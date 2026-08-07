import type { Explanation } from "./common.js";

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
