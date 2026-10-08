// Inicializacao apenas: nicknames, presenca e tags personalizados ficam no estado INI.
export const SOCIAL_CONFIG = Object.freeze({
  tabMode: "hold" as "hold" | "toggle",
  tabKey: 9, previousPageKey: 33, nextPageKey: 34,
  pageSize: 13, refreshMs: 500,
  scoreboardHud: Object.freeze({ maxWidth: 800, minWidth: 500, aspectRatio: 0.75,
    topInset: 32, rowHeight: 19 }),
  gangPageSize: 8, topPageSize: 7,
  noticeDurationMs: 4_000,
  humanId: "human-cj", humanNickname: "CJ",
  chatGlobalKeys: [84] as readonly number[], // T; Ctrl+T continua funcionando
  chatGangKeys: [17, 89] as readonly number[], // compatibilidade com Ctrl+Y
  gangChatPrefix: "!",
  chatHud: Object.freeze({ left: 20, feedTop: 8, feedHeight: 220,
    lineHeight: 24, feedPadding: 16, inputGap: 6,
    inputTop: 96, inputWidth: 800, inputHeight: 38 }),
  chatLimit: 100, chatRows: 8, chatHistoryLimit: 40, feedRows: 2,
  feedDurationMs: 8_000,
  // Novas chaves exigem tambem um produtor de evento confirmado; nao sao simuladas.
  points: Object.freeze({ kill: 5, conquest: 20, defense: 15, gzVictory: 25 } as Readonly<Record<string, number>>),
});
