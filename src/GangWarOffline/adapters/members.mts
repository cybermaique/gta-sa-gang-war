import { GANG_ENGINE, WORLD_RULES } from "../config/world.mts";
import { memberRespawn } from "../core/respawn.mts";
import type { WorldStore } from "../persistence/store.mts";
import type { Position } from "../core/world-types.mts";
import { distance } from "./engine.mts";
import type { GameEngine } from "./engine.mts";

// Somente dois guardas locais fora dos combates; demais integrantes sao abstratos.
export class MemberPool {
  bindings(): { participantId: string; handle: number }[] {
    return [...this.active].map(([participantId, ped]) => ({ participantId, handle: ped.handle }));
  }
  private active = new Map<string, { handle: number; model: number; home: Position; baseId: string | null }>();
  private recovering = new Map<string, number>();
  constructor(private engine: GameEngine, private canAct: () => boolean) {}
  tick(store: WorldStore, point: Position, now: number, battleActive: boolean): void {
    if (battleActive) { this.clear(); return; }
    for (const [id, ped] of this.active) {
      const member = store.world.members.find((m) => m.id === id);
      const home = member && memberRespawn(store.world, { ...member, readyAt: 0 }, now);
      if (this.engine.dead(ped.handle)) {
        this.recovering.set(id, now + WORLD_RULES.troopRecoveryMs);
        if (this.engine.exists(ped.handle)) this.engine.call<void>("DELETE_CHAR", ped.handle);
        this.active.delete(id);
      } else if (!member || !home || member.baseId !== ped.baseId || distance(home, ped.home) > 1 ||
          distance(point, this.engine.position(ped.handle)) > WORLD_RULES.streamRadius) {
        this.engine.call<void>("DELETE_CHAR", ped.handle); this.active.delete(id);
      }
    }
    if (store.busy) return;
    if (this.recovering.size) {
      const entries = [...this.recovering];
      store.transact("recuperacao de integrantes", (draft) => {
        for (const [id, until] of entries) { const m = draft.members.find((m) => m.id === id); if (m) m.readyAt = Math.max(m.readyAt, until); }
      }, () => { for (const [id] of entries) this.recovering.delete(id); });
      return;
    }
    if (this.active.size >= Math.min(2, WORLD_RULES.maxNpc)) return;
    for (const member of store.world.members) {
      if (this.active.has(member.id) || member.readyAt > now) continue;
      const location = memberRespawn(store.world, member, now);
      if (!location || distance(point, location) > WORLD_RULES.streamRadius || distance(point, location) < 3) continue;
      const config = GANG_ENGINE[member.gangId as keyof typeof GANG_ENGINE];
      if (!config) continue;
      const model = config.models[this.active.size % config.models.length]!;
      const weaponModel = this.engine.call<number>("GET_WEAPONTYPE_MODEL", member.weapon);
      if (!this.engine.model(model) || !this.engine.model(weaponModel)) continue;
      const position = this.engine.ground({ ...location, x: location.x + this.active.size * 3 });
      store.transact("reserva de integrante", (draft) => {
        draft.members.find((m) => m.id === member.id)!.readyAt = now + WORLD_RULES.troopRecoveryMs;
      }, () => {
        if (!this.canAct() || battleActive) return;
        const handle = this.engine.call<number>("CREATE_CHAR", config.pedType, model, position.x, position.y, position.z);
        this.active.set(member.id, { handle, model, home: location, baseId: member.baseId });
        this.engine.call<void>("SET_CHAR_HEALTH", handle, 100);
        this.engine.call<void>("GIVE_WEAPON_TO_CHAR", handle, member.weapon, member.ammo);
        this.engine.call<void>("SET_CHAR_RELATIONSHIP", handle, 1, config.pedType);
        this.engine.call<void>("TASK_STAND_STILL", handle, 60_000);
        this.engine.releaseModel(model); this.engine.releaseModel(weaponModel);
      });
      break;
    }
  }
  clear(): void {
    for (const ped of this.active.values()) if (this.engine.exists(ped.handle)) this.engine.call<void>("DELETE_CHAR", ped.handle);
    this.active.clear();
  }
}
