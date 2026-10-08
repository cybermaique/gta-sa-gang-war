import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGangs } from "../src/GangWarOffline/core/gangs.mts";
import { GangWarInitializationError, POLL_INTERVAL_MS, reportGtaError, startGangWar } from "../src/GangWarOffline/adapters/gta.mts";
import { RANKING_SHORTCUT } from "../src/GangWarOffline/config/keyboard.mts";
import type { GtaRuntime } from "../src/GangWarOffline/adapters/gta.mts";

function fakeGta(host = "sa") {
  const messages: string[] = [];
  const logs: string[] = [];
  let callback: (() => void) | undefined;
  const pressedKeys = new Set<number>();
  const setKey = (keyCode: number, value: boolean) => {
    if (value) pressedKeys.add(keyCode);
    else pressedKeys.delete(keyCode);
  };
  const setShortcut = (value: boolean) => {
    for (const keyCode of RANKING_SHORTCUT.keys) setKey(keyCode, value);
  };
  let onMission = false;
  let stopped = false;
  const runtime: GtaRuntime = {
    host,
    log: (message) => { logs.push(message); },
    showTextBox: (message) => { messages.push(message); },
    isKeyPressed: (keyCode) => {
      assert.ok(RANKING_SHORTCUT.keys.includes(keyCode));
      return pressedKeys.has(keyCode);
    },
    isOnMission: () => onMission,
    setInterval: (tick, delay) => {
      assert.equal(delay, POLL_INTERVAL_MS);
      callback = tick;
      return 1;
    },
    clearInterval: (id) => { assert.equal(id, 1); stopped = true; },
  };
  return {
    runtime, messages, logs,
    key: setShortcut,
    setKey,
    mission: (value: boolean) => { onMission = value; },
    tick: () => { callback?.(); },
    press: () => { setShortcut(false); callback?.(); setShortcut(true); callback?.(); },
    isStopped: () => stopped,
  };
}

test("inicia no SA, registra ranking completo e não repete logs durante consultas", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  assert.match(gta.messages[0]!, /v0.1 carregado/);
  assert.ok(gta.logs.some((message) => message.includes("[validacao] OK: 4 gangues validadas")));
  assert.ok(gta.logs.some((message) => message.includes("[atalho] OK: Ctrl + G registrado")));
  const rankingLog = gta.logs.find((message) => message.includes("[ranking] OK:"));
  assert.ok(rankingLog);
  for (const id of ["grove-street", "ballas", "los-vagos", "aztecas"]) {
    assert.ok(rankingLog.includes(id));
  }
  const startupLogCount = gta.logs.length;
  gta.press();
  gta.tick();
  gta.tick();
  assert.equal(gta.logs.length, startupLogCount);
});

test("Ctrl + G segurado não repete; soltar e pressionar percorre ranking e volta ao início", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  gta.press();
  for (let tick = 0; tick < 50; tick++) gta.tick();
  assert.equal(gta.messages.length, 2);
  assert.match(gta.messages[1]!, /DEMO 1\/4: Ballas.*2110 pts/);
  gta.press();
  gta.press();
  gta.press();
  gta.press();
  assert.match(gta.messages[2]!, /2\/4: Los Santos Vagos/);
  assert.match(gta.messages[3]!, /3\/4: Grove Street Families \[JOGADOR\]/);
  assert.match(gta.messages[4]!, /4\/4: Varrios Los Aztecas/);
  assert.match(gta.messages[5]!, /1\/4: Ballas/);
});

test("ignora combinação já pressionada ao carregar o script", () => {
  const gta = fakeGta();
  gta.key(true);
  startGangWar(gta.runtime);
  gta.tick();
  assert.equal(gta.messages.length, 1);
  gta.press();
  assert.equal(gta.messages.length, 2);
});

test("suprime textos durante missões sem avançar posição nem disparar tecla segurada depois", () => {
  const gta = fakeGta();
  gta.mission(true);
  startGangWar(gta.runtime);
  gta.press();
  assert.equal(gta.messages.length, 0);
  gta.mission(false);
  gta.tick();
  assert.equal(gta.messages.length, 0);
  gta.press();
  assert.match(gta.messages[0]!, /1\/4: Ballas/);
});

test("não consulta APIs de jogo nem cria timer em host diferente de SA", () => {
  const gta = fakeGta("vc");
  gta.runtime.isKeyPressed = () => { throw new Error("Não deve consultar entrada"); };
  gta.runtime.showTextBox = () => { throw new Error("Não deve exibir texto"); };
  gta.runtime.isOnMission = () => { throw new Error("Não deve consultar missão"); };
  gta.runtime.setInterval = () => { throw new Error("Não deve iniciar timer"); };
  assert.doesNotThrow(() => startGangWar(gta.runtime)());
  assert.equal(gta.logs.length, 1);
  assert.match(gta.logs[0]!, /Host não suportado/);
});

test("Ctrl + G usa dados atuais e lida com lista de gangues vazia", () => {
  const gta = fakeGta();
  const gangs = createInitialGangs();
  startGangWar(gta.runtime, () => gangs);
  gangs[0]!.territoryCount = 20;
  gta.press();
  assert.match(gta.messages[1]!, /1\/4: Grove Street Families.*3080 pts/);
  gangs.length = 0;
  gta.press();
  assert.match(gta.messages[2]!, /nenhuma gangue/);
});

test("falha de consulta cancela timer e registra erro uma só vez", () => {
  const gta = fakeGta();
  const gangs = createInitialGangs();
  startGangWar(gta.runtime, () => gangs);
  const startupLogCount = gta.logs.length;
  gangs[0]!.bankBalance = -1;
  assert.doesNotThrow(() => gta.press());
  assert.ok(gta.isStopped());
  assert.match(gta.logs[gta.logs.length - 1]!, /ERRO \[consulta-ranking\].*bankBalance/);
  gta.press();
  gta.tick();
  assert.equal(gta.logs.length, startupLogCount + 1);
});

