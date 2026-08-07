import type { RosterRadarAxes } from "@sedinho/shared";

/** Etichette dei 6 assi del radar di rosa (sez. richiesta esplicitamente dall'utente),
 * condivise tra il radar per-rosa in `/auction` e il confronto rose in `/confronti` invece di
 * duplicate tra i due file. */
export const ROSTER_RADAR_AXES: { key: keyof RosterRadarAxes; label: string }[] = [
  { key: "bonus", label: "Bonus" },
  { key: "depth", label: "Profondità" },
  { key: "attack", label: "Attacco" },
  { key: "defense", label: "Difesa" },
  { key: "reliability", label: "Affidabilità" },
  { key: "gamble", label: "Scommessa" },
];
