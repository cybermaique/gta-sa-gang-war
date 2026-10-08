import { SOCIAL_CONFIG } from "../config/social.mts";
import { INITIAL_GANGS } from "../config/gangs.mts";
import type { WorldState } from "./world-types.mts";

export interface Participant {
  id: string; memberId: string | null; gangId: string; sessionId: number | null;
  nickname: string; online: boolean; human: boolean;
  kills: number; deaths: number; score: number;
  conquests: number; defenses: number; gzWins: number; rank?: string;
}
export interface SocialMessage {
  id: string; at: number; kind: "global" | "gang" | "death" | "notification";
  participantId: string; text: string; gangId: string;
}
export interface SocialState {
  version: 1; participants: Participant[]; messages: SocialMessage[];
  processedEvents: string[];
}
const nicknamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,23}$/;
const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function blank(id: string, gangId: string, nickname: string, human: boolean): Participant {
  return { id, memberId: human ? null : id, gangId, nickname, human, online: true,
    sessionId: null, kills: 0, deaths: 0, score: 0, conquests: 0, defenses: 0, gzWins: 0 };
}
// Migracao aditiva somente de snapshots anteriores ao Social System. Nao repara dados
// sociais corrompidos nem importa resultados ficticios do ranking DEMO das gangues.
export function initialSocial(world: Pick<WorldState, "gangs" | "members">): SocialState {
  for (const gang of world.gangs) {
    gang.tag ??= INITIAL_GANGS.find((g) => g.id === gang.id)?.tag ?? `[G${world.gangs.indexOf(gang)}]`;
  }
  const participants = world.members.map((m, index) => blank(m.id, m.gangId, `Player_${index + 1}`, false));
  participants.unshift(blank(SOCIAL_CONFIG.humanId, world.gangs.find((g) => g.isPlayerGang)!.id, SOCIAL_CONFIG.humanNickname, true));
  return { version: 1, participants, messages: [], processedEvents: [] };
}
export function migrateSocial(world: WorldState): boolean {
  if (world.social !== undefined) return false;
  world.social = initialSocial(world);
  assignSessionIds(world);
  return true;
}
export function participant(world: WorldState, id: string): Participant {
  const p = world.social.participants.find((p) => p.id === id);
  if (!p) throw new Error(`Participante desconhecido: ${id}`);
  return p;
}
export function identity(world: WorldState, id: string): { name: string; color: `#${string}` } {
  const p = participant(world, id), gang = world.gangs.find((g) => g.id === p.gangId);
  if (!gang?.tag) throw new Error(`Gangue sem identidade: ${p.gangId}`);
  return { name: `${gang.tag} ${p.nickname}`, color: gang.color };
}
export function kd(p: Participant): string { return (p.kills / Math.max(1, p.deaths)).toFixed(2); }
export function individualRanking(world: WorldState): Participant[] {
  return world.social.participants.filter((p) => p.online).slice().sort((a, b) =>
    b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || Number(b.human) - Number(a.human) || compareId(a.id, b.id));
}
export function assignSessionIds(world: WorldState): void {
  let next = 0;
  for (const p of world.social.participants.slice().sort((a, b) => Number(b.human) - Number(a.human) || compareId(a.id, b.id))) {
    p.sessionId = p.online ? next++ : null;
  }
}
export function setOnline(world: WorldState, id: string, online: boolean): void {
  const p = participant(world, id);
  if (p.human && !online) throw new Error("CJ permanece online durante esta sessao.");
  p.online = online;
  if (!online) { p.sessionId = null; return; }
  if (p.sessionId !== null) return;
  const used = new Set(world.social.participants.filter((p) => p.online).map((p) => p.sessionId));
  let next = 0; while (used.has(next)) next++;
  p.sessionId = next;
}
export function setGangTag(world: WorldState, gangId: string, tag: string): void {
  if (!/^\[[A-Z0-9]{1,5}\]$/.test(tag)) throw new Error("Tag: [ABC], 1 a 5 letras maiusculas/digitos.");
  const gang = world.gangs.find((g) => g.id === gangId);
  if (!gang) throw new Error("Gangue desconhecida.");
  gang.tag = tag;
}
export function setNickname(world: WorldState, id: string, nickname: string): void {
  if (!nicknamePattern.test(nickname)) throw new Error("Nickname: 1 a 24 letras/digitos/_.-, sem tag.");
  participant(world, id).nickname = nickname;
}
export function addMessage(world: WorldState, at: number, kind: SocialMessage["kind"], id: string, text: string): SocialMessage {
  const p = participant(world, id);
  if (!p.online && (kind === "global" || kind === "gang")) throw new Error("Participante offline nao pode enviar chat.");
  // Proibe tokens GXT e controle; limita a uma linha curta para o HUD.
  if (typeof text !== "string" || !text.trim() || text.length > SOCIAL_CONFIG.chatLimit || /[~\x00-\x1f\x7f]/.test(text)) throw new Error("Mensagem invalida.");
  const message: SocialMessage = { id: `social-${world.nextEventId++}`, at, kind,
    participantId: id, text: text.trim(), gangId: p.gangId };
  world.social.messages.push(message);
  world.social.messages = world.social.messages.slice(-40);
  return message;
}
export type IndividualAward = string;
// Chamado exclusivamente pelos adaptadores de eventos confirmados, nunca por alvos
// de IA, transferencias DEV, mortes ambientais ou simples aparicao no scoreboard.
export function award(world: WorldState, eventId: string, id: string, kind: IndividualAward): void {
  const token = `${eventId}:${id}:${kind}`;
  if (world.social.processedEvents.includes(token)) return;
  const p = participant(world, id);
  const points = SOCIAL_CONFIG.points[kind];
  if (points === undefined || !Number.isSafeInteger(points) || points < 0) throw new Error("Evento nao configurado ou pontos individuais invalidos.");
  p.score += points;
  if (kind === "kill") p.kills++;
  if (kind === "conquest") p.conquests++;
  if (kind === "defense") p.defenses++;
  if (kind === "gzVictory") p.gzWins++;
  world.social.processedEvents.push(token);
  world.social.processedEvents = world.social.processedEvents.slice(-512);
}
export function recordDeath(world: WorldState, eventId: string, id: string, at: number, killerId?: string): void {
  const token = `${eventId}:${id}:death`;
  if (world.social.processedEvents.includes(token)) return;
  const victim = participant(world, id);
  if (killerId === id) killerId = undefined;
  const killer = killerId === undefined ? undefined : participant(world, killerId);
  victim.deaths++;
  world.social.processedEvents.push(token);
  if (killer && killer.gangId !== victim.gangId) award(world, eventId, killer.id, "kill");
  // Nao persiste tag/nickname: o feed deriva as duas identidades ao renderizar.
  addMessage(world, at, "death", id, killer ? `killer:${killer.id}` : "Autoria nao confirmada");
  world.social.processedEvents = world.social.processedEvents.slice(-512);
}
export function validateSocial(world: WorldState): void {
  const s = world.social;
  if (!s || s.version !== 1 || !Array.isArray(s.participants) || s.participants.length !== world.members.length + 1 ||
      !Array.isArray(s.messages) || s.messages.length > 40 || !Array.isArray(s.processedEvents) || s.processedEvents.length > 512 ||
      !s.processedEvents.every((e) => typeof e === "string" && e.length <= 180)) throw new Error("Estado social invalido.");
  const ids = new Set<string>(), sessions = new Set<number>(), memberIds = new Set<string>();
  for (const p of s.participants) {
    if (!p || typeof p.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id) ||
        typeof p.nickname !== "string" || !nicknamePattern.test(p.nickname) || !world.gangs.some((g) => g.id === p.gangId) ||
        typeof p.online !== "boolean" || typeof p.human !== "boolean" ||
        ![p.kills, p.deaths, p.score, p.conquests, p.defenses, p.gzWins].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        (p.rank !== undefined && (typeof p.rank !== "string" || !/^[A-Za-z0-9_ -]{1,24}$/.test(p.rank)))) throw new Error("Identidade social invalida.");
    ids.add(p.id);
    if (p.online) {
      if (p.sessionId === null || !Number.isSafeInteger(p.sessionId) || p.sessionId < 0 || sessions.has(p.sessionId)) throw new Error("ID online duplicado/invalido.");
      sessions.add(p.sessionId);
    } else if (p.sessionId !== null) throw new Error("Participante offline com ID de sessao.");
    if (p.human) {
      if (p.id !== SOCIAL_CONFIG.humanId || p.memberId !== null || !p.online || p.gangId !== world.gangs.find((g) => g.isPlayerGang)?.id) throw new Error("Identidade humana invalida.");
    } else {
      const member = world.members.find((m) => m.id === p.memberId);
      if (!member || member.id !== p.id || member.gangId !== p.gangId || memberIds.has(member.id)) throw new Error("Vinculo NPC invalido.");
      memberIds.add(member.id);
    }
  }
  if (s.participants.filter((p) => p.human).length !== 1) throw new Error("Um humano e necessario.");
  for (const g of world.gangs) if (typeof g.tag !== "string" || !/^\[[A-Z0-9]{1,5}\]$/.test(g.tag)) throw new Error("Tag persistida invalida.");
  if (new Set(s.messages.map((m) => m.id)).size !== s.messages.length) throw new Error("Mensagem duplicada.");
  for (const m of s.messages) if (!ids.has(m.participantId) || !["global", "gang", "death", "notification"].includes(m.kind) ||
      !Number.isSafeInteger(m.at) || m.at < 0 || typeof m.text !== "string" || !m.text || m.text.length > SOCIAL_CONFIG.chatLimit || /[~\x00-\x1f\x7f]/.test(m.text) ||
      !world.gangs.some((g) => g.id === m.gangId) || typeof m.id !== "string") throw new Error("Mensagem persistida invalida.");
}
