import { logDateCompatibility } from "./adapters/diagnostics.mts";
import { reportGtaError, startGangWar } from "./adapters/gta.mts";
import type { GtaRuntime } from "./adapters/gta.mts";

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
    startGangWar(runtime);
  } else {
    log(`[GangWar] Host não suportado: ${HOST}. Esperado: sa.`);
  }
} catch (error) {
  reportGtaError(runtime, error);
}
