import { DEV_PAGES } from "../config/commands.mts";
import { DEV_SHORTCUTS } from "../config/keyboard.mts";
import type { DevAction } from "../config/commands.mts";
import type { GtaRuntime } from "./gta.mts";
import type { WorldState } from "../core/world-types.mts";

declare const ImGui: {
  BeginFrame(id: string): void; EndFrame(): void;
  SetCursorVisible(visible: boolean): void;
  SetNextWindowPos(x: number, y: number, condition: number): void;
  SetNextWindowSize(width: number, height: number, condition: number): void;
  SetNextWindowTransparency(alpha: number): void;
  Begin(label: string, open: boolean, noTitleBar: boolean, noResize: boolean, noMove: boolean, autoResize: boolean): boolean;
  End(): void;
  Text(value: string): void; TextDisabled(value: string): void;
  TextColored(value: string, red: number, green: number, blue: number, alpha: number): void;
  Separator(): void; SameLine(): void; Columns(count: number): void; NextColumn(): void;
  PushStyleColor(index: number, red: number, green: number, blue: number, alpha: number): void;
  PopStyleColor(count: number): void; PushStyleVar(index: number, value: number): void; PopStyleVar(count: number): void;
  GetDisplaySize(): { width: number; height: number };
};

export class DevMenu {
  pageIndex = 0; actionIndex = 0; targetIndex = 0; slotIndex = 0; value = 0; visible = false;
  private wasPressed = new Set<string>();
  private imguiFailed = false;
  constructor(private runtime: GtaRuntime) {
    for (const [id, shortcut] of Object.entries(DEV_SHORTCUTS)) if (shortcut.keys.every((k) => runtime.isKeyPressed(k))) this.wasPressed.add(id);
  }
  get page() { return DEV_PAGES[this.pageIndex]!; }
  get action(): DevAction { return this.page.actions[this.actionIndex]!; }
  targets(world: WorldState): { id: string; name: string }[] {
    if (this.page.id === "territory" || this.page.id === "gz") return world.zones.filter((z) => z.kind === (this.page.id === "gz" ? "gz" : "territory"));
    return world.bases;
  }
  target(world: WorldState): string { return this.targets(world)[this.targetIndex % Math.max(1, this.targets(world).length)]?.id ?? ""; }
  describe(world: WorldState): void {
    const target = this.targets(world).find((t) => t.id === this.target(world));
    if (this.imguiFailed || typeof ImGui === "undefined")
      this.runtime.showTextBox(`${this.page.name}: ${target?.name ?? "-"} | ${this.action.label} | valor=${this.value} slot=${this.slotIndex + 1}. Ctrl+Enter: executar.`);
  }
  pollSuppressed(world: WorldState): void { this.poll(world, false); }
  poll(world: WorldState, allowed = true): "execute" | "stop" | null {
    let result: "execute" | "stop" | null = null;
    for (const [id, shortcut] of Object.entries(DEV_SHORTCUTS)) {
      const pressed = shortcut.keys.every((k) => this.runtime.isKeyPressed(k));
      const edge = pressed && !this.wasPressed.has(id);
      if (pressed) this.wasPressed.add(id); else this.wasPressed.delete(id);
      if (!edge || !allowed || this.runtime.isOnMission()) continue;
      if (id === "stop") { result = "stop"; continue; }
      if (id === "page") {
        if (this.visible) { this.visible = false; continue; }
        this.visible = true; this.actionIndex = 0; this.targetIndex = 0; this.slotIndex = 0; this.value = this.action.initial;
      } else if (id === "pagePrev" || id === "pageNext") {
        if (!this.visible) continue;
        this.pageIndex = (this.pageIndex + (id === "pagePrev" ? DEV_PAGES.length - 1 : 1)) % DEV_PAGES.length;
        this.actionIndex = 0; this.targetIndex = 0; this.slotIndex = 0; this.value = this.action.initial;
      } else if (!this.visible) continue;
      else if (id === "action") { this.actionIndex = (this.actionIndex + 1) % this.page.actions.length; this.value = this.action.initial; }
      else if (id === "target") { this.targetIndex = (this.targetIndex + 1) % Math.max(1, this.targets(world).length); this.slotIndex = 0; }
      else if (id === "slot") {
        const base = world.bases.find((b) => b.id === this.target(world));
        const count = this.page.id === "pickup" ? base?.pickups.length : base?.vehicles.length;
        this.slotIndex = (this.slotIndex + 1) % Math.max(1, count ?? 1);
      } else if (id === "increase") this.value = Math.min(this.action.max, this.value + this.action.step);
      else if (id === "decrease") this.value = Math.max(this.action.min, this.value - this.action.step);
      else if (id === "execute") result = "execute";
      this.describe(world);
    }
    return result;
  }
  draw(world: WorldState): boolean {
    if (!this.visible || this.imguiFailed || typeof ImGui === "undefined") return false;
    try {
      const display = ImGui.GetDisplaySize();
      const width = Math.min(900, Math.max(620, display.width - 80));
      const height = Math.min(560, display.height - 48);
      ImGui.BeginFrame("GANG_WAR_DEV");
      try {
        ImGui.SetCursorVisible(false);
        ImGui.PushStyleColor(2, 5, 8, 12, 245);
        ImGui.PushStyleColor(5, 170, 180, 190, 220);
        ImGui.PushStyleVar(3, 2); ImGui.PushStyleVar(4, 1);
        ImGui.SetNextWindowPos((display.width - width) / 2, (display.height - height) / 2, 1);
        ImGui.SetNextWindowSize(width, height, 1);
        ImGui.SetNextWindowTransparency(0.94);
        ImGui.Begin("##GW_DEV_MENU", true, true, true, true, false);
        ImGui.TextColored("GANG WAR OFFLINE  |  MENU DEV", 0.36, 0.86, 0.42, 1);
        ImGui.SameLine(); ImGui.TextDisabled("somente ferramentas de desenvolvimento");
        ImGui.Separator();
        ImGui.Columns(2);
        ImGui.TextDisabled("Pagina"); ImGui.NextColumn(); ImGui.TextColored(`${this.pageIndex + 1}/${DEV_PAGES.length}  ${this.page.name}`, 0.95, 0.95, 0.95, 1); ImGui.NextColumn();
        ImGui.TextDisabled("Alvo"); ImGui.NextColumn(); ImGui.Text(this.targets(world).find((target) => target.id === this.target(world))?.name ?? "-"); ImGui.NextColumn();
        ImGui.TextDisabled("Acao"); ImGui.NextColumn(); ImGui.Text(this.action.label); ImGui.NextColumn();
        ImGui.TextDisabled("Valor"); ImGui.NextColumn(); ImGui.Text(`${this.value}  (min ${this.action.min}, max ${this.action.max}, passo ${this.action.step})`); ImGui.NextColumn();
        ImGui.TextDisabled("Slot"); ImGui.NextColumn(); ImGui.Text(`${this.slotIndex + 1}`); ImGui.NextColumn();
        ImGui.Columns(1); ImGui.Separator();
        ImGui.TextDisabled("Paginas");
        for (const [index, page] of DEV_PAGES.entries()) ImGui.TextColored(`${index === this.pageIndex ? ">" : " "} ${index + 1}. ${page.name}`, index === this.pageIndex ? 0.36 : 0.72, index === this.pageIndex ? 0.86 : 0.72, index === this.pageIndex ? 0.42 : 0.72, 1);
        ImGui.Separator(); ImGui.TextDisabled("Atalhos");
        ImGui.Text("Ctrl+M fecha/abre  |  Ctrl+Esq/Direita muda pagina  |  Ctrl+N proxima acao");
        ImGui.Text("Ctrl+B proximo alvo  |  Ctrl+L proximo slot  |  Ctrl+Cima/Baixo ajusta valor");
        ImGui.Text("Ctrl+Enter executa  |  Ctrl+Esc interrompe o mod");
        ImGui.TextDisabled("As ferramentas permanecem desativadas durante missao, interior e fade.");
        ImGui.End();
        ImGui.PopStyleVar(2); ImGui.PopStyleColor(2);
      } finally { ImGui.EndFrame(); }
      return true;
    } catch (error) {
      this.imguiFailed = true;
      this.runtime.log(`[GangWar] [menu-dev] ImGui suspenso: ${String(error)}; fallback de teclas ativo.`);
      return false;
    }
  }
}
