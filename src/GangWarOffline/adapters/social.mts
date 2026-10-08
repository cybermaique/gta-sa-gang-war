import { SOCIAL_CONFIG as config } from "../config/social.mts";
import { addMessage, assignSessionIds, identity, individualRanking, kd, participant, recordDeath, setGangTag, setNickname, setOnline } from "../core/social.mts";
import type { Participant, SocialMessage } from "../core/social.mts";
import type { WorldState } from "../core/world-types.mts";
import type { WorldStore } from "../persistence/store.mts";
import type { GameEngine } from "./engine.mts";
import type { GtaRuntime } from "./gta.mts";
import { BASE_SOCIAL_CAPABILITIES } from "./social-capabilities.mts";
import type { ActorBinding, SocialCapabilities } from "./social-capabilities.mts";

// Assinaturas conferidas na .config/sa.d.ts do CLEO Redux 1.5.1 + ImGuiRedux.
// `declare` nao emite codigo e o global so e acessado apos typeof no runtime.
declare const ImGui: {
  BeginFrame(id: string): void; EndFrame(): void;
  SetCursorVisible(visible: boolean): void;
  SetNextWindowPos(x: number, y: number, condition: number): void;
  SetNextWindowSize(width: number, height: number, condition: number): void;
  SetNextWindowTransparency(alpha: number): void;
  Begin(label: string, open: boolean, noTitleBar: boolean, noResize: boolean, noMove: boolean, autoResize: boolean): boolean;
  End(): void;
  Text(value: string): void;
  TextColored(value: string, red: number, green: number, blue: number, alpha: number): void;
  TextDisabled(value: string): void;
  Separator(): void; SameLine(): void;
  Selectable(value: string, selected: boolean): boolean;
  Columns(count: number): void; NextColumn(): void;
  PushStyleColor(index: number, red: number, green: number, blue: number, alpha: number): void;
  PopStyleColor(count: number): void;
  PushStyleVar(index: number, value: number): void;
  PopStyleVar(count: number): void;
  GetForegroundDrawList(): number;
  AddText(drawList: number, x: number, y: number, red: number, green: number, blue: number, alpha: number, value: string): void;
  AddLine(drawList: number, x1: number, y1: number, x2: number, y2: number, red: number, green: number, blue: number, alpha: number, thickness: number): void;
  CalcTextSize(value: string): { width: number; height: number };
  GetDisplaySize(): { width: number; height: number };
};

export interface TextStore { insert(key: string, value: string): void; delete(key: string): void }
export interface SocialEventBus { listen(name: string, callback: (data: unknown) => void): () => void }
interface Cell { key: string; value: string; x: number; y: number; color: string; center?: boolean }
interface LocalLine { text: string; color: string; at: number }
interface DisplayRow { source: "system" | "message"; at: number; text: string; color: string; message?: SocialMessage }
type Mutation = (world: WorldState) => void;
const CHAT_KEYS = [27, 13, 8, 32, 38, 40, 111, 186, 187, 188, 189, 190, 191, 192, 193, 219, 220, 221, 222,
  ...Array.from({ length: 36 }, (_, i) => i < 10 ? 48 + i : 65 + i - 10)];

// A fila so inclui fatos observados ou mensagens realmente enviadas. Nao gera
// conversas, ping, mortes ou pontos aleatorios para preencher o scoreboard.
export class SocialAdapter {
  private visible = false;
  private page = 0;
  private lastRevision = -1;
  private lastRefresh = -1;
  private rows: Participant[] = [];
  private total = 0;
  private cells: Cell[] = [];
  private messages: Cell[] = [];
  private messageRows: SocialMessage[] = [];
  private displayRows: DisplayRow[] = [];
  private lastMessageRevision = -1;
  private lastMessageTime = -1;
  private pressed = new Set<number>();
  private queue: { label: string; mutate: Mutation; after: () => void }[] = [];
  private pendingMessages: SocialMessage[] = [];
  private observed = new Map<string, { handle: number; dead: boolean }>();
  private controlsOwned = false;
  private statsOwned = false;
  private chat: "global" | "gang" | null = null;
  private buffer = "";
  private chatError = "";
  private textKeys = new Map<string, string>();
  private timer: number | null = null;
  private started = false;
  private names: { key: string; actor: ActorBinding; color: string }[] = [];
  private observationSequence = 0;
  private sessionKey = "";
  private presenceQueued = new Set<string>();
  private projectionFailed = false;
  private attributionFailed = false;
  private imguiFailed = false;
  private scoreboardLogged = false;
  private gangRankingVisible = false;
  private gangPage = 0;
  private localLines: LocalLine[] = [];
  private welcomed = false;
  private noticeText = "";
  private noticeUntil = 0;
  private chatScroll = 0;
  private chatVisibleRows = 7;
  private subscriptions: (() => void)[] = [];
  constructor(private runtime: GtaRuntime, private engine: GameEngine, private store: WorldStore,
    private text: TextStore, private capabilities: SocialCapabilities = BASE_SOCIAL_CAPABILITIES,
    private canChat: () => boolean = () => true, private events?: SocialEventBus) {}