test("falha na API de entrada é contida e o timer é encerrado", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  gta.runtime.isKeyPressed = () => { throw new Error("Pad indisponível"); };
  assert.doesNotThrow(gta.tick);
  assert.ok(gta.isStopped());
  assert.match(gta.logs[gta.logs.length - 1]!, /Pad indisponível/);
});

test("desligamento explícito é idempotente e não processa novos eventos", () => {
  const gta = fakeGta();
  const stop = startGangWar(gta.runtime);
  stop();
  stop();
  gta.press();
  assert.ok(gta.isStopped());
  assert.equal(gta.messages.length, 1);
});

test("diagnóstico não lança erro caso a API de log esteja indisponível", () => {
  const gta = fakeGta();
  gta.runtime.log = () => { throw new Error("log indisponível"); };
  assert.doesNotThrow(() => reportGtaError(gta.runtime, "falha"));
});

test("configuração centraliza os códigos Ctrl e G e o texto do atalho", () => {
  assert.deepEqual(RANKING_SHORTCUT.keys, [17, 71]);
  assert.equal(RANKING_SHORTCUT.label, "Ctrl + G");
  assert.ok(Object.isFrozen(RANKING_SHORTCUT));
  assert.ok(Object.isFrozen(RANKING_SHORTCUT.keys));
});

test("Ctrl sozinho, G sozinho e F7 não abrem nem avançam o ranking", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  for (const keyCode of [17, 71, 118]) {
    gta.setKey(keyCode, true);
    gta.tick();
    gta.tick();
    gta.setKey(keyCode, false);
    gta.tick();
  }
  assert.equal(gta.messages.length, 1);
  gta.press();
  assert.match(gta.messages[1]!, /1\/4: Ballas/);
  assert.match(gta.messages[1]!, /Ctrl \+ G: proxima/);
});

test("segurar Ctrl e tocar G avança uma posição por toque", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  gta.setKey(17, true);
  gta.tick();
  for (let position = 1; position <= 5; position++) {
    gta.setKey(71, true);
    gta.tick();
    for (let tick = 0; tick < 20; tick++) gta.tick();
    assert.equal(gta.messages.length, position + 1);
    assert.ok(gta.messages[position]!.includes(`${(position - 1) % 4 + 1}/4`));
    gta.setKey(71, false);
    gta.tick();
  }
});

test("G antes de Ctrl também funciona; soltar Ctrl permite um novo acionamento", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  gta.setKey(71, true);
  gta.tick();
  assert.equal(gta.messages.length, 1);
  gta.setKey(17, true);
  gta.tick();
  gta.tick();
  assert.equal(gta.messages.length, 2);
  gta.setKey(17, false);
  gta.tick();
  gta.setKey(17, true);
  gta.tick();
  assert.equal(gta.messages.length, 3);
  assert.match(gta.messages[2]!, /2\/4: Los Santos Vagos/);
});

test("teclas pressionadas sem sobreposição não acionam o atalho", () => {
  const gta = fakeGta();
  startGangWar(gta.runtime);
  gta.setKey(17, true);
  gta.tick();
  gta.setKey(17, false);
  gta.setKey(71, true);
  gta.tick();
  assert.equal(gta.messages.length, 1);
});

test("Ctrl já segurado ao carregar permite o primeiro toque de G", () => {
  const gta = fakeGta();
  gta.setKey(17, true);
  startGangWar(gta.runtime);
  gta.setKey(71, true);
  gta.tick();
  assert.match(gta.messages[1]!, /1\/4: Ballas/);
});

test("regressão: inicia quatro gangues, ranking e Ctrl + G com Date.parse retornando NaN", (t) => {
  t.mock.method(Date, "parse", () => NaN);
  t.mock.method(Date.prototype, "toISOString", () => { throw new Error("ISO incompatível"); });
  const gta = fakeGta();
  assert.doesNotThrow(() => startGangWar(gta.runtime));
  assert.ok(gta.logs.some((message) => message.includes("[validacao] OK: 4")));
  assert.ok(gta.logs.some((message) => message.includes("[ranking] OK:")));
  assert.ok(gta.logs.some((message) => message.includes("[atalho] OK: Ctrl + G registrado")));
  gta.press();
  assert.match(gta.messages[1]!, /1\/4: Ballas.*2110 pts/);
  gta.tick();
  assert.equal(gta.messages.length, 2);
});

test("erros de validação, ranking e registro do atalho identificam a etapa", () => {
  for (const stage of ["validacao", "ranking", "atalho"] as const) {
    const gta = fakeGta();
    const gangs = createInitialGangs();
    if (stage === "validacao") gangs[0]!.createdAt = "2026-02-30T00:00:00.000Z";
    if (stage === "ranking") gangs[0]!.territoryCount = Number.MAX_SAFE_INTEGER;
    if (stage === "atalho") {
      gta.runtime.setInterval = () => { throw new Error("Timer indisponível"); };
    }
    assert.throws(() => startGangWar(gta.runtime, () => gangs), (error) => {
      assert.ok(error instanceof GangWarInitializationError);
      assert.equal(error.stage, stage);
      reportGtaError(gta.runtime, error);
      return true;
    });
    assert.ok(gta.logs[gta.logs.length - 1]!.includes(`ERRO [${stage}]`));
    assert.ok(!gta.logs.some((message) => message.includes("Mod iniciado com sucesso")));
    assert.ok(!gta.logs.some((message) => message.includes("[atalho] OK:")));
  }
});
