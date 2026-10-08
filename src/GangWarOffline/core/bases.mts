import { BASE_LIMITS, PICKUP_CHOICES, VEHICLE_CHOICES } from "../config/world.mts";
import { bankChange } from "./economy.mts";
import { event, playerGang, validPosition } from "./world.mts";
import type { BaseState, Position, WorldState } from "./world-types.mts";

export function getBase(world: WorldState, id: string): BaseState {
  const base = world.bases.find((b) => b.id === id);
  if (!base) throw new Error("Base inexistente.");
  return base;
}
export function buyBase(world: WorldState, id: string, now: number, ownerId = playerGang(world)): void {
  const base = getBase(world, id);
  if (base.ownerId !== null || !base.position || !base.respawn) throw new Error("Base ocupada ou sem coordenadas e respawn calibrados.");
  if (!world.gangs.some((g) => g.id === ownerId)) throw new Error("Comprador inexistente.");
  bankChange(world, ownerId, -base.price, `compra ${base.id}`, now);
  transferBase(world, id, ownerId, now);
}
export function transferBase(world: WorldState, id: string, ownerId: string | null, now: number): void {
  const base = getBase(world, id);
  if (ownerId !== null && !world.gangs.some((g) => g.id === ownerId)) throw new Error("Gangue inexistente.");
  base.ownerId = ownerId; base.ownerHistory.push({ at: now, ownerId });
  base.ownerHistory = base.ownerHistory.slice(-30);
  for (const m of world.members) if (m.baseId === id && m.gangId !== ownerId) m.baseId = null;
  if (ownerId) for (const m of world.members.filter((m) => m.gangId === ownerId)) if (!m.baseId) m.baseId = id;
  event(world, now, "base", `${base.name}: novo proprietario ${ownerId ?? "disponivel"}`);
}
function editableBase(world: WorldState, id: string): BaseState {
  const base = getBase(world, id);
  if (base.ownerId !== playerGang(world)) throw new Error("Configure apenas bases da sua gangue.");
  return base;
}
export function addPickup(world: WorldState, baseId: string, position: Position, choice: number): void {
  const base = editableBase(world, baseId), type = PICKUP_CHOICES[choice];
  if (!type || !validPosition(position) || base.pickups.length >= BASE_LIMITS[base.level].pickups) throw new Error("Tipo, ponto ou capacidade de pickups invalidos.");
  base.pickups.push({ id: `pickup-${world.nextEventId++}`, type: type.type, weapon: type.weapon,
    ammo: type.weapon === 16 ? 5 : 60, cooldownMs: 60_000, position, usedUntil: {} });
}
export function addVehicle(world: WorldState, baseId: string, position: Position, choice: number): void {
  const base = editableBase(world, baseId), config = VEHICLE_CHOICES[choice];
  if (!config || !validPosition(position) || base.vehicles.length >= BASE_LIMITS[base.level].vehicles ||
      (config.military && base.level < 4)) throw new Error("Modelo, ponto, nivel ou capacidade de veiculos invalidos.");
  base.vehicles.push({ id: `vehicle-${world.nextEventId++}`, model: config.model, position,
    color1: 86, color2: 86, cooldownMs: config.military ? 30 * 60_000 : 5 * 60_000,
    readyAt: 0, enabled: true });
}
