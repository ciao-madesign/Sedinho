import type { Explanation, PlayerRole } from "./common.js";

/** Un partecipante alla lega (sez. 11): `League.participants` e' solo il numero previsto dal
 * Setup Wizard, questi record esistono per sapere CHI sono, necessari per calcolare budget
 * residuo e fabbisogno di ruolo durante l'asta live. Creati al volo al primo avvio asta. */
export interface Participant {
  id: string;
  leagueId: string;
  name: string;
  /** Il fantallenatore che usa Sedinho, per distinguere "la mia rosa" nel report finale (sez. 16). */
  isMe: boolean;
}

/** Un singolo inserimento durante l'asta live (sez. 11, Live Auction Engine). */
export interface AuctionEntry {
  id: string;
  auctionId: string;
  playerId: string;
  price: number;
  buyerId: string;
  timestamp: string;
}

/** Un inserimento asta arricchito con i dati di giocatore/acquirente per la UI, senza dover
 * fare join lato client (sez. 11: "ogni inserimento aggiornerà immediatamente" varie viste). */
export interface AuctionEntryView {
  id: string;
  price: number;
  timestamp: string;
  player: { id: string; name: string; role: PlayerRole; team: string };
  buyer: { id: string; name: string };
}

/** Budget residuo e fabbisogno di ruolo di un partecipante, ricalcolati ad ogni inserimento
 * (sez. 11: "aggiornerà immediatamente... budget residui, fabbisogni di ruolo"). */
export interface ParticipantAuctionSummary {
  id: string;
  name: string;
  isMe: boolean;
  budgetSpent: number;
  budgetRemaining: number;
  /** Giocatori già acquistati in questa asta, per ruolo. */
  rosterCounts: Record<PlayerRole, number>;
  /** Quanti ne mancano ancora per completare la rosa (da `LeagueConfig.rosterComposition`),
   * mai negativo. */
  rosterNeeded: Record<PlayerRole, number>;
}

/** Stato completo dell'asta attiva, cosi' come restituito da `GET /auctions/active` — tutto
 * cio' che serve alla console live in un'unica chiamata (sez. 11). "Valore di mercato" e
 * "probabilità residue" (richiesti dalla spec) non ci sono ancora: dipendono dal Market Engine
 * (sez. 13), non ancora implementato — nessun dato inventato nel frattempo. */
export interface ActiveAuctionState {
  id: string;
  leagueId: string;
  startedAt: string;
  entries: AuctionEntryView[];
  participants: ParticipantAuctionSummary[];
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
