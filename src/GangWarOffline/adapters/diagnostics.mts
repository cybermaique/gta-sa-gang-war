import { INITIAL_GANGS } from "../config/gangs.mts";
import { isValidIsoUtcTimestamp, isoUtcToEpoch } from "../core/dates.mts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Executável no próprio CLEO: uma vez por inicialização, somente log, sem timers.
// Cada API de Date é avaliada separadamente; falhar não bloqueia a inicialização.
export function logDateCompatibility(writeLog: (message: string) => void): void {
  const value = INITIAL_GANGS[0]!.createdAt;
  const report: Record<string, unknown> = {
    value,
    valueType: typeof value,
    valueLength: value.length,
    legacyRegexMatches: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),
    canonicalFormat: typeof value === "string" && value.length === 24 &&
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value),
    calendarValid: isValidIsoUtcTimestamp(value),
    expectedEpoch: isoUtcToEpoch(value),
  };
  const calendarChecks = [
    [value, true],
    ["2024-02-29T00:00:00.000Z", true],
    ["2000-02-29T00:00:00.000Z", true],
    ["2100-02-29T00:00:00.000Z", false],
    ["2026-02-30T00:00:00.000Z", false],
    ["2026-10-08T24:00:00.000Z", false],
  ] as const;
  const failedChecks = calendarChecks.filter(([input, expected]) => isValidIsoUtcTimestamp(input) !== expected);
  report.calendarSelfTestPasses = failedChecks.length === 0;
  report.calendarSelfTestFailures = failedChecks.map(([input]) => input);
  let parseValid = false;
  let roundTripValid = false;
  try {
    const timestamp = Date.parse(value);
    report.dateParse = String(timestamp); // Preserva NaN/Infinity; JSON os converteria em null.
    report.dateParseType = typeof timestamp;
    report.dateParseFinite = parseValid = Number.isFinite(timestamp);
    report.dateParseDeltaMs = Number.isFinite(timestamp) ? timestamp - isoUtcToEpoch(value) : "not-finite";
    report.dateParseMatchesExactEpoch = timestamp === isoUtcToEpoch(value);
    report.expectedEpochAsFloat32 = Math.fround(isoUtcToEpoch(value));
    report.matchesFloat32Rounding = timestamp !== isoUtcToEpoch(value) && timestamp === Math.fround(isoUtcToEpoch(value));
  } catch (error) {
    report.dateParseError = errorMessage(error);
  }
  try {
    const date = new Date(value);
    report.constructedTime = String(date.getTime());
    const iso = date.toISOString();
    report.toISOString = iso;
    report.roundTripMatches = roundTripValid = iso === value;
  } catch (error) {
    report.dateRoundTripError = errorMessage(error);
  }
  report.legacyValidationPasses = report.legacyRegexMatches === true && parseValid && roundTripValid;
  try {
    writeLog(`[GangWar] [compat-data] ${JSON.stringify(report)}`);
  } catch { /* Diagnóstico opcional não impede o mod. */ }
}
