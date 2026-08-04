import type { DataSourceMeta, PlayerAvailability, PlayerRole } from "./common.js";

export interface Player {
  id: string;
  name: string;
  team: string;
  role: PlayerRole;
  birthDate?: string;
  nationality?: string;
  foot?: "left" | "right" | "both";
  availability: PlayerAvailability;
  estimatedRecoveryDate?: string;
  meta: DataSourceMeta;
}

/** Statistiche di una singola stagione per un giocatore (sez. 4, "Storico"). */
export interface SeasonStats {
  id: string;
  playerId: string;
  season: string; // es. "2025-26"
  competition: string; // es. "Serie A"
  appearances: number;
  minutes: number;
  fantasyAvg: number;
  averageRating: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  shots: number;
  shotsOnTarget: number;
  yellowCards: number;
  redCards: number;
  penaltiesScored: number;
  penaltiesTaken: number;
  cleanSheets: number;
  expectedBonus: number;
  meta: DataSourceMeta;
}

export type HierarchyLevel = "starter" | "first-alternate" | "second-alternate";

/** Gerarchia di ruolo all'interno della squadra (sez. 4, "Gerarchie"). */
export interface PlayerHierarchy {
  id: string;
  playerId: string;
  level: HierarchyLevel;
  reliability: number; // 0..1
  meta: DataSourceMeta;
}

export type SetPieceType =
  | "penalty-1"
  | "penalty-2"
  | "penalty-3"
  | "direct-free-kick-1"
  | "direct-free-kick-2"
  | "corner"
  | "side-free-kick";

/** Ruolo sui calci piazzati con probabilità reale di utilizzo (sez. 4, "Calci piazzati"). */
export interface SetPieceRole {
  id: string;
  playerId: string;
  type: SetPieceType;
  probability: number; // 0..1
  meta: DataSourceMeta;
}

/** Profilo di rotazione stimato per una squadra (sez. 4, "Rotazioni"). */
export interface TeamRotationProfile {
  id: string;
  team: string;
  numberOfCompetitions: number;
  turnoverFrequency: number; // 0..1
  coachReliability: number; // 0..1, stabilità delle scelte dell'allenatore
  turnoverProbabilityByRole: Partial<Record<PlayerRole, number>>;
  meta: DataSourceMeta;
}
