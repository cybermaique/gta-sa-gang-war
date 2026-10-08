import { BASE_LIMITS, PICKUP_CHOICES, VEHICLE_CHOICES, WORLD_RULES } from "../config/world.mts";
import { beginBattle, resolveBattle } from "../core/battles.mts";
import { addPickup, addVehicle, buyBase, getBase, transferBase } from "../core/bases.mts";
import { bankChange, transferWallet } from "../core/economy.mts";
import { advanceWorld } from "../core/offline.mts";
import { playerRespawn } from "../core/respawn.mts";
import { calibrateZone, catalogMissing, event, extendCatalog, inside, playerGang, transferZone } from "../core/world.mts";
import type { City, Position, WorldState } from "../core/world-types.mts";
import { WorldStore } from "../persistence/store.mts";
import type { StateIo } from "../persistence/store.mts";
import { BaseAssets } from "./assets.mts";
import { CombatSession } from "./combat.mts";
import { DevMenu } from "./dev-menu.mts";
import { distance, GameEngine } from "./engine.mts";
import type { NativeApi } from "./engine.mts";
import { reportGtaError, startGangWar } from "./gta.mts";
import type { GtaRuntime } from "./gta.mts";
import { TerritoryRadar } from "./territories.mts";
import { MemberPool } from "./members.mts";
import { SocialAdapter } from "./social.mts";
import type { SocialEventBus, TextStore } from "./social.mts";
import type { SocialCapabilities } from "./social-capabilities.mts";
import { SOCIAL_CONFIG } from "../config/social.mts";
import { PERSISTENCE_CONFIG } from "../config/persistence.mts";
import { IniProbe, IniReadLimits } from "../persistence/ini-diagnostics.mts";
import { ClockMonitor, epochNow } from "./clock.mts";
export { epochNow } from "./clock.mts";

