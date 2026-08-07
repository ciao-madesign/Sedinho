import type { Explanation, PlayerRole } from "./common.js";

/** Un singolo acquisto valutato per "migliori/peggiori operazioni" (sez. 16): confronta il
 * prezzo pagato con il prezzo atteso a mercato (Player Evaluation Engine), stesso concetto già
 * usato per `rateOperation` in `/auction`, qui aggregato per l'intero report. */
export interface FinalReportOperation {
  playerId: string;
  name: string;
  role: PlayerRole;
  team: string;
  price: number;
  /** `null` se nessuna quotazione/valutazione era disponibile per questo giocatore. */
  expectedPrice: number | null;
  /** (price - expectedPrice) / expectedPrice, `null` se `expectedPrice` è `null`. */
  deltaPercent: number | null;
}

export interface FinalReportRoleBalance {
  role: PlayerRole;
  count: number;
  /** Media di `valueScore` dei giocatori di questo ruolo in rosa, `null` se nessuno ha un
   * valueScore noto. */
  averageValueScore: number | null;
}

/** Report finale (sez. 16): prodotto on-demand per la rosa del partecipante `isMe`, non
 * persistito — stesso pattern di Market/Opponent/Decision/Simulator Engine, ricalcolato ogni
 * volta dai dati già presenti (nessuno storico separato da tenere sincronizzato). Ogni campo
 * `number | null` con un campo "coverage" affiancato (0..1) dichiara esplicitamente su quanti
 * giocatori della rosa quel dato era disponibile — mai una stima silenziosa sui mancanti. */
export interface FinalReport {
  participantId: string;
  auctionEndedAt: string | null;
  rosterSize: number;
  totalSpent: number;
  budgetInitial: number;
  /** Somma dei prezzi attesi a mercato (Player Evaluation Engine) dei soli giocatori con
   * quel dato disponibile. */
  theoreticalValue: number | null;
  theoreticalValueCoverage: number;
  /** Somma dei punti fantamedia attesi (FSTATS) dei soli giocatori con quel dato disponibile. */
  expectedFantasyPoints: number | null;
  expectedFantasyPointsCoverage: number;
  /** Quanti giocatori in rosa ricadono in ciascuna fascia di rischio (indisponibilità +
   * gerarchia dichiarata, stessa euristica del Decision Engine sez. 14) — "unknown" per chi non
   * ha nessuno dei due dati. */
  riskDistribution: { low: number; medium: number; high: number; unknown: number };
  roleBalance: FinalReportRoleBalance[];
  /** Squadra più rappresentata in rosa e relativa quota, `null` con rosa vuota. */
  teamDependency: { team: string; share: number } | null;
  penaltyCoverage: { covered: boolean; players: string[] };
  setPieceCoverage: { covered: boolean; players: string[] };
  /** Media di `ReliabilityIndices.rotationRisk` dei giocatori che lo hanno — quasi sempre `null`
   * oggi: il Rotation Engine (sez. 7) non è ancora implementato, nessuna fonte lo popola. */
  turnoverExposure: number | null;
  turnoverExposureCoverage: number;
  bestOperations: FinalReportOperation[];
  worstOperations: FinalReportOperation[];
  explanation: Explanation;
}
