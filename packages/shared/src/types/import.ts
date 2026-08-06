import type { PlayerRole } from "./common.js";
import type { HierarchyLevel, SetPieceType } from "./player.js";

/** Identificatore di una fonte dati di import (sez. 5). Aggiungere qui ogni nuovo connettore. */
export type ImportSourceId = "fantacalcio-it" | "fstats" | "fantacalciopedia" | "transfermarkt";

/** Statistiche di una stagione cosi' come riportate da una fonte, prima del merge nel DB. */
export interface ImportedSeasonStats {
  season: string;
  competition: string;
  appearances?: number;
  minutes?: number;
  fantasyAvg?: number;
  averageRating?: number;
  goals?: number;
  assists?: number;
  xG?: number;
  xA?: number;
  shots?: number;
  shotsOnTarget?: number;
  yellowCards?: number;
  redCards?: number;
  penaltiesScored?: number;
  penaltiesTaken?: number;
  cleanSheets?: number;
  expectedBonus?: number;
  /** Frazione (0..1) delle partite ufficiali della squadra saltate dal giocatore per
   * infortunio in questa stagione. Nessun connettore attivo la fornisce ancora (richiede
   * storico infortuni per giocatore, non solo lo stato attuale): resta `undefined` finché una
   * fonte reale non la popola, mai stimata da altri campi (vedi CLAUDE.md). */
  injuryAbsenceRate?: number;
}

/** Un record giocatore cosi' come estratto da un connettore, prima del merge/upsert nel DB.
 * I connettori riempiono solo i campi di loro competenza (es. Fantacalcio.it non conosce xG). */
export interface PlayerImportRecord {
  /** Nome e squadra sono usati come chiave di matching verso i Player esistenti (vedi
   * import/upsert.ts). Non c'e' ancora un id esterno persistito per fonte. */
  name: string;
  team: string;
  role?: PlayerRole;
  initialQuotation?: number;
  seasonStats?: ImportedSeasonStats[];
  hierarchy?: { level: HierarchyLevel; reliability: number };
  setPieces?: { type: SetPieceType; probability: number }[];
}

export interface ImportSourceResult {
  source: ImportSourceId;
  status: "success" | "failed" | "skipped";
  recordsFound: number;
  recordsUpserted: number;
  errors: string[];
  durationMs: number;
}

/** Riepilogo del ricalcolo delle valutazioni (Player Evaluation Engine, sez. 8) eseguito in
 * automatico a fine "Aggiorna Database". `averageConfidence` riflette quanti indici hanno
 * dati reali: sara' basso finche' FSTATS/Fantacalciopedia restano stub (sez. 5). */
export interface EvaluationRunSummary {
  evaluated: number;
  averageConfidence: number;
}

/** Riepilogo di un'esecuzione di "Aggiorna Database" (sez. 5). Innescata solo da un'azione
 * utente esplicita: nessun campo/meccanismo qui prevede scheduling automatico. */
export interface ImportRunSummary {
  startedAt: string;
  finishedAt: string;
  results: ImportSourceResult[];
  evaluation: EvaluationRunSummary;
}

/** Riepilogo di un'esecuzione dell'import infortuni da Transfermarkt (richiesto esplicitamente
 * dall'utente, non in spec). Azione manuale separata da "Aggiorna Database": interroga
 * Transfermarkt giocatore per giocatore (nessuna lista Serie A comoda come le altre fonti),
 * quindi limitata a un sottoinsieme (i giocatori con quotazione più alta) per restare nei tempi
 * di una function serverless. Vedi CLAUDE.md sez. 5 per i dettagli e i limiti noti. */
export interface InjuryImportSummary {
  startedAt: string;
  finishedAt: string;
  targeted: number;
  matched: number;
  seasonsUpdated: number;
  errors: string[];
  evaluation: EvaluationRunSummary;
}
