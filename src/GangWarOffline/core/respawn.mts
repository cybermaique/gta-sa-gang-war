import { playerGang } from "./world.mts";
import type { MemberState, Position, WorldState } from "./world-types.mts";

export function playerRespawn(world: WorldState): Position | null {
  const base = world.bases.find((b) => b.id === world.respawn.baseId && b.ownerId === playerGang(world));
  if (base?.respawn) return base.respawn;
  const points = world.citySpawns[world.respawn.city];
  return points.length ? points[Math.floor(Math.random() * points.length)]! : null;
}
export function memberRespawn(world: WorldState, member: MemberState, now: number): Position | null {
  if (member.readyAt > now) return null;
  const base = world.bases.find((b) => b.id === member.baseId && b.ownerId === member.gangId);
  if (base?.respawn) return base.respawn;
  const city = member.gangId === playerGang(world) ? world.respawn.city : member.city;
  return world.citySpawns[city][0] ?? null;
}
