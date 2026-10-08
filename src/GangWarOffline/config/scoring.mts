import type { ScoringConfig } from "../core/types.mts";

export const DEFAULT_SCORING: ScoringConfig = Object.freeze({
  territoryPoints: 100,
  gangZonePoints: 250,
  basePoints: 500,
  bankUnit: 10_000,
  bankUnitPoints: 10,
  bankPointsCap: 300,
});
