import type { Explanation, PlayerRole } from "./common.js";

export interface SimulatedPriceRange {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export interface SimulatedBudgetOutcome {
  budget: number;
  winProbability: number; // 0..1
}

/** Fascia in cui il motore classifica il giocatore prima di simulare (sez. 15): quasi ogni
 * rosa tiene 1-2 slot per ruolo riempiti a 1 credito (riempitivi/tappabuchi), un titolare segue
 * invece il prezzo pieno — due distribuzioni molto diverse, non un'unica curva continua per
 * ruolo (dettaglio confermato esplicitamente dall'utente). */
export type SimulatedPriceTier = "starter" | "backup" | "filler";

/** Risultato del Simulatore Monte Carlo per un SINGOLO giocatore (sez. 15): scope scelto
 * esplicitamente con l'utente al posto della simulazione dell'intera asta (troppo complessa da
 * tarare senza uno storico comportamentale reale dei partecipanti, vedi CLAUDE.md §5). Nessuno
 * storico prezzi reale della lega dell'utente e' disponibile: la distribuzione simulata resta
 * un'euristica dichiarata, informata da alcuni riferimenti qualitativi (fasce di prezzo
 * indicative per ruolo/fascia, effetto "fine asta") ma non calibrata su dati veri. */
export interface SimulationResult {
  playerId: string;
  iterations: number;
  tier: SimulatedPriceTier;
  /** "auction" se calcolato sui dati reali di un'asta in corso (rivali/inflazione veri), altrimenti
   * "generic" (proxy pre-asta dalla sola composizione rosa della lega). */
  dataSource: "auction" | "generic";
  priceRange: SimulatedPriceRange;
  /** Probabilità di aggiudicazione al budget indicato dall'utente. */
  winProbability: number;
  /** "Strategie alternative" (spec sez. 15): stessa simulazione letta ad altri budget candidati. */
  winProbabilityByBudget: SimulatedBudgetOutcome[];
  explanation: Explanation;
}

/** Rendimento medio atteso per un giocatore della rosa simulata (sez. 15, secondo blocco:
 * "rendimento della rosa", non l'asta). Segnalato esplicitamente dall'utente: la sola somma
 * stagionale (`expectedSeasonPoints`, un numero a 3 cifre) diceva poco a colpo d'occhio —
 * `expectedFantasyAvg`/`expectedBonusMalus` sono sulla stessa scala "a partita" con cui un
 * fantallenatore legge normalmente una fantamedia (~4-8), molto più leggibile. */
export interface RosterSeasonPlayerOutcome {
  playerId: string;
  name: string;
  role: PlayerRole;
  /** Somma dei fantavoto simulati sulle giornate in cui il giocatore gioca (probabilità di
   * titolarità), non un dato misurato — utile come confronto complessivo tra giocatori, meno
   * come lettura "a colpo d'occhio" (vedi nota sopra). */
  expectedSeasonPoints: number;
  /** Fantamedia attesa a partita (voto + bonus/malus), la stessa identica cifra già mostrata
   * altrove nell'app (`ProductionIndices.expectedFantasyPoints`, da FSTATS) — non ricalcolata
   * dalla simulazione, solo passata attraverso per restare sulla scala "a partita". */
  expectedFantasyAvg: number;
  /** Bonus/malus medio a partita (`expectedFantasyAvg` meno il voto puro medio dell'ultima
   * stagione nota), `null` se il voto puro non è disponibile per nessuna stagione. */
  expectedBonusMalus: number | null;
}

/** Risultato del Simulatore di rosa (sez. 15, secondo blocco): Monte Carlo su un intero
 * campionato per un insieme di giocatori già scelto (rosa d'asta reale o lista Obiettivi/
 * shortlist) — non simula l'asta, solo il rendimento stagionale della rosa data. Riusa gli
 * stessi indici del Player Evaluation Engine già calcolati (produzione attesa/partita,
 * probabilità di titolarità, floor/ceiling/volatilità multi-stagione), nessun nuovo dato
 * raccolto. Resta un'euristica dichiarata: floor/ceiling/volatilità sono varianza tra STAGIONI
 * (unico proxy disponibile con lo schema attuale), usata qui come proxy anche per la varianza
 * partita-per-partita — un compromesso dichiarato, non un dato calibrato sul vero andamento
 * settimanale. */
export interface RosterSeasonSimulationResult {
  iterations: number;
  /** Giornate simulate per campionato (Serie A: 38, costante dichiarata). */
  matchdays: number;
  playersIncluded: number;
  /** Giocatori esclusi dalla simulazione per mancanza di una produzione attesa nota
   * (nessuna `PlayerEvaluation`/`SeasonStats` disponibile) — mai stimati a caso. */
  playersExcluded: number;
  totalPointsRange: SimulatedPriceRange;
  /** Media di `expectedFantasyAvg` su tutti i giocatori inclusi: un singolo numero sulla scala
   * "a partita" (~4-8) invece della somma stagionale aggregata — segnalato esplicitamente
   * dall'utente come lettura più immediata di "quanto rende in media questo gruppo". */
  averageFantasyAvg: number;
  /** Rendimento medio atteso per ogni giocatore incluso, per un grafico di dettaglio per rosa. */
  perPlayer: RosterSeasonPlayerOutcome[];
  explanation: Explanation;
}
