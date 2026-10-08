import { isoUtcToEpoch } from "../core/dates.mts";
import { WORLD_RULES } from "../config/world.mts";

export function epochNow(): number {
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < 1_577_836_800_000 || now > 4_102_444_800_000) throw new Error("Date.now nao forneceu um epoch real valido. Mundo temporal bloqueado.");
  return now;
}

// Date.parse tem um defeito confirmado no log do runtime. Nao e usado no mundo.
// Round-trip numerico e progresso contra GET_GAME_TIMER sao verificados separadamente.
export class ClockMonitor {
  private reliable = false;
  private progressionConfirmed = false;
  private baseline: { wall: number; game: number } | null = null;
  private reason = "diagnostico pendente";
  constructor(private log: (message: string) => void) {}
  diagnose(now: number): void {
    const vectors = [
      ["2026-10-08T00:00:00.000Z", 1_791_417_600_000],
      ["1970-01-01T00:00:00.000Z", 0],
      ["2000-02-29T12:34:56.789Z", 951_827_696_789],
    ] as const;
    const results = vectors.map(([iso, expected]) => {
      let numericIso: string | undefined, numericTime: number | undefined, error: string | undefined;
      try { const d = new Date(expected); numericIso = d.toISOString(); numericTime = d.getTime(); }
      catch (e) { error = String(e); }
      return { iso, expected, calendarEpoch: isoUtcToEpoch(iso), numericIso, numericTime, error,
        matches: numericIso === iso && numericTime === expected && isoUtcToEpoch(iso) === expected };
    });
    let nowIso: string | undefined, nowRoundTrip: number | undefined, error: string | undefined;
    try { nowIso = new Date(now).toISOString(); nowRoundTrip = isoUtcToEpoch(nowIso); }
    catch (e) { error = String(e); }
    this.reliable = results.every((r) => r.matches) && nowRoundTrip === now;
    this.reason = this.reliable ? "round-trip numerico OK; aguardando progresso e comparacao UTC com Windows" : "round-trip numerico divergente; offline bloqueado";
    this.log(`[relogio-diagnostico] ${JSON.stringify({ now, nowIso, nowRoundTrip, error, vectors: results,
      numericRoundTripPasses: this.reliable, interpretation: this.reason,
      warning: "Compare now/nowIso com horario UTC do Windows. Finitude de Date.now nao valida o relogio." })}`);
  }
  observe(wall: number, game: number, safe: boolean): void {
    if (!safe) { this.baseline = null; return; }
    if (!Number.isSafeInteger(game) || game < 0) { this.reliable = false; this.reason = "GET_GAME_TIMER invalido"; return; }
    if (!this.baseline || game < this.baseline.game) { this.baseline = { wall, game }; return; }
    const elapsed = game - this.baseline.game;
    if (elapsed < 2000) return;
    const drift = wall - this.baseline.wall - elapsed;
    if (wall < this.baseline.wall || Math.abs(drift) > 2000) {
      this.reliable = false; this.reason = `deriva/retrocesso do relogio: ${drift}ms`;
      this.log(`[relogio] Offline bloqueado: ${this.reason}. Pause/loading tambem podem causar deriva; confirme antes de reiniciar.`);
    } else if (this.reliable && !this.progressionConfirmed) {
      this.progressionConfirmed = true;
      this.reason = "round-trip numerico e progresso contra GET_GAME_TIMER OK; confirmar UTC absoluto no Windows";
      this.log(`[relogio] ${this.reason}; janela ${elapsed}ms; deriva ${drift}ms.`);
    }
    this.baseline = { wall, game };
  }
  canAdvance(now: number, lastProcessedAt: number): boolean {
    return this.reliable && this.progressionConfirmed && now >= lastProcessedAt && now - lastProcessedAt <= WORLD_RULES.maxClockJumpMs;
  }
  get status(): string { return this.reason; }
}
