import type { Explanation } from "./common.js";

/** Un singolo inserimento durante l'asta live (sez. 11, Live Auction Engine). */
export interface AuctionEntry {
  id: string;
  auctionId: string;
  playerId: string;
  price: number;
  buyerId: string;
  timestamp: string;
}

/** Profilo di un partecipante, costruito e aggiornato in tempo reale (sez. 12). */
export interface OpponentProfile {
  participantId: string;
  aggressiveness: number; // 0..1, propensione ai rilanci
  averageSpend: number;
  topPlayerPreference: number; // 0..1
  youngPlayerPreference: number; // 0..1
  teamPreferences: Record<string, number>; // squadra -> peso preferenza
  spendConcentration: number; // 0..1, quanto concentra la spesa su pochi giocatori
  remainingBudget: number;
  overpayIndex: number; // rapporto medio tra prezzo pagato e valore stimato
  updatedAt: string;
}

/** Stato aggregato del mercato durante l'asta (sez. 13, Market Engine). */
export interface MarketState {
  auctionId: string;
  priceInflation: number; // delta % rispetto al valore stimato medio
  roleDeflation: Partial<Record<string, number>>;
  marketTemperature: number; // 0..1
  remainingBudgetTotal: number;
  starterScarcityByRole: Partial<Record<string, number>>;
  averageBidValue: number;
  updatedAt: string;
}

/** Risposta del Decision Engine a una domanda operativa durante l'asta (sez. 14). */
export interface DecisionRecommendation {
  question: string;
  recommendation: string;
  maxCorrectPrice?: number;
  confidence: number; // 0..1
  explanation: Explanation;
}
