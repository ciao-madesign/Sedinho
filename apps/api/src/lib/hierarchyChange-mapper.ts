import type { PlayerHierarchyChange as HierarchyChangeRow } from "@prisma/client";
import type { HierarchyChange, HierarchyLevel } from "@sedinho/shared";

/** Confine Prisma <-> tipo condiviso per `HierarchyChange` (sez. 4), stesso pattern di
 * `transfer-mapper.ts`. */
export function toHierarchyChange(row: HierarchyChangeRow): HierarchyChange {
  return {
    id: row.id,
    playerId: row.playerId,
    fromLevel: row.fromLevel as HierarchyLevel | null,
    toLevel: row.toLevel as HierarchyLevel | null,
    source: row.source,
    date: row.date.toISOString(),
  };
}
