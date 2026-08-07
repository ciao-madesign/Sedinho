import type { PlayerAvailability, PlayerRole } from "./common.js";
import type { HierarchyLevel, SetPieceType } from "./player.js";

/** Fascia di priorità impostata a mano dall'utente su un obiettivo (richiesto esplicitamente,
 * non in spec): 1 = prima scelta, 2 = seconda, 3 = terza. `null` = non ancora assegnata, mai
 * un default implicito — un obiettivo senza priorità non è "terza scelta" per default. */
export type ShortlistPriority = 1 | 2 | 3;

/** Un obiettivo d'asta dell'utente: Sedinho e' single-user (vedi CLAUDE.md sez. 5), quindi
 * nessuna scoping per lega/partecipante, solo "i giocatori che voglio tenere d'occhio". */
export interface ShortlistEntry {
  id: string;
  playerId: string;
  note: string | null;
  priority: ShortlistPriority | null;
  createdAt: string;
}

/** Riga arricchita per la UI (lista shortlist e pannello durante l'asta): stessi campi di
 * `PlayerListItem` (valutazione live) piu' lo stato di vendita nell'asta attiva, se ce n'e'
 * una — cosi' la shortlist resta utile sia fuori sia dentro l'asta senza due tipi separati. */
export interface ShortlistEntryView {
  id: string;
  playerId: string;
  note: string | null;
  priority: ShortlistPriority | null;
  createdAt: string;
  player: {
    id: string;
    name: string;
    team: string;
    role: PlayerRole;
    birthDate: string | null;
    availability: PlayerAvailability;
    initialQuotation: number | null;
    valueScore: number | null;
    expectedAuctionPrice: number | null;
    starterProbability: number | null;
    hierarchyLevel: HierarchyLevel | null;
    setPieceTypes: SetPieceType[];
  };
  /** Presente solo se c'e' un'asta attiva e il giocatore e' gia' stato assegnato. */
  sold: { price: number; buyerId: string; buyerName: string } | null;
}
