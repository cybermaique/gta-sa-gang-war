// Contratos opcionais. Nenhum comando CLEO+ e executado por este modulo.
// Um provider futuro deve primeiro comprovar plugin carregado e versao/ABI compativel.
export interface ActorBinding { participantId: string; handle: number }
// Coordenadas normalizadas para o plano HUD 640x448, nao pixels da janela.
export interface ProjectedPoint { x: number; y: number }
export interface ConfirmedDeath { victimId: string; killerId?: string }
export interface SocialCapabilities {
  readonly description: string;
  readonly compatible: boolean;
  readonly verifiedOnInstallation: boolean;
  projectHead?(actor: ActorBinding): ProjectedPoint | null;
  // Somente autoria da morte confirmada. Ultimo agressor/alvo de IA nao sao prova.
  identifyKiller?(victim: ActorBinding, actors: readonly ActorBinding[]): string | undefined;
}
export const BASE_SOCIAL_CAPABILITIES: SocialCapabilities = Object.freeze({
  description: "CLEO Redux 1.5.1: nametags 3D/autoria de abates indisponiveis; CLEO+ nao exigido",
  compatible: true,
  verifiedOnInstallation: false,
});
