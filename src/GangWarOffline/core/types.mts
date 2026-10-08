// IDs estáveis permitem referenciar membros, propriedades e relações no futuro.
export type GangId = string;

export interface Gang {
  id: GangId;
  name: string;
  color: `#${string}`;
  leaderId?: string;
  members: number;
  bankBalance: number;
  territoryCount: number;
  gangZoneCount: number;
  baseCount: number;
  wins: number;
  losses: number;
  aggressiveness: number;
  skillLevel: number;
  isPlayerGang: boolean;
  createdAt: string;
}

export interface ScoringConfig {
  readonly territoryPoints: number;
  readonly gangZonePoints: number;
  readonly basePoints: number;
  readonly bankUnit: number;
  readonly bankUnitPoints: number;
  readonly bankPointsCap: number;
}

export interface RankedGang {
  readonly position: number;
  readonly score: number;
  readonly gang: Readonly<Gang>;
}