  get chatActive(): boolean { return this.chat !== null || this.controlsOwned; }
  get scoreboardVisible(): boolean { return this.visible; }
  get gangRankingOpen(): boolean { return this.gangRankingVisible; }
  showNotice(message: string): boolean {
    if (!this.started || !this.imguiReady) return false;
    this.noticeText = message;
    this.noticeUntil = Date.now() + config.noticeDurationMs;
    return true;
  }
  private get optionalReady(): boolean { return this.capabilities.compatible && this.capabilities.verifiedOnInstallation; }
  private environmentSafe(): boolean {
    return this.engine.canPresent(this.runtime.isOnMission());
  }
  private put(key: string, value: string): void {
    if (this.textKeys.get(key) === value) return;
    this.text.insert(key, value); this.textKeys.set(key, value);
  }
  private enqueue(label: string, mutate: Mutation, after: () => void = () => {}): void {
    if (this.store.readOnly) throw new Error("Persistencia somente leitura; geracao invalida preservada.");
    if (this.queue.length >= 64) throw new Error("Fila social cheia; aguarde a gravacao.");
    this.queue.push({ label, mutate, after });
  }
  start(): void {
    this.sessionKey = `session-${this.store.world.revision}-${Date.now()}`;
    if (!this.store.readOnly) this.enqueue("IDs da sessao social", (w) => {
      assignSessionIds(w);
      addMessage(w, Date.now(), "notification", config.humanId, "Entrou no Gang War Offline.");
    });
    this.started = true;
    if (this.events) for (const name of ["GangWar:chat", "GangWar:notification", "GangWar:presence"]) {
      this.subscriptions.push(this.events.listen(name, (data) => {
        try {
          if (!data || typeof data !== "object") throw new Error("Payload social invalido.");
          const input = data as Record<string, unknown>;
          if (typeof input.participantId !== "string") throw new Error("Informe participantId estavel (nao o ID de sessao).");
          participant(this.store.world, input.participantId);
          if (name === "GangWar:presence") {
            if (typeof input.online !== "boolean") throw new Error("Presenca precisa ser booleana.");
            if (input.participantId === config.humanId && !input.online) throw new Error("CJ esta online.");
            this.presence(input.participantId, input.online);
          } else {
            if (typeof input.text !== "string") throw new Error("Mensagem precisa ser texto.");
            if (name === "GangWar:notification") this.notification(input.participantId, input.text);
            else {
              if (input.channel !== "global" && input.channel !== "gang") throw new Error("Canal desconhecido.");
              this.send(input.participantId, input.text, input.channel);
            }
          }
        } catch (error) { this.runtime.log(`[GangWar] [evento-social] Rejeitado: ${String(error)}`); }
      }));
    }
    this.runtime.log(`[GangWar] [social] ${this.store.world.social.participants.length} identidades; score individual ativo; sessao sem ping.`);
    this.runtime.log(`[GangWar] [social-ui] ${this.imguiReady ? "ImGuiRedux detectado: chat e TAB em ImGui." : "ImGuiRedux ausente: renderer SCM ativo."}`);
    this.runtime.log(`[GangWar] [social-opcional] ${this.capabilities.description}`);
    this.runtime.log(`[GangWar] [atalhos] TAB jogadores; Ctrl+G painel de gangues; PgUp/PgDn paginas; T chat; ! = gangue; Enter envia; Esc cancela.`);
    // DRAW_RECT e DISPLAY_TEXT sao comandos visuais validos apenas para o frame
    // atual. A interface social precisa ser redesenhada a cada ciclo do Redux;
    // uma cadencia fixa deixa a tela alternar entre o painel e o mundo do GTA.
    this.timer = this.runtime.setInterval(() => {
      try { this.frame(); } catch (error) {
        this.runtime.log(`[GangWar] [social-ui] ERRO: ${String(error)}`); this.stop();
      }
    }, 0);
  }
  private edge(key: number): boolean {
    const down = this.runtime.isKeyPressed(key), previous = this.pressed.has(key);
    if (down) this.pressed.add(key); else this.pressed.delete(key);
    return down && !previous;
  }
  private display(cell: Cell): void {
    const n = parseInt(cell.color.slice(1), 16);
    this.engine.call<void>("SET_TEXT_FONT", 1);
    this.engine.call<void>("SET_TEXT_SCALE", 0.26, 0.8);
    this.engine.call<void>("SET_TEXT_PROPORTIONAL", true);
    this.engine.call<void>("SET_TEXT_JUSTIFY", false);
    this.engine.call<void>("SET_TEXT_RIGHT_JUSTIFY", false);
    this.engine.call<void>("SET_TEXT_CENTRE", cell.center ?? false);
    this.engine.call<void>("SET_TEXT_WRAPX", 615);
    this.engine.call<void>("SET_TEXT_CENTRE_SIZE", 580);
    this.engine.call<void>("SET_TEXT_BACKGROUND", false);
    this.engine.call<void>("SET_TEXT_EDGE", 1, 0, 0, 0, 220);
    this.engine.call<void>("SET_TEXT_COLOUR", (n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
    this.engine.call<void>("DISPLAY_TEXT", cell.x, cell.y, cell.key);
  }
  private get imguiReady(): boolean { return !this.imguiFailed && typeof ImGui !== "undefined"; }
  private color(color: string): readonly [number, number, number] {
    const value = Number.parseInt(color.slice(1), 16);
    return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
  }
  private rankedGangs(): { gang: WorldState["gangs"][number]; score: number; position: number }[] {
    const world = this.store.world;
    return world.ranking.map((row) => ({ ...row, gang: world.gangs.find((gang) => gang.id === row.gangId)! }));
  }
  private showLocal(lines: Omit<LocalLine, "at">[]): void {
    const at = Date.now();
    this.localLines.push(...lines.map((line) => ({ ...line, at })));
    this.localLines = this.localLines.slice(-config.chatHistoryLimit);
    this.lastMessageRevision = -1;
  }
  showWelcome(): void {
    if (!this.started || this.welcomed) return;
    this.welcomed = true;
    try {
      const ranked = this.rankedGangs(), ownId = participant(this.store.world, config.humanId).gangId;
      const own = ranked.find((row) => row.gang.id === ownId);
      const lines: Omit<LocalLine, "at">[] = [
        { text: "Bem-vindo ao Gang War Offline v0.2!", color: "#FFFFFF" },
        { text: `TOP 5 GANGUES (${ranked.length} cadastradas)`, color: "#A9B9CC" },
        ...ranked.slice(0, 5).map((row) => ({ text: `${row.position}. ${row.gang.tag} ${row.gang.name}  ${row.gang.color}  ${row.score} pts`, color: row.gang.color })),
        { text: own ? `Sua gangue: ${own.gang.tag} ${own.gang.name} - #${own.position}` : "Sua gangue nao consta no ranking.", color: own?.gang.color ?? "#FFFFFF" },
        { text: own ? `Propriedades: ${own.gang.territoryCount} territorios, ${own.gang.gangZoneCount} GZs, ${own.gang.baseCount} bases.` : "", color: "#FFFFFF" },
        { text: "T: chat | /gangs /gang /top /stats /help | Ctrl+G: ranking | TAB: jogadores", color: "#A9B9CC" },
      ].filter((line) => line.text);
      this.showLocal(lines);
      this.runtime.log("[GangWar] [social-ui] Boas-vindas e ranking publicados uma vez no chat desta sessao.");
    } catch (error) { this.runtime.log(`[GangWar] [social-ui] Boas-vindas indisponiveis: ${String(error)}`); }
  }
  toggleGangRanking(): boolean {
    if (!this.started) return false;
    if (!this.imguiReady) {
      this.presentGangs(1);
      return true;
    }
    this.gangRankingVisible = !this.gangRankingVisible;
    if (this.gangRankingVisible) { this.gangPage = 0; this.endChat(); }
    return true;
  }
  private presentGangs(page: number): void {
    const ranked = this.rankedGangs(), pages = Math.max(1, Math.ceil(ranked.length / config.gangPageSize));
    if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error(`Pagina invalida. Use /gangs 1-${pages}.`);
    this.showLocal([
      { text: `RANKING DE GANGUES - pagina ${page}/${pages}`, color: "#A9B9CC" },
      ...ranked.slice((page - 1) * config.gangPageSize, page * config.gangPageSize).map((row) => ({
        text: `${row.position}. ${row.gang.tag} ${row.gang.name}  ${row.score} pts | T:${row.gang.territoryCount} GZ:${row.gang.gangZoneCount} B:${row.gang.baseCount}`,
        color: row.gang.color,
      })),
      { text: pages > 1 ? `Use /gangs 1-${pages} para mudar de pagina.` : "Ctrl+G abre ou fecha o painel visual.", color: "#A9B9CC" },
    ]);
  }
  private presentGang(tag?: string): void {
    const ranked = this.rankedGangs();
    const ownId = participant(this.store.world, config.humanId).gangId;
    const query = tag?.replace(/^\[|\]$/g, "").toUpperCase();
    const row = ranked.find((entry) => query ? entry.gang.tag?.slice(1, -1).toUpperCase() === query : entry.gang.id === ownId);
    if (!row) throw new Error(`Gangue ${tag ?? "do jogador"} nao encontrada. Use /gangs.`);
    this.showLocal([
      { text: `${row.gang.tag} ${row.gang.name} (${row.gang.color})`, color: row.gang.color },
      { text: `Ranking: #${row.position}/${ranked.length} | ${row.score} pontos`, color: "#FFFFFF" },
      { text: `Membros: ${row.gang.members} | Banco: $${row.gang.bankBalance}`, color: "#FFFFFF" },
      { text: `Territorios: ${row.gang.territoryCount} | GZs: ${row.gang.gangZoneCount} | Bases: ${row.gang.baseCount}`, color: "#FFFFFF" },
    ]);
  }
  private presentTop(page: number): void {
    const ranked = individualRanking(this.store.world), pages = Math.max(1, Math.ceil(ranked.length / config.topPageSize));
    if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error(`Pagina invalida. Use /top 1-${pages}.`);
    this.showLocal([
      { text: `TOP JOGADORES ONLINE - pagina ${page}/${pages}`, color: "#A9B9CC" },
      ...ranked.slice((page - 1) * config.topPageSize, page * config.topPageSize).map((person, index) => ({
        text: `${(page - 1) * config.topPageSize + index + 1}. ID ${person.sessionId} ${identity(this.store.world, person.id).name} - ${person.score} pts, K/D ${kd(person)}`,
        color: identity(this.store.world, person.id).color,
      })),
      { text: `Use /top 1-${pages} para mudar de pagina.`, color: "#A9B9CC" },
    ]);
  }
  private presentStats(): void {
    const person = participant(this.store.world, config.humanId), name = identity(this.store.world, person.id);
    this.showLocal([
      { text: `${name.name}${person.rank ? ` - ${person.rank}` : ""}`, color: name.color },
      { text: `ID ${person.sessionId} | Score ${person.score} | K/D ${kd(person)}`, color: "#FFFFFF" },
      { text: `Abates ${person.kills} | Mortes ${person.deaths}`, color: "#FFFFFF" },
      { text: `Conquistas ${person.conquests} | Defesas ${person.defenses} | Vitorias GZ ${person.gzWins}`, color: "#FFFFFF" },
    ]);
  }
  private presentHelp(): void {
    this.showLocal([
      { text: "COMANDOS GANG WAR", color: "#A9B9CC" },
      { text: "/gangs [pagina] - ranking de gangues", color: "#FFFFFF" },
      { text: "/gang [TAG] - sua gangue ou uma gangue especifica", color: "#FFFFFF" },
      { text: "/top [pagina] - ranking individual online", color: "#FFFFFF" },
      { text: "/stats - suas estatisticas | /help - esta lista", color: "#FFFFFF" },
      { text: "/nick NOME | /tag [TAG] | !mensagem: chat da gangue", color: "#FFFFFF" },
      { text: "Ctrl+G: painel de gangues | TAB: jogadores | PgUp/PgDn: paginas", color: "#FFFFFF" },
    ]);
  }
  private runCommand(input: string): void {
    const [command, arg, extra] = input.split(/\s+/);
    if (extra) throw new Error("Argumentos demais. Use /help.");
    const page = arg === undefined ? 1 : Number(arg);
    switch (command?.toLowerCase()) {
      case "/gangs": this.presentGangs(page); break;
      case "/gang": this.presentGang(arg); break;
      case "/top": this.presentTop(page); break;
      case "/stats": if (arg) throw new Error("Use /stats."); this.presentStats(); break;
      case "/help": if (arg) throw new Error("Use /help."); this.presentHelp(); break;
      default: throw new Error(`Comando desconhecido: ${command}. Use /help.`);
    }
  }
  private drawImGui(): boolean {
    if (!this.imguiReady) return false;
    try {
      ImGui.BeginFrame("GANG_WAR_SOCIAL");
      try {
        ImGui.SetCursorVisible(false);
        this.drawNotice();
        if (this.visible) this.drawImGuiScoreboard();
        else if (this.gangRankingVisible) this.drawImGuiGangRanking();
        else this.drawImGuiChat();
      } finally { ImGui.EndFrame(); }
      return true;
    } catch (error) {
      this.imguiFailed = true;
      if (this.gangRankingVisible) {
        this.gangRankingVisible = false;
        try { this.presentGangs(1); } catch { /* O erro original permanece no log. */ }
      }
      this.runtime.log(`[GangWar] [social-imgui] Suspenso: ${String(error)}; renderer nativo reativado.`);
      return false;
    }
  }
  private drawNotice(): void {
    if (!this.noticeText || Date.now() >= this.noticeUntil) return;
    const display = ImGui.GetDisplaySize();
    const width = Math.min(720, Math.max(360, display.width - 80));
    ImGui.PushStyleColor(2, 8, 10, 12, 238);
    ImGui.PushStyleColor(5, 150, 155, 160, 210);
    ImGui.PushStyleVar(3, 2); ImGui.PushStyleVar(4, 1);
    ImGui.SetNextWindowPos((display.width - width) / 2, 34, 1);
    ImGui.SetNextWindowSize(width, 38, 1);
    ImGui.SetNextWindowTransparency(0.94);
    ImGui.Begin("##GW_NOTICE", true, true, true, true, false);
    ImGui.TextColored(this.noticeText, 1, 1, 1, 1);
    ImGui.End();
    ImGui.PopStyleVar(2); ImGui.PopStyleColor(2);
  }
  private drawImGuiScoreboard(): void {
    const display = ImGui.GetDisplaySize();
    const hud = config.scoreboardHud;
    const width = Math.min(hud.maxWidth, Math.max(hud.minWidth, display.width / 2), display.width - 32);
    const height = Math.min(width * hud.aspectRatio, display.height - 32);
    const left = (display.width - width) / 2, top = (display.height - height) / 2;
    ImGui.PushStyleColor(2, 0, 0, 0, 255); // WindowBg
    ImGui.PushStyleColor(5, 190, 190, 190, 255); // Border
    ImGui.PushStyleVar(3, 0); // WindowRounding
    ImGui.PushStyleVar(4, 1); // WindowBorderSize
    ImGui.SetNextWindowPos(left, top, 1);
    ImGui.SetNextWindowSize(width, height, 1);
    ImGui.SetNextWindowTransparency(0.92);
    ImGui.Begin("##GW_SCOREBOARD", true, true, true, true, false);
    ImGui.TextColored("* Gang War Offline", 0.86, 0.9, 0.95, 1);
    ImGui.SameLine(); ImGui.TextDisabled(`Players: ${this.total}`);
    ImGui.Separator();
    ImGui.Columns(4);
    ImGui.TextDisabled("id"); ImGui.NextColumn(); ImGui.TextDisabled("name"); ImGui.NextColumn();
    ImGui.TextDisabled("score"); ImGui.NextColumn(); ImGui.TextDisabled("K/D"); ImGui.NextColumn();
    ImGui.Separator();
    for (const person of this.rows) {
      const name = identity(this.store.world, person.id), [r, g, b] = this.color(name.color);
      if (person.human) ImGui.PushStyleColor(24, 120, 22, 28, 230);
      ImGui.Selectable(`${person.human ? "> " : "  "}${person.sessionId}`, person.human); ImGui.NextColumn();
      ImGui.TextColored(name.name, r, g, b, 1); ImGui.NextColumn();
      ImGui.Text(`${person.score}`); ImGui.NextColumn();
      ImGui.Text(kd(person)); ImGui.NextColumn();
      if (person.human) ImGui.PopStyleColor(1);
    }
    ImGui.Columns(1); ImGui.Separator();
    const pages = Math.max(1, Math.ceil(this.total / config.pageSize));
    ImGui.TextDisabled(`PgUp/PgDn: pagina ${this.page + 1}/${pages} | ${config.tabMode === "hold" ? "Solte TAB para fechar" : "TAB fecha"}`);
    ImGui.End();
    ImGui.PopStyleVar(2); ImGui.PopStyleColor(2);
  }
  private drawImGuiGangRanking(): void {
    const display = ImGui.GetDisplaySize();
    const width = Math.min(880, Math.max(600, display.width / 2), display.width - 32);
    const height = Math.min(500, display.height - 32);
    const left = (display.width - width) / 2, top = (display.height - height) / 2;
    ImGui.PushStyleColor(2, 0, 0, 0, 255);
    ImGui.PushStyleColor(5, 190, 190, 190, 255);
    ImGui.PushStyleVar(3, 0); ImGui.PushStyleVar(4, 1);
    ImGui.SetNextWindowPos(left, top, 1);
    ImGui.SetNextWindowSize(width, height, 1);
    ImGui.SetNextWindowTransparency(0.84);
    ImGui.Begin("##GW_GANG_RANKING", true, true, true, true, false);
    const ranked = this.rankedGangs(), pages = Math.max(1, Math.ceil(ranked.length / config.gangPageSize));
    this.gangPage = Math.min(this.gangPage, pages - 1);
    ImGui.TextColored("* Gang War Offline - Ranking de Gangues", 0.86, 0.9, 0.95, 1);
    ImGui.SameLine(); ImGui.TextDisabled(`Gangues: ${ranked.length}`);
    ImGui.Separator(); ImGui.Columns(7);
    for (const heading of ["#", "tag", "name", "score", "terr.", "GZs", "bases"]) {
      ImGui.TextDisabled(heading); ImGui.NextColumn();
    }
    ImGui.Separator();
    const ownId = participant(this.store.world, config.humanId).gangId;
    for (const row of ranked.slice(this.gangPage * config.gangPageSize, (this.gangPage + 1) * config.gangPageSize)) {
      const [r, g, b] = this.color(row.gang.color), own = row.gang.id === ownId;
      const number = own ? 1 : r, green = own ? 1 : g, blue = own ? 1 : b;
      ImGui.TextColored(String(row.position), number, green, blue, 1); ImGui.NextColumn();
      ImGui.TextColored(row.gang.tag ?? "[?]", r, g, b, 1); ImGui.NextColumn();
      ImGui.TextColored(row.gang.name, r, g, b, 1); ImGui.NextColumn();
      ImGui.TextColored(String(row.score), number, green, blue, 1); ImGui.NextColumn();
      ImGui.TextColored(String(row.gang.territoryCount), number, green, blue, 1); ImGui.NextColumn();
      ImGui.TextColored(String(row.gang.gangZoneCount), number, green, blue, 1); ImGui.NextColumn();
      ImGui.TextColored(String(row.gang.baseCount), number, green, blue, 1); ImGui.NextColumn();
    }
    ImGui.Columns(1); ImGui.Separator();
    ImGui.TextDisabled(`Ctrl+G/Esc: fechar | PgUp/PgDn: pagina ${this.gangPage + 1}/${pages} | TAB: jogadores`);
    ImGui.End();
    ImGui.PopStyleVar(2); ImGui.PopStyleColor(2);
  }
  private drawImGuiChat(): void {
    const hud = config.chatHud;
    const count = this.displayRows.length;
    const rowHeight = Math.max(hud.lineHeight, ImGui.CalcTextSize("Ag").height + 10);
    const display = ImGui.GetDisplaySize();
    const width = Math.min(hud.inputWidth, Math.max(320, display.width - hud.left * 2));
    const maxRows = Math.max(1, Math.floor((hud.feedHeight - hud.feedPadding) / rowHeight));
    const visibleRows = Math.min(maxRows, Math.max(1, count));
    const feedHeight = Math.max(hud.feedHeight, visibleRows * rowHeight + hud.feedPadding);
    this.chatVisibleRows = visibleRows;
    const scroll = this.chat ? Math.min(this.chatScroll, Math.max(0, count - visibleRows)) : 0;
    const first = Math.max(0, count - visibleRows - scroll);
    ImGui.PushStyleColor(2, 2, 5, 8, 235);
    ImGui.PushStyleVar(3, 0); ImGui.PushStyleVar(4, 0);
    ImGui.SetNextWindowPos(hud.left, hud.feedTop, 1);
    ImGui.SetNextWindowSize(width, feedHeight, 1);
    ImGui.SetNextWindowTransparency(0.08);
    ImGui.Begin("##GW_CHAT_FEED", true, true, true, true, false);
    for (const entry of this.displayRows.slice(first, first + visibleRows)) {
      if (entry.source === "system") {
        const [r, g, b] = this.color(entry.color);
        ImGui.TextColored(`>> ${entry.text}`, r, g, b, 1);
      } else {
        const row = entry.message!;
        const name = identity(this.store.world, row.participantId), [r, g, b] = this.color(name.color);
        ImGui.TextColored(name.name, r, g, b, 1); ImGui.SameLine();
        const body = row.kind === "death" ?
          ` morreu${row.text.startsWith("killer:") ? ` - ${identity(this.store.world, row.text.slice(7)).name}` : " - autoria desconhecida"}` :
          `: ${row.kind === "gang" ? "(Gangue) " : ""}${row.text}${this.pendingMessages.includes(row) ? " *" : ""}`;
        ImGui.Text(body);
      }
    }
    ImGui.End();
    ImGui.PopStyleVar(2); ImGui.PopStyleColor(1);
    if (this.chat && count > visibleRows) {
      ImGui.SetNextWindowPos(hud.left + width - 18, hud.feedTop + feedHeight - 25, 1);
      ImGui.SetNextWindowSize(14, 20, 1); ImGui.SetNextWindowTransparency(0.7);
      ImGui.Begin("##GW_CHAT_SCROLL", true, true, true, true, false);
      ImGui.TextDisabled(`${scroll + 1}`); ImGui.End();
    }
    if (this.chat) {
      // Indices de ImGuiCol/ImGuiStyleVar conferidos no sa.enums.mts da DEV:
      // WindowBg=2, Border=5, WindowRounding=3, WindowBorderSize=4.
      ImGui.PushStyleColor(2, 5, 8, 9, 250);
      ImGui.PushStyleColor(5, 220, 225, 225, 255);
      ImGui.PushStyleVar(3, 3);
      ImGui.PushStyleVar(4, 1.5);
      ImGui.SetNextWindowPos(hud.left, hud.feedTop + feedHeight + hud.inputGap, 1);
      ImGui.SetNextWindowSize(width, hud.inputHeight, 1);
      ImGui.SetNextWindowTransparency(1);
      ImGui.Begin("##GW_CHAT_INPUT", true, true, true, true, false);
      const caret = Math.floor(Date.now() / 500) % 2 === 0 ? "|" : " ";
      if (this.chatError) ImGui.TextColored(` ${this.chatError}`, 1, 0.36, 0.36, 1);
      else ImGui.TextColored(` ${this.buffer}${caret}`, 1, 1, 1, 1);
      ImGui.End();
      ImGui.PopStyleVar(2);
      ImGui.PopStyleColor(2);
    }
  }
  private buildScoreboard(now: number): void {
    const world = this.store.world;
    if (this.lastRevision === world.revision && now - this.lastRefresh < config.refreshMs) return;
    const ranking = individualRanking(world);
    this.total = ranking.length;
    const pages = Math.max(1, Math.ceil(this.total / config.pageSize));
    this.page = Math.min(this.page, pages - 1);
    this.rows = ranking.slice(this.page * config.pageSize, (this.page + 1) * config.pageSize);
    this.cells = [];
    const add = (key: string, value: string, x: number, y: number, color = "#FFFFFF", center = false) => {
      this.put(key, value); this.cells.push({ key, value, x, y, color, center });
    };
    add("GWSTTL", `Gang War Offline - ${this.total} online`, 320, 77, "#FFFFFF", true);
    add("GWSHI", "ID", 69, 107, "#BBBBBB");
    add("GWSHN", "Jogador", 128, 107, "#BBBBBB");
    add("GWSHS", "Score", 461, 107, "#BBBBBB");
    add("GWSHK", "K/D", 546, 107, "#BBBBBB");
    for (const [i, p] of this.rows.entries()) {
      const name = identity(world, p.id), y = 133 + i * 18;
      add(`GWSI${i}`, `${p.human ? ">" : " "}${p.sessionId}`, 69, y);
      add(`GWSN${i}`, name.name, 128, y, name.color);
      add(`GWSS${i}`, `${p.score}`, 461, y);
      add(`GWSK${i}`, kd(p), 546, y);
    }
    add("GWSFOOT", `PgUp/PgDn - ${this.page + 1}/${pages} - ${config.tabMode === "hold" ? "solte TAB" : "TAB fecha"} - ${this.store.readOnly ? "somente leitura" : this.store.busy || this.queue.length ? "gravacao pendente" : "salvo"}`, 320, 389, "#BBBBBB", true);
    this.lastRevision = world.revision; this.lastRefresh = now;
  }
  private setVisible(value: boolean): void {
    if (value === this.visible) return;
    this.visible = value;
    this.lastRevision = -1;
    if (value) {
      // 0960: suprime SOMENTE o painel de atributos (acao TAB), nao o pad inteiro.
      this.engine.call<void>("SET_PLAYER_DISPLAY_VITAL_STATS_BUTTON", 0, false); this.statsOwned = true;
    } else if (this.statsOwned) {
      this.engine.call<void>("SET_PLAYER_DISPLAY_VITAL_STATS_BUTTON", 0, true); this.statsOwned = false;
    }
  }
  private endChat(): void {
    this.chat = null; this.buffer = ""; this.chatError = "";
    this.chatScroll = 0;
    this.releaseControls();
  }
  private releaseControls(): void {
    // Uma missao/cutscene tem prioridade; nao liga controles no meio dela.
    if (this.controlsOwned && this.environmentSafe()) {
      this.engine.call<void>("SET_PLAYER_CONTROL", 0, true); this.controlsOwned = false;
    }
  }
  private editChat(edges: ReadonlySet<number>): void {
    if (edges.has(27)) { this.endChat(); return; }
    if (edges.has(13)) { this.trySubmitChat(); return; }
    if (edges.has(38)) { this.chatScroll = Math.min(this.chatScroll + 1, Math.max(0, this.displayRows.length - this.chatVisibleRows)); this.lastMessageRevision = -1; }
    if (edges.has(40)) { this.chatScroll = Math.max(0, this.chatScroll - 1); this.lastMessageRevision = -1; }
    if (edges.has(8)) { this.buffer = this.buffer.slice(0, -1); this.chatError = ""; }
    if (this.runtime.isKeyPressed(17)) return;
    const shift = this.runtime.isKeyPressed(16);
    for (const key of edges) {
      let char = "";
      if (key >= 65 && key <= 90) char = String.fromCharCode(key + (shift ? 0 : 32));
      else if (key >= 48 && key <= 57) char = shift ? ")!@#$%^&*("[key - 48]! : String.fromCharCode(key);
      else if (key === 32) char = " ";
      else if (key === 186) char = shift ? ":" : ";";
      else if (key === 187) char = shift ? "+" : "=";
      else if (key === 188) char = shift ? "<" : ",";
      else if (key === 189) char = shift ? "_" : "-";
      else if (key === 190) char = shift ? ">" : ".";
      // No layout pt-BR da instalacao DEV, OEM_2 (191) e ;/: e ABNT_C1 (193) e /?.
      else if (key === 191) char = shift ? ":" : ";";
      else if (key === 192) char = shift ? "~" : "`";
      else if (key === 193) char = shift ? "?" : "/";
      else if (key === 111) char = "/"; // divisao do teclado numerico
      else if (key === 219) char = shift ? "{" : "[";
      else if (key === 220) char = shift ? "|" : "\\";
      else if (key === 221) char = shift ? "}" : "]";
      else if (key === 222) char = shift ? '"' : "'";
      if (char && this.buffer.length < config.chatLimit) {
        this.buffer += char; this.chatError = "";
      }
    }
  }
  private trySubmitChat(): void {
    try {
      let text = this.buffer.trim(), channel = this.chat;
      if (!text || !channel) return;
      const gangPrefix = text.startsWith(config.gangChatPrefix);
      if (gangPrefix) {
        channel = "gang";
        text = text.slice(config.gangChatPrefix.length).trim();
        if (!text) throw new Error("Digite uma mensagem depois de !.");
      }
      if (!gangPrefix && text.startsWith("/tag ")) {
        const tag = text.slice(5).toUpperCase();
        if (!/^\[[A-Z0-9]{1,5}\]$/.test(tag)) throw new Error("Use /tag [ABC].");
        this.enqueue("tag da gangue", (w) => setGangTag(w, participant(w, config.humanId).gangId, tag));
      } else if (!gangPrefix && text.startsWith("/nick ")) {
        const nickname = text.slice(6);
        if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,23}$/.test(nickname)) throw new Error("Nickname invalido.");
        this.enqueue("nickname", (w) => setNickname(w, config.humanId, nickname));
      } else if (!gangPrefix && text.startsWith("/")) this.runCommand(text);
      else this.send(config.humanId, text, channel);
      this.endChat();
    } catch (error) {
      this.chatError = error instanceof Error ? error.message : String(error);
      this.runtime.log(`[GangWar] [chat] Entrada rejeitada: ${this.chatError}`);
    }
  }
  private buildMessages(now: number): void {
    const world = this.store.world, time = Math.floor(now / 500);
    if (world.revision === this.lastMessageRevision && time === this.lastMessageTime) return;
    const gangId = participant(world, config.humanId).gangId;
    const messages = [...world.social.messages, ...this.pendingMessages];
    const chat = messages.filter((m) => (m.kind === "global" || m.kind === "gang") &&
      (m.kind !== "gang" || m.gangId === gangId)).slice(-config.chatHistoryLimit);
    const feed = messages.filter((m) => (m.kind === "death" || m.kind === "notification") &&
      now >= m.at && now - m.at < config.feedDurationMs).slice(-config.feedRows);
    this.messageRows = [...chat, ...feed];
    this.displayRows = [
      ...this.localLines.map((line) => ({ source: "system" as const, at: line.at, text: line.text, color: line.color })),
      ...this.messageRows.map((message) => ({ source: "message" as const, at: message.at, text: "", color: "#FFFFFF", message })),
    ].sort((a, b) => a.at - b.at).slice(-config.chatHistoryLimit);
    const first = Math.max(0, this.displayRows.length - config.chatRows - this.chatScroll);
    this.messages = this.displayRows.slice(first, first + config.chatRows).flatMap((entry, i) => {
      if (entry.source === "system") {
        const key = `GWSQ${i}`; this.put(key, `>> ${entry.text}`);
        return [{ key, value: "", x: 25, y: 25 + i * 18, color: entry.color }];
      }
      const m = entry.message!;
      const name = identity(world, m.participantId);
      const pending = this.pendingMessages.includes(m) ? " *" : "";
      const value = m.kind === "death" ? `${name.name} morreu${m.text.startsWith("killer:") ? ` - ${identity(world, m.text.slice(7)).name}` : " - autoria desconhecida"}` :
        `${m.kind === "gang" ? "(Gangue) " : ""}${name.name}: ${m.text}${pending}`;
      const key = `GWSC${i}`; this.put(key, value);
      if (m.kind === "death" && m.text.startsWith("killer:")) {
        const killer = identity(world, m.text.slice(7)), killerKey = `GWSF${i}`;
        this.put(key, `${killer.name} matou`); this.put(killerKey, name.name);
        return [{ key, value: "", x: 25, y: 25 + i * 18, color: killer.color },
          { key: killerKey, value: "", x: 290, y: 25 + i * 18, color: name.color }];
      }
      return [{ key, value, x: 25, y: 25 + i * 18, color: name.color }];
    });
    this.lastMessageRevision = world.revision; this.lastMessageTime = time;
  }
  private frame(): void {
    if (!this.started) return;
    const keys = this.chat ? CHAT_KEYS :
      [config.tabKey, config.previousPageKey, config.nextPageKey, 27, 84, 89];
    const edges = new Set(keys.filter((key) => this.edge(key)));
    if (!this.environmentSafe()) { this.setVisible(false); this.gangRankingVisible = false; this.endChat(); return; }
    const canInteract = this.controlsOwned || this.engine.call<boolean>("IS_PLAYER_CONTROL_ON", 0);
    // Mesmo se o GTA ainda nao liberou o controle, as boas-vindas podem ser
    // desenhadas; apenas entrada de teclado e paineis interativos aguardam.
    if (!canInteract) { this.setVisible(false); this.gangRankingVisible = false; this.endChat(); }
    if (!this.chat) this.releaseControls();
    if (this.chat) {
      try { this.editChat(edges); } catch (error) {
        this.runtime.log(`[GangWar] [chat] Entrada rejeitada: ${String(error)}`); this.endChat();
      }
    }
    else if (canInteract) {
      const global = config.chatGlobalKeys.every((key) => this.runtime.isKeyPressed(key)) && edges.has(84);
      const gang = config.chatGangKeys.every((key) => this.runtime.isKeyPressed(key)) && edges.has(89);
      if ((global || gang) && this.canChat()) {
        this.setVisible(false); this.gangRankingVisible = false; this.chat = gang ? "gang" : "global";
        for (const key of CHAT_KEYS) {
          if (this.runtime.isKeyPressed(key)) this.pressed.add(key); else this.pressed.delete(key);
        }
        this.buffer = ""; this.chatError = ""; this.chatScroll = 0;
        this.engine.call<void>("SET_PLAYER_CONTROL", 0, false); this.controlsOwned = true;
      }
    }
    if (!this.chat && canInteract) {
      if (config.tabMode === "hold") this.setVisible(this.runtime.isKeyPressed(config.tabKey));
      else if (edges.has(config.tabKey)) this.setVisible(!this.visible);
    }
    if (this.gangRankingVisible && !this.visible && !this.chat) {
      const pages = Math.max(1, Math.ceil(this.store.world.ranking.length / config.gangPageSize));
      if (edges.has(27)) this.gangRankingVisible = false;
      if (edges.has(config.previousPageKey)) this.gangPage = Math.max(0, this.gangPage - 1);
      if (edges.has(config.nextPageKey)) this.gangPage = Math.min(pages - 1, this.gangPage + 1);
    }
    const now = Date.now();
    if (this.visible) {
      const pages = Math.max(1, Math.ceil(this.total / config.pageSize));
      if (edges.has(config.previousPageKey)) { this.page = Math.max(0, this.page - 1); this.lastRevision = -1; }
      if (edges.has(config.nextPageKey)) { this.page = Math.min(pages - 1, this.page + 1); this.lastRevision = -1; }
      this.buildScoreboard(now);
      if (!this.scoreboardLogged) {
        this.scoreboardLogged = true;
        this.runtime.log(`[GangWar] [social-ui] TAB: ${this.total} participantes online; ${this.rows.length} linhas na pagina ${this.page + 1}.`);
      }
      if (!this.drawImGui()) {
        this.engine.call<void>("USE_TEXT_COMMANDS", true);
        this.engine.call<void>("DRAW_RECT", 320, 232, 560, 335, 12, 16, 20, 230);
        for (const [i, p] of this.rows.entries()) if (p.human) this.engine.call<void>("DRAW_RECT", 320, 140 + i * 18, 548, 18, 95, 22, 27, 190);
        for (const cell of this.cells) this.display(cell);
      }
    } else {
      this.buildMessages(now);
      const imguiDrawn = this.drawImGui();
      if (!imguiDrawn && (this.messages.length || this.chat || this.names.length)) this.engine.call<void>("USE_TEXT_COMMANDS", true);
      if (!imguiDrawn) for (const cell of this.messages) this.display(cell);
      if (this.optionalReady && !this.projectionFailed && this.capabilities.projectHead) {
        for (const name of this.names) {
          if (!this.engine.exists(name.actor.handle) || this.engine.dead(name.actor.handle)) continue;
          let p;
          try { p = this.capabilities.projectHead(name.actor); }
          catch (error) {
            this.projectionFailed = true;
            this.runtime.log(`[GangWar] [nametag-opcional] Suspenso: ${String(error)}; chat/TAB continuam.`); break;
          }
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 640 && p.y >= 0 && p.y <= 448)
            this.display({ key: name.key, value: "", x: p.x, y: p.y, color: name.color, center: true });
        }
      }
      if (this.chat && !imguiDrawn) {
        const value = `${this.buffer}_`;
        this.put("GWSIN", value);
        const lineCount = Math.min(config.chatRows, this.displayRows.length);
        const inputY = Math.max(96, 25 + lineCount * 18 + 12);
        this.engine.call<void>("DRAW_RECT", 320, inputY + 9, 590, 25, 5, 8, 9, 245);
        this.display({ key: "GWSIN", value, x: 25, y: inputY, color: "#FFFFFF" });
      }
    }
  }
  send(id: string, text: string, channel: "global" | "gang"): void {
    if (this.store.readOnly) throw new Error("Chat nao pode ser salvo: geracao invalida preservada; persistencia somente leitura.");
    // Valida imediatamente para rejeitar input sem interromper o loop/persistencia.
    const probe = { ...this.store.world, social: { ...this.store.world.social, messages: [] } };
    const message = addMessage(probe, Date.now(), channel, id, text);
    this.enqueue(`chat ${channel}`, (w) => { addMessage(w, message.at, channel, id, text); }, () => this.unstage(message));
    this.stage(message);
  }
  private stage(message: SocialMessage): void { this.pendingMessages.push(message); this.lastMessageRevision = -1; }
  private unstage(message: SocialMessage): void {
    this.pendingMessages = this.pendingMessages.filter((m) => m !== message); this.lastMessageRevision = -1;
  }
  notification(id: string, text: string): void {
    if (this.store.readOnly) throw new Error("Persistencia somente leitura.");
    const probe = { ...this.store.world, social: { ...this.store.world.social, messages: [] } };
    addMessage(probe, Date.now(), "notification", id, text);
    this.enqueue("notificacao social", (w) => addMessage(w, Date.now(), "notification", id, text));
  }
  presence(id: string, online: boolean): void {
    if (this.store.readOnly) throw new Error("Persistencia somente leitura.");
    this.enqueue("presenca social", (w) => setOnline(w, id, online));
  }
  // Chamado ANTES de os pools removerem os NPCs mortos ou da disputa ser resolvida.
  observe(bindings: readonly ActorBinding[], now: number): void {
    if (!this.started || this.store.readOnly) return;
    const current = new Set(bindings.map((a) => a.participantId));
    for (const id of this.observed.keys()) if (!current.has(id)) this.observed.delete(id);
    this.names = [];
    for (const actor of bindings) {
      if (!this.engine.exists(actor.handle)) continue; // despawn nao e morte
      const person = participant(this.store.world, actor.participantId);
      if (!person.online && !this.presenceQueued.has(person.id)) {
        this.enqueue("participante fisico online", (w) => setOnline(w, person.id, true), () => this.presenceQueued.delete(person.id));
        this.presenceQueued.add(person.id);
      }
      const previous = this.observed.get(actor.participantId);
      const dead = this.engine.call<boolean>("IS_CHAR_DEAD", actor.handle);
      if (dead && ((previous?.handle === actor.handle && !previous.dead) ||
          (actor.participantId !== config.humanId && previous?.handle !== actor.handle))) {
        let killerId: string | undefined;
        if (this.optionalReady && !this.attributionFailed && this.capabilities.identifyKiller) {
          try { killerId = this.capabilities.identifyKiller(actor, bindings); }
          catch (error) { this.attributionFailed = true; this.runtime.log(`[GangWar] [autoria-opcional] ${String(error)}; morte sem autor.`); }
        }
        if (killerId && !bindings.some((b) => b.participantId === killerId)) killerId = undefined;
        const eventId = `${this.sessionKey}-${++this.observationSequence}`;
        const preview: SocialMessage = { id: eventId, at: now, kind: "death", participantId: actor.participantId,
          gangId: participant(this.store.world, actor.participantId).gangId, text: killerId ? `killer:${killerId}` : "Autoria nao confirmada" };
        this.enqueue("morte confirmada", (w) => recordDeath(w, eventId, actor.participantId, now, killerId), () => this.unstage(preview));
        this.stage(preview);
      }
      this.observed.set(actor.participantId, { handle: actor.handle, dead });
      if (!dead && actor.participantId !== config.humanId && this.optionalReady && !this.projectionFailed && this.capabilities.projectHead) {
        const name = identity(this.store.world, actor.participantId), key = `GWSA${this.names.length}`;
        this.put(key, name.name); this.names.push({ key, actor, color: name.color });
      }
    }
  }
  pump(): void {
    if (!this.started || this.store.readOnly || this.store.busy || !this.queue.length) return;
    const batch = this.queue.slice(0, 8);
    // Publicacao e remocao da fila somente depois do checkpoint confirmado.
    this.store.transact("social: mensagens/estatisticas", (w) => {
      for (const item of batch) {
        try { item.mutate(w); }
        catch (error) { this.runtime.log(`[GangWar] [social-validacao] ${item.label} rejeitado: ${String(error)}`); }
      }
    }, () => { this.queue.splice(0, batch.length); for (const item of batch) item.after(); });
  }
  stop(): void {
    if (this.timer !== null) this.runtime.clearInterval(this.timer);
    this.timer = null; this.started = false; this.setVisible(false); this.gangRankingVisible = false; this.endChat();
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    for (const key of this.textKeys.keys()) this.text.delete(key);
    this.textKeys.clear(); this.names = []; this.observed.clear();
    if (this.queue.length) this.runtime.log(`[GangWar] [social] ${this.queue.length} eventos ainda nao confirmados; aguarde persistencia antes de encerrar o jogo.`);
  }
}
