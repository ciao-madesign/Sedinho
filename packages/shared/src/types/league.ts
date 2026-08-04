import type { PlayerRole } from "./common.js";

/** Composizione della rosa richiesta dal regolamento (es. { P: 3, D: 8, C: 8, A: 6 }). */
export type RosterComposition = Record<PlayerRole, number>;

export type AuctionMode = "classic-serpentina" | "classic-fixed-order" | "custom";

export interface CallOrderRule {
  mode: "sequential" | "random" | "budget-based" | "custom";
  description?: string;
}

/** Una regola estratta dal regolamento testuale fornito dall'utente al Setup Wizard (sez. 3). */
export interface ParsedRule {
  id: string;
  category: "bonus" | "malus" | "modifier" | "formation" | "market" | "exception";
  description: string;
  /** Espressione/valore usato dal motore matematico (es. { type: "goal", role: "P", points: 3 }). */
  effect: Record<string, unknown>;
  sourceText?: string;
}

/** Quota di iscrizione e relative penali (dati amministrativi, non usati dagli engine di valutazione). */
export interface EntryFeeConfig {
  amount: number;
  currency: string; // es. "EUR"
  depositAmount?: number; // es. cauzione multe
  deadlineDescription?: string; // testo libero: le scadenze di lega sono spesso relative ("giorno dell'asta di Febbraio")
  withdrawalPenaltyDescription?: string; // cosa succede se un partecipante si ritira
}

/** Una voce del montepremi di fine stagione. */
export interface PrizePoolEntry {
  id: string;
  label: string; // es. "Primo posto", "Vincitore Coppa", "Top scorer dell'anno"
  amount: number;
  currency: string;
  notes?: string;
}

/** Una fase di un torneo/coppa parallelo al campionato (formato eliminazione a gironi/fasi). */
export interface CupPhase {
  id: string;
  name: string;
  fromMatchday: number;
  toMatchday: number;
  teams: number;
  eliminatedTeams: number;
  notes?: string;
}

/** Struttura opzionale di una coppa/torneo parallelo (dati amministrativi/di contesto). */
export interface CupFormat {
  enabled: boolean;
  name?: string; // es. "Coppa Formula 1"
  phases: CupPhase[];
}

export interface LeagueConfig {
  id: string;
  name: string;
  participants: number;
  initialBudget: number;
  rosterComposition: RosterComposition;
  allowedModules: string[]; // es. ["4-3-3", "3-5-2"]
  auctionMode: AuctionMode;
  callOrder: CallOrderRule;
  rulesText: string;
  parsedRules: ParsedRule[];
  entryFee?: EntryFeeConfig;
  prizePool?: PrizePoolEntry[];
  cupFormat?: CupFormat;
  createdAt: string;
  updatedAt: string;
}

/** Payload di creazione/modifica lega: tutto tranne id e timestamp gestiti dal backend. */
export type LeagueDraft = Omit<LeagueConfig, "id" | "createdAt" | "updatedAt">;
