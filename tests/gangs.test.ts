import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_GANGS } from "../src/GangWarOffline/config/gangs.mts";
import { createInitialGangs, getGangById, validateGang } from "../src/GangWarOffline/core/gangs.mts";
import type { Gang } from "../src/GangWarOffline/core/types.mts";

test("cadastro contém as quatro gangues, ids únicos, nomes e cores esperados", () => {
  const gangs = createInitialGangs();
  assert.deepEqual(gangs.map(({ id, name, color }) => [id, name, color]), [
    ["grove-street", "Grove Street Families", "#228B22"],
    ["ballas", "Ballas", "#800080"],
    ["los-vagos", "Los Santos Vagos", "#FFD700"],
    ["aztecas", "Varrios Los Aztecas", "#00BFFF"],
  ]);
  assert.equal(new Set(gangs.map((gang) => gang.id)).size, 4);
  assert.deepEqual(gangs.filter((gang) => gang.isPlayerGang).map((gang) => gang.id), ["grove-street"]);
  for (const gang of gangs) {
    assert.doesNotThrow(() => validateGang(gang));
    assert.equal(gang.leaderId, undefined);
  }
});

test("inicializações independentes não alteram a configuração nem compartilham gangues", () => {
  const first = createInitialGangs();
  const second = createInitialGangs();
  first[0]!.bankBalance = 0;
  assert.equal(second[0]!.bankBalance, 85_000);
  assert.equal(INITIAL_GANGS[0]!.bankBalance, 85_000);
  assert.ok(Object.isFrozen(INITIAL_GANGS));
  assert.ok(INITIAL_GANGS.every(Object.isFrozen));
});

test("busca gangue por id estável e retorna undefined para id ausente", () => {
  const gangs = createInitialGangs();
  assert.equal(getGangById(gangs, "ballas")?.name, "Ballas");
  assert.equal(getGangById(gangs, "grove-street")?.isPlayerGang, true);
  assert.equal(getGangById(gangs, "inexistente"), undefined);
  assert.equal(getGangById([], "ballas"), undefined);
});

test("busca rejeita ids duplicados para evitar resultado ambíguo", () => {
  const [gang] = createInitialGangs();
  assert.ok(gang);
  assert.throws(() => getGangById([gang, { ...gang }], gang.id), /duplicado/);
});

test("valida limites de agressividade e habilidade", () => {
  const gang = createInitialGangs()[0]!;
  for (const field of ["aggressiveness", "skillLevel"] as const) {
    for (const value of [-1, 101, NaN, Infinity]) {
      assert.throws(() => validateGang({ ...gang, [field]: value }), RangeError);
    }
    for (const value of [0, 100]) {
      assert.doesNotThrow(() => validateGang({ ...gang, [field]: value }));
    }
  }
});

test("valida identificadores, nome, cor, líder, flag e data ISO", () => {
  const gang = createInitialGangs()[0]!;
  const invalid: Partial<Gang>[] = [
    { id: "" }, { id: "Grove Street" }, { name: "  " }, { color: "#XYZ000" },
    { leaderId: " " }, { createdAt: "ontem" }, { createdAt: "2026-02-30T00:00:00.000Z" },
  ];
  for (const overrides of invalid) {
    assert.throws(() => validateGang({ ...gang, ...overrides }), TypeError);
  }
  assert.throws(() => validateGang({ ...gang, isPlayerGang: "true" } as unknown as Gang), TypeError);
  assert.throws(() => validateGang({ ...gang, id: null } as unknown as Gang), TypeError);
  assert.doesNotThrow(() => validateGang({ ...gang, leaderId: "member-cj" }));
});

test("regressão: as quatro datas do cadastro são válidas mesmo com Date.parse incompatível", (t) => {
  const parse = t.mock.method(Date, "parse", () => NaN);
  const iso = t.mock.method(Date.prototype, "toISOString", () => { throw new Error("ISO incompatível"); });
  const gangs = createInitialGangs();
  assert.equal(gangs.length, 4);
  for (const gang of gangs) {
    assert.equal(gang.createdAt, "2026-10-08T00:00:00.000Z");
    assert.doesNotThrow(() => validateGang(gang));
    assert.throws(() => validateGang({ ...gang, createdAt: "2026-02-30T00:00:00.000Z" }), /createdAt/);
  }
  assert.equal(parse.mock.callCount(), 0);
  assert.equal(iso.mock.callCount(), 0);
});
