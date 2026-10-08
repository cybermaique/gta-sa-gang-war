import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const project = fileURLToPath(new URL("../", import.meta.url));

// Carrega o verdadeiro index.ts e toda sua árvore de imports em processo isolado.
// Simula somente os globais CLEO; não executa o GTA nem usa APIs Node no mod.
function loadEntry(host: string, failText = false, incompatibleDate = false) {
  const script = `
    const messages = [], logs = [];
    let callback, delay;
    const keys = new Set();
    const keyCodesRead = [];
    if (${incompatibleDate}) {
      Date.parse = () => NaN;
      Date.prototype.toISOString = () => { throw new Error('ISO incompatível'); };
    }
    globalThis.HOST = ${JSON.stringify(host)};
    globalThis.ONMISSION = false;
    globalThis.log = (message) => logs.push(message);
    globalThis.showTextBox = (message) => {
      if (${failText}) throw new Error('Texto indisponivel');
      messages.push(message);
    };
    globalThis.Pad = { IsKeyPressed: (keyCode) => { keyCodesRead.push(keyCode); return keys.has(keyCode); } };
    globalThis.setInterval = (tick, ms) => { callback = tick; delay = ms; return 1; };
    globalThis.clearInterval = () => {};
    await import('./src/GangWarOffline/index.ts');
    callback?.();
    keys.add(17); keys.add(71);
    callback?.();
    callback?.();
    console.log(JSON.stringify({ messages, logs, delay, keyCodesRead }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: project,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout) as { messages: string[]; logs: string[]; delay?: number; keyCodesRead: number[] };
}

test("entrada real carrega todos os imports, inicializa ranking e agenda consultas", () => {
  const result = loadEntry("sa");
  assert.match(result.messages[0]!, /Gang War Offline v0.1 carregado! Ctrl \+ G: ranking DEMO/);
  assert.equal(result.delay, 50);
  assert.ok(result.logs.some((message) => message.includes("[validacao] OK: 4")));
  assert.ok(result.logs.some((message) => message.includes("[ranking] OK:") && message.includes("grove-street") && message.includes("2110")));
  assert.ok(result.logs.some((message) => message.includes("[atalho] OK: Ctrl + G registrado")));
  assert.match(result.messages[1]!, /1\/4: Ballas.*2110/);
  assert.equal(result.messages.length, 2);
});

test("entrada real recusa outro host sem iniciar consulta", () => {
  const result = loadEntry("vc");
  assert.equal(result.messages.length, 0);
  assert.equal(result.delay, undefined);
  assert.match(result.logs[0]!, /Host não suportado/);
});

test("entrada real captura falha de inicialização sem exceção não tratada", () => {
  const result = loadEntry("sa", true);
  assert.equal(result.delay, undefined);
  assert.match(result.logs[result.logs.length - 1]!, /ERRO \[apresentacao\].*Texto indisponivel/);
});

test("entrada real diagnostica Date incompatível e ainda registra Ctrl + G funcional", () => {
  const result = loadEntry("sa", false, true);
  const diagnostic = result.logs.find((message) => message.includes("[compat-data]"));
  assert.ok(diagnostic);
  const report = JSON.parse(diagnostic.slice(diagnostic.indexOf("{")));
  assert.equal(report.value, "2026-10-08T00:00:00.000Z");
  assert.equal(report.dateParse, "NaN");
  assert.equal(report.legacyValidationPasses, false);
  assert.equal(report.calendarValid, true);
  assert.equal(result.delay, 50);
  assert.ok(result.keyCodesRead.includes(17));
  assert.ok(result.keyCodesRead.includes(71));
  assert.match(result.messages[1]!, /1\/4: Ballas.*2110/);
  assert.equal(result.messages.length, 2);
  assert.ok(!result.logs.some((message) => message.includes("ERRO")));
});
