export const PERSISTENCE_CONFIG = Object.freeze({
  // O binding IniFiles 1.2 falhou na releitura do snapshot real no GTA.
  // Mantenha o mundo em memoria para integrar/testar os sistemas sem tocar
  // snapshots; mude para "ini" somente apos uma validacao nativa completa.
  mode: "memory" as "memory" | "ini",
  // Temporario: confirma o binding real antes de tocar nos snapshots.
  diagnosticMode: "preflight" as "preflight" | "limits" | "off",
  // Modo off exige que este tamanho ja tenha sido confirmado pelo probe no GTA.
  confirmedChunkSize: 96,
});
