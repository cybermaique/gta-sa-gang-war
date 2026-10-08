import fs from "node:fs";
import path from "node:path";

// Diagnostico somente leitura, nao e teste unitario nem instala plugins.
const game = process.argv[2] ?? "C:\\Games\\GTA-SA-GangWar-DEV";
const apiPath = path.join(game, "CLEO", ".config", "sa.json");
const api = JSON.parse(fs.readFileSync(apiPath, "utf8"));
const logPath = path.join(game, "cleo_redux.log");
const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
const pluginDirs = [game, path.join(game, "CLEO"), path.join(game, "CLEO", "CLEO_PLUGINS")];
const candidates = pluginDirs.flatMap((dir) => fs.existsSync(dir) ? fs.readdirSync(dir)
  .filter((name) => /^cleo\+\.(asi|cleo)$/i.test(name)).map((name) => path.join(dir, name)) : []);
const loadedEvidence = log.split(/\r?\n/).filter((line) => /(?:loaded|loading).*cleo\+/i.test(line));
const commands = api.extensions.flatMap((ext) => ext.name === "CLEO+" ? ext.commands : []);
console.log(JSON.stringify({
  game, libraryVersion: api.meta.version,
  reduxLogEvidence: log.split(/\r?\n/).filter((line) => /CLEO Redux|host version|API version/i.test(line)).slice(0, 8),
  cleoPlusFiles: candidates, cleoPlusLoadEvidence: loadedEvidence,
  optionalCommandsInCatalog: commands.filter((c) => ["CONVERT_3D_TO_SCREEN_2D", "GET_CHAR_DAMAGE_LAST_FRAME"].includes(c.name)).map((c) => c.name),
  compatibleProviderVerified: false,
  status: candidates.length || loadedEvidence.length ? "Presenca possivel; versao/ABI e comportamento ainda exigem prova no GTA. Provider permanece desligado." :
    "CLEO+ nao encontrado; provider opcional desligado. Chat, TAB e persistencia nao dependem dele.",
  warning: "Um comando no catalogo sa.json NAO comprova plugin instalado. Ultimo dano NAO comprova autoria da morte.",
}, null, 2));
