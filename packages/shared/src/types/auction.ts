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
 * cio' che serve alla console live in un'unica chiamata (sez. 11), incluso lo stato del
 * Market Engine (sez. 13) e i profili avversari (sez. 12). "Migliori opportunità" (richiesto
 * dalla spec) non c'è ancora: dipende dal Decision Engine (sez. 14), non ancora implementato. */
export interface ActiveAuctionState {
  id: string;
  leagueId: string;
  startedAt: string;
  entries: AuctionEntryView[];
  participants: ParticipantAuctionSummary[];
  market: MarketState;
  opponents: OpponentProfile[];
}

/** Profilo di un partecipante, costruito e aggiornato in tempo reale (sez. 12) dai soli
 * `AuctionEntry` già registrati. La spec parla di "aggressività nei rilanci": il Live Auction
 * Engine registra solo il prezzo finale di ogni inserimento, non i rilanci intermedi (nessuna
 * UI di asta "a voce" è mai stata costruita) — `aggressiveness` è quindi una proxy dichiarata
 * (frequenza di sovrapprezzo rispetto alla quotazione), non una misura diretta dei rilanci.
 * Ogni indice che richiede almeno un dato non disponibile (nessun inserimento, nessuna
 * quotazione nota, un solo acquisto per calcolare una concentrazione) è `number | null`, mai
 * un finto 0 — stesso pattern del Player Evaluation Engine (sez. 8). */
export interface OpponentProfile {
  participantId: string;
  aggressiveness: number | null; // 0..1, proxy: frequenza di sovrapprezzo sulla quotazione
  averageSpend: number;
  topPlayerPreference: number | null; // 0..1, valueScore medio dei giocatori acquistati
  youngPlayerPreference: number | null; // 0..1, richiede birthDate noto sui giocatori acquistati
  teamPreferences: Record<string, number>; // squadra -> quota degli acquisti da quella squadra
  spendConcentration: number | null; // 0..1, richiede almeno 2 acquisti per essere significativo
  remainingBudget: number;
  overpayIndex: number | null; // rapporto medio prezzo/quotazione, richiede quotazioni note
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

/** Risultato di "Annulla ultima azione" (sez. 11, richiesto esplicitamente dall'utente): un
 * solo livello di undo, sull'evento più recente dell'asta (assegnazione o rimozione di un
 * inserimento), non uno storico completo — scope volutamente limitato all'asta live. */
export interface AuctionUndoResult {
  undone: { type: "assign" | "remove"; playerName: string; buyerName: string };
  state: ActiveAuctionState;
}
