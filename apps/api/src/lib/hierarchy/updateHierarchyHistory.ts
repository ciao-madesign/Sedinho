import type { HierarchyLevel } from "@sedinho/shared";
import { prisma } from "../../db/prisma.js";
import { computeHierarchyChanges } from "./computeHierarchyChanges.js";

/** Istantanea di `PlayerHierarchy` per una singola fonte (playerId -> livello), usata da
 * `runImport.ts` per calcolare il diff prima/dopo l'upsert di un connettore. */
export async function snapshotHierarchyBySource(source: string): Promise<Map<string, HierarchyLevel>> {
  const rows = await prisma.playerHierarchy.findMany({
    where: { source },
    select: { playerId: true, level: true },
  });
  return new Map(rows.map((r) => [r.playerId, r.level as HierarchyLevel]));
}

/** Confronta due istantanee e persiste solo le righe davvero cambiate come nuove
 * `PlayerHierarchyChange` (append-only, mai sovrascritte) — vedi il motore puro
 * `computeHierarchyChanges.ts` per la logica di confronto. */
export async function persistHierarchyChanges(
  source: string,
  before: Map<string, HierarchyLevel>,
  after: Map<string, HierarchyLevel>,
): Promise<number> {
  const changes = computeHierarchyChanges(before, after);
  if (changes.length === 0) return 0;

  await prisma.playerHierarchyChange.createMany({
    data: changes.map((c) => ({
      playerId: c.playerId,
      fromLevel: c.fromLevel,
      toLevel: c.toLevel,
      source,
    })),
  });

  return changes.length;
}
