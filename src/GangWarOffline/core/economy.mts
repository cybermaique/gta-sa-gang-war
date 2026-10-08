import { WORLD_RULES } from "../config/world.mts";
import { event } from "./world.mts";
import type { WorldState } from "./world-types.mts";

export function bankChange(world: WorldState, gangId: string, amount: number, reason: string, now: number): void {
  const gang = world.gangs.find((g) => g.id === gangId);
  if (!gang || !Number.isSafeInteger(amount) || !Number.isSafeInteger(gang.bankBalance + amount) || gang.bankBalance + amount < 0) throw new Error("Saldo insuficiente ou operacao bancaria invalida.");
  gang.bankBalance += amount;
  const id = event(world, now, "banco", `${gangId}: ${amount}; ${reason}`);
  world.transactions.push({ id, at: now, gangId, amount, reason });
  world.transactions = world.transactions.slice(-WORLD_RULES.transactionLimit);
}
export function transferWallet(world: WorldState, gangId: string, amount: number, deposit: boolean, now: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Valor deve ser inteiro positivo.");
  const wallet = world.wallets[gangId];
  if (wallet === undefined || (deposit && wallet < amount)) throw new Error("Carteira Gang War insuficiente.");
  bankChange(world, gangId, deposit ? amount : -amount, deposit ? "deposito da carteira" : "saque para carteira", now);
  world.wallets[gangId] = wallet + (deposit ? -amount : amount);
}
export function processIncome(world: WorldState, now: number): void {
  for (const gang of world.gangs) {
    const revenue = world.zones.filter((z) => z.ownerId === gang.id && z.bounds)
      .reduce((sum, z) => sum + (z.kind === "gz" ? WORLD_RULES.incomeGz : WORLD_RULES.incomeTerritory), 0);
    const expense = gang.members * WORLD_RULES.upkeepMember + world.bases.filter((b) => b.ownerId === gang.id).length * WORLD_RULES.upkeepBase;
    const change = Math.max(-gang.bankBalance, revenue - expense);
    if (change) bankChange(world, gang.id, change, "receita e manutencao por hora", now);
    const bases = world.bases.filter((b) => b.ownerId === gang.id && b.position);
    for (const member of world.members.filter((m) => m.gangId === gang.id)) {
      member.baseId = bases[0]?.id ?? null;
      if (!bases.length || member.readyAt > now || member.equippedAt + WORLD_RULES.npcEquipmentCooldownMs > now || gang.bankBalance < WORLD_RULES.npcEquipmentCost) continue;
      bankChange(world, gang.id, -WORLD_RULES.npcEquipmentCost, `equipamento ${member.id}`, now);
      member.ammo = 140; member.equippedAt = now;
    }
  }
}
