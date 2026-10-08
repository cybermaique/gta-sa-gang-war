import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGangs } from "../src/GangWarOffline/core/gangs.mts";
import { calculateGangScore, rankGangs } from "../src/GangWarOffline/core/ranking.mts";
import { DEFAULT_SCORING } from "../src/GangWarOffline/config/scoring.mts";
import type { Gang, ScoringConfig } from "../src/GangWarOffline/core/types.mts";

function gang(overrides: Partial<Gang> = {}): Gang {
  return { ...createInitialGangs()[0]!, ...overrides };
}

test("soma territórios, GZs, bases e unidades completas do banco", () => {
  assert.equal(calculateGangScore(gang({
    territoryCount: 2, gangZoneCount: 3, baseCount: 1, bankBalance: 25_999.99,
  }), DEFAULT_SCORING), 1_470);
});

test("ordena o ranking demonstrativo por pontuação e retorna posições", () => {
  const ranking = rankGangs(createInitialGangs(), DEFAULT_SCORING);
  assert.deepEqual(ranking.map(({ gang, score, position }) => [gang.id, score, position]), [
    ["ballas", 2_110, 1], ["los-vagos", 1_950, 2],
    ["grove-street", 1_580, 3], ["aztecas", 970, 4],
  ]);
});

test("desempata por id ascendente independentemente da ordem de entrada", () => {
  const gangs = createInitialGangs().map((value) => ({
    ...value, territoryCount: 0, gangZoneCount: 0, baseCount: 0, bankBalance: 0,
  }));
  const expected = ["aztecas", "ballas", "grove-street", "los-vagos"];
  for (const input of [gangs, [...gangs].reverse(), [...gangs.slice(2), ...gangs.slice(0, 2)]]) {
    assert.deepEqual(rankGangs(input, DEFAULT_SCORING).map((value) => value.gang.id), expected);
  }
});

test("gangue sem territórios recebe pontos das outras propriedades", () => {
  const value = gang({ territoryCount: 0, gangZoneCount: 1, baseCount: 1, bankBalance: 0 });
  assert.equal(calculateGangScore(value, DEFAULT_SCORING), 750);
  assert.equal(rankGangs([value], DEFAULT_SCORING)[0]!.position, 1);
});

test("saldo zero e patrimônio vazio produzem zero pontos", () => {
  assert.equal(calculateGangScore(gang({
    territoryCount: 0, gangZoneCount: 0, baseCount: 0, bankBalance: 0,
  }), DEFAULT_SCORING), 0);
});

test("banco conta somente unidades completas e aplica teto de 300 pontos", () => {
  for (const [bankBalance, expected] of [
    [0, 0], [9_999.99, 0], [10_000, 10], [19_999.99, 10], [20_000, 20],
    [299_999.99, 290], [300_000, 300], [310_000, 300], [1_000_000, 300],
  ] as const) {
    assert.equal(calculateGangScore(gang({
      territoryCount: 0, gangZoneCount: 0, baseCount: 0, bankBalance,
    }), DEFAULT_SCORING), expected);
  }
});

test("todos os pesos são configuráveis", () => {
  const config: ScoringConfig = {
    territoryPoints: 1, gangZonePoints: 2, basePoints: 3,
    bankUnit: 100, bankUnitPoints: 4, bankPointsCap: 5,
  };
  assert.equal(calculateGangScore(gang({
    territoryCount: 2, gangZoneCount: 3, baseCount: 4, bankBalance: 200,
  }), config), 25);
});

test("vitórias e derrotas não influenciam a pontuação v0.1", () => {
  assert.equal(calculateGangScore(gang({ wins: 99, losses: 50 }), DEFAULT_SCORING), 1_580);
});

for (const field of [
  "members", "bankBalance", "territoryCount", "gangZoneCount", "baseCount", "wins", "losses",
] as const) {
  test(`rejeita ${field} negativo no cálculo e no ranking`, () => {
    const value = gang({ [field]: -1 });
    assert.throws(() => calculateGangScore(value, DEFAULT_SCORING), RangeError);
    assert.throws(() => rankGangs([value], DEFAULT_SCORING), RangeError);
  });
}

test("rejeita NaN, infinito, frações em contagens e valores fora da precisão segura", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => calculateGangScore(gang({ bankBalance: value }), DEFAULT_SCORING));
    assert.throws(() => calculateGangScore(gang({ territoryCount: value }), DEFAULT_SCORING));
  }
  assert.throws(() => calculateGangScore(gang({ territoryCount: 1.5 }), DEFAULT_SCORING));
  assert.throws(() => calculateGangScore(gang({ bankBalance: Number.MAX_SAFE_INTEGER + 1 }), DEFAULT_SCORING));
  assert.throws(() => calculateGangScore(gang({ territoryCount: Number.MAX_SAFE_INTEGER }), DEFAULT_SCORING));
});

test("rejeita configuração inválida inclusive para ranking vazio", () => {
  for (const field of Object.keys(DEFAULT_SCORING) as (keyof ScoringConfig)[]) {
    for (const invalid of [-1, NaN, Infinity, 0.5]) {
      const config = { ...DEFAULT_SCORING, [field]: invalid };
      assert.throws(() => calculateGangScore(gang(), config));
      assert.throws(() => rankGangs([], config));
    }
  }
  assert.throws(() => rankGangs([], { ...DEFAULT_SCORING, bankUnit: 0 }));
});

test("cálculo e ranking aceitam dados congelados e não alteram o original", () => {
  const gangs = Object.freeze(createInitialGangs().map((value) => Object.freeze(value)));
  const snapshot = JSON.stringify(gangs);
  const ranking = rankGangs(gangs, DEFAULT_SCORING);
  calculateGangScore(gangs[0]!, DEFAULT_SCORING);
  assert.equal(JSON.stringify(gangs), snapshot);
  assert.notEqual(ranking[0]!.gang, gangs.find((value) => value.id === ranking[0]!.gang.id));
});

test("recalcula o ranking após mudança de dados e preserva o resultado anterior", () => {
  const gangs = createInitialGangs();
  const previous = rankGangs(gangs, DEFAULT_SCORING);
  gangs[0]!.territoryCount = 20;
  const current = rankGangs(gangs, DEFAULT_SCORING);
  assert.equal(current[0]!.gang.id, "grove-street");
  assert.equal(current[0]!.score, 3_080);
  assert.equal(previous[2]!.gang.territoryCount, 5);
  assert.equal(previous[2]!.score, 1_580);
});

test("ranking vazio é válido e ids duplicados são rejeitados", () => {
  assert.deepEqual(rankGangs([], DEFAULT_SCORING), []);
  assert.throws(() => rankGangs([gang(), gang()], DEFAULT_SCORING), /duplicado/);
});
