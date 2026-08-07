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

export interface DetectedTransfer {
  playerId: string;
  fromTeam: string;
  toTeam: string;
}

interface UpsertOutcome {
  upserted: number;
  errors: string[];
  /** Cambi squadra rilevati in questo giro (sez. 6, Transfer Engine): solo le fonti con
   * `canCreatePlayers` possono scrivere `team` (vedi sotto), quindi solo li' un trasferimento
   * puo' essere rilevato. L'impatto viene calcolato dopo, a fine `runImport`, confrontando la
   * `PlayerEvaluation` di prima e quella ricalcolata dopo — non qui. */
  detectedTransfers: DetectedTransfer[];
}

// injuryAbsenceRate resta fuori da questo elenco: gli altri campi sono colonne non-nullable con
// default 0 in schema.prisma (Int/Float @default(0)), quindi "nessun valore dalla fonte" e
// "zero reale" sono la stessa cosa. injuryAbsenceRate e' Float? (nullable): 0 e' un valore reale
// diverso da "dato non disponibile", va quindi trattato separatamente (vedi syncSeasonStats)
// per non scrivere un finto 0 quando nessuna fonte fornisce lo storico infortuni.
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
  const detectedTransfers: DetectedTransfer[] = [];

  for (const record of records) {
    try {
      const result = await findOrCreatePlayer(record, context);
      if (!result) {
        errors.push(
          `Saltato "${record.name}" (${record.team}): nessun giocatore esistente trovato (match esatto o fuzzy) e questa fonte non puo' crearne uno nuovo.`,
        );
        continue;
      }
      const { player, transfer } = result;
      await syncSeasonStats(player.id, record, context);
      await syncHierarchy(player.id, record, context);
      await syncSetPieces(player.id, record, context);
      if (transfer) detectedTransfers.push(transfer);
      upserted += 1;
    } catch (err) {
      errors.push(
        `Errore su "${record.name}" (${record.team}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { upserted, errors, detectedTransfers };
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
 * stesso cognome) si preferisce non abbinare piuttosto che rischiare un abbinamento sbagliato.
 * Se la ricerca filtrata per ruolo non trova nulla, si ritenta senza filtro: le fonti non
 * sono sempre d'accordo sulla classificazione di ruolo di un giocatore (es. trequartisti
 * classificati "C" da una fonte e "A" da un'altra), e scartare un match altrimenti univoco
 * solo per un disaccordo di ruolo sarebbe piu' dannoso del rischio di ambiguita' residua. */
async function findPlayerByFuzzyName(name: string, role: PlayerImportRecord["role"]) {
  const tokens = new Set(normalizeNameTokens(name));
  if (tokens.size === 0) return null;

  const findUnique = async (where?: { role: NonNullable<typeof role> }) => {
    const candidates = await prisma.player.findMany({ where });
    const matches = candidates.filter((candidate) =>
      normalizeNameTokens(candidate.name).some((token) => tokens.has(token)),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  };

  if (role) {
    const byRole = await findUnique({ role });
    if (byRole) return byRole;
  }
  return findUnique(undefined);
}

async function findOrCreatePlayer(
  record: PlayerImportRecord,
  context: UpsertContext,
): Promise<{ player: { id: string }; transfer: DetectedTransfer | null } | null> {
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
    const created = await prisma.player.create({
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
    return { player: created, transfer: null };
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

  const updated = await prisma.player.update({ where: { id: existing.id }, data });

  // Trasferimento (sez. 6, Transfer Engine): rilevato per confronto diretto, non da uno
  // scraping di calciomercato dedicato — solo Fantacalcio.it/quotazioni puo' scrivere `team`
  // (canCreatePlayers), quindi e' l'unica fonte che puo' far emergere un cambio squadra reale.
  const transfer =
    context.canCreatePlayers && existing.team !== team
      ? { playerId: updated.id, fromTeam: existing.team, toTeam: team }
      : null;

  return { player: updated, transfer };
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
    if (stats.injuryAbsenceRate !== undefined) update.injuryAbsenceRate = stats.injuryAbsenceRate;

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
        injuryAbsenceRate: stats.injuryAbsenceRate ?? null,
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
