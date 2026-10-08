import { WORLD_RULES } from "../config/world.mts";
import { bankChange, processIncome } from "./economy.mts";
import { event, playerGang, syncWorld, transferZone } from "./world.mts";
import type { WorldState } from "./world-types.mts";

function random(world: WorldState): number {
  world.randomSeed = (world.randomSeed * 16807) % 2147483647;
  return world.randomSeed / 2147483647;
}
export function advanceWorld(world: WorldState, now: number): string {
  if (!Number.isSafeInteger(now) || now < world.lastProcessedAt) return "Relogio retrocedeu; simulacao suspensa ate recuperar a data anterior.";
  const elapsed = now - world.lastProcessedAt;
  const pending = Math.floor(elapsed / WORLD_RULES.offlineStepMs);
  if (!pending) return "Nenhuma hora pendente.";
  const steps = Math.min(pending, WORLD_RULES.maxOfflineSteps);
  let captures = 0, playerLosses = 0;
  for (let i = 0; i < steps; i++) {
    const at = world.lastProcessedAt + (i + 1) * WORLD_RULES.offlineStepMs;
    processIncome(world, at);
    const attackers = world.gangs.filter((g) => !g.isPlayerGang && g.bankBalance >= 500 &&
      world.members.filter((m) => m.gangId === g.id && m.readyAt <= at).length >= 3);
    if (!attackers.length || random(world) > 0.35) continue;
    const attacker = attackers[Math.floor(random(world) * attackers.length)]!;
    const targets = world.zones.filter((z) => z.bounds && z.ownerId !== attacker.id && z.cooldownUntil <= at &&
      (z.ownerId !== playerGang(world) || (playerLosses < WORLD_RULES.maxPlayerLossesPerReturn &&
        world.zones.filter((t) => t.kind === "territory" && t.ownerId === z.ownerId && t.bounds).length > WORLD_RULES.minPlayerTerritories)));
    if (!targets.length) continue;
    const zone = targets[Math.floor(random(world) * targets.length)]!;
    const defender = world.gangs.find((g) => g.id === zone.ownerId)!;
    const attackPower = Math.min(8, world.members.filter((m) => m.gangId === attacker.id && m.readyAt <= at).length) * attacker.skillLevel;
    const defencePower = Math.min(8, world.members.filter((m) => m.gangId === defender.id && m.readyAt <= at).length) * defender.skillLevel * 1.2;
    bankChange(world, attacker.id, -500, "ataque offline", at);
    const wasPlayer = zone.ownerId === playerGang(world);
    if (random(world) * (attackPower + defencePower) < attackPower) {
      transferZone(world, zone.id, attacker.id, at); captures++; if (wasPlayer) playerLosses++;
      attacker.wins++; defender.losses++;
    } else { zone.cooldownUntil = at + WORLD_RULES.attackCooldownMs; defender.wins++; attacker.losses++; }
    for (const id of [attacker.id, defender.id]) {
      for (const member of world.members.filter((m) => m.gangId === id && m.readyAt <= at).slice(0, 3)) member.readyAt = at + WORLD_RULES.troopRecoveryMs;
    }
    event(world, at, "offline", `${zone.name}: ataque ${attacker.id}, defesa ${defender.id}`);
  }
  // Consome todo o intervalo; o teto nao vira backlog reaplicavel em cada load.
  world.lastProcessedAt += pending * WORLD_RULES.offlineStepMs;
  syncWorld(world);
  const summary = `${steps} horas simuladas, ${captures} conquistas, ${playerLosses} perdas do jogador${pending > steps ? "; periodo excedente limitado" : ""}.`;
  event(world, now, "retorno", summary);
  return summary;
}
