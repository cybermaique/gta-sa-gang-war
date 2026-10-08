import type { Position } from "../core/world-types.mts";

export interface NativeApi { <T>(name: string, ...args: unknown[]): T }
export class GameEngine {
  constructor(readonly call: NativeApi) {}
  char(): number { return this.call<number>("GET_PLAYER_CHAR", 0); }
  exists(char: number): boolean { return this.call<boolean>("DOES_CHAR_EXIST", char); }
  dead(char: number): boolean { return !this.exists(char) || this.call<boolean>("IS_CHAR_DEAD", char); }
  position(char = this.char()): Position {
    const p = this.call<{ x: number; y: number; z: number }>("GET_CHAR_COORDINATES", char);
    const heading = this.call<number>("GET_CHAR_HEADING", char);
    return { ...p, heading: (heading % 360 + 360) % 360 };
  }
  canPresent(onMission: boolean): boolean {
    // HUD/consultas podem aparecer em interiores; apenas missao/loading/fade bloqueiam.
    return !onMission && this.call<boolean>("IS_PLAYER_PLAYING", 0) &&
      !this.call<boolean>("GET_FADING_STATUS");
  }
  safe(onMission: boolean, _chatOwnsControls = false): boolean {
    // HAS_CUTSCENE_LOADED indica recursos carregados, nao uma cutscene ativa;
    // IS_PLAYER_CONTROL_ON tambem diverge no Redux durante jogo livre.
    return this.canPresent(onMission) && this.call<number>("GET_AREA_VISIBLE") === 0;
  }
  ground(point: Position): Position {
    this.call<void>("REQUEST_COLLISION", point.x, point.y);
    const z = this.call<number>("GET_GROUND_Z_FOR_3D_COORD", point.x, point.y, point.z + 5);
    if (!Number.isFinite(z) || Math.abs(z - point.z) > 4) throw new Error("Solo sem colisao carregada ou ponto inseguro; calibre no local a pe.");
    return { ...point, z: z + 1 };
  }
  model(id: number): boolean {
    this.call<void>("REQUEST_MODEL", id);
    return this.call<boolean>("HAS_MODEL_LOADED", id);
  }
  releaseModel(id: number): void { this.call<void>("MARK_MODEL_AS_NO_LONGER_NEEDED", id); }
}
export function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}
