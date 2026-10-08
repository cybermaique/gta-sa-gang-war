import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidIsoUtcTimestamp } from "../src/GangWarOffline/core/dates.mts";
import { logDateCompatibility } from "../src/GangWarOffline/adapters/diagnostics.mts";

test("aceita data real do cadastro e limites canônicos de calendário/hora", () => {
  for (const value of [
    "2026-10-08T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    "2026-12-31T23:59:59.999Z", "2024-02-29T12:30:45.001Z",
    "2000-02-29T00:00:00.000Z", "0000-02-29T00:00:00.000Z",
    "0099-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z",
  ]) assert.equal(isValidIsoUtcTimestamp(value), true, value);
});

test("rejeita dias impossíveis, meses inválidos e anos seculares não bissextos", () => {
  for (const value of [
    "2026-02-29T00:00:00.000Z", "2026-02-30T00:00:00.000Z",
    "1900-02-29T00:00:00.000Z", "2100-02-29T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z", "2026-06-31T00:00:00.000Z",
    "2026-09-31T00:00:00.000Z", "2026-11-31T00:00:00.000Z",
    "2026-01-00T00:00:00.000Z", "2026-01-32T00:00:00.000Z",
    "2026-00-01T00:00:00.000Z", "2026-13-01T00:00:00.000Z",
  ]) assert.equal(isValidIsoUtcTimestamp(value), false, value);
});

test("rejeita hora, minuto e segundo fora do contrato, inclusive normalização 24h", () => {
  for (const value of [
    "2026-10-08T24:00:00.000Z", "2026-10-08T25:00:00.000Z",
    "2026-10-08T00:60:00.000Z", "2026-10-08T00:00:60.000Z",
  ]) assert.equal(isValidIsoUtcTimestamp(value), false, value);
});

test("rejeita offsets, precisão diferente, espaços, quebras de linha e tipos inválidos", () => {
  for (const value of [
    null, undefined, 1791417600000, {}, "", "2026-10-08",
    "2026-10-08T00:00:00Z", "2026-10-08T00:00:00.00Z",
    "2026-10-08T00:00:00.0000Z", "2026-10-08T00:00:00.000+00:00",
    "2026-10-08t00:00:00.000z", "2026-10-08T00:00:00.000Z\n",
    " 2026-10-08T00:00:00.000Z", "2026-10-08T00:00:00.000Z ",
  ]) assert.equal(isValidIsoUtcTimestamp(value), false, String(value));
});

test("diagnóstico captura separadamente formato, parsing e round-trip no Node", () => {
  const logs: string[] = [];
  logDateCompatibility((message) => logs.push(message));
  const report = JSON.parse(logs[0]!.slice(logs[0]!.indexOf("{")));
  assert.equal(report.value, "2026-10-08T00:00:00.000Z");
  assert.equal(report.valueType, "string");
  assert.equal(report.valueLength, 24);
  assert.equal(report.legacyRegexMatches, true);
  assert.equal(report.canonicalFormat, true);
  assert.equal(report.calendarValid, true);
  assert.equal(report.calendarSelfTestPasses, true);
  assert.deepEqual(report.calendarSelfTestFailures, []);
  assert.equal(report.dateParseFinite, true);
  assert.equal(report.roundTripMatches, true);
  assert.equal(report.legacyValidationPasses, true);
});

test("diagnóstico registra NaN e erros de Date sem interromper o mod", (t) => {
  t.mock.method(Date, "parse", () => NaN);
  t.mock.method(Date.prototype, "toISOString", () => { throw new Error("ISO indisponível"); });
  const logs: string[] = [];
  assert.doesNotThrow(() => logDateCompatibility((message) => logs.push(message)));
  const report = JSON.parse(logs[0]!.slice(logs[0]!.indexOf("{")));
  assert.equal(report.calendarValid, true);
  assert.equal(report.dateParse, "NaN");
  assert.equal(report.dateParseFinite, false);
  assert.equal(report.dateRoundTripError, "ISO indisponível");
  assert.equal(report.legacyValidationPasses, false);
  assert.doesNotThrow(() => logDateCompatibility(() => { throw new Error("Log indisponível"); }));
});

test("diagnóstico também detecta normalização diferente quando Date.parse é finito", (t) => {
  t.mock.method(Date.prototype, "toISOString", () => "2026-10-08T03:00:00.000Z");
  const logs: string[] = [];
  logDateCompatibility((message) => logs.push(message));
  const report = JSON.parse(logs[0]!.slice(logs[0]!.indexOf("{")));
  assert.equal(report.dateParseFinite, true);
  assert.equal(report.toISOString, "2026-10-08T03:00:00.000Z");
  assert.equal(report.roundTripMatches, false);
  assert.equal(report.legacyValidationPasses, false);
  assert.equal(report.calendarValid, true);
});
