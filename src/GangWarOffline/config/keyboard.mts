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
