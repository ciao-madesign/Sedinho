import type { ImportSourceId, PlayerImportRecord } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";

interface UpsertContext {
  source: ImportSourceId;
  reliability: number;
  /** Solo le fonti che identificano un giocatore in modo affidabile (nome completo + squadra
   * coerenti col resto del DB, oggi solo Fantacalcio.it/quotazioni) possono creare nuovi
   * `Player` o sovrascriverne name/team. Le fonti di arricchimento (Fantacalciopedia, la
   * pagina statistiche) usano grafie/formati diversi (cognome soltanto, sigla squadra a 3
   * lettere) che andrebbero a corrompere questi campi se scritti direttamente: matchano solo
   * su giocatori gia' esistenti (via findPlayerByFuzzyName) e non creano/rinominano nulla. */
  canCreatePlayers: boolean;
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
 * se/quando diventa un problema pratico). Se il match esatto fallisce, si tenta un fallback
 * per nome normalizzato (vedi findPlayerByFuzzyName): necessario perche' Fantacalciopedia e
 * la pagina statistiche di Fantacalcio.it usano grafie/ordine diversi (es. "BARELLA NICOLO'"
 * o "Martinez L.") rispetto al nome completo del listone quotazioni. */
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

/** Riduce un nome a un set di token confrontabili tra fonti con grafie diverse: minuscolo,
 * senza accenti/apostrofi, filtrando i token troppo corti (iniziali puntate come "L.") che
 * darebbero falsi positivi. */
function normalizeNameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['".]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

/** Fallback quando il match esatto (name, team) fallisce: cerca un giocatore esistente (dello
 * stesso ruolo, se noto) che condivida almeno un token di nome/cognome col record importato.
 * Accettato solo se il match e' univoco: in caso di ambiguita' (es. due giocatori con lo
 * stesso cognome) si preferisce non abbinare piuttosto che rischiare un abbinamento sbagliato. */
async function findPlayerByFuzzyName(name: string, role: PlayerImportRecord["role"]) {
  const tokens = new Set(normalizeNameTokens(name));
  if (tokens.size === 0) return null;

  const candidates = await prisma.player.findMany({ where: role ? { role } : undefined });
  const matches = candidates.filter((candidate) =>
    normalizeNameTokens(candidate.name).some((token) => tokens.has(token)),
  );

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

async function findOrCreatePlayer(record: PlayerImportRecord, context: UpsertContext) {
  const name = record.name.trim();
  const team = record.team.trim();
  let existing = await prisma.player.findFirst({ where: { name, team } });
  if (!existing) {
    existing = await findPlayerByFuzzyName(name, record.role);
  }

  if (!existing) {
    // Le fonti di arricchimento non conoscono nome/squadra nel formato canonico: non creano
    // giocatori nuovi, solo il rischio di duplicati con dati mal formattati (vedi commento
    // su UpsertContext.canCreatePlayers).
    if (!context.canCreatePlayers || !record.role) return null;
    return prisma.player.create({
      data: {
        name,
        team,
        role: record.role,
        initialQuotation: record.initialQuotation,
        source: context.source,
        reliability: context.reliability,
        availability: "available",
      },
    });
  }

  const data = context.canCreatePlayers
    ? {
        name,
        team,
        role: record.role ?? existing.role,
        initialQuotation: record.initialQuotation ?? existing.initialQuotation,
        source: context.source,
        reliability: context.reliability,
      }
    : {
        // Solo arricchimento: name/team restano quelli gia' salvati (affidabili), non quelli
        // di questa fonte secondaria.
        role: record.role ?? existing.role,
        initialQuotation: record.initialQuotation ?? existing.initialQuotation,
        source: context.source,
        reliability: context.reliability,
      };

  return prisma.player.update({ where: { id: existing.id }, data });
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
