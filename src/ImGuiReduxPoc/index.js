// POC isolada: so deve ser instalada junto com ImGuiReduxWin32.cleo.
// Ctrl+I alterna o painel; a verificacao usa a entrada Pad ja confirmada no Redux.
let visible = false;
let previousToggle = false;
let announced = false;
let unavailableLogged = false;

while (true) {
  wait(0);

  if (typeof ImGui === "undefined") {
    if (!unavailableLogged) {
      unavailableLogged = true;
      log("[GangWar] [imgui-poc] ERRO: ImGuiRedux nao foi carregado; POC inativa.");
    }
    continue;
  }

  const toggle = Pad.IsKeyPressed(17) && Pad.IsKeyPressed(73);
  if (toggle && !previousToggle) visible = !visible;
  previousToggle = toggle;

  ImGui.BeginFrame("GANG_WAR_IMGUI_POC");
  ImGui.SetCursorVisible(visible);
  if (visible) {
    ImGui.SetNextWindowSize(560.0, 300.0, 2);
    ImGui.Begin("Gang War Offline - ImGuiRedux POC", visible, 0, 0, 0, 0);
    ImGui.TextColored("SA-MP Social System", 0.36, 0.82, 0.36, 1.0);
    ImGui.Separator();
    ImGui.Text("Renderizacao ImGuiRedux ativa em cada frame.");
    ImGui.Text("Entrada Redux ativa: Ctrl+I mostra/oculta este painel.");
    ImGui.Text("Chat e TAB do mod principal usam ImGuiRedux na DEV.");
    ImGui.End();
  }
  ImGui.EndFrame();

  if (!announced) {
    announced = true;
    log(`[GangWar] [imgui-poc] OK: ImGuiRedux ${ImGui.GetPluginVersion().toFixed(2)} carregado; Ctrl+I alterna o painel.`);
  }
}
