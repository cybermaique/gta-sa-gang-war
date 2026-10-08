import { validateGang, validateGangs } from "./gangs.mts";
import type { Gang, RankedGang, ScoringConfig } from "./types.mts";

function validateScoringConfig(config: ScoringConfig): void {
  for (const field of [
    "territoryPoints", "gangZonePoints", "basePoints", "bankUnitPoints", "bankPointsCap",
  ] as const) {
    if (!Number.isSafeInteger(config[field]) || config[field] < 0) {
      throw new RangeError(`Scoring ${field} deve ser inteiro não negativo.`);
    }
  }
  if (!Number.isSafeInteger(config.bankUnit) || config.bankUnit <= 0) {
    throw new RangeError("Scoring bankUnit deve ser inteiro positivo.");
  }
}

export function calculateGangScore(gang: Readonly<Gang>, config: ScoringConfig): number {
  validateGang(gang);
  validateScoringConfig(config);
  const bankPoints = Math.min(
    Math.floor(gang.bankBalance / config.bankUnit) * config.bankUnitPoints,
    config.bankPointsCap,
  );
  const score = gang.territoryCount * config.territoryPoints +
    gang.gangZoneCount * config.gangZonePoints +
    gang.baseCount * config.basePoints + bankPoints;
  if (!Number.isSafeInteger(score)) {
    throw new RangeError(`Gang ${gang.id}: pontuação excede a precisão segura.`);
  }
  return score;
}

export function rankGangs(
  gangs: readonly Readonly<Gang>[],
  config: ScoringConfig,
): RankedGang[] {
  validateGangs(gangs);
  validateScoringConfig(config);
  // Ordenação por id usa comparação ASCII, independente do locale/engine.
  return gangs.map((gang) => ({ gang: { ...gang }, score: calculateGangScore(gang, config) }))
    .sort((a, b) => b.score - a.score ||
      (a.gang.id < b.gang.id ? -1 : a.gang.id > b.gang.id ? 1 : 0))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}
