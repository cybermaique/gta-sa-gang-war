import { createInitialGangs, validateGangs } from "./gangs.mts";
import { rankGangs } from "./ranking.mts";
import { DEFAULT_SCORING } from "../config/scoring.mts";
import { assignSessionIds, initialSocial, validateSocial } from "./social.mts";
import { BASE_LIMITS, GANG_ENGINE, INITIAL_BASES, INITIAL_ZONES, WORLD_RULES } from "../config/world.mts";
import type { Bounds, City, Position, WorldState, ZoneState } from "./world-types.mts";

export function cloneWorld(world: WorldState): WorldState { return JSON.parse(JSON.stringify(world)) as WorldState; }
export function playerGang(world: WorldState): string { return world.gangs.find((g) => g.isPlayerGang)!.id; }
export function inside(point: Position, bounds: Bounds | null): boolean {
  return bounds !== null && point.x >= bounds.minX && point.x <= bounds.maxX &&
    point.y >= bounds.minY && point.y <= bounds.maxY && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}
export function event(world: WorldState, at: number, type: string, detail: string): string {
  const id = `event-${world.nextEventId++}`;
  world.history.push({ id, at, type, detail });
  world.history = world.history.slice(-WORLD_RULES.historyLimit);
  return id;
}
export function syncWorld(world: WorldState): void {
  for (const gang of world.gangs) {
    gang.territoryCount = world.zones.filter((z) => z.kind === "territory" && z.ownerId === gang.id && z.bounds).length;
    gang.gangZoneCount = world.zones.filter((z) => z.kind === "gz" && z.ownerId === gang.id && z.bounds).length;
    gang.baseCount = world.bases.filter((b) => b.ownerId === gang.id).length;
    gang.members = world.members.filter((m) => m.gangId === gang.id).length;
  }
  if (world.respawn.baseId && !world.bases.some((b) => b.id === world.respawn.baseId && b.ownerId === playerGang(world))) {
    world.respawn.baseId = null;
  }
  world.ranking = rankGangs(world.gangs, DEFAULT_SCORING).map((r) => ({ gangId: r.gang.id, score: r.score, position: r.position }));
}
export function createWorld(now: number): WorldState {
  const gangs = createInitialGangs();
  const world: WorldState = {
    schema: 2, revision: 0, gangs, zones: JSON.parse(JSON.stringify(INITIAL_ZONES)),
    bases: JSON.parse(JSON.stringify(INITIAL_BASES)), members: [], wallets: {},
    citySpawns: { ls: [], sf: [], lv: [] }, respawn: { city: "ls", baseId: null },
    history: [], transactions: [], lastProcessedAt: now, nextEventId: 1, randomSeed: 17,
    ranking: [],
    social: { version: 1, participants: [], messages: [], processedEvents: [] },
  };
  for (const gang of gangs) {
    const config = GANG_ENGINE[gang.id as keyof typeof GANG_ENGINE];
    world.wallets[gang.id] = 5_000;
    for (let i = 0; i < gang.members; i++) world.members.push({
      id: `${gang.id}-${i + 1}`, gangId: gang.id, city: config?.city ?? "ls",
      baseId: null, readyAt: 0, weapon: config?.weapon ?? 28, ammo: 140, equippedAt: 0,
    });
  }
  world.social = initialSocial(world); assignSessionIds(world);
  syncWorld(world);
  return world;
}
export function catalogMissing(world: WorldState): boolean {
  return INITIAL_ZONES.some((z) => !world.zones.some((current) => current.id === z.id)) ||
    INITIAL_BASES.some((b) => !world.bases.some((current) => current.id === b.id));
}
export function extendCatalog(world: WorldState): void {
  for (const zone of INITIAL_ZONES) if (!world.zones.some((z) => z.id === zone.id)) world.zones.push(JSON.parse(JSON.stringify(zone)) as ZoneState);
  for (const base of INITIAL_BASES) if (!world.bases.some((b) => b.id === base.id)) world.bases.push(JSON.parse(JSON.stringify(base)));
  syncWorld(world);
}
export function validPosition(p: Position): boolean {
  return [p.x, p.y, p.z, p.heading].every(Number.isFinite) && Math.abs(p.x) <= 6_000 &&
    Math.abs(p.y) <= 6_000 && p.z >= -100 && p.z <= 2_000 && p.heading >= 0 && p.heading < 360;
}
export function calibrateZone(zone: ZoneState, a: Position, b: Position): void {
  if (!validPosition(a) || !validPosition(b) || Math.abs(a.x - b.x) < 5 || Math.abs(a.y - b.y) < 5 ||
      Math.abs(a.x - b.x) > 1_000 || Math.abs(a.y - b.y) > 1_000) throw new Error("Dois cantos opostos, entre 5 e 1000 metros por eixo, sao necessarios.");
  zone.bounds = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y), minZ: Math.min(a.z, b.z) - 10, maxZ: Math.max(a.z, b.z) + 30 };
  zone.calibrated = true;
}
export function transferZone(world: WorldState, id: string, ownerId: string, now: number): void {
  const zone = world.zones.find((z) => z.id === id);
  if (!zone || !world.gangs.some((g) => g.id === ownerId)) throw new Error("Zona ou gangue inexistente.");
  const previous = zone.ownerId;
  zone.ownerId = ownerId;
  zone.cooldownUntil = now + WORLD_RULES.attackCooldownMs;
  event(world, now, "propriedade", `${zone.name}: ${previous} -> ${ownerId}`);
  syncWorld(world);
}
export function cityAt(point: Position): City {
  if (point.x < -800) return "sf";
  if (point.y > 700) return "lv";
  return "ls";
}

