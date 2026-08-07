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
  /** Tratti impostati manualmente dall'utente (richiesto esplicitamente, non in spec): niente
   * storico delle scorse edizioni disponibile, quindi l'utente fornisce la propria conoscenza
   * diretta degli avversari. Deliberatamente separati da `OpponentProfile` (dati osservati dagli
   * inserimenti reali dell'asta): uno è calcolato, l'altro è una stima soggettiva dell'utente. */
  preferredTeam: string | null;
  bidTendency: number | null; // 0..1
  spendingStyle: number | null; // 0..1, 0 = tirchio, 1 = spendaccione
  scoutingStyle: number | null; // 0..1, 0 = si affida alle valutazioni ufficiali, 1 = talent scout
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
  rosterRadar: RosterRadarProfile[];
}

/** I 6 assi del radar di rosa (richiesto esplicitamente dall'utente, non in spec): 0..100,
 * ricalcolati ad ogni inserimento dai soli dati già calcolati da altri motori (Player
 * Evaluation Engine) — nessun nuovo dato raccolto, solo un'aggregazione diversa. Un partecipante
 * senza giocatori in un determinato ruolo/categoria ha 0 su quell'asse (non `null`: qui "zero
 * investimento" è un'informazione reale, a differenza del pattern `number | null` usato altrove
 * per "dato non disponibile" su un singolo giocatore). */
export interface RosterRadarAxes {
  /** Potenziale bonus medio (rigori/punizioni/clean sheet/assist) dei giocatori in rosa. */
  bonus: number;
  /** Quota di titolari (gerarchia reale) sul totale degli slot di rosa previsti dalla lega:
   * più titolari, meno rischio di dover schierare un rincalzo. */
  depth: number;
  /** Valore medio (valueScore) degli attaccanti acquistati. */
  attack: number;
  /** Valore medio (valueScore) di difensori e portiere acquistati. */
  defense: number;
  /** Età media (più alta = più affidabile, proxy dichiarata) combinata con la stabilità di
   * rendimento storica (`StabilityIndices.consistencyIndex`) dei giocatori in rosa. */
  reliability: number;
  /** Quota di giocatori giovani combinata con l'imprevedibilità di rendimento storica
   * (`StabilityIndices.volatilityIndex`) — "scommesse"/potenziali talenti, proxy dichiarata. */
  gamble: number;
}

export interface RosterRadarProfile {
  participantId: string;
  axes: RosterRadarAxes;
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

/** Risposta del Decision Engine a una domanda operativa durante l'asta (sez. 14): un giocatore
 * alla volta (per le domande sul pool intero, vedi `DecisionPoolResult` sotto). Le 4 domande
 * della spec che si rispondono per-giocatore ("conviene rilanciare?", "prezzo massimo corretto",
 * "quanto vale realmente questo rilancio?", "conviene attendere?") più le 2 legate alla rosa
 * dell'acquirente ("rischio rosa", "coppia") condividono la stessa chiamata: i campi extra sono
 * `null` quando il dato che richiedono non è stato fornito (es. nessun `candidatePrice` per
 * `valuation`/`waitRecommended`, nessun `buyerId` per `rosterRisk`/`teamConcentration`) — mai un
 * finto 0, stesso pattern `number | null` degli altri motori. */
export interface DecisionRecommendation {
  question: string;
  recommendation: string;
  maxCorrectPrice?: number;
  confidence: number; // 0..1
  explanation: Explanation;
  /** "Quanto vale realmente questo rilancio?" — solo se e' stato passato un `candidatePrice`:
   * confronta il prezzo proposto con `maxCorrectPrice`. */
  valuation: { label: "sottopagato" | "in linea" | "sovrapagato"; deltaVsMaxPrice: number } | null;
  /** "Conviene attendere?" — true solo se il prezzo proposto e' ben sopra il massimo corretto E
   * ci sono alternative con valueScore comparabile ancora libere nello stesso ruolo. */
  waitRecommended: boolean | null;
  /** Quanti giocatori dello stesso ruolo, ancora liberi, hanno un valueScore comparabile (entro
   * il 15%) a questo — il dato su cui si basa `waitRecommended`. */
  alternativesAvailable: number | null;
  /** "Quanto rischio introduco nella mia rosa acquistando questo giocatore?" — 0..1 (più alto =
   * più rischioso), calcolato solo se e' stato passato un `buyerId`. */
  rosterRisk: { before: number; after: number } | null;
  /** "Conviene completare una coppia?" — quota di giocatori della rosa dell'acquirente già
   * dalla stessa squadra del candidato, prima e dopo l'acquisto (0..1). Proxy dichiarata sulla
   * concentrazione per squadra: nessun dato di sinergia reale (rete di assist, coppie titolari)
   * e' disponibile. */
  teamConcentration: { before: number; after: number } | null;
}

/** Un candidato in una classifica del Decision Engine su tutto il pool giocatori (sez. 14):
 * "miglior rapporto qualità/prezzo" e "chi dovrei chiamare adesso" sono le uniche 2 domande
 * della spec che richiedono di confrontare l'intero pool invece di un giocatore alla volta,
 * quindi condividono una risposta diversa da `DecisionRecommendation`. */
export interface DecisionPoolCandidate {
  playerId: string;
  name: string;
  role: PlayerRole;
  team: string;
  price: number | null;
  /** Punti fantacalcio attesi per credito di quotazione (produzione / prezzo): a differenza di
   * `PlayerListItem.valueScore` (solo un percentile della quotazione, non incorpora la qualità
   * attesa) e' una vera stima di rapporto qualità/prezzo, ma richiede `ProductionIndices`
   * (FSTATS) — `null` se non calcolabile per questo giocatore. */
  pointsPerCredit: number | null;
  reason: string;
}

export interface DecisionPoolResult {
  mode: "value-for-money" | "next-call";
  question: string;
  candidates: DecisionPoolCandidate[];
  explanation: Explanation;
}

/** Risultato di "Annulla ultima azione" (sez. 11, richiesto esplicitamente dall'utente): un
 * solo livello di undo, sull'evento più recente dell'asta (assegnazione o rimozione di un
 * inserimento), non uno storico completo — scope volutamente limitato all'asta live. */
export interface AuctionUndoResult {
  undone: { type: "assign" | "remove"; playerName: string; buyerName: string };
  state: ActiveAuctionState;
}
