import type { ExplanationFactor, ProductionIndices } from "@sedinho/shared";
import { missingDataFactor, type IndexCalculation } from "./types.js";

interface SeasonStatsInput {
  season: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  fantasyAvg: number;
}

/** Indici di Produzione attesa (sez. 8): proiettano per-partita i dati dell'ultima stagione
 * disponibile (preferendo xG/xA se presenti, altrimenti i gol/assist realizzati). Richiede
 * `SeasonStats`, popolata solo dal connettore FSTATS (non ancora completato, vedi
 * import/connectors/fstats.ts) — con i dati odierni restituisce sempre `null`. */
export function computeProductionIndices(
  latestSeason: SeasonStatsInput | undefined,
): IndexCalculation<ProductionIndices> {
  if (!latestSeason || latestSeason.appearances === 0) {
    return {
      indices: {
        expectedGoals: null,
        expectedAssists: null,
        expectedMinutes: null,
        expectedFantasyPoints: null,
      },
      factors: [
        missingDataFactor(
          "Statistiche stagionali",
          "Dato non disponibile: richiede il connettore FSTATS (non ancora completato).",
        ),
      ],
    };
  }

  const appearances = latestSeason.appearances;
  const expectedGoals = Number(
    ((latestSeason.xG > 0 ? latestSeason.xG : latestSeason.goals) / appearances).toFixed(2),
  );
  const expectedAssists = Number(
    ((latestSeason.xA > 0 ? latestSeason.xA : latestSeason.assists) / appearances).toFixed(2),
  );
  const expectedMinutes = Number((latestSeason.minutes / appearances).toFixed(0));
  const expectedFantasyPoints = Number(latestSeason.fantasyAvg.toFixed(2));

  const factors: ExplanationFactor[] = [
    {
      label: "Statistiche stagionali",
      direction: "neutral",
      weight: 1,
      detail: `Proiezione per-partita dalla stagione ${latestSeason.season} (${appearances} presenze, fonte: FSTATS).`,
    },
  ];

  return {
    indices: { expectedGoals, expectedAssists, expectedMinutes, expectedFantasyPoints },
    factors,
  };
}
