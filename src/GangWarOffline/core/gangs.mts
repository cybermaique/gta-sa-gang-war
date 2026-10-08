import { INITIAL_GANGS } from "../config/gangs.mts";
import { isValidIsoUtcTimestamp } from "./dates.mts";
import type { Gang, GangId } from "./types.mts";

const COUNT_FIELDS = [
  "members", "territoryCount", "gangZoneCount", "baseCount", "wins", "losses",
] as const;

export function validateGang(gang: Readonly<Gang>): void {
  if (typeof gang.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(gang.id)) {
    throw new TypeError("Gang id deve ser um identificador estável em kebab-case.");
  }
  if (typeof gang.name !== "string" || gang.name.trim().length === 0) {
    throw new TypeError(`Gang ${gang.id}: name vazio.`);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(gang.color)) {
    throw new TypeError(`Gang ${gang.id}: color deve ser hexadecimal #RRGGBB.`);
  }
  if (gang.leaderId !== undefined &&
      (typeof gang.leaderId !== "string" || gang.leaderId.trim().length === 0)) {
    throw new TypeError(`Gang ${gang.id}: leaderId inválido.`);
  }
  for (const field of COUNT_FIELDS) {
    if (!Number.isSafeInteger(gang[field]) || gang[field] < 0) {
      throw new RangeError(`Gang ${gang.id}: ${field} deve ser inteiro não negativo.`);
    }
  }
  if (!Number.isFinite(gang.bankBalance) || gang.bankBalance < 0 ||
      gang.bankBalance > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`Gang ${gang.id}: bankBalance deve ser finito e não negativo.`);
  }
  for (const field of ["aggressiveness", "skillLevel"] as const) {
    if (!Number.isFinite(gang[field]) || gang[field] < 0 || gang[field] > 100) {
      throw new RangeError(`Gang ${gang.id}: ${field} deve estar entre 0 e 100.`);
    }
  }
  if (typeof gang.isPlayerGang !== "boolean") {
    throw new TypeError(`Gang ${gang.id}: isPlayerGang deve ser booleano.`);
  }
  if (!isValidIsoUtcTimestamp(gang.createdAt)) {
    throw new TypeError(`Gang ${gang.id}: createdAt deve ser uma data ISO UTC válida. Valor: ${JSON.stringify(gang.createdAt)}`);
  }
}

export function validateGangs(gangs: readonly Readonly<Gang>[]): void {
  const ids = new Set<GangId>();
  for (const gang of gangs) {
    validateGang(gang);
    if (ids.has(gang.id)) {
      throw new TypeError(`Gang id duplicado: ${gang.id}.`);
    }
    ids.add(gang.id);
  }
}

export function createInitialGangs(): Gang[] {
  validateGangs(INITIAL_GANGS);
  return INITIAL_GANGS.map((gang) => ({ ...gang }));
}

export function getGangById(
  gangs: readonly Readonly<Gang>[],
  id: GangId,
): Readonly<Gang> | undefined {
  validateGangs(gangs);
  return gangs.find((gang) => gang.id === id);
}
