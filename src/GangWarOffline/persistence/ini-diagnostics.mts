export const INI_SECTION = "GangWar";
// IniFiles 1.2 / SDK publico: buffers UTF-8 e wchar_t de 128 posicoes.
// 127 ASCII + terminador; isto nao comprova o round-trip do binding instalado.
export const INI_ASCII_LIMIT = 127;
export interface IniOperations {
  exists(path: string): boolean;
  read(path: string, key: string): unknown;
  write(path: string, key: string, value: string): unknown;
}
export interface IniContext { path: string; key: string; index: number | null; total: number | null; phase: string;
  expectedLength?: number; failureType?: string }
function summary(value: unknown): Record<string, unknown> {
  // Nunca inclui o conteudo de um bloco. Resultado de leitura e resumido por tipo,
  // comprimento e comparacao; bool/numero/undefined sao preservados explicitamente.
  return { type: typeof value, result: typeof value === "string" ? "<conteudo omitido>" :
    value === undefined ? "undefined" : value === null ? "null" :
    typeof value === "boolean" || typeof value === "number" ? String(value) : "<tipo inesperado>",
    length: typeof value === "string" ? value.length : null };
}
export function firstDifference(expected: string, actual: unknown): number | null {
  if (typeof actual !== "string") return null;
  const length = Math.min(expected.length, actual.length);
  for (let i = 0; i < length; i++) if (expected.charCodeAt(i) !== actual.charCodeAt(i)) return i;
  return actual.length === expected.length ? -1 : length;
}
export function reportIni(writeLog: (message: string) => void, context: IniContext,
  expected: string | undefined, writeResult: unknown, readResult: unknown,
  writeError?: unknown, readError?: unknown): string {
  const difference = expected === undefined ? null : firstDifference(expected, readResult);
  const type = context.failureType ?? (writeError !== undefined ? "write-exception" : readError !== undefined ? "read-exception" :
    context.phase !== "load" && writeResult !== true ? (writeResult === false ? "write-false" : "write-unexpected-type") :
    typeof readResult !== "string" ? (readResult === undefined ? "read-missing" : "read-unexpected-type") :
    expected !== undefined && readResult !== expected ?
      (readResult.length < expected.length && expected.startsWith(readResult) ? "read-truncated-prefix" : "read-mismatch") :
    context.expectedLength !== undefined && readResult.length !== context.expectedLength ?
      (readResult.length < context.expectedLength ? "read-shorter-than-metadata" : "read-longer-than-metadata") : "ok");
  writeLog(`[persistencia-io] ${JSON.stringify({
    ...context, file: context.path.replace(/\\/g, "/").split("/").pop(), section: INI_SECTION,
    sentLength: expected?.length ?? null, write: summary(writeResult), read: summary(readResult),
    firstDifference: difference, failureType: type,
    expectedCodeAtDifference: expected !== undefined && difference !== null && difference >= 0 && difference < expected.length ? expected.charCodeAt(difference) : null,
    readCodeAtDifference: typeof readResult === "string" && difference !== null && difference >= 0 && difference < readResult.length ? readResult.charCodeAt(difference) : null,
    writeError: writeError === undefined ? null : String(writeError),
    readError: readError === undefined ? null : String(readError),
  })}`);
  return type;
}
export function writeVerified(io: IniOperations, writeLog: (message: string) => void,
  context: IniContext, value: string): void {
  let writeResult: unknown, readResult: unknown, writeError: unknown, readError: unknown;
  try { writeResult = io.write(context.path, context.key, value); } catch (error) { writeError = error; }
  // Nao faz short-circuit: leitura tambem e medida quando o writer retorna false.
  try { readResult = io.read(context.path, context.key); } catch (error) { readError = error; }
  if (writeResult === true && readResult === value && writeError === undefined && readError === undefined) return;
  const type = reportIni(writeLog, context, value, writeResult, readResult, writeError, readError);
  throw new Error(`Falha de gravacao/verificacao de bloco (${type}; ${context.key}; indice ${context.index ?? "marcador"}). Veja [persistencia-io].`);
}

