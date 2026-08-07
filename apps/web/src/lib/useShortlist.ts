import { useCallback, useEffect, useState } from "react";
import type { ShortlistEntryView, ShortlistPriority } from "@sedinho/shared";
import { shortlistApi } from "./api.js";

/** Stato condiviso della shortlist (obiettivi d'asta dell'utente), usato da PlayersPage,
 * PlayerDetailPage, AuctionPage e ShortlistPage: ricarica l'intero elenco dopo ogni
 * aggiunta/rimozione invece di aggiornare lo stato locale, stesso pattern "ricalcola da zero"
 * già usato per lo stato dell'asta (semplice e impossibile da far disallineare, accettabile
 * alla scala di poche decine di obiettivi). */
export function useShortlist() {
  const [entries, setEntries] = useState<ShortlistEntryView[] | undefined>(undefined);

  const reload = useCallback(() => {
    shortlistApi
      .list()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const entryByPlayerId = new Map((entries ?? []).map((e) => [e.playerId, e]));

  async function add(playerId: string) {
    await shortlistApi.add(playerId);
    reload();
  }

  async function remove(entryId: string) {
    await shortlistApi.remove(entryId);
    reload();
  }

  async function toggle(playerId: string) {
    const existing = entryByPlayerId.get(playerId);
    if (existing) await remove(existing.id);
    else await add(playerId);
  }

  async function setPriority(entryId: string, priority: ShortlistPriority | null) {
    await shortlistApi.updatePriority(entryId, priority);
    reload();
  }

  return { entries, entryByPlayerId, add, remove, toggle, setPriority, reload };
}
