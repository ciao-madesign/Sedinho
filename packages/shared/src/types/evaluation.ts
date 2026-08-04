import type { Explanation } from "./common.js";

/** Indici di affidabilità (sez. 8, "Affidabilità"). */
export interface ReliabilityIndices {
  starterProbability: number;
  reliabilityScore: number;
  injuryRisk: number;
  rotationRisk: number;
}

/** Indici di produzione attesa (sez. 8, "Produzione"). */
export interface ProductionIndices {
  expectedGoals: number;
  expectedAssists: number;
  expectedMinutes: number;
  expectedFantasyPoints: number;
}

/** Potenziale bonus (sez. 8, "Bonus"). */
export interface BonusIndices {
  penaltyPotential: number;
  freeKickPotential: number;
  cleanSheetPotential: number;
  assistPotential: number;
}

/** Indici di stabilità del rendimento (sez. 8, "Stabilità"). */
export interface StabilityIndices {
  floorScore: number;
  ceilingScore: number;
  consistencyIndex: number;
  volatilityIndex: number;
}

/** Indici di convenienza economica (sez. 8, "Convenienza"). */
export interface ValueIndices {
  valueScore: number;
  expectedAuctionPrice: number;
  efficiencyIndex: number;
  opportunityScore: number;
}

/** Valutazione completa di un giocatore prodotta dal Player Evaluation Engine (sez. 8). */
export interface PlayerEvaluation {
  playerId: string;
  computedAt: string;
  reliability: ReliabilityIndices;
  production: ProductionIndices;
  bonus: BonusIndices;
  stability: StabilityIndices;
  value: ValueIndices;
  explanation: Explanation;
}