export function validateWorld(input: unknown): asserts input is WorldState {
  if (!input || typeof input !== "object") throw new Error("Estado do mundo invalido.");
  const w = input as WorldState;
  if (w.schema !== 2 || !Number.isSafeInteger(w.revision) || w.revision < 0 ||
      !Number.isSafeInteger(w.lastProcessedAt) || w.lastProcessedAt < 1_577_836_800_000 ||
      !Number.isSafeInteger(w.nextEventId) || w.nextEventId < 1 || !Number.isSafeInteger(w.randomSeed) ||
      w.randomSeed <= 0 || w.randomSeed >= 2147483647) throw new Error("Versao ou relogio persistido invalido.");
  for (const [list, limit] of [[w.gangs, 32], [w.zones, WORLD_RULES.maxZones], [w.bases, WORLD_RULES.maxBases],
    [w.members, WORLD_RULES.maxMembers], [w.history, WORLD_RULES.historyLimit], [w.transactions, WORLD_RULES.transactionLimit]] as const) {
    if (!Array.isArray(list) || list.length > limit || new Set(list.map((x) => x.id)).size !== list.length) throw new Error("Colecao invalida ou IDs duplicados.");
  }
  validateGangs(w.gangs);
  if (w.gangs.filter((g) => g.isPlayerGang).length !== 1) throw new Error("Uma gangue do jogador e necessaria.");
  const hasGang = (id: string) => w.gangs.some((g) => g.id === id);
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  for (const z of w.zones) {
    if (!hasGang(z.ownerId) || !["territory", "gz"].includes(z.kind) || !integer(z.cooldownUntil)) throw new Error("Proprietario ou zona invalida.");
    if (z.bounds && (!Object.values(z.bounds).every(Number.isFinite) || z.bounds.maxX <= z.bounds.minX ||
      z.bounds.maxY <= z.bounds.minY || z.bounds.maxZ <= z.bounds.minZ)) throw new Error("Limites da zona invalidos.");
  }
  for (const b of w.bases) {
    if (!integer(b.price) || ![1, 2, 3, 4].includes(b.level) || (b.ownerId !== null && !hasGang(b.ownerId)) ||
      (b.position !== null && !validPosition(b.position)) || (b.respawn !== null && !validPosition(b.respawn)) ||
      !Array.isArray(b.pickups) || !Array.isArray(b.vehicles) || b.pickups.length > BASE_LIMITS[b.level].pickups ||
      b.vehicles.length > BASE_LIMITS[b.level].vehicles || !Array.isArray(b.ownerHistory) || b.ownerHistory.length > 30 ||
      new Set(b.pickups.map((p) => p.id)).size !== b.pickups.length || new Set(b.vehicles.map((v) => v.id)).size !== b.vehicles.length) throw new Error("Base invalida.");
    for (const p of b.pickups) if (!validPosition(p.position) || !["health", "armour", "weapon"].includes(p.type) ||
      !integer(p.ammo) || p.ammo > 1000 || !integer(p.cooldownMs) || p.cooldownMs < 1000 ||
      !integer(p.weapon) || p.weapon > 46 || !p.usedUntil || !Object.values(p.usedUntil).every(integer)) throw new Error("Pickup invalido.");
    for (const v of b.vehicles) if (!validPosition(v.position) || !integer(v.model) || v.model < 400 || v.model > 611 ||
      !integer(v.cooldownMs) || v.cooldownMs < 10_000 || !integer(v.readyAt) || !integer(v.color1) || v.color1 > 126 ||
      !integer(v.color2) || v.color2 > 126) throw new Error("Veiculo invalido.");
  }
  for (const m of w.members) if (!hasGang(m.gangId) || !integer(m.readyAt) || !integer(m.ammo) || m.ammo > 1000 ||
    !integer(m.weapon) || m.weapon > 46 || !integer(m.equippedAt) || (m.baseId !== null && !w.bases.some((b) => b.id === m.baseId))) throw new Error("Membro invalido.");
  for (const g of w.gangs) if (!integer(w.wallets[g.id]!)) throw new Error("Carteira invalida.");
  for (const city of ["ls", "sf", "lv"] as const) if (!Array.isArray(w.citySpawns[city]) ||
    w.citySpawns[city].length > WORLD_RULES.maxCitySpawns || !w.citySpawns[city].every(validPosition)) throw new Error("Spawns invalidos.");
  if (!["ls", "sf", "lv"].includes(w.respawn.city)) throw new Error("Preferencia de respawn invalida.");
  for (const t of w.transactions) if (!hasGang(t.gangId) || !Number.isSafeInteger(t.amount) || !integer(t.at)) throw new Error("Transacao invalida.");
  validateSocial(w);
  syncWorld(w);
}
