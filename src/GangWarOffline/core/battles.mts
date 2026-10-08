import { GZ_BATTLE, TERRITORY_BATTLE, WORLD_RULES } from "../config/world.mts";
import { event, playerGang, transferZone } from "./world.mts";
import type { BattleState, WorldState, ZoneState } from "./world-types.mts";
import { addMessage, award } from "./social.mts";

export function beginBattle(world: WorldState, zone: ZoneState, now: number): BattleState {
  const attackerId = playerGang(world);
  const rules = zone.kind === "gz" ? GZ_BATTLE : TERRITORY_BATTLE;
  if (!zone.bounds || zone.ownerId === attackerId || zone.cooldownUntil > now) throw new Error("Zona indisponivel, aliada ou em cooldown.");
  for (const id of [attackerId, zone.ownerId]) {
    if (world.members.filter((m) => m.gangId === id && m.readyAt <= now).length < rules.squadSize) throw new Error(`Gangue ${id} sem tropas recuperadas.`);
  }
  return { zoneId: zone.id, attackerId, defenderId: zone.ownerId, startedAt: now,
    endsAt: now + rules.durationMs, lastTick: now, score: 0, rules,
    attackersDead: 0, defendersDead: 0 };
}
export function updateBattle(b: BattleState, now: number, attackers: number, defenders: number,
  newAttackerDeaths: number, newDefenderDeaths: number): "attacker" | "defender" | null {
  const seconds = Math.min(1, Math.max(0, now - b.lastTick) / 1000);
  b.lastTick = now;
  b.attackersDead += newAttackerDeaths; b.defendersDead += newDefenderDeaths;
  const presence = attackers >= b.rules.minimumAttackers ? attackers - defenders : -defenders;
  b.score = Math.max(0, b.score + presence * seconds * b.rules.presencePerSecond +
    (newDefenderDeaths - newAttackerDeaths) * b.rules.deathPoints);
  if (b.score >= b.rules.targetScore && attackers >= b.rules.minimumAttackers) return "attacker";
  if (now >= b.endsAt || attackers === 0) return "defender";
  return null;
}
export function resolveBattle(world: WorldState, b: BattleState, winner: "attacker" | "defender",
  participants: readonly string[], casualties: readonly string[], now: number): void {
  const zone = world.zones.find((z) => z.id === b.zoneId);
  if (!zone || zone.ownerId !== b.defenderId) throw new Error("Propriedade mudou durante a disputa.");
  const winnerId = winner === "attacker" ? b.attackerId : b.defenderId;
  const loserId = winner === "attacker" ? b.defenderId : b.attackerId;
  world.gangs.find((g) => g.id === winnerId)!.wins++;
  world.gangs.find((g) => g.id === loserId)!.losses++;
  if (winner === "attacker") transferZone(world, zone.id, b.attackerId, now);
  zone.cooldownUntil = now + WORLD_RULES.attackCooldownMs;
  for (const member of world.members) if (participants.includes(member.id)) {
    member.readyAt = now + WORLD_RULES.troopRecoveryMs * (casualties.includes(member.id) ? 2 : 1);
  }
  const resultId = event(world, now, "disputa", `${zone.name}: venceu ${winnerId}; pontos ${Math.floor(b.score)}; mortes ${casualties.length}`);
  for (const id of new Set(participants)) {
    const p = world.social.participants.find((p) => p.id === id);
    if (p?.gangId !== winnerId) continue;
    const kind = zone.kind === "gz" ? "gzVictory" : winner === "attacker" ? "conquest" : "defense";
    award(world, resultId, id, kind);
    addMessage(world, now, "notification", id, kind === "conquest" ? "Participou da conquista." : kind === "defense" ? "Participou da defesa." : "Venceu a GZ.");
  }
}
