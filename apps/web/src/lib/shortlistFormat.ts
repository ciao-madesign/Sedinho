import type { ShortlistPriority } from "@sedinho/shared";

/** Etichette/colori per la priorità impostata a mano sugli obiettivi (richiesta esplicitamente,
 * non in spec): condivise tra ShortlistPage e il pannello Obiettivi in /auction, cosi' le due
 * viste restano coerenti invece di ridefinire la stessa mappa due volte. */
export const priorityLabels: Record<ShortlistPriority, string> = {
  1: "1ª scelta",
  2: "2ª scelta",
  3: "3ª scelta",
};

export function priorityBadgeClass(priority: ShortlistPriority): string {
  switch (priority) {
    case 1:
      return "bg-emerald-500/10 text-emerald-400";
    case 2:
      return "bg-amber-500/10 text-amber-400";
    case 3:
      return "bg-slate-700/40 text-slate-400";
  }
}
