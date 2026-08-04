/** Metadata di provenienza per ogni dato importato/calcolato, come richiesto dalla spec (sez. 5). */
export interface DataSourceMeta {
  source: string;
  updatedAt: string; // ISO date
  reliability: number; // 0..1
}

/** Un singolo fattore che concorre a una valutazione "spiegabile" (sez. 2, "Spiegabile"). */
export interface ExplanationFactor {
  label: string;
  direction: "favorable" | "unfavorable" | "neutral";
  weight: number; // 0..1, contributo relativo al punteggio finale
  detail: string;
}

/** Spiegazione completa allegata a ogni suggerimento/valutazione del sistema. */
export interface Explanation {
  factors: ExplanationFactor[];
  confidence: number; // 0..1, livello di affidabilità complessivo
  summary: string;
}

export type PlayerRole = "P" | "D" | "C" | "A"; // Portiere, Difensore, Centrocampista, Attaccante (default; ridefinibile da lega)

export type PlayerAvailability =
  | "available"
  | "injured"
  | "suspended"
  | "doubtful";
