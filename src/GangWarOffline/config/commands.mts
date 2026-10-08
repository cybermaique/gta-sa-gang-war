export interface DevAction { id: string; label: string; min: number; max: number; step: number; initial: number }
function action(id: string, label: string, min = 0, max = 0, step = 1, initial = min): DevAction {
  return { id, label, min, max, step, initial };
}
export const DEV_PAGES = [
  { id: "territory", name: "Territorios", actions: [action("inspect", "Inspecionar"), action("corner-a", "Marcar canto A"),
    action("corner-b", "Marcar canto B e salvar"), action("transfer-zone", "Transferir para gangue 0..3", 0, 3), action("capture", "Iniciar captura")] },
  { id: "gz", name: "Gang Zones", actions: [action("inspect", "Inspecionar"), action("corner-a", "Marcar canto A"),
    action("corner-b", "Marcar canto B e salvar"), action("capture", "Disputar GZ"), action("transfer-zone", "Transferir para gangue 0..3", 0, 3)] },
  { id: "bank", name: "Banco", actions: [action("balance", "Consultar banco/carteira"), action("deposit", "Depositar da carteira", 100, 50_000, 100, 1000),
    action("withdraw", "Sacar para carteira", 100, 50_000, 100, 1000)] },
  { id: "base", name: "Bases", actions: [action("inspect", "Inspecionar catalogo"), action("base-position", "Calibrar base aqui"),
    action("base-respawn", "Calibrar respawn aqui"), action("buy", "Comprar"), action("buy-gang", "DEV comprar por gangue 0..3", 0, 3), action("base-transfer", "DEV proprietario 0..3, 4=livre", 0, 4),
    action("base-level", "DEV nivel 1..4", 1, 4)] },
  { id: "pickup", name: "Pickups", actions: [action("inspect", "Listar slots"), action("pickup-add", `Adicionar tipo 0..${PICKUP_CHOICES.length - 1} aqui`, 0, PICKUP_CHOICES.length - 1),
    action("pickup-type", `Alterar tipo 0..${PICKUP_CHOICES.length - 1}`, 0, PICKUP_CHOICES.length - 1), action("pickup-ammo", "Municao", 1, 1000, 10, 60),
    action("pickup-cooldown", "Cooldown segundos", 1, 3600, 5, 60), action("pickup-position", "Mover slot aqui"), action("pickup-remove", "Remover slot")] },
  { id: "respawn", name: "Respawn", actions: [action("spawn-inspect", "Consultar preferencia"), action("spawn-city", "Cidade 0=LS 1=SF 2=LV", 0, 2),
    action("spawn-point", "Cadastrar ponto seguro da cidade", 0, 2), action("spawn-base", "Selecionar base do alvo")] },
  { id: "vehicle", name: "Veiculos", actions: [action("inspect", "Listar slots"), action("vehicle-add", `Adicionar modelo 0..${VEHICLE_CHOICES.length - 1} aqui`, 0, VEHICLE_CHOICES.length - 1),
    action("vehicle-model", `Alterar modelo 0..${VEHICLE_CHOICES.length - 1}`, 0, VEHICLE_CHOICES.length - 1), action("vehicle-position", "Mover slot aqui"),
    action("vehicle-color", "Cor 0..126", 0, 126, 1, 86), action("vehicle-cooldown", "Cooldown segundos", 10, 7200, 30, 300),
    action("vehicle-enabled", "Disponivel 0/1", 0, 1, 1, 1), action("vehicle-remove", "Remover slot")] },
];
import { PICKUP_CHOICES, VEHICLE_CHOICES } from "./world.mts";
