import { cloneWorld, createWorld, syncWorld, validateWorld } from "../core/world.mts";
import type { WorldState } from "../core/world-types.mts";
import { migrateSocial } from "../core/social.mts";
import { INI_ASCII_LIMIT, reportIni, writeVerified } from "./ini-diagnostics.mts";
import type { IniOperations } from "./ini-diagnostics.mts";

export interface StateIo extends IniOperations {}
export type PersistenceMode = "memory" | "ini";
const LEGACY_CHUNK = 96;
const MAX_HEX_LENGTH = 288_000; // mesmo teto anterior de 3000 * 96
const MAX_CHUNKS = 9000; // permite o mesmo estado com blocos menores comprovados
const BATCH = 4;
function checksum(text: string): string {
  let a = 1, b = 0;
  for (let i = 0; i < text.length; i++) { a = (a + text.charCodeAt(i)) % 65521; b = (b + a) % 65521; }
  return `${a}:${b}`;
}
function encode(world: WorldState): string {
  const ascii = JSON.stringify(world).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return ascii.split("").map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}
function decode(hex: string): unknown {
  if (hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) throw new Error("Blocos persistidos invalidos.");
  let text = "";
  for (let i = 0; i < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return JSON.parse(text);
}
interface LoadJob { path: string; revision: number; count: number; sum: string; index: number; hex: string; chunkSize: number; length: number | null }
interface SaveJob { path: string; candidate: WorldState; hex: string; index: number; count: number; callback: () => void; label: string;
  chunkSize: number; phase: "write" | "recheck"; verified: string; lastProgress: number }

// Duas geracoes: a anterior permanece intacta enquanto a proxima e escrita.
// Estado publicado somente depois de todos os blocos e do marcador final verificados.
export class WorldStore {
  world: WorldState;
  busy = true;
  socialMigrationPending = false;
  readOnly = false;
  private chunkSize = LEGACY_CHUNK;
  private protectedPaths = new Set<string>();
  private currentPath = "";
  private loads: LoadJob[] = [];
  private loaded: { path: string; world: WorldState; migrated: boolean }[] = [];
  private saving: SaveJob | null = null;
  private initializing = true;
  private existing = false;
  private stopped = false;
  private ready: () => void = () => {};
  readonly paths: string[];
  constructor(private io: StateIo, root: string, now: number,
    private log: (message: string) => void, private fail: (error: unknown) => void,
    private mode: PersistenceMode = "ini") {
    this.world = createWorld(now);
    this.paths = [root + "\\world-a.ini", root + "\\world-b.ini"];
  }
  setVerifiedChunkSize(size: number): void {
    if (!this.initializing || this.loads.length || !Number.isSafeInteger(size) || size < 32 || size > LEGACY_CHUNK || size > INI_ASCII_LIMIT) throw new Error("Tamanho de bloco INI nao confirmado ou fora do contrato.");
    this.chunkSize = size;
    this.log(`[persistencia] Fragmentacao verificada para novas geracoes: ${size} ASCII; formato GW2.`);
  }
  open(onReady: () => void): void {
    this.ready = onReady;
    if (this.mode === "memory") {
      this.initializing = false; this.busy = false;
      this.log("[persistencia] Modo memoria: mundo de desenvolvimento ativo; nenhuma leitura/escrita INI sera executada.");
      this.ready();
      return;
    }
    for (const path of this.paths) {
      if (!this.io.exists(path)) continue;
      this.existing = true;
      let meta: unknown;
      try { meta = this.io.read(path, "commit"); }
      catch (error) {
        reportIni(this.log, { path, key: "commit", index: null, total: null, phase: "load" }, undefined, undefined, meta, undefined, error);
        this.protectedPaths.add(path); continue;
      }
      const legacy = typeof meta === "string" && /^([0-9]+):([0-9]+):([0-9]+:[0-9]+)$/.exec(meta);
      const modern = typeof meta === "string" && /^GW2:([0-9]+):([0-9]+):([0-9]+):([0-9]+):([0-9]+:[0-9]+)$/.exec(meta);
      const match = modern || legacy;
      if (!match) {
        reportIni(this.log, { path, key: "commit", index: null, total: null, phase: "load", failureType: "marker-invalid-or-incomplete" }, undefined, undefined, meta);
        this.log(`[persistencia] Marcador ausente/incompleto/invalido; arquivo protegido: ${path}`);
        this.protectedPaths.add(path); continue;
      }
      const revision = Number(match[1]), count = Number(match[2]);
      const chunkSize = modern ? Number(modern[3]) : LEGACY_CHUNK;
      const length = modern ? Number(modern[4]) : null;
      if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(count) || count < 1 || count > MAX_CHUNKS ||
          !Number.isSafeInteger(chunkSize) || chunkSize < 32 || chunkSize > LEGACY_CHUNK ||
          (length !== null && (!Number.isSafeInteger(length) || length < 2 || length > MAX_HEX_LENGTH || length % 2 !== 0 || Math.ceil(length / chunkSize) !== count)) ||
          (legacy && count > 3000)) {
        this.log(`[persistencia] Metadados fora do contrato; arquivo protegido: ${path}`); this.protectedPaths.add(path); continue;
      }
      this.loads.push({ path, revision, count, sum: modern ? modern[5]! : match[3]!, index: 0, hex: "", chunkSize, length });
    }
    if (!this.loads.length) this.finishLoad();
  }
  private finishLoad(): void {
    if (this.loaded.length) {
      const latest = this.loaded.sort((a, b) => b.world.revision - a.world.revision)[0]!;
      this.world = latest.world; this.currentPath = latest.path;
      this.socialMigrationPending = latest.migrated;
      this.readOnly = this.protectedPaths.size > 0;
      this.initializing = false; this.busy = false;
      this.log(`[persistencia] OK: revisao ${this.world.revision}; ${latest.path}`);
      if (this.readOnly) this.log(`[persistencia] RECUPERADA em somente leitura. Geracoes invalidas preservadas: ${[...this.protectedPaths].join(", ")}. Arquive-as manualmente com GTA fechado para reativar gravacao.`);
      this.ready();
    } else if (this.existing) {
      throw new Error("Nenhuma geracao integra do Gang War. Arquivos preservados; restaure um backup antes de continuar.");
    } else {
      this.initializing = false; this.busy = false;
      this.transact("primeiro cadastro", () => {}, this.ready);
    }
  }
  transact(label: string, mutate: (draft: WorldState) => void, onCommit: () => void = () => {}): void {
    if (this.busy || this.stopped) throw new Error("Persistencia ocupada ou indisponivel; aguarde a confirmacao.");
    if (this.readOnly) throw new Error("Persistencia somente leitura: uma geracao invalida foi preservada. Arquive-a manualmente com GTA fechado; nao sera sobrescrita automaticamente.");
    const candidate = cloneWorld(this.world);
    mutate(candidate);
    candidate.revision++;
    syncWorld(candidate); validateWorld(candidate);
    if (this.mode === "memory") {
      this.world = candidate; this.socialMigrationPending = false;
      this.log(`[persistencia] Modo memoria: ${label}; revisao ${this.world.revision} (nao persistida).`);
      onCommit();
      return;
    }
    const hex = encode(candidate), count = Math.ceil(hex.length / this.chunkSize);
    if (hex.length > MAX_HEX_LENGTH || count > MAX_CHUNKS) throw new Error("Estado excede o limite seguro do armazenamento.");
    const path = this.currentPath === this.paths[0] ? this.paths[1]! : this.paths[0]!;
    writeVerified(this.io, this.log, { path, key: "commit", index: null, total: count, phase: "begin" }, "pending");
    this.busy = true;
    this.saving = { path, candidate, hex, index: 0, count, callback: onCommit, label,
      chunkSize: this.chunkSize, phase: "write", verified: "", lastProgress: -1 };
  }
  pump(): void {
    if (this.stopped) return;
    try {
      if (this.initializing) {
        const job = this.loads[0];
        if (!job) return;
        for (let n = 0; n < BATCH && job.index < job.count; n++) {
          const index = job.index, key = `part${index}`;
          let chunk: unknown;
          try { chunk = this.io.read(job.path, key); }
          catch (error) {
            reportIni(this.log, { path: job.path, key, index, total: job.count, phase: "load" }, undefined, undefined, chunk, undefined, error); throw error;
          }
          const expectedLength = job.length === null ? null : Math.min(job.chunkSize, job.length - index * job.chunkSize);
          if (typeof chunk !== "string" || !/^[0-9a-f]+$/.test(chunk) || chunk.length > job.chunkSize ||
              (index < job.count - 1 && chunk.length !== job.chunkSize) || (expectedLength !== null && chunk.length !== expectedLength)) {
            reportIni(this.log, { path: job.path, key, index, total: job.count, phase: "load",
              ...(expectedLength !== null || index < job.count - 1 ? { expectedLength: expectedLength ?? job.chunkSize } : {}),
              ...(typeof chunk === "string" && !/^[0-9a-f]+$/.test(chunk) ? { failureType: "read-nonhex" } : {}) }, undefined, undefined, chunk);
            throw new Error(`Bloco invalido/curto ${key}; esperado ${expectedLength ?? job.chunkSize}, geracao ${job.path}.`);
          }
          job.hex += chunk;
          job.index++;
        }
        if (job.index < job.count) return;
        try {
          if (job.hex.length > MAX_HEX_LENGTH || (job.length !== null && job.hex.length !== job.length) || checksum(job.hex) !== job.sum) throw new Error("Checksum/comprimento total nao confere.");
          const world = decode(job.hex) as WorldState;
          // Primeiro verifica o formato legado; migracao nao pode aceitar schema desconhecido.
          if (!world || world.schema !== 2 || !Array.isArray(world.gangs) || !Array.isArray(world.members)) throw new Error("Snapshot legado invalido.");
          const migrated = migrateSocial(world); validateWorld(world);
          if (world.revision !== job.revision) throw new Error("Revisao nao confere.");
          this.loaded.push({ path: job.path, world, migrated });
        } catch (error) { this.log(`[persistencia] Geracao rejeitada e preservada ${job.path}: ${String(error)}`); this.protectedPaths.add(job.path); }
        this.loads.shift();
        if (!this.loads.length) this.finishLoad();
        return;
      }
      const job = this.saving;
      if (!job) return;
      for (let n = 0; n < BATCH && job.index < job.count; n++) {
        const key = `part${job.index}`, value = job.hex.slice(job.index * job.chunkSize, (job.index + 1) * job.chunkSize);
        if (job.phase === "write") {
          writeVerified(this.io, this.log, { path: job.path, key, index: job.index, total: job.count, phase: "write" }, value);
        } else {
          let actual: unknown;
          try { actual = this.io.read(job.path, key); }
          catch (error) {
            reportIni(this.log, { path: job.path, key, index: job.index, total: job.count, phase: "load" }, value, undefined, actual, undefined, error); throw error;
          }
          if (actual !== value) {
            reportIni(this.log, { path: job.path, key, index: job.index, total: job.count, phase: "load" }, value, undefined, actual);
            throw new Error(`Releitura final divergiu em ${key}; geracao nao confirmada.`);
          }
          job.verified += actual;
        }
        job.index++;
      }
      const progress = Math.floor(job.index / job.count * 4);
      if (progress !== job.lastProgress) { job.lastProgress = progress; this.log(`[persistencia] ${job.label}: ${job.phase} ${Math.floor(job.index / job.count * 100)}% (${job.index}/${job.count}).`); }
      if (job.index < job.count) return;
      if (job.phase === "write") { job.phase = "recheck"; job.index = 0; job.lastProgress = -1; return; }
      if (job.verified.length !== job.hex.length || checksum(job.verified) !== checksum(job.hex)) throw new Error("Checksum da releitura final divergiu; marcador nao publicado.");
      const meta = `GW2:${job.candidate.revision}:${job.count}:${job.chunkSize}:${job.hex.length}:${checksum(job.hex)}`;
      writeVerified(this.io, this.log, { path: job.path, key: "commit", index: null, total: job.count, phase: "commit" }, meta);
      this.world = job.candidate; this.currentPath = job.path; this.saving = null; this.busy = false;
      this.socialMigrationPending = false;
      this.log(`[persistencia] OK: ${job.label}; revisao ${this.world.revision}`);
      job.callback();
    } catch (error) {
      // Uma geracao quebrada no carregamento nao elimina a outra.
      if (this.initializing && this.loads.length) {
        this.log(`[persistencia] Leitura rejeitada: ${String(error)}`);
        this.protectedPaths.add(this.loads[0]!.path);
        this.loads.shift();
        if (this.loads.length) return;
        try { this.finishLoad(); return; } catch (loadError) { error = loadError; }
      }
      this.stopped = true; this.busy = true; this.fail(error);
    }
  }
  progress(): string {
    if (this.mode === "memory") return "Modo memoria: alteracoes nao persistidas";
    if (this.readOnly) return "Somente leitura: geracao invalida preservada";
    if (this.saving) return `${this.saving.phase === "write" ? "Salvando" : "Conferindo"} ${Math.floor(this.saving.index / this.saving.count * 100)}%`;
    if (this.initializing) return "Carregando mundo...";
    return this.busy ? "Persistencia indisponivel" : "Estado salvo";
  }
  stop(): void { this.stopped = true; }
}
