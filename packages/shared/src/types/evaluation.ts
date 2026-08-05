import type { Explanation } from "./common.js";

/** Ogni indice e' `number | null`: `null` significa esplicitamente "dato non disponibile"
 * (fonte non ancora integrata), non "zero" — un valore reale di 0 e un dato mancante sono
 * informazioni molto diverse e vanno distinte per rispettare il principio "Spiegabile"
 * (CLAUDE.md sez. 2). Il motivo del `null` va sempre nei `factors` della `Explanation`
 * complessiva della `PlayerEvaluation` (vedi apps/api/src/lib/evaluation/). */

/** Indici di affidabilità (sez. 8, "Affidabilità"). */
export interface ReliabilityIndices {
  starterProbability: number | null;
  reliabilityScore: number | null;
  injuryRisk: number | null;
  rotationRisk: number | null;
}

/** Indici di produzione attesa (sez. 8, "Produzione"). */
export interface ProductionIndices {
  expectedGoals: number | null;
  expectedAssists: number | null;
  expectedMinutes: number | null;
  expectedFantasyPoints: number | null;
}

/** Potenziale bonus (sez. 8, "Bonus"). */
export interface BonusIndices {
  penaltyPotential: number | null;
  freeKickPotential: number | null;
  cleanSheetPotential: number | null;
  assistPotential: number | null;
}

/** Indici di stabilità del rendimento (sez. 8, "Stabilità"). */
export interface StabilityIndices {
  floorScore: number | null;
  ceilingScore: number | null;
  consistencyIndex: number | null;
  volatilityIndex: number | null;
}

/** Indici di convenienza economica (sez. 8, "Convenienza"). */
export interface ValueIndices {
  valueScore: number | null;
  expectedAuctionPrice: number | null;
  efficiencyIndex: number | null;
  opportunityScore: number | null;
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
