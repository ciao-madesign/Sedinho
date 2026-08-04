import type { PlayerRole } from "./common.js";

/** Composizione della rosa richiesta dal regolamento (es. { P: 3, D: 8, C: 8, A: 6 }). */
export type RosterComposition = Record<PlayerRole, number>;

export type AuctionMode = "classic-serpentina" | "classic-fixed-order" | "custom";

export interface CallOrderRule {
  mode: "sequential" | "random" | "budget-based" | "custom";
  description?: string;
}

/** Una regola estratta dal regolamento testuale fornito dall'utente al Setup Wizard (sez. 3). */
export interface ParsedRule {
  id: string;
  category: "bonus" | "malus" | "modifier" | "formation" | "market" | "exception";
  description: string;
  /** Espressione/valore usato dal motore matematico (es. { type: "goal", role: "P", points: 3 }). */
  effect: Record<string, unknown>;
  sourceText?: string;
}

export interface LeagueConfig {
  id: string;
  name: string;
  participants: number;
  initialBudget: number;
  rosterComposition: RosterComposition;
  allowedModules: string[]; // es. ["4-3-3", "3-5-2"]
  auctionMode: AuctionMode;
  callOrder: CallOrderRule;
  rulesText: string;
  parsedRules: ParsedRule[];
  createdAt: string;
  updatedAt: string;
}
