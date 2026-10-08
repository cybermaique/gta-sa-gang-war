import type { WorldState, Position } from "../core/world-types.mts";
import { inside } from "../core/world.mts";
import { GANG_ENGINE } from "../config/world.mts";
import type { GameEngine } from "./engine.mts";

export class TerritoryRadar {
  private blips = new Map<string, { handle: number; signature: string }>();
  private current = "";
  constructor(private engine: GameEngine, private notify: (message: string) => void) {}
  update(world: WorldState, point: Position): void {
    for (const zone of world.zones) {
      const signature = JSON.stringify([zone.ownerId, zone.bounds]);
      const existing = this.blips.get(zone.id);
      if (existing?.signature === signature) continue;
      if (existing) { this.engine.call<void>("REMOVE_BLIP", existing.handle); this.blips.delete(zone.id); }
      if (!zone.bounds) continue;
      const b = zone.bounds;
      const handle = this.engine.call<number>("ADD_BLIP_FOR_COORD", (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      const color = GANG_ENGINE[zone.ownerId as keyof typeof GANG_ENGINE]?.blipColor ?? 0;
      this.engine.call<void>("CHANGE_BLIP_COLOUR", handle, color);
      this.blips.set(zone.id, { handle, signature });
    }
    const zones = world.zones.filter((zone) => inside(point, zone.bounds));
    const next = zones.map((z) => z.id).join(",");
    if (this.current !== next) {
      this.notify(zones.length ? `Entrou: ${zones.map((z) => `${z.name} (${z.ownerId})`).join(" / ")}` : "Saiu da area Gang War.");
      this.current = next;
    }
  }
  clear(): void { for (const { handle } of this.blips.values()) this.engine.call<void>("REMOVE_BLIP", handle); this.blips.clear(); }
}
