import type { ImportSourceId, PlayerImportRecord } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";

interface UpsertContext {
  source: ImportSourceId;
  reliability: number;
}

interface UpsertOutcome {
  upserted: number;
  errors: string[];
}

const SEASON_STATS_FIELDS = [
  "appearances",
  "minutes",
  "fantasyAvg",
  "averageRating",
  "goals",
  "assists",
  "xG",
  "xA",
  "shots",
  "shotsOnTarget",
  "yellowCards",
  "redCards",
  "penaltiesScored",
  "penaltiesTaken",
  "cleanSheets",
  "expectedBonus",
] as const;

/** Fa il merge di un batch di record importati nel DB. Matching giocatore per (name, team),
 * confronto esatto dopo trim: non esiste ancora un id esterno persistito per fonte, quindi
 * fonti che usano una grafia diversa per lo stesso giocatore creeranno record duplicati
 * (limite noto e documentato in CLAUDE.md, da risolvere con una tabella di mapping dedicata
 * se/quando diventa un problema pratico). */
export async function upsertPlayerImportRecords(
  records: PlayerImportRecord[],
  context: UpsertContext,
): Promise<UpsertOutcome> {
  let upserted = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      const player = await findOrCreatePlayer(record, context);
      if (!player) {
        errors.push(
          `Saltato "${record.name}" (${record.team}): nessun giocatore esistente e nessun ruolo fornito dalla fonte, impossibile crearne uno nuovo.`,
        );
        continue;
      }
      await syncSeasonStats(player.id, record, context);
      await syncHierarchy(player.id, record, context);
      await syncSetPieces(player.id, record, context);
      upserted += 1;
    } catch (err) {
      errors.push(
        `Errore su "${record.name}" (${record.team}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { upserted, errors };
}

async function findOrCreatePlayer(record: PlayerImportRecord, context: UpsertContext) {
  const name = record.name.trim();
  const team = record.team.trim();
  const existing = await prisma.player.findFirst({ where: { name, team } });

  if (!existing && !record.role) {
    return null;
  }

  const data = {
    name,
    team,
    role: record.role ?? existing!.role,
    initialQuotation: record.initialQuotation ?? existing?.initialQuotation,
    source: context.source,
    reliability: context.reliability,
  };

  if (existing) {
    return prisma.player.update({ where: { id: existing.id }, data });
  }
  return prisma.player.create({ data: { ...data, availability: "available" } });
}

async function syncSeasonStats(
  playerId: string,
  record: PlayerImportRecord,
  context: UpsertContext,
) {
  if (!record.seasonStats) return;

  for (const stats of record.seasonStats) {
    const update: Record<string, number> = {};
    for (const field of SEASON_STATS_FIELDS) {
      const value = stats[field];
      if (value !== undefined) update[field] = value;
    }

    await prisma.seasonStats.upsert({
      where: {
        playerId_season_competition: {
          playerId,
          season: stats.season,
          competition: stats.competition,
        },
      },
      create: {
        playerId,
        season: stats.season,
        competition: stats.competition,
        source: context.source,
        reliability: context.reliability,
        ...Object.fromEntries(SEASON_STATS_FIELDS.map((f) => [f, stats[f] ?? 0])),
      },
      update: { ...update, source: context.source, reliability: context.reliability },
    });
  }
}

async function syncHierarchy(
  playerId: string,
  record: PlayerImportRecord,
  context: UpsertContext,
) {
  if (!record.hierarchy) return;

  // Nessun vincolo unique su (playerId, source): si rimpiazza la riga della stessa fonte
  // invece di farla accumulare ad ogni "Aggiorna Database".
  await prisma.playerHierarchy.deleteMany({ where: { playerId, source: context.source } });
  await prisma.playerHierarchy.create({
    data: {
      playerId,
      level: record.hierarchy.level,
      reliability: record.hierarchy.reliability,
      source: context.source,
    },
  });
}

async function syncSetPieces(
  playerId: string,
  record: PlayerImportRecord,
  context: UpsertContext,
) {
  if (!record.setPieces) return;

  for (const setPiece of record.setPieces) {
    await prisma.setPieceRole.upsert({
      where: { playerId_type: { playerId, type: setPiece.type } },
      create: {
        playerId,
        type: setPiece.type,
        probability: setPiece.probability,
        source: context.source,
      },
      update: { probability: setPiece.probability, source: context.source },
    });
  }
}