const SAMPLE_LENGTHS = [1, 7, 16, 32, 48, 64, 80, 96, 112, 120, 126, 127];
export interface IniProbeResult { safeChunkSize: number; scratchPath: string; complete: boolean }
// Diagnostico no runtime REAL, um caso por pump. So escreve dados sinteticos num
// arquivo novo reservado, nunca snapshots/backups. Nao ultrapassa o buffer de entrada
// documentado; leituras >127 usam fixture separada no modo de limites.
export class IniProbe {
  private index = 0;
  private path = "";
  private successes: number[] = [];
  private repeated = 0;
  private selected = 0;
  private allOk = true;
  constructor(private io: IniOperations, private root: string, private log: (message: string) => void) {}
  pump(): IniProbeResult | null {
    if (!this.path) {
      for (let i = 1; i <= 99; i++) {
        const candidate = `${this.root}\\ini-probe-${i}.ini`;
        if (candidate.length > INI_ASCII_LIMIT || /[^\x20-\x7e]/.test(candidate)) throw new Error("Caminho do INI exige diagnostico UTF-8 especifico; probe ASCII bloqueado antes de escrever.");
        if (!this.io.exists(candidate)) { this.path = candidate; break; }
      }
      if (!this.path) throw new Error("99 diagnosticos INI existentes; arquivos preservados. Arquive-os antes de repetir.");
    }
    if (this.index < SAMPLE_LENGTHS.length) {
      const length = SAMPLE_LENGTHS[this.index]!;
      const value = "0123456789abcdef".repeat(8).slice(0, length), key = `length${length}`;
      if (this.probe(key, value, this.index, SAMPLE_LENGTHS.length)) this.successes.push(length);
      this.index++; return null;
    }
    if (!this.selected) {
      // Escolhe apenas um tamanho cujo round-trip acabou de ser comprovado.
      this.selected = this.successes.filter((n) => n <= 96).sort((a, b) => b - a)[0] ?? 0;
      if (this.selected < 32) throw new Error("INI nao confirmou nem blocos ASCII de 32 caracteres. Snapshots nao foram tocados.");
      this.log(`[persistencia-probe] Limite observado nesta amostragem: ${Math.max(...this.successes)}; candidato ${this.selected}. Confirmando chaves part0..part15 e releitura.`);
    }
    if (this.repeated < 16) {
      const i = this.repeated++;
      const value = (`abcdef0123456789${i.toString(16).padStart(2, "0")}`).repeat(8).slice(0, this.selected);
      if (!this.probe(`part${i}`, value, i, 16)) this.allOk = false;
      return null;
    }
    if (this.repeated < 32) {
      const i = this.repeated++ - 16;
      const value = (`abcdef0123456789${i.toString(16).padStart(2, "0")}`).repeat(8).slice(0, this.selected);
      let actual: unknown, error: unknown;
      try { actual = this.io.read(this.path, `part${i}`); } catch (e) { error = e; }
      if (reportIni(this.log, { path: this.path, key: `part${i}`, index: i, total: 16, phase: "load" }, value, undefined, actual, undefined, error) !== "ok") this.allOk = false;
      return null;
    }
    if (!this.allOk) throw new Error("Round-trip/releitura INI falhou no arquivo sintetico. Limite efetivo nao confirmado; snapshots preservados.");
    this.log(`[persistencia-probe] OK: ${this.selected} ASCII confirmados em escrita/leitura e releitura de 16 blocos; arquivo ${this.path}.`);
    return { safeChunkSize: this.selected, scratchPath: this.path, complete: true };
  }
  private probe(key: string, value: string, index: number, total: number): boolean {
    let written: unknown, actual: unknown, writeError: unknown, readError: unknown;
    try { written = this.io.write(this.path, key, value); } catch (error) { writeError = error; }
    try { actual = this.io.read(this.path, key); } catch (error) { readError = error; }
    return reportIni(this.log, { path: this.path, key, index, total, phase: "probe" }, value, written, actual, writeError, readError) === "ok";
  }
}

export class IniReadLimits {
  private index = 0;
  constructor(private io: IniOperations, private path: string, private log: (message: string) => void) {}
  pump(): boolean {
    const lengths = [16, 64, 96, 120, 127, 128, 192, 256, 512];
    if (this.index >= lengths.length) return true;
    const length = lengths[this.index]!;
    let result: unknown, error: unknown;
    try { result = this.io.read(this.path, `length${length}`); } catch (e) { error = e; }
    reportIni(this.log, { path: this.path, key: `length${length}`, index: this.index++, total: lengths.length, phase: "load" },
      "0123456789abcdef".repeat(32).slice(0, length), undefined, result, undefined, error);
    return false;
  }
}
