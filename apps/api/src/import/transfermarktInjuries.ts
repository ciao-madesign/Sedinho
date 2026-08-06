import * as cheerio from "cheerio";
import type { PlayerInjuryImportResult } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { evaluateSinglePlayer } from "../lib/evaluation/evaluateAllPlayers.js";

/** Import infortuni da Transfermarkt, richiesto esplicitamente dall'utente (non in spec).
 *
 * **Prima versione (batch, top 20 per quotazione): 0/20 su HTTP 504 in produzione**, verificato
 * dal vivo — ogni singola richiesta a transfermarkt.com falliva con 504, non un problema di
 * selettori CSS. Sostituita su richiesta dell'utente con un'azione **on-demand, un giocatore
 * alla volta** dal dettaglio giocatore: riduce il carico per chiamata (2 richieste invece di
 * fino a 40) e permette di vedere subito se una singola richiesta passa o viene ancora bloccata,
 * senza sprecare l'intero budget di tentativi su un blocco sistematico. Header più simili a un
 * browser reale (`HEADERS` sotto) per aumentare (non garantire: un WAF può fingerprintare anche
 * TLS/JS challenge, non risolvibili da un semplice `fetch()`) le probabilità di passare.
 *
 * Diverso dagli altri connettori (import/connectors/*): quelli scaricano UNA pagina con molti
 * giocatori; qui invece si parte da un `Player.id` già noto (niente lista Serie A comoda su
 * Transfermarkt), quindi si scrive direttamente su `SeasonStats` con quel id, bypassando il
 * matching per nome di `upsert.ts` — non c'e' nulla da identificare, solo da arricchire. La
 * ricerca per nome richiede comunque un match univoco per token (stesso principio "meglio
 * saltare che sbagliare" di `findPlayerByFuzzyName`), altrimenti niente scrittura.
 */
const SEASON_MATCHES = 38; // Serie A, 20 squadre, girone all'italiana: approssimazione dichiarata

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
  Referer: "https://www.transfermarkt.com/",
};

function normalizeNameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['".]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

interface SearchCandidate {
  id: string;
  slug: string;
  name: string;
}

async function searchPlayer(name: string): Promise<SearchCandidate[]> {
  const url = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Ricerca Transfermarkt fallita per "${name}": HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const candidates: SearchCandidate[] = [];

  $("a[href*='/profil/spieler/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/^\/([^/]+)\/profil\/spieler\/(\d+)/);
    if (!match) return;
    const [, slug, id] = match;
    const candidateName = $(el).text().trim();
    if (slug && id && candidateName) candidates.push({ id, slug, name: candidateName });
  });

  // Lo stesso giocatore compare spesso più volte nella pagina (thumbnail + nome, entrambi link):
  // deduplicato per id.
  return [...new Map(candidates.map((c) => [c.id, c])).values()];
}

function resolveUniqueCandidate(playerName: string, candidates: SearchCandidate[]): SearchCandidate | null {
  const tokens = new Set(normalizeNameTokens(playerName));
  const matches = candidates.filter((c) => normalizeNameTokens(c.name).some((t) => tokens.has(t)));
  return matches.length === 1 ? matches[0]! : null;
}

interface InjurySeasonTotal {
  season: string; // formato nostro, es. "2025-26"
  gamesMissed: number;
}

function normalizeSeasonLabel(tmSeason: string): string | null {
  // Transfermarkt usa "25/26": convertito nel nostro formato "2025-26".
  const match = tmSeason.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return `20${match[1]}-${match[2]}`;
}

async function fetchInjuryHistory(id: string, slug: string): Promise<InjurySeasonTotal[]> {
  const url = `https://www.transfermarkt.com/${slug}/verletzungen/spieler/${id}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Pagina infortuni Transfermarkt fallita (${slug}): HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const bySeason = new Map<string, number>();

  $("table.items tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const seasonRaw = $(cells[0]).text().trim();
    const gamesMissedRaw = $(cells[cells.length - 1]).text().trim();
    const season = normalizeSeasonLabel(seasonRaw);
    if (!season) return;
    const gamesMissed = Number(gamesMissedRaw.replace(/[^\d]/g, ""));
    if (!Number.isFinite(gamesMissed)) return;
    bySeason.set(season, (bySeason.get(season) ?? 0) + gamesMissed);
  });

  return [...bySeason.entries()].map(([season, gamesMissed]) => ({ season, gamesMissed }));
}

/** Importa lo storico infortuni per UN giocatore, innescato solo da un'azione utente esplicita
 * sul suo dettaglio (sez. 2, "Aggiornamento manuale"). Ricalcola anche la sua `PlayerEvaluation`
 * (non l'intero DB) cosi' l'indice `reliability.injuryRisk` è subito aggiornato in UI. */
export async function importInjuriesForPlayer(playerId: string): Promise<PlayerInjuryImportResult> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    return { playerId, matched: false, seasonsUpdated: 0, error: "Giocatore non trovato." };
  }

  try {
    const candidates = await searchPlayer(player.name);
    const resolved = resolveUniqueCandidate(player.name, candidates);
    if (!resolved) {
      return {
        playerId,
        matched: false,
        seasonsUpdated: 0,
        error: "Nessun match univoco su Transfermarkt per questo nome.",
      };
    }

    const seasonTotals = await fetchInjuryHistory(resolved.id, resolved.slug);
    for (const { season, gamesMissed } of seasonTotals) {
      const injuryAbsenceRate = Math.min(1, gamesMissed / SEASON_MATCHES);
      await prisma.seasonStats.upsert({
        where: {
          playerId_season_competition: { playerId: player.id, season, competition: "Serie A" },
        },
        create: {
          playerId: player.id,
          season,
          competition: "Serie A",
          source: "transfermarkt",
          reliability: 0.65,
          injuryAbsenceRate,
        },
        update: { injuryAbsenceRate, source: "transfermarkt", reliability: 0.65 },
      });
    }

    if (seasonTotals.length > 0) {
      await evaluateSinglePlayer(playerId);
    }

    return { playerId, matched: true, seasonsUpdated: seasonTotals.length, error: null };
  } catch (err) {
    return {
      playerId,
      matched: false,
      seasonsUpdated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
