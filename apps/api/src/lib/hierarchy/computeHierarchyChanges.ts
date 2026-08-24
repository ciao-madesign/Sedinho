import type { HierarchyLevel } from "@sedinho/shared";

export interface HierarchyChangeRecord {
  playerId: string;
  fromLevel: HierarchyLevel | null;
  toLevel: HierarchyLevel | null;
}

/** Motore puro (sez. 4 Dashboard "Cambi di gerarchia"): nessuna dipendenza da Prisma/HTTP.
 * Confronta l'istantanea PRIMA e DOPO di `PlayerHierarchy` per una singola fonte (chiave =
 * playerId, valore = livello) e restituisce solo le righe che sono davvero cambiate — un
 * giocatore assente in entrambe le mappe non genera nulla, un giocatore invariato nemmeno.
 * `null` in `fromLevel`/`toLevel` significa "non nella lista titolari di questa fonte in quel
 * momento" (oggi l'unico segnale reale disponibile, vedi commento sul modello Prisma). */
export function computeHierarchyChanges(
  before: Map<string, HierarchyLevel>,
  after: Map<string, HierarchyLevel>,
): HierarchyChangeRecord[] {
  const changes: HierarchyChangeRecord[] = [];
  const allPlayerIds = new Set([...before.keys(), ...after.keys()]);

  for (const playerId of allPlayerIds) {
    const fromLevel = before.get(playerId) ?? null;
    const toLevel = after.get(playerId) ?? null;
    if (fromLevel !== toLevel) {
      changes.push({ playerId, fromLevel, toLevel });
    }
  }

  return changes;
}
