import type { PlayerEvaluation as EvaluationRow, Prisma } from "@prisma/client";
import type { PlayerEvaluation } from "@sedinho/shared";
import type { PlayerEvaluationResult } from "./evaluation/evaluatePlayer.js";

/** Confine JSON-string <-> tipi condivisi per `PlayerEvaluation`, stesso pattern di
 * league-mapper.ts (Postgres via Prisma supporterebbe il tipo `Json` nativo, ma questi campi
 * sono rimasti `String` per coerenza con il resto del modello dati, vedi CLAUDE.md sez. 5). */
export function toPlayerEvaluation(row: EvaluationRow): PlayerEvaluation {
  return {
    playerId: row.playerId,
    computedAt: row.computedAt.toISOString(),
    reliability: JSON.parse(row.reliability),
    production: JSON.parse(row.production),
    bonus: JSON.parse(row.bonus),
    stability: JSON.parse(row.stability),
    value: JSON.parse(row.value),
    explanation: JSON.parse(row.explanation),
  };
}

export function toPlayerEvaluationWriteData(
  playerId: string,
  result: PlayerEvaluationResult,
): Prisma.PlayerEvaluationUncheckedCreateInput {
  return {
    playerId,
    reliability: JSON.stringify(result.reliability),
    production: JSON.stringify(result.production),
    bonus: JSON.stringify(result.bonus),
    stability: JSON.stringify(result.stability),
    value: JSON.stringify(result.value),
    explanation: JSON.stringify(result.explanation),
  };
}
