import type { HierarchyLevel, PlayerAvailability, PlayerRole, SetPieceType } from "@sedinho/shared";

export const roleLabels: Record<PlayerRole, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};

/** Colori per ruolo, coerenti in tutta l'app (liste, dettaglio, dashboard). */
export const roleStyles: Record<PlayerRole, { text: string; bg: string; ring: string }> = {
  P: { text: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/30" },
  D: { text: "text-sky-400", bg: "bg-sky-500/10", ring: "ring-sky-500/30" },
  C: { text: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
  A: { text: "text-rose-400", bg: "bg-rose-500/10", ring: "ring-rose-500/30" },
};

export const availabilityLabels: Record<PlayerAvailability, string> = {
  available: "Disponibile",
  injured: "Infortunato",
  suspended: "Squalificato",
  doubtful: "In dubbio",
};

export const hierarchyLabels: Record<HierarchyLevel, string> = {
  starter: "Titolare",
  "first-alternate": "Prima alternativa",
  "second-alternate": "Seconda alternativa",
};

export const setPieceLabels: Record<SetPieceType, string> = {
  "penalty-1": "Rigorista 1°",
  "penalty-2": "Rigorista 2°",
  "penalty-3": "Rigorista 3°",
  "direct-free-kick-1": "Punizioni 1°",
  "direct-free-kick-2": "Punizioni 2°",
  corner: "Angoli",
  "side-free-kick": "Punizioni laterali",
};

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatCredits(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)} cr.`;
}
