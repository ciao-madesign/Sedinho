import type { Transfer as TransferRow } from "@prisma/client";
import type { Transfer } from "@sedinho/shared";

/** Confine Prisma <-> tipo condiviso per `Transfer` (sez. 6), stesso pattern di
 * `evaluation-mapper.ts`. Il modello Prisma non ha una colonna `reliability` dedicata (a
 * differenza di `Player`/`SeasonStats`): questi record sono calcolati internamente dal Transfer
 * Engine, non scaricati da una fonte esterna con affidabilità variabile, quindi `reliability`
 * e' fissa a 1 nel `DataSourceMeta` esposto al frontend. */
export function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    playerId: row.playerId,
    fromTeam: row.fromTeam,
    toTeam: row.toTeam,
    date: row.date.toISOString(),
    startingRoleImpact: row.startingRoleImpact,
    minutesImpact: row.minutesImpact,
    bonusImpact: row.bonusImpact,
    riskDelta: row.riskDelta,
    fantasyValueDelta: row.fantasyValueDelta,
    newStarterProbability: row.newStarterProbability,
    isHighlighted: row.isHighlighted,
    meta: { source: row.source, updatedAt: row.updatedAt.toISOString(), reliability: 1 },
  };
}
