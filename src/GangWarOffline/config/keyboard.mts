export interface KeyboardShortcut {
  readonly keys: readonly number[];
  readonly label: string;
}

// Virtual keys conferidas em CLEO/.config/sa.enums.mts (CLEO Redux 1.5.1):
// Ctrl = 0x11 (17), G = 0x47 (71). Todas as teclas devem estar pressionadas.
export const RANKING_SHORTCUT: KeyboardShortcut = Object.freeze({
  keys: Object.freeze([0x11, 0x47]),
  label: "Ctrl + G",
});

export const DEV_SHORTCUTS = Object.freeze({
  page: { keys: [17, 77], label: "Ctrl + M" },
  pagePrev: { keys: [17, 37], label: "Ctrl + Esquerda" },
  pageNext: { keys: [17, 39], label: "Ctrl + Direita" },
  action: { keys: [17, 78], label: "Ctrl + N" },
  target: { keys: [17, 66], label: "Ctrl + B" },
  slot: { keys: [17, 76], label: "Ctrl + L" },
  increase: { keys: [17, 38], label: "Ctrl + Cima" },
  decrease: { keys: [17, 40], label: "Ctrl + Baixo" },
  execute: { keys: [17, 13], label: "Ctrl + Enter" },
  stop: { keys: [17, 27], label: "Ctrl + Esc" },
});
