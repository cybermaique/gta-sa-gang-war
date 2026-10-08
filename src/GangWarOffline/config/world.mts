import type { BaseState, BattleRules, City, ZoneState } from "../core/world-types.mts";

export const WORLD_RULES = Object.freeze({
  tickMs: 250, streamRadius: 180, maxNpc: 8, maxActiveVehicles: 12, maxActivePickups: 24, modelTimeoutMs: 8_000,
  troopRecoveryMs: 10 * 60_000, attackCooldownMs: 60 * 60_000,
  offlineStepMs: 60 * 60_000, maxOfflineSteps: 24, maxPlayerLossesPerReturn: 1,
  minPlayerTerritories: 1, incomeTerritory: 500, incomeGz: 750,
  upkeepMember: 5, upkeepBase: 150, captureReward: 1_000,
  historyLimit: 80, transactionLimit: 100, maxZones: 128, maxBases: 64,
  maxMembers: 1_000, maxCitySpawns: 16, maxClockJumpMs: 30 * 86_400_000,
  npcEquipmentCost: 50, npcEquipmentCooldownMs: 60 * 60_000,
});
export const TERRITORY_BATTLE: BattleRules = Object.freeze({
  durationMs: 120_000, targetScore: 100, presencePerSecond: 1,
  deathPoints: 15, minimumAttackers: 2, squadSize: 3,
});
export const GZ_BATTLE: BattleRules = Object.freeze({ ...TERRITORY_BATTLE, durationMs: 180_000, targetScore: 150 });
export const BASE_LIMITS = Object.freeze({
  1: { pickups: 3, vehicles: 1 }, 2: { pickups: 5, vehicles: 2 },
  3: { pickups: 8, vehicles: 3 }, 4: { pickups: 12, vehicles: 4 },
});
export const GANG_ENGINE = Object.freeze({
  "grove-street": { city: "ls" as City, models: [105, 106, 107], weapon: 28, pedType: 7, blipColor: 1 },
  ballas: { city: "ls" as City, models: [102, 103, 104], weapon: 28, pedType: 8, blipColor: 5 },
  "los-vagos": { city: "ls" as City, models: [108, 109, 110], weapon: 28, pedType: 9, blipColor: 4 },
  aztecas: { city: "ls" as City, models: [114, 115, 116], weapon: 28, pedType: 10, blipColor: 6 },
});
// Limites extraídos de data/info.zon da instalação 1.0 US; não alteramos as zonas GTA.
export const INITIAL_ZONES: ZoneState[] = [
  { id: "grove-street", name: "Grove Street / Ganton", city: "ls", kind: "territory", ownerId: "grove-street", cooldownUntil: 0, calibrated: false,
    bounds: { minX: 2222.56, minY: -1722.33, maxX: 2632.83, maxY: -1628.53, minZ: -89.0839, maxZ: 110.916 } },
  { id: "idlewood", name: "Idlewood", city: "ls", kind: "territory", ownerId: "ballas", cooldownUntil: 0, calibrated: false,
    bounds: { minX: 1951.66, minY: -1742.31, maxX: 2124.66, maxY: -1602.31, minZ: -89.0839, maxZ: 110.916 } },
  { id: "east-los-santos", name: "East Los Santos", city: "ls", kind: "territory", ownerId: "los-vagos", cooldownUntil: 0, calibrated: false,
    bounds: { minX: 2421.03, minY: -1628.53, maxX: 2632.83, maxY: -1454.35, minZ: -89.0839, maxZ: 110.916 } },
  { id: "el-corona", name: "El Corona", city: "ls", kind: "territory", ownerId: "aztecas", cooldownUntil: 0, calibrated: false, bounds: null },
  { id: "gz-grove", name: "GZ Grove", city: "ls", kind: "gz", ownerId: "grove-street", cooldownUntil: 0, calibrated: false, bounds: null },
  { id: "gz-idlewood", name: "GZ Idlewood", city: "ls", kind: "gz", ownerId: "ballas", cooldownUntil: 0, calibrated: false, bounds: null },
];
function base(id: string, name: string, city: City, level: BaseState["level"], price: number): BaseState {
  return { id, name, city, level, price, ownerId: null, position: null, respawn: null, pickups: [], vehicles: [], ownerHistory: [] };
}
export const INITIAL_BASES = [
  base("grove-house", "Base Grove", "ls", 1, 15_000),
  base("factory", "Base da Fabrica", "ls", 2, 40_000),
  base("sf-garage", "Garagem San Fierro", "sf", 2, 45_000),
  base("lv-hangar", "Hangar Las Venturas", "lv", 3, 80_000),
  base("area-51", "Area 51", "lv", 4, 350_000),
];
export const PICKUP_CHOICES = Object.freeze([
  { label: "Vida", type: "health" as const, weapon: 0 },
  { label: "Colete", type: "armour" as const, weapon: 0 },
  ...[24, 32, 28, 26, 30, 31, 34, 16].map((weapon, i) => ({
    label: ["Desert Eagle", "Tec-9", "Micro SMG", "Sawn-off", "AK-47", "M4", "Sniper", "Granadas"][i]!,
    type: "weapon" as const, weapon,
  })),
]);
export const VEHICLE_CHOICES = Object.freeze([
  { model: 492, name: "Greenwood", military: false }, { model: 567, name: "Savanna", military: false },
  { model: 560, name: "Sultan", military: false }, { model: 432, name: "Rhino", military: true },
  { model: 520, name: "Hydra", military: true }, { model: 425, name: "Hunter", military: true },
]);
