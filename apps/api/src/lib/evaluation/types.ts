import type { ExplanationFactor } from "@sedinho/shared";

/** Risultato di un singolo calcolatore di categoria (Affidabilità, Produzione, ...): gli
 * indici stessi (con `null` dove manca la fonte dati) piu' i fattori che spiegano com'e'
 * arrivato a quei valori — o perche' non ci e' arrivato (principio "Spiegabile", CLAUDE.md
 * sez. 2). L'orchestratore (evaluatePlayer.ts) concatena i factors di ogni categoria nella
 * `Explanation` complessiva della `PlayerEvaluation`. */
export interface IndexCalculation<T> {
  indices: T;
  factors: ExplanationFactor[];
}

export function missingDataFactor(label: string, detail: string): ExplanationFactor {
  return { label, direction: "neutral", weight: 0, detail };
}
