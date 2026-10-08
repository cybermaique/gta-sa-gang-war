import { WORLD_RULES } from "../config/world.mts";
import { distance } from "./engine.mts";
import { playerGang } from "../core/world.mts";
import type { GameEngine } from "./engine.mts";
import type { BaseState, PickupState, Position, VehicleSlot, WorldState } from "../core/world-types.mts";
import type { WorldStore } from "../persistence/store.mts";

interface Icon { handle: number; signature: string; model: number }
interface ActiveVehicle { handle: number; model: number; signature: string; ownerId: string }
export class BaseAssets {
  private icons = new Map<string, Icon>();
  private cars = new Map<string, ActiveVehicle>();
  private blockedUntil = new Map<string, number>();
  private requests = new Map<number, number>();
  private failedModels = new Set<number>();
  constructor(private engine: GameEngine, private notify: (message: string) => void, private canAct: () => boolean) {}
  private loaded(model: number, now: number): boolean {
    const at = this.requests.get(model);
    if (at !== undefined && now - at > WORLD_RULES.modelTimeoutMs) {
      if (!this.failedModels.has(model)) { this.failedModels.add(model); this.notify(`Modelo ${model} nao carregou. Slot suspenso; confira o catalogo e reinicie o mod.`); }
      return false;
    }
    if (at === undefined) this.requests.set(model, now);
    if (!this.engine.model(model)) return false;
    this.requests.delete(model); return true;
  }
  tick(store: WorldStore, point: Position, now: number): void {
    const world = store.world;
    const expectedIcons = new Set<string>(), expectedCars = new Set<string>();
    for (const base of world.bases) {
      if (!base.ownerId || !base.position || distance(point, base.position) > WORLD_RULES.streamRadius) continue;
      for (const pickup of base.pickups) {
        expectedIcons.add(pickup.id);
        this.icon(base, pickup, now);
        if (base.ownerId === playerGang(world) && distance(point, pickup.position) < 1.6 &&
          (pickup.usedUntil.cj ?? 0) <= now && !store.busy) this.collect(store, base, pickup, now);
      }
      for (const slot of base.vehicles) {
        if (!slot.enabled) continue;
        expectedCars.add(slot.id);
        this.vehicle(store, base, slot, point, now);
      }
    }
    for (const [id, icon] of this.icons) if (!expectedIcons.has(id)) { this.removeIcon(icon); this.icons.delete(id); }
    for (const [id, car] of this.cars) if (!expectedCars.has(id)) {
      if (!this.engine.call<boolean>("IS_CHAR_IN_CAR", this.engine.char(), car.handle)) {
        this.removeCar(car); this.cars.delete(id);
      } else {
        // Preserve o jogador e o veiculo que esta utilizando. Continue gerenciando-o.
        const base = world.bases.find((b) => b.vehicles.some((v) => v.id === id));
        if (!base || base.ownerId !== playerGang(world)) this.engine.call<void>("TASK_LEAVE_CAR", this.engine.char(), car.handle);
      }
    }
  }
  private icon(base: BaseState, p: PickupState, now: number): void {
    const signature = JSON.stringify([base.ownerId, p.position, p.type, p.weapon]);
    const previous = this.icons.get(p.id);
    if (previous && (previous.signature !== signature || !this.engine.call<boolean>("DOES_OBJECT_EXIST", previous.handle))) {
      this.removeIcon(previous); this.icons.delete(p.id);
    }
    if (!this.icons.has(p.id)) {
      if (this.icons.size >= WORLD_RULES.maxActivePickups) return;
      const model = p.type === "health" ? 1240 : p.type === "armour" ? 1242 : this.engine.call<number>("GET_WEAPONTYPE_MODEL", p.weapon);
      if (!this.loaded(model, now)) return;
      const handle = this.engine.call<number>("CREATE_OBJECT", model, p.position.x, p.position.y, p.position.z + 0.3);
      this.icons.set(p.id, { handle, signature, model });
      this.engine.call<void>("SET_OBJECT_COLLISION", handle, false);
      this.engine.releaseModel(model);
    }
    const icon = this.icons.get(p.id)!;
    this.engine.call<void>("SET_OBJECT_ROTATION", icon.handle, 0, 0, (now / 20) % 360);
  }
  private collect(store: WorldStore, base: BaseState, p: PickupState, now: number): void {
    const char = this.engine.char();
    if (this.engine.dead(char)) return;
    if (p.type === "health" && this.engine.call<number>("GET_CHAR_HEALTH", char) >= 100) return;
    if (p.type === "armour" && this.engine.call<number>("GET_CHAR_ARMOUR", char) >= 100) return;
    if (p.type === "weapon" && !this.loaded(this.engine.call<number>("GET_WEAPONTYPE_MODEL", p.weapon), now)) return;
    store.transact("uso de pickup", (draft) => {
      const pickup = draft.bases.find((b) => b.id === base.id)!.pickups.find((q) => q.id === p.id)!;
      pickup.usedUntil.cj = now + pickup.cooldownMs;
    }, () => {
      // Estado salvo antes de conceder; um reload nunca repete o mesmo credito.
      const current = store.world.bases.find((b) => b.id === base.id);
      if (current?.ownerId !== playerGang(store.world) || char !== this.engine.char() || this.engine.dead(char) ||
          distance(this.engine.position(char), p.position) > 2 || !this.canAct()) return;
      if (p.type === "health") this.engine.call<void>("SET_CHAR_HEALTH", char, Math.max(100, this.engine.call<number>("GET_CHAR_HEALTH", char)));
      else if (p.type === "armour") this.engine.call<void>("ADD_ARMOUR_TO_CHAR", char, Math.max(0, 100 - this.engine.call<number>("GET_CHAR_ARMOUR", char)));
      else this.engine.call<void>("GIVE_WEAPON_TO_CHAR", char, p.weapon, p.ammo);
      this.notify("Equipamento recebido; cooldown registrado.");
    });
  }
  private vehicle(store: WorldStore, base: BaseState, slot: VehicleSlot, point: Position, now: number): void {
    const signature = JSON.stringify([base.ownerId, slot.model, slot.position, slot.color1, slot.color2]);
    const previous = this.cars.get(slot.id);
    if (previous) {
      const exists = this.engine.call<boolean>("DOES_VEHICLE_EXIST", previous.handle);
      if (!exists || this.engine.call<boolean>("IS_CAR_DEAD", previous.handle)) {
        this.removeCar(previous); this.cars.delete(slot.id);
        this.blockedUntil.set(slot.id, now + slot.cooldownMs);
        return;
      }
      const mine = base.ownerId === playerGang(store.world);
      if (!mine && this.engine.call<boolean>("IS_CHAR_IN_CAR", this.engine.char(), previous.handle)) this.engine.call<void>("TASK_LEAVE_CAR", this.engine.char(), previous.handle);
      this.engine.call<void>("LOCK_CAR_DOORS", previous.handle, mine ? 1 : 2);
      if (previous.signature !== signature && !this.engine.call<boolean>("IS_CHAR_IN_CAR", this.engine.char(), previous.handle)) {
        this.removeCar(previous); this.cars.delete(slot.id);
      }
      return;
    }
    const blocked = this.blockedUntil.get(slot.id) ?? 0;
    if (slot.readyAt < blocked && !store.busy) {
      store.transact("reposicao de veiculo", (draft) => { draft.bases.find((b) => b.id === base.id)!.vehicles.find((v) => v.id === slot.id)!.readyAt = blocked; });
      return;
    }
    if (now < Math.max(slot.readyAt, blocked) || distance(point, slot.position) < 5) return;
    if ([...this.cars.values()].some((car) => distance(this.engine.call<Position>("GET_CAR_COORDINATES", car.handle), slot.position) < 5)) return;
    if (!this.loaded(slot.model, now)) return;
    if (store.busy || this.cars.size >= WORLD_RULES.maxActiveVehicles || this.engine.call<boolean>("IS_POINT_OBSCURED_BY_A_MISSION_ENTITY", slot.position.x, slot.position.y, slot.position.z, 3, 6, 3)) return;
    const location = this.engine.ground(slot.position);
    // Reserva duravel antes do spawn: recarregar nao contorna o cooldown.
    store.transact("reserva de veiculo", (draft) => {
      draft.bases.find((b) => b.id === base.id)!.vehicles.find((v) => v.id === slot.id)!.readyAt = now + slot.cooldownMs;
    }, () => {
      if (!this.canAct()) return;
      const p = this.engine.position();
      if (distance(p, slot.position) < 5 || distance(p, slot.position) > WORLD_RULES.streamRadius ||
          this.engine.call<boolean>("IS_POINT_OBSCURED_BY_A_MISSION_ENTITY", slot.position.x, slot.position.y, slot.position.z, 3, 6, 3)) return;
      const handle = this.engine.call<number>("CREATE_CAR", slot.model, location.x, location.y, location.z);
      this.cars.set(slot.id, { handle, model: slot.model, signature, ownerId: base.ownerId! });
      this.engine.call<void>("SET_CAR_HEADING", handle, slot.position.heading);
      this.engine.call<void>("CHANGE_CAR_COLOUR", handle, slot.color1, slot.color2);
      this.engine.call<void>("LOCK_CAR_DOORS", handle, base.ownerId === playerGang(store.world) ? 1 : 2);
      this.engine.releaseModel(slot.model);
    });
  }
  private removeIcon(icon: Icon): void {
    if (this.engine.call<boolean>("DOES_OBJECT_EXIST", icon.handle)) this.engine.call<void>("DELETE_OBJECT", icon.handle);
  }
  private removeCar(car: ActiveVehicle): void {
    if (this.engine.call<boolean>("DOES_VEHICLE_EXIST", car.handle) && this.engine.call<boolean>("IS_CAR_MODEL", car.handle, car.model)) this.engine.call<void>("DELETE_CAR", car.handle);
  }
  pause(): void {
    for (const icon of this.icons.values()) this.removeIcon(icon);
    this.icons.clear();
    for (const [id, car] of this.cars) {
      if (!this.engine.call<boolean>("DOES_VEHICLE_EXIST", car.handle) ||
          !this.engine.call<boolean>("IS_CHAR_IN_CAR", this.engine.char(), car.handle)) {
        this.removeCar(car); this.cars.delete(id);
      }
    }
  }
  clear(): void {
    for (const icon of this.icons.values()) this.removeIcon(icon);
    for (const car of this.cars.values()) {
      if (this.engine.call<boolean>("IS_CHAR_IN_CAR", this.engine.char(), car.handle)) this.engine.call<void>("MARK_CAR_AS_NO_LONGER_NEEDED", car.handle);
      else this.removeCar(car);
    }
    this.icons.clear(); this.cars.clear();
    for (const model of this.requests.keys()) this.engine.releaseModel(model);
    this.requests.clear();
  }
}
