import type { Gang } from "./types.mts";
import type { SocialState } from "./social.mts";

export type City = "ls" | "sf" | "lv";
export interface Position { x: number; y: number; z: number; heading: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number }
export interface ZoneState {
  id: string; name: string; city: City; kind: "territory" | "gz";
  bounds: Bounds | null; ownerId: string; cooldownUntil: number; calibrated: boolean;
}
export interface MemberState {
  id: string; gangId: string; city: City; baseId: string | null;
  readyAt: number; weapon: number; ammo: number; equippedAt: number;
}
export interface PickupState {
  id: string; type: "health" | "armour" | "weapon"; weapon: number; ammo: number;
  cooldownMs: number; position: Position; usedUntil: Record<string, number>;
}
export interface VehicleSlot {
  id: string; model: number; position: Position; color1: number; color2: number;
  cooldownMs: number; readyAt: number; enabled: boolean;
}
export interface BaseState {
  id: string; name: string; city: City; level: 1 | 2 | 3 | 4; price: number;
  ownerId: string | null; position: Position | null; respawn: Position | null;
  pickups: PickupState[]; vehicles: VehicleSlot[]; ownerHistory: { at: number; ownerId: string | null }[];
}
export interface WorldEvent { id: string; at: number; type: string; detail: string }
export interface Transaction { id: string; at: number; gangId: string; amount: number; reason: string }
export interface WorldState {
  schema: 2; revision: number; gangs: Gang[]; zones: ZoneState[]; bases: BaseState[];
  members: MemberState[]; wallets: Record<string, number>;
  social: SocialState;
  citySpawns: Record<City, Position[]>;
  respawn: { city: City; baseId: string | null };
  history: WorldEvent[]; transactions: Transaction[];
  lastProcessedAt: number; nextEventId: number; randomSeed: number;
  ranking: { gangId: string; score: number; position: number }[];
}
export interface BattleRules {
  durationMs: number; targetScore: number; presencePerSecond: number;
  deathPoints: number; minimumAttackers: number; squadSize: number;
}
export interface BattleState {
  zoneId: string; attackerId: string; defenderId: string; startedAt: number;
  endsAt: number; score: number; rules: BattleRules;
  lastTick: number; attackersDead: number; defendersDead: number;
}
