import type { ExplanationFactor, StabilityIndices } from "@sedinho/shared";
import { missingDataFactor, type IndexCalculation } from "./types.js";

interface SeasonStatsInput {
  season: string;
  fantasyAvg: number;
}

/** Indici di Stabilità (sez. 8): richiedono variabilità del rendimento nel tempo. Lo schema
 * attuale di `SeasonStats` e' aggregato per stagione (non partita-per-partita), quindi il
 * proxy migliore disponibile e' la varianza tra stagioni diverse — serve almeno 2 stagioni
 * storiche per lo stesso giocatore. Con una sola fonte (Fantacalcio.it, che non porta
 * `SeasonStats`) o con una sola stagione importata, resta `null`. Una volta disponibili dati
 * partita-per-partita (fuori dallo schema attuale) questo calcolo andrebbe raffinato. */
export function computeStabilityIndices(
  seasons: SeasonStatsInput[],
): IndexCalculation<StabilityIndices> {
  if (seasons.length < 2) {
    return {
      indices: {
        floorScore: null,
        ceilingScore: null,
        consistencyIndex: null,
        volatilityIndex: null,
      },
      factors: [
        missingDataFactor(
          "Storico multi-stagione",
          `Dato non disponibile: servono almeno 2 stagioni di statistiche (trovate ${seasons.length}), richiede il connettore FSTATS.`,
        ),
      ],
    };
  }

  const values = seasons.map((s) => s.fantasyAvg);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const floorScore = Number(Math.min(...values).toFixed(2));
  const ceilingScore = Number(Math.max(...values).toFixed(2));
  const volatilityIndex = Number((mean > 0 ? stdDev / mean : 0).toFixed(2));
  const consistencyIndex = Number(Math.max(0, 1 - volatilityIndex).toFixed(2));

  const factors: ExplanationFactor[] = [
    {
      label: "Storico multi-stagione",
      direction: consistencyIndex > 0.5 ? "favorable" : "unfavorable",
      weight: 1,
      detail: `Varianza calcolata su ${seasons.length} stagioni (fonte: FSTATS). Proxy a livello di stagione, non partita-per-partita.`,
    },
  ];

  return { indices: { floorScore, ceilingScore, consistencyIndex, volatilityIndex }, factors };
}
