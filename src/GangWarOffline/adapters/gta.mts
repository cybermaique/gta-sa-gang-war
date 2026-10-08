import { createInitialGangs, validateGangs } from "../core/gangs.mts";
import { rankGangs } from "../core/ranking.mts";
import { DEFAULT_SCORING } from "../config/scoring.mts";
import { RANKING_SHORTCUT } from "../config/keyboard.mts";
import type { Gang } from "../core/types.mts";

export const POLL_INTERVAL_MS = 50;

type InitializationStage = "validacao" | "ranking" | "apresentacao" | "atalho";

export class GangWarInitializationError extends Error {
  constructor(readonly stage: InitializationStage, error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = "GangWarInitializationError";
  }
}

// Interface pequena permite testar o controle da tecla sem abrir o GTA.
export interface GtaRuntime {
  readonly host: string;
  log(message: string): void;
  showTextBox(message: string): void;
  isKeyPressed(keyCode: number): boolean;
  isOnMission(): boolean;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
}

export function reportGtaError(runtime: GtaRuntime, error: unknown, stage = "execucao"): void {
  const message = error instanceof Error ? error.message : String(error);
  const phase = error instanceof GangWarInitializationError ? error.stage : stage;
  // Uma falha da própria API de diagnóstico também não deve derrubar o script.
  try { runtime.log(`[GangWar] ERRO [${phase}]: ${message}`); } catch { /* API indisponível */ }
}

export function startGangWar(
  runtime: GtaRuntime,
  getGangs?: () => readonly Readonly<Gang>[],
): () => void {
  if (runtime.host !== "sa") {
    runtime.log(`[GangWar] Host não suportado: ${runtime.host}. Esperado: sa.`);
    return () => {};
  }

  let stage: InitializationStage = "validacao";
  let timerId: number | undefined;
  let stopped = false;
  try {
    runtime.log("[GangWar] [validacao] Iniciando cadastro de gangues.");
    const initialGangs = getGangs ? getGangs() : createInitialGangs();
    validateGangs(initialGangs);
    const currentGangs = getGangs ?? (() => initialGangs);
    runtime.log(`[GangWar] [validacao] OK: ${initialGangs.length} gangues validadas.`);

    stage = "ranking";
    runtime.log("[GangWar] [ranking] Calculando ranking inicial DEMO.");
    const initialRanking = rankGangs(initialGangs, DEFAULT_SCORING);
    runtime.log(`[GangWar] [ranking] OK: Ranking inicial completo (DEMO): ${JSON.stringify(initialRanking)}`);
    stage = "apresentacao";
    if (!runtime.isOnMission()) {
      runtime.showTextBox(`Gang War Offline v0.1 carregado! ${RANKING_SHORTCUT.label}: ranking DEMO.`);
    }

    stage = "atalho";
    runtime.log(`[GangWar] [atalho] Registrando ${RANKING_SHORTCUT.label}; teclas=${RANKING_SHORTCUT.keys.join(",")}.`);
    const isShortcutPressed = () => RANKING_SHORTCUT.keys.every((keyCode) => runtime.isKeyPressed(keyCode));
    // Ignora a combinação já segurada ao carregar; só avança em uma nova borda.
    let wasPressed = isShortcutPressed();
    let nextPosition = 0;
    timerId = runtime.setInterval(() => {
      if (stopped) return;
      try {
        const pressed = isShortcutPressed();
        const justPressed = pressed && !wasPressed;
        wasPressed = pressed;
        if (!justPressed || runtime.isOnMission()) return;

        const ranking = rankGangs(currentGangs(), DEFAULT_SCORING);
        if (ranking.length === 0) {
          runtime.showTextBox("Gang War DEMO: nenhuma gangue cadastrada.");
          nextPosition = 0;
          return;
        }
        const index = nextPosition % ranking.length;
        const entry = ranking[index]!;
        const player = entry.gang.isPlayerGang ? " [JOGADOR]" : "";
        runtime.showTextBox(
          `DEMO ${entry.position}/${ranking.length}: ${entry.gang.name}${player} - ${entry.score} pts. ${RANKING_SHORTCUT.label}: proxima.`,
        );
        nextPosition = (index + 1) % ranking.length;
      } catch (error) {
        stopped = true;
        try {
          if (timerId !== undefined) runtime.clearInterval(timerId);
        } catch { /* stopped impede repetições */ }
        reportGtaError(runtime, error, "consulta-ranking");
      }
    }, POLL_INTERVAL_MS);

    runtime.log(`[GangWar] [atalho] OK: ${RANKING_SHORTCUT.label} registrado; consulta a cada ${POLL_INTERVAL_MS} ms.`);
    runtime.log("[GangWar] Mod iniciado com sucesso! Gang War Offline v0.1 (DEMO).");

    return () => {
      if (!stopped) {
        stopped = true;
        if (timerId !== undefined) runtime.clearInterval(timerId);
      }
    };
  } catch (error) {
    stopped = true;
    try {
      if (timerId !== undefined) runtime.clearInterval(timerId);
    } catch { /* Preserva o erro original de inicialização. */ }
    throw new GangWarInitializationError(stage, error);
  }
}
