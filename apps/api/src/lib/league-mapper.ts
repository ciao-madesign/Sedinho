import type { League as LeagueRow, Prisma } from "@prisma/client";
import type { LeagueConfig, LeagueDraft } from "@sedinho/shared";

/** Confine JSON-string <-> oggetto tra SQLite (che non supporta il tipo Json in Prisma) e i tipi condivisi. */
export function toLeagueConfig(row: LeagueRow): LeagueConfig {
  return {
    id: row.id,
    name: row.name,
    participants: row.participants,
    initialBudget: row.initialBudget,
    rosterComposition: JSON.parse(row.rosterComposition),
    allowedModules: JSON.parse(row.allowedModules),
    auctionMode: row.auctionMode as LeagueConfig["auctionMode"],
    callOrder: JSON.parse(row.callOrder),
    rulesText: row.rulesText,
    parsedRules: JSON.parse(row.parsedRules),
    entryFee: row.entryFee ? JSON.parse(row.entryFee) : undefined,
    prizePool: row.prizePool ? JSON.parse(row.prizePool) : undefined,
    cupFormat: row.cupFormat ? JSON.parse(row.cupFormat) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLeagueWriteData(
  draft: LeagueDraft,
): Omit<Prisma.LeagueUncheckedCreateInput, "id" | "createdAt" | "updatedAt"> {
  return {
    name: draft.name,
    participants: draft.participants,
    initialBudget: draft.initialBudget,
    rosterComposition: JSON.stringify(draft.rosterComposition),
    allowedModules: JSON.stringify(draft.allowedModules),
    auctionMode: draft.auctionMode,
    callOrder: JSON.stringify(draft.callOrder),
    rulesText: draft.rulesText,
    parsedRules: JSON.stringify(draft.parsedRules),
    entryFee: draft.entryFee ? JSON.stringify(draft.entryFee) : null,
    prizePool: draft.prizePool ? JSON.stringify(draft.prizePool) : null,
    cupFormat: draft.cupFormat ? JSON.stringify(draft.cupFormat) : null,
  };
}
