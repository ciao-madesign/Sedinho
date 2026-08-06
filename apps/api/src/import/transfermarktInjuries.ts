import * as cheerio from "cheerio";
import type { InjuryImportSummary } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { evaluateAllPlayers } from "../lib/evaluation/evaluateAllPlayers.js";

/** Import infortuni da Transfermarkt, richiesto esplicitamente dall'utente (non in spec).
 *
 * Diverso da tutti gli altri connettori (import/connectors/*): quelli scaricano UNA pagina che
 * elenca molti giocatori; Transfermarkt non ha una lista Serie A comoda equivalente, servirebbe
 * una ricerca + una pagina infortuni PER GIOCATORE. Su ~760 giocatori sarebbero 1500+ richieste
 * sequenziali in una singola function serverless: rischio concreto di timeout. Per questo:
 * - limitato ai `TARGET_PLAYER_COUNT` giocatori con quotazione più alta (i più rilevanti per
 *   un giudizio d'asta, e i più probabili ad avere una pagina Transfermarkt riconoscibile);
 * - azione manuale SEPARATA da "Aggiorna Database" (POST /import/injuries, pulsante dedicato),
 *   non incorporata nel giro standard che gira su tutti i ~760 giocatori;
 * - scrive direttamente su `SeasonStats` usando il `Player.id` già noto dal nostro DB, senza
 *   passare dal matching per nome usato da `upsert.ts`: qui non stiamo cercando di IDENTIFICARE
 *   un giocatore a partire da un nome esterno ambiguo, stiamo arricchendo un giocatore che
 *   conosciamo già. Non implementa `ImportConnector` per questo motivo (quell'interfaccia
 *   presume l'identificazione via nome/squadra, qui non serve).
 *
 * **Selettori CSS mai verificati dal vivo in questa sessione** (stesso limite di rete di
 * sempre, sandbox senza accesso a transfermarkt.com): scritti sulla struttura storicamente
 * nota del sito (tabelle `table.items`), da confermare/correggere in produzione prima di
 * fidarsene, stesso percorso già seguito per FSTATS e Fantacalciopedia. Transfermarkt è inoltre
 * noto per protezioni anti-scraping più aggressive delle altre fonti già integrate: possibile
 * che le richieste vengano bloccate anche con selettori corretti — va verificato.
 */
const TARGET_PLAYER_COUNT = 20;
const SEASON_MATCHES = 38; // Serie A, 20 squadre, girone all'italiana: approssimazione dichiarata

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
};

/** Stesso criterio di `import/upsert.ts::normalizeNameTokens`, duplicato qui volutamente
 * (modulo indipendente, non fa matching verso il resto del DB — vedi commento sopra): minuscolo,
 * senza accenti, token troppo corti scartati. */
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

  $("table.items tbody tr").each((_, row) => {
    const link = $(row).find("td.hauptlink a").first();
    const href = link.attr("href") ?? "";
    const match = href.match(/^\/([^/]+)\/profil\/spieler\/(\d+)/);
    if (!match) return;
    const [, slug, id] = match;
    const candidateName = link.text().trim();
    if (slug && id && candidateName) candidates.push({ id, slug, name: candidateName });
  });

  return candidates;
}

/** Accetta solo un candidato il cui nome condivide almeno un token con quello cercato ED è
 * l'unico a farlo: stesso principio "meglio saltare che sbagliare" di `findPlayerByFuzzyName`
 * (import/upsert.ts) — nessuna verifica di squadra (i risultati di ricerca non la espongono in
 * modo affidabile), accettabile perché limitato ai giocatori più noti (quotazione più alta). */
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

/** Esegue l'import infortuni per i `TARGET_PLAYER_COUNT` giocatori con quotazione più alta,
 * innescato solo da un'azione utente esplicita (POST /import/injuries), mai in automatico
 * (sez. 2, "Aggiornamento manuale"). Sequenziale, stesso motivo di
 * `upsertPlayerImportRecords`/`evaluateAllPlayers` (Neon pooled, connection_limit=1). */
export async function runTransfermarktInjuries(): Promise<InjuryImportSummary> {
  const startedAt = new Date();
  const errors: string[] = [];
  let matched = 0;
  let seasonsUpdated = 0;

  const players = await prisma.player.findMany({
    where: { initialQuotation: { not: null } },
    orderBy: { initialQuotation: "desc" },
    take: TARGET_PLAYER_COUNT,
  });

  for (const player of players) {
    try {
      const candidates = await searchPlayer(player.name);
      const resolved = resolveUniqueCandidate(player.name, candidates);
      if (!resolved) {
        errors.push(`"${player.name}": nessun match univoco su Transfermarkt, saltato.`);
        continue;
      }
      matched += 1;

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
        seasonsUpdated += 1;
      }
    } catch (err) {
      errors.push(`"${player.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const evaluation = await evaluateAllPlayers();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    targeted: players.length,
    matched,
    seasonsUpdated,
    errors,
    evaluation,
  };
}
