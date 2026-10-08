import { GANG_ENGINE, WORLD_RULES } from "../config/world.mts";
import { beginBattle, updateBattle } from "../core/battles.mts";
import { inside, playerGang } from "../core/world.mts";
import type { BattleState, MemberState, Position, WorldState } from "../core/world-types.mts";
import type { GameEngine } from "./engine.mts";

interface Fighter { handle: number; memberId: string; gangId: string; dead: boolean; weapon: number }
interface Pending { member: MemberState; position: Position; model: number; requestedAt: number }
export class CombatSession {
  bindings(): { participantId: string; handle: number }[] {
    return this.fighters.map((f) => ({ participantId: f.memberId, handle: f.handle }));
  }
  battle: BattleState | null = null;
  private fighters: Fighter[] = [];
  private pending: Pending[] = [];
  private reinforced = false;
  private lastTasks = 0;
  private lastNotice = 0;
  private result: "attacker" | "defender" | null = null;
  private reserved: string[] = [];
  constructor(private engine: GameEngine, private notify: (message: string) => void) {}
  start(world: WorldState, zoneId: string, position: Position, now: number, reservation?: { battle: BattleState; members: string[] }): void {
    if (this.battle) throw new Error("Uma disputa ja esta em andamento.");
    const zone = world.zones.find((z) => z.id === zoneId);
    if (!zone || !inside(position, zone.bounds)) throw new Error("Entre na zona para iniciar a captura.");
    this.battle = reservation?.battle ?? beginBattle(world, zone, now);
    if (zone.ownerId !== this.battle.defenderId) throw new Error("Proprietario mudou antes da captura.");
    this.battle.startedAt = this.battle.lastTick = now; this.battle.endsAt = now + this.battle.rules.durationMs;
    this.reserved = reservation?.members ?? [];
    this.result = null; this.reinforced = false;
    this.queue(world, this.battle.rules.squadSize, position, now);
    this.notify(`Disputa ${zone.name}: preparando 3v3. Fique na area com seus aliados.`);
  }
  private queue(world: WorldState, count: number, p: Position, now: number): void {
    if (!this.battle) return;
    for (const [side, gangId] of [this.battle.attackerId, this.battle.defenderId].entries()) {
      const config = GANG_ENGINE[gangId as keyof typeof GANG_ENGINE];
      if (!config) throw new Error("Gangue sem modelos configurados.");
      const members = world.members.filter((m) => m.gangId === gangId &&
        (this.reserved.length ? this.reserved.includes(m.id) : m.readyAt <= now) &&
        !this.fighters.some((f) => f.memberId === m.id) && !this.pending.some((q) => q.member.id === m.id)).slice(0, count);
      for (const [i, member] of members.entries()) {
        if (this.fighters.length + this.pending.length >= WORLD_RULES.maxNpc) break;
        const point = { ...p, x: p.x + (side ? 8 : -5), y: p.y + (i - 1) * 3 };
        const zone = world.zones.find((z) => z.id === this.battle!.zoneId)!;
        if (!inside(point, zone.bounds)) throw new Error("Ponto perto da borda: avance alguns metros para dentro da zona.");
        this.pending.push({ member, position: point, model: config.models[i % config.models.length]!, requestedAt: now });
      }
    }
  }
  tick(world: WorldState, now: number, playerPosition: Position) {
    const b = this.battle;
    if (!b) return null;
    if (this.result) return this.finished();
    const zone = world.zones.find((z) => z.id === b.zoneId)!;
    if (zone.ownerId !== b.defenderId) { this.cancel(); this.notify("Disputa cancelada: propriedade alterada."); return null; }
    for (const q of [...this.pending]) {
      const weaponModel = this.engine.call<number>("GET_WEAPONTYPE_MODEL", q.member.weapon);
      if (!this.engine.model(q.model) || !this.engine.model(weaponModel)) {
        if (now - q.requestedAt > WORLD_RULES.modelTimeoutMs) throw new Error("Modelo de combate nao carregou a tempo.");
        continue;
      }
      const point = this.engine.ground(q.position);
      const config = GANG_ENGINE[q.member.gangId as keyof typeof GANG_ENGINE]!;
      const handle = this.engine.call<number>("CREATE_CHAR", config.pedType, q.model, point.x, point.y, point.z);
      this.fighters.push({ handle, memberId: q.member.id, gangId: q.member.gangId, dead: false, weapon: q.member.weapon });
      this.pending = this.pending.filter((p) => p !== q);
      this.engine.call<void>("SET_CHAR_HEALTH", handle, 100);
      this.engine.call<void>("SET_CHAR_ACCURACY", handle, Math.round(world.gangs.find((g) => g.id === q.member.gangId)!.skillLevel));
      this.engine.call<void>("GIVE_WEAPON_TO_CHAR", handle, q.member.weapon, q.member.ammo);
      this.engine.call<void>("SET_CHAR_RELATIONSHIP", handle, 1, config.pedType);
      this.engine.call<void>("SET_CHAR_RELATIONSHIP", handle, q.member.gangId === playerGang(world) ? 1 : 4, 0);
      this.engine.releaseModel(q.model); this.engine.releaseModel(weaponModel);
    }
    if (this.pending.length) { b.endsAt += Math.min(1000, Math.max(0, now - b.lastTick)); b.lastTick = now; return null; }
    if (!this.reinforced && now - b.startedAt > 30_000) { this.reinforced = true; this.queue(world, 1, playerPosition, now); }
    let attackers = inside(playerPosition, zone.bounds) && !this.engine.dead(this.engine.char()) ? 1 : 0;
    let defenders = 0, attackerDeaths = 0, defenderDeaths = 0;
    for (const f of this.fighters) {
      if (f.dead) continue;
      if (this.engine.dead(f.handle)) {
        f.dead = true;
        if (f.gangId === b.attackerId) attackerDeaths++; else defenderDeaths++;
      } else if (inside(this.engine.position(f.handle), zone.bounds)) {
        if (f.gangId === b.attackerId) attackers++; else defenders++;
      }
    }
    if (now - this.lastTasks >= 3000) {
      this.lastTasks = now;
      for (const f of this.fighters.filter((f) => !f.dead)) {
        const enemy = this.fighters.find((e) => !e.dead && e.gangId !== f.gangId);
        const target = enemy?.handle ?? (f.gangId === b.defenderId ? this.engine.char() : null);
        if (target !== null && this.engine.exists(target)) this.engine.call<void>("TASK_KILL_CHAR_ON_FOOT", f.handle, target);
      }
    }
    this.result = updateBattle(b, now, attackers, defenders, attackerDeaths, defenderDeaths);
    if (now - this.lastNotice >= 5000) { this.lastNotice = now; this.notify(`Captura: ${Math.floor(b.score)}/${b.rules.targetScore}; aliados ${attackers}, defensores ${defenders}.`); }
    return this.finished();
  }
  private finished() {
    if (!this.result || !this.battle) return null;
    return { winner: this.result, battle: this.battle,
      participants: this.fighters.map((f) => f.memberId), casualties: this.fighters.filter((f) => f.dead).map((f) => f.memberId),
      ammo: this.fighters.map((f) => ({ memberId: f.memberId, amount: f.dead || !this.engine.exists(f.handle) ? 0 :
        Math.max(0, Math.min(1000, this.engine.call<number>("GET_AMMO_IN_CHAR_WEAPON", f.handle, f.weapon))) })) };
  }
  participants(): string[] { return [...this.fighters.map((f) => f.memberId), ...this.pending.map((p) => p.member.id)]; }
  cancel(): void {
    for (const f of this.fighters) if (this.engine.exists(f.handle)) this.engine.call<void>("DELETE_CHAR", f.handle);
    for (const q of this.pending) this.engine.releaseModel(q.model);
    this.fighters = []; this.pending = []; this.battle = null; this.result = null; this.reserved = [];
  }
}
