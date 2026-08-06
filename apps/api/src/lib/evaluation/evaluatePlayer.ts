import type {
  BonusIndices,
  Explanation,
  HierarchyLevel,
  ProductionIndices,
  ReliabilityIndices,
  SetPieceType,
  StabilityIndices,
  ValueIndices,
} from "@sedinho/shared";
import { computeReliabilityIndices } from "./reliability.js";
import { computeProductionIndices } from "./production.js";
import { computeBonusIndices } from "./bonus.js";
import { computeStabilityIndices } from "./stability.js";
import { computeValueIndices } from "./value.js";

interface SeasonStatsInput {
  season: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  fantasyAvg: number;
  cleanSheets: number;
  injuryAbsenceRate: number | null;
}

export interface PlayerEvaluationInput {
  initialQuotation: number | undefined;
  roleQuotations: number[];
  seasons: SeasonStatsInput[];
  hierarchy: { level: HierarchyLevel; reliability: number } | undefined;
  rotation: { turnoverFrequency: number; coachReliability: number } | undefined;
  setPieces: { type: SetPieceType; probability: number }[];
}

export interface PlayerEvaluationResult {
  reliability: ReliabilityIndices;
  production: ProductionIndices;
  bonus: BonusIndices;
  stability: StabilityIndices;
  value: ValueIndices;
  explanation: Explanation;
}

function latestSeason<T extends { season: string }>(seasons: T[]): T | undefined {
  return [...seasons].sort((a, b) => b.season.localeCompare(a.season))[0];
}

/** Motore puro del Player Evaluation Engine (sez. 8): nessuna dipendenza da Prisma/HTTP, solo
 * input -> output, per restare testabile e sostituibile (principio "Modularità", CLAUDE.md
 * sez. 2). Ogni categoria di indici viene calcolata da un modulo dedicato che restituisce sia
 * i valori (con `null` esplicito dove manca la fonte) sia i fattori che spiegano il risultato
 * (principio "Spiegabile"): qui vengono solo assemblati in un'unica `PlayerEvaluation`. */
export function evaluatePlayer(input: PlayerEvaluationInput): PlayerEvaluationResult {
  const mostRecentSeason = latestSeason(input.seasons);
  const reliability = computeReliabilityIndices(
    input.hierarchy,
    input.rotation,
    mostRecentSeason?.injuryAbsenceRate,
  );
  const production = computeProductionIndices(mostRecentSeason);
  const bonus = computeBonusIndices(input.setPieces, mostRecentSeason);
  const stability = computeStabilityIndices(input.seasons);
  const value = computeValueIndices(input.initialQuotation, input.roleQuotations);

  const factors = [
    ...reliability.factors,
    ...production.factors,
    ...bonus.factors,
    ...stability.factors,
    ...value.factors,
  ];

  const allValues = [
    ...Object.values(reliability.indices),
    ...Object.values(production.indices),
    ...Object.values(bonus.indices),
    ...Object.values(stability.indices),
    ...Object.values(value.indices),
  ];
  const available = allValues.filter((v) => v !== null).length;
  const confidence = Number((available / allValues.length).toFixed(2));

  return {
    reliability: reliability.indices,
    production: production.indices,
    bonus: bonus.indices,
    stability: stability.indices,
    value: value.indices,
    explanation: {
      factors,
      confidence,
      summary: `${available}/${allValues.length} indici calcolati con dati reali; gli altri richiedono fonti non ancora integrate (vedi i singoli fattori).`,
    },
  };
}
