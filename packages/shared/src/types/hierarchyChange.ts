import type { HierarchyLevel } from "./player.js";

/** Un cambio di gerarchia rilevato (sez. 4 Dashboard "Cambi di gerarchia"): a differenza di
 * `Transfer`, `fromLevel`/`toLevel` possono essere entrambi `null` solo alternativamente — un
 * giocatore che entra/esce dalla lista titolari di una fonte, non transizioni tra più livelli
 * (oggi nessuna fonte scrive altro che "starter", vedi CLAUDE.md). */
export interface HierarchyChange {
  id: string;
  playerId: string;
  fromLevel: HierarchyLevel | null;
  toLevel: HierarchyLevel | null;
  source: string;
  date: string;
}