export function startWorldRuntime(runtime: GtaRuntime, call: NativeApi, io: StateIo, root: string,
  text?: TextStore, capabilities?: SocialCapabilities, events?: SocialEventBus): () => void {
  const engine = new GameEngine(call);
  const writeLog = (message: string) => runtime.log(`[GangWar] ${message}`);
  const clock = new ClockMonitor(writeLog);
  const iniPersistence = PERSISTENCE_CONFIG.mode === "ini";
  const probe = iniPersistence && PERSISTENCE_CONFIG.diagnosticMode !== "off" ? new IniProbe(io, root, writeLog) : null;
  const limits = iniPersistence && PERSISTENCE_CONFIG.diagnosticMode === "limits" ? new IniReadLimits(io, `${root}\\ini-read-limits.ini`, writeLog) : null;
  let limitsComplete = limits === null, opened = false;
  let now = epochNow(), ready = false, stopped = false, bootstrapAnnouncementPending = false, welcomePending = false, lastTick = 0, lastSimulation = 0;
  let wasDead = false, wasSafe = false, overrideOwned = false;
  let stoppedRanking: (() => void) | undefined;
  let social: SocialAdapter | undefined;
  // Chat possui controle do teclado apenas durante a digitacao; simulacao/NPCs continuam.
  const isSafe = () => engine.safe(runtime.isOnMission(), social?.chatActive ?? false);
  let corner: { id: string; position: Position } | null = null;
  const disabled = new Set<string>();
  const notify = (message: string) => {
    if (engine.canPresent(runtime.isOnMission())) {
      if (!social?.showNotice(message)) runtime.showTextBox(message);
    }
    runtime.log(`[GangWar] ${message}`);
  };
  const radar = new TerritoryRadar(engine, notify);
  const combat = new CombatSession(engine, notify);
  const members = new MemberPool(engine, () => isSafe() && !combat.battle);
  const assets = new BaseAssets(engine, notify, isSafe);
  const menu = new DevMenu(runtime);
  const store = new WorldStore(io, root, now, (message) => runtime.log(`[GangWar] ${message}`), (error) => {
    reportGtaError(runtime, error, "persistencia"); ready = false;
    social?.stop();
    combat.cancel(); members.clear(); assets.clear();
    runtime.log("[GangWar] [bootstrap] Persistencia suspensa; ranking e Ctrl+G permanecem ativos com o estado em memoria.");
  }, PERSISTENCE_CONFIG.mode);
  const startRankingBootstrap = () => {
    if (stoppedRanking) return;
    stoppedRanking = startGangWar(runtime, () => store.world.gangs, { version: "0.2", demo: false, showInitialMessage: false,
      onShortcut: () => {
        if (!ready) { runtime.showTextBox("Gang War: aguarde o mundo ficar pronto."); return; }
        try {
          if (social?.toggleGangRanking()) return;
          if (!social?.showNotice("Gang War: chat indisponivel; ranking registrado no log."))
            runtime.showTextBox("Gang War: chat indisponivel; ranking registrado no log.");
          runtime.log(`[GangWar] [ranking] ${JSON.stringify(store.world.ranking)}`);
        } catch (error) { reportGtaError(runtime, error, "consulta-ranking-social"); }
      } });
    bootstrapAnnouncementPending = true;
    runtime.log("[GangWar] [bootstrap] Ranking e Ctrl+G ativos; persistencia continua em segundo plano.");
  };
  if (text) social = new SocialAdapter(runtime, engine, store, text, capabilities, () => !menu.visible, events);
  const save = (label: string, mutate: (draft: WorldState) => void, after: () => void = () => {}) => {
    store.transact(label, mutate, () => {
      try { after(); } catch (error) { reportGtaError(runtime, error, "efeito-pos-gravacao"); combat.cancel(); }
      notify(`${label}: confirmado e salvo.`);
    });
  };
  function point(): Position {
    const char = engine.char();
    if (!engine.call<boolean>("IS_CHAR_ON_FOOT", char) || engine.call<boolean>("IS_CHAR_IN_WATER", char) || engine.call<boolean>("IS_CHAR_IN_AIR", char)) throw new Error("Calibre a pe, parado e fora da agua.");
    const p = engine.position(char);
    if (engine.call<number>("GET_CHAR_SPEED", char) > 0.5) throw new Error("Pare antes de calibrar.");
    engine.ground(p); return p;
  }
  function execute(): void {
    const world = store.world, id = menu.target(world), action = menu.action.id, value = menu.value, slot = menu.slotIndex;
    const owner = playerGang(world), position = engine.position();
    const zone = world.zones.find((z) => z.id === id);
    const base = world.bases.find((b) => b.id === id);
    if (action === "inspect") {
      const data = zone ?? base;
      runtime.log(`[GangWar] [DEV] ${JSON.stringify(data)}`);
      notify(zone ? `${zone.name}: ${zone.ownerId}; ${inside(position, zone.bounds) ? "dentro" : "fora"}; ${zone.bounds ? "limites OK" : "calibre cantos A/B"}` :
        `${base?.name}: ${base?.ownerId ?? "a venda"}, $${base?.price}, nivel ${base?.level}, pickups ${base?.pickups.length}, veiculos ${base?.vehicles.length}.`);
      return;
    }
    if (action === "balance") {
      notify(`Banco $${world.gangs.find((g) => g.id === owner)!.bankBalance}; carteira Gang War $${world.wallets[owner]}.`); return;
    }
    if (action === "spawn-inspect") { notify(`Respawn: ${world.respawn.baseId ?? world.respawn.city}. Pontos cidade: ${world.citySpawns[world.respawn.city].length}`); return; }
    if (store.busy) throw new Error(store.progress());
    if (action === "corner-a") { corner = { id, position: point() }; notify("Canto A marcado. Caminhe ao canto oposto e execute canto B."); return; }
    if (action === "capture") {
      if (!zone) throw new Error("Selecione uma zona.");
      if (disabled.has("combat")) throw new Error("Combate suspenso apos erro; reinicie o mod depois de verificar o log.");
      if (combat.battle) throw new Error("Uma disputa ja esta em andamento.");
      if (!inside(position, zone.bounds)) throw new Error("Entre na zona selecionada.");
      members.clear();
      const battle = beginBattle(world, zone, now);
      const troopIds = [battle.attackerId, battle.defenderId].flatMap((gangId) =>
        world.members.filter((m) => m.gangId === gangId && m.readyAt <= now).slice(0, battle.rules.squadSize + 1).map((m) => m.id));
      save("reserva de tropas", (draft) => {
        for (const member of draft.members) if (troopIds.includes(member.id)) member.readyAt = now + WORLD_RULES.troopRecoveryMs;
      }, () => {
        if (!engine.safe(runtime.isOnMission()) || !inside(engine.position(), zone.bounds)) { notify("Reserva salva, mas captura cancelada: CJ saiu da area ou entrou em estado especial."); return; }
        combat.start(store.world, id, engine.position(), epochNow(), { battle, members: troopIds });
      }); return;
    }
    if (combat.battle && ["corner-b", "transfer-zone", "base-transfer"].includes(action)) throw new Error("Finalize ou interrompa a disputa antes de editar propriedades.");
    if (action === "corner-b") {
      if (!corner || corner.id !== id) throw new Error("Marque o canto A deste alvo primeiro.");
      const a = corner.position, b = point();
      save("calibracao de zona", (draft) => { calibrateZone(draft.zones.find((z) => z.id === id)!, a, b); event(draft, now, "calibracao", id); }); return;
    }
    if (action === "transfer-zone") { save("transferencia DEV", (draft) => transferZone(draft, id, draft.gangs[value]!.id, now)); return; }
    if (action === "deposit" || action === "withdraw") {
      save(action, (draft) => transferWallet(draft, owner, value, action === "deposit", now)); return;
    }
    if (action === "spawn-city") {
      const city = ["ls", "sf", "lv"][value] as City;
      if (!world.citySpawns[city].length) throw new Error("Cadastre um ponto seguro para esta cidade primeiro.");
      save("preferencia de cidade", (draft) => { draft.respawn = { city, baseId: null }; }); return;
    }
    if (action === "spawn-point") {
      const p = point(), city = ["ls", "sf", "lv"][value] as City;
      save("ponto de respawn", (draft) => {
        if (draft.citySpawns[city].length >= WORLD_RULES.maxCitySpawns || draft.citySpawns[city].some((q) => distance(p, q) < 5)) throw new Error("Ponto repetido ou limite atingido.");
        draft.citySpawns[city].push(p);
      }); return;
    }
    if (!base) throw new Error("Selecione uma base.");
    if (action === "base-position") { const p = point(); save("localizacao de base", (draft) => { getBase(draft, id).position = p; }); return; }
    if (action === "base-respawn") { const p = point(); save("respawn de base", (draft) => { getBase(draft, id).respawn = p; }); return; }
    if (action === "buy" || action === "buy-gang") {
      if (!base.position || distance(position, base.position) > 15) throw new Error("Aproxime-se da base calibrada.");
      save("compra de base", (draft) => buyBase(draft, id, now, action === "buy-gang" ? draft.gangs[value]!.id : owner)); return;
    }
    if (action === "base-transfer") { save("proprietario DEV", (draft) => transferBase(draft, id, draft.gangs[value]?.id ?? null, now)); return; }
    if (action === "base-level") {
      save("nivel DEV", (draft) => {
        const b = getBase(draft, id), level = value as 1 | 2 | 3 | 4;
        if (b.pickups.length > BASE_LIMITS[level].pickups || b.vehicles.length > BASE_LIMITS[level].vehicles) throw new Error("Remova slots excedentes antes de reduzir o nivel.");
        b.level = level;
      }); return;
    }
    if (action === "spawn-base") {
      if (base.ownerId !== owner || !base.respawn) throw new Error("Respawn disponivel somente em base propria calibrada.");
      save("preferencia de base", (draft) => { draft.respawn.baseId = id; }); return;
    }
    if (base.ownerId !== owner) throw new Error("Apenas a gangue proprietaria pode configurar equipamentos e veiculos.");
    if (!base.position || distance(position, base.position) > 60) throw new Error("Configure os slots dentro da base calibrada.");
    if (action === "pickup-add") { const p = point(); save("adicionar pickup", (draft) => addPickup(draft, id, p, value)); return; }
    if (action === "vehicle-add") { const p = point(); save("adicionar veiculo", (draft) => addVehicle(draft, id, p, value)); return; }
    if (action.startsWith("pickup-")) {
      const p = action === "pickup-position" ? point() : null;
      save(action, (draft) => {
        const b = getBase(draft, id), pickup = b.pickups[slot];
        if (!pickup) throw new Error("Slot de pickup inexistente.");
        if (action === "pickup-remove") b.pickups.splice(slot, 1);
        if (action === "pickup-position" && p) pickup.position = p;
        if (action === "pickup-ammo") pickup.ammo = value;
        if (action === "pickup-cooldown") pickup.cooldownMs = value * 1000;
        if (action === "pickup-type") { const type = PICKUP_CHOICES[value]!; pickup.type = type.type; pickup.weapon = type.weapon; }
      }); return;
    }
    if (action.startsWith("vehicle-")) {
      const p = action === "vehicle-position" ? point() : null;
      save(action, (draft) => {
        const b = getBase(draft, id), vehicle = b.vehicles[slot];
        if (!vehicle) throw new Error("Slot de veiculo inexistente.");
        if (action === "vehicle-remove") b.vehicles.splice(slot, 1);
        if (action === "vehicle-position" && p) vehicle.position = p;
        if (action === "vehicle-color") vehicle.color1 = vehicle.color2 = value;
        if (action === "vehicle-cooldown") vehicle.cooldownMs = value * 1000;
        if (action === "vehicle-enabled") vehicle.enabled = value === 1;
        if (action === "vehicle-model") {
          const config = VEHICLE_CHOICES[value]!;
          if (config.military && b.level !== 4) throw new Error("Veiculo militar exige nivel 4.");
          vehicle.model = config.model;
        }
      }); return;
    }
    throw new Error("Acao DEV desconhecida.");
  }
  function stop(): void {
    if (stopped) return;
    stopped = true;
    runtime.clearInterval(timer); stoppedRanking?.(); social?.stop(); store.stop();
    combat.cancel(); members.clear(); assets.clear(); radar.clear();
    if (overrideOwned) engine.call<void>("CANCEL_OVERRIDE_RESTART");
    notify("Gang War v0.2 interrompido; entidades removidas. Estado confirmado permanece salvo.");
  }
  const timer = runtime.setInterval(() => {
    if (stopped) return;
    try {
      store.pump();
      now = epochNow();
      const freeRoam = isSafe();
      const canPresent = engine.canPresent(runtime.isOnMission());
      if (bootstrapAnnouncementPending && ready && canPresent) {
        bootstrapAnnouncementPending = false;
        if (!social?.showNotice("Gang War Offline v0.2 ativo! Ctrl + G: ranking."))
          runtime.showTextBox("Gang War Offline v0.2 ativo! Ctrl + G: ranking.");
        runtime.log("[GangWar] [bootstrap] Mensagem inicial exibida no jogo.");
      }
      if (welcomePending && ready && canPresent) {
        welcomePending = false;
        try { social?.showWelcome(); } catch (error) { reportGtaError(runtime, error, "boas-vindas-social"); }
      }
      const gameTime = engine.call<number>("GET_GAME_TIMER");
      clock.observe(now, gameTime, freeRoam);
      if (!opened) {
        if (!iniPersistence) { opened = true; openWorld(); return; }
        if (!limitsComplete) { limitsComplete = limits!.pump(); return; }
        const measured = probe?.pump();
        if (probe && !measured) return;
        store.setVerifiedChunkSize(measured?.safeChunkSize ?? PERSISTENCE_CONFIG.confirmedChunkSize);
        opened = true; openWorld(); return;
      }
      if (!ready) return;
      if (freeRoam && !social?.chatActive && !social?.scoreboardVisible && !social?.gangRankingOpen) {
        const action = menu.poll(store.world);
        if (action === "stop") { stop(); return; }
        if (action === "execute") {
          try { execute(); } catch (error) { notify(`DEV: ${error instanceof Error ? error.message : String(error)}`); }
        }
      } else menu.pollSuppressed(store.world);
      if (freeRoam) menu.draw(store.world);
      if (gameTime >= lastTick && gameTime - lastTick < WORLD_RULES.tickMs) return;
      lastTick = gameTime;
      const char = engine.char(), dead = engine.dead(char);
      social?.observe([{ participantId: SOCIAL_CONFIG.humanId, handle: char }, ...combat.bindings(), ...members.bindings()], now);
      social?.pump();
      if (runtime.isOnMission() || engine.call<number>("GET_AREA_VISIBLE") !== 0) {
        wasSafe = false;
        if (overrideOwned) { engine.call<void>("CANCEL_OVERRIDE_RESTART"); overrideOwned = false; }
      }
      if (dead && !wasDead && wasSafe) {
        const p = playerRespawn(store.world);
        if (p) { engine.call<void>("OVERRIDE_NEXT_RESTART", p.x, p.y, p.z, p.heading); overrideOwned = true; }
      }
      if (!dead && wasDead && overrideOwned) { engine.call<void>("CANCEL_OVERRIDE_RESTART"); overrideOwned = false; }
      wasDead = dead;
      if (!freeRoam || dead) {
        if (combat.battle) {
          const b = combat.battle, participants = combat.participants();
          if (!store.busy) save("disputa interrompida", (draft) => {
            for (const m of draft.members) if (participants.includes(m.id)) m.readyAt = now + WORLD_RULES.troopRecoveryMs;
            event(draft, now, "cancelamento", b.zoneId);
          });
          combat.cancel();
        }
        members.clear(); assets.pause(); return;
      }
      wasSafe = true;
      const position = engine.position(char);
      for (const [name, operation] of [
        ["radar", () => radar.update(store.world, position)],
        ["assets", () => assets.tick(store, position, now)],
        ["members", () => members.tick(store, position, now, combat.battle !== null)],
        ["combat", () => {
          const result = combat.tick(store.world, now, position);
          if (result && !store.busy) save("resultado da disputa", (draft) => {
            // CJ realmente iniciou a captura dentro da area; nenhum NPC pendente
            // de streaming recebe pontos por simplesmente ter sido reservado.
            resolveBattle(draft, result.battle, result.winner, [...result.participants, SOCIAL_CONFIG.humanId], result.casualties, now);
            for (const ammo of result.ammo) {
              const member = draft.members.find((m) => m.id === ammo.memberId);
              if (member) member.ammo = ammo.amount;
            }
            bankChange(draft, result.winner === "attacker" ? result.battle.attackerId : result.battle.defenderId,
              WORLD_RULES.captureReward, "recompensa de disputa", now);
          }, () => combat.cancel());
        }],
      ] as const) {
        if (store.readOnly && name !== "radar") continue;
        if (disabled.has(name)) continue;
        try { operation(); } catch (error) {
          reportGtaError(runtime, error, name); disabled.add(name);
          if (name === "combat") combat.cancel();
          if (name === "assets") assets.clear();
          if (name === "members") members.clear();
          notify(`${name} suspenso por erro. Veja cleo_redux.log; outros sistemas continuam.`);
        }
      }
      social?.observe([{ participantId: SOCIAL_CONFIG.humanId, handle: char }, ...combat.bindings(), ...members.bindings()], now);
      if (!store.readOnly && clock.canAdvance(now, store.world.lastProcessedAt) && !combat.battle && !store.busy && now - lastSimulation >= 60_000) {
        lastSimulation = now;
        if (now - store.world.lastProcessedAt >= WORLD_RULES.offlineStepMs) save("simulacao do mundo", (draft) => { advanceWorld(draft, now); });
      }
    } catch (error) { reportGtaError(runtime, error, opened ? "mundo" : "diagnostico-ini"); stop(); }
  }, 50);
  function openWorld(): void {
    try {
      store.open(() => {
        const initialize = () => {
          runtime.log(`[GangWar] [mundo] OK: ${store.world.gangs.length} gangues; ${store.world.zones.length} territorios/GZs; revisao ${store.world.revision}; ${store.readOnly ? "somente leitura" : "gravacao habilitada"}.`);
          startRankingBootstrap();
          if (social) {
            try { social.start(); welcomePending = !store.readOnly; }
            catch (error) {
              reportGtaError(runtime, error, "chat-social");
              try { social.stop(); } catch { /* Ranking e mundo permanecem ativos. */ }
              social = undefined;
            }
          }
          ready = true;
          runtime.log("[GangWar] [menu-dev] OK: Ctrl+M registrado; Ctrl+G ranking registrado.");
          notify(`Gang War v0.2 pronto${store.readOnly ? " (somente leitura)" : ""}: TAB jogadores; Ctrl+G gangues; Ctrl+M DEV.`);
        };
        if (store.readOnly) { initialize(); return; }
        const offlineAllowed = clock.canAdvance(now, store.world.lastProcessedAt);
        if (!offlineAllowed) runtime.log(`[GangWar] [offline] Adiado/bloqueado sem alterar checkpoint temporal: ${clock.status}; now=${now}; lastProcessedAt=${store.world.lastProcessedAt}.`);
        if (store.socialMigrationPending || catalogMissing(store.world) || (offlineAllowed && now - store.world.lastProcessedAt >= WORLD_RULES.offlineStepMs)) {
          let summary = "";
          store.transact("retorno e catalogo", (draft) => { extendCatalog(draft); if (offlineAllowed) summary = advanceWorld(draft, now); }, () => { if (summary) notify(summary); initialize(); });
        } else initialize();
      });
    } catch (error) {
      // Um snapshot corrompido nao pode cancelar o bootstrap independente da Fase 1.
      store.stop();
      reportGtaError(runtime, error, "persistencia");
      runtime.log("[GangWar] [bootstrap] Persistencia indisponivel; ranking e Ctrl+G permanecem ativos com o estado em memoria.");
    }
  }
  try {
    clock.diagnose(now);
    runtime.log(`[GangWar] [relogio] Date.now=${now}; diagnostico numerico separado; persistencia independente dos saves.`);
    startRankingBootstrap();
    runtime.log(iniPersistence ? `[GangWar] [persistencia] Diagnostico ${PERSISTENCE_CONFIG.diagnosticMode}; snapshots/backups nao sao tocados pelo probe.` :
      "[GangWar] [persistencia] Modo memoria configurado para testes integrados; snapshots/backups nao sao tocados.");
    if (engine.safe(runtime.isOnMission())) runtime.showTextBox("Gang War v0.2: diagnostico INI e carregamento. Aguarde a confirmacao.");
  } catch (error) { runtime.clearInterval(timer); store.stop(); throw error; }
  return stop;
}
