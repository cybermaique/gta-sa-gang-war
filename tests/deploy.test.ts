import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const available = spawnSync(powershell, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
const skip = available.error ? "PowerShell indisponível nesta máquina" : false;

function withFixture(run: (root: string, game: string, script: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "gangwar-deploy-test-"));
  try {
    const game = join(root, "GTA DEV");
    const script = join(root, "project", "scripts", "deploy.ps1");
    mkdirSync(dirname(script), { recursive: true });
    cpSync(join(project, "scripts", "deploy.ps1"), script);
    cpSync(join(project, "src", "GangWarOffline"), join(root, "project", "src", "GangWarOffline"), { recursive: true });
    mkdirSync(game);
    run(root, game, script);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function deploy(script: string, game: string) {
  return spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-GamePath", game], { encoding: "utf8" });
}

function filesIn(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

test("deploy copia entrada e todos os módulos, preserva imports e outros arquivos", { skip }, () => {
  withFixture((root, game, script) => {
    const source = join(root, "project", "src", "GangWarOffline");
    const destination = join(game, "CLEO", "GangWarOffline");
    writeFileSync(join(game, "gta_sa.exe"), "fixture: executável não é alterado");
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "preservar.txt"), "arquivo existente");
    writeFileSync(join(game, "CLEO", "outro-mod.cs"), "outro mod");
    for (const folder of ["node_modules", "tests", ".git"]) {
      mkdirSync(join(source, folder));
      writeFileSync(join(source, folder, "nao-copiar.ts"), "ignorar");
    }
    writeFileSync(join(source, "ignorar.d.ts"), "ignorar");
    writeFileSync(join(source, "ignorar.log"), "ignorar");
    const result = deploy(script, game);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /deploy concluido/);
    const payload = filesIn(join(project, "src", "GangWarOffline"));
    for (const file of payload) {
      assert.deepEqual(readFileSync(join(destination, relative(join(project, "src", "GangWarOffline"), file))), readFileSync(file));
    }
    assert.equal(filesIn(destination).length, payload.length + 1);
    assert.equal(readFileSync(join(destination, "preservar.txt"), "utf8"), "arquivo existente");
    assert.equal(readFileSync(join(game, "CLEO", "outro-mod.cs"), "utf8"), "outro mod");
    assert.equal(readFileSync(join(game, "gta_sa.exe"), "utf8"), "fixture: executável não é alterado");
  });
});

test("deploy rejeita instalação sem gta_sa.exe antes de copiar arquivos", { skip }, () => {
  withFixture((_root, game, script) => {
    const result = deploy(script, game);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /gta_sa\.exe\s+ausente/);
    assert.deepEqual(readdirSync(game), []);
  });
});

test("deploy rejeita entrada ausente antes de copiar arquivos", { skip }, () => {
  withFixture((root, game, script) => {
    writeFileSync(join(game, "gta_sa.exe"), "fixture");
    rmSync(join(root, "project", "src", "GangWarOffline", "index.ts"));
    const result = deploy(script, game);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Script de entrada nao encontrado/);
    assert.deepEqual(readdirSync(game), ["gta_sa.exe"]);
  });
});
