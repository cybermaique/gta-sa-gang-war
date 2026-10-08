import { logDateCompatibility } from "./adapters/diagnostics.mts";
import { reportGtaError, startGangWar } from "./adapters/gta.mts";
import type { GtaRuntime } from "./adapters/gta.mts";
import { startWorldRuntime } from "./adapters/world-runtime.mts";
import { createIniAdapter } from "./adapters/ini.mts";

// Somente este ponto conecta o mod às APIs globais verificadas do CLEO Redux.
const runtime: GtaRuntime = {
  host: HOST,
  log: (message) => log(message),
  showTextBox: (message) => showTextBox(message),
  isKeyPressed: (keyCode) => Pad.IsKeyPressed(keyCode),
  isOnMission: () => ONMISSION,
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (id) => clearInterval(id),
};

try {
  if (HOST === "sa") {
    logDateCompatibility(runtime.log);
    if (typeof native === "function") {
      startWorldRuntime(runtime, (name, ...args) => native(name, ...args), createIniAdapter({
        exists: (path) => Fs.DoesFileExist(path),
        read: (path, section, key) => IniFile.ReadString(path, section, key),
        write: (value, path, section, key) => IniFile.WriteString(value, path, section, key),
      }), __dirname, typeof FxtStore === "undefined" ? undefined : FxtStore, undefined, {
        listen: (name, callback) => addEventListener(name, (event) => callback(event.data)),
      });
    } else {
      // Ambiente sem engine (ex.: ferramentas Node): somente a integracao v0.1.
      log("[GangWar] [mundo] Engine indisponivel; somente ranking v0.1. Fases 2-10 nao inicializadas.");
      startGangWar(runtime);
    }
  } else {
    log(`[GangWar] Host não suportado: ${HOST}. Esperado: sa.`);
  }
} catch (error) {
  reportGtaError(runtime, error);
}
