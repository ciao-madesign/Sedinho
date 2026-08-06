import * as cheerio from "cheerio";
import type { ImportedSeasonStats, PlayerImportRecord, PlayerRole } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

/** "FSTATS" era un nome di fonte segnaposto, mai una URL reale (fstats.it non risolve in
 * rete). Verificato dal vivo (agosto 2026, stessa tecnica del debug-proxy su Vercel usata per
 * fantacalcio.it/quotazioni, vedi CLAUDE.md): fantacalcio.it pubblica anche una pagina
 * statistiche server-side per stagione, `/statistiche-serie-a/{stagione}`. La stagione
 * corrente (2026/27) e' ancora a 0 presenze/voti perche' non e' ancora iniziata: si usano
 * quindi le ultime stagioni completate come fonte di dati storici reali (sez. 4 "Storico",
 * fantamedia storica richiesta esplicitamente dall'utente). **Va aggiornato manualmente
 * l'elenco `SEASONS` di anno in anno** (nessun calcolo automatico delle stagioni passate: la
 * spec vieta comunque ogni automazione, sez. 2 "Aggiornamento manuale"). Le stagioni oltre
 * l'ultima non sono state verificate dal vivo in questa sessione (stesso limite di rete
 * documentato in CLAUDE.md sez. 5): la struttura della pagina e' presunta stabile tra stagioni
 * passate perche' e' lo stesso template server-side, ma va confermato in produzione. */
const SEASONS = ["2025-26", "2024-25", "2023-24"];

function statsUrl(season: string): string {
  return `https://www.fantacalcio.it/statistiche-serie-a/${season}`;
}

const SELECTORS = {
  row: "table.pills-table tr.player-row",
  roleAttr: "data-filter-role-classic",
  name: ".player-name a span",
  team: "[data-col-key='sq']",
  appearances: "[data-col-key='pg']",
  averageRating: "[data-col-key='mv']",
  fantasyAvg: "[data-col-key='mfv']",
  goals: "[data-col-key='gol']",
  penalties: "[data-col-key='rig']", // formato "segnati / tirati", es. "1 / 1"
  assists: "[data-col-key='ass']",
  yellowCards: "[data-col-key='amm']",
  redCards: "[data-col-key='esp']",
};

const ROLE_MAP: Record<string, PlayerRole> = { p: "P", d: "D", c: "C", a: "A" };

function parseItalianNumber(raw: string): number {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

interface SeasonRow {
  name: string;
  team: string;
  role: PlayerRole;
  stats: ImportedSeasonStats;
}

async function fetchSeason(season: string): Promise<SeasonRow[]> {
  const res = await fetch(statsUrl(season), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Richiesta a fantacalcio.it/statistiche-serie-a/${season} fallita: HTTP ${res.status}`,
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const rows: SeasonRow[] = [];

  $(SELECTORS.row).each((_, row) => {
    const $row = $(row);
    const roleRaw = ($row.attr(SELECTORS.roleAttr) ?? "").toLowerCase();
    const role = ROLE_MAP[roleRaw];
    const name = $row.find(SELECTORS.name).first().text().trim();
    const team = $row.find(SELECTORS.team).first().text().trim();
    const appearances = Number($row.find(SELECTORS.appearances).first().text().trim()) || 0;

    if (!name || !role || appearances === 0) return; // riga vuota o giocatore senza presenze

    const [penaltiesScoredRaw] = $row.find(SELECTORS.penalties).first().text().trim().split("/");
    const penaltiesScored = Number((penaltiesScoredRaw ?? "0").trim()) || 0;

    rows.push({
      name,
      team,
      role,
      stats: {
        season,
        competition: "Serie A",
        appearances,
        averageRating: parseItalianNumber($row.find(SELECTORS.averageRating).first().text()),
        fantasyAvg: parseItalianNumber($row.find(SELECTORS.fantasyAvg).first().text()),
        goals: Number($row.find(SELECTORS.goals).first().text().trim()) || 0,
        assists: Number($row.find(SELECTORS.assists).first().text().trim()) || 0,
        yellowCards: Number($row.find(SELECTORS.yellowCards).first().text().trim()) || 0,
        redCards: Number($row.find(SELECTORS.redCards).first().text().trim()) || 0,
        penaltiesScored,
      },
    });
  });

  return rows;
}

export const fstatsConnector: ImportConnector = {
  id: "fstats",
  label: "FSTATS — Statistiche avanzate",
  reliability: 0.75,
  canCreatePlayers: false, // squadra come sigla a 3 lettere (es. "INT"), non il formato canonico

  async run(): Promise<PlayerImportRecord[]> {
    // Sequenziale, non Promise.all: stesso motivo di upsertPlayerImportRecords (gentile con la
    // pooled connection Neon a valle e con il sito sorgente, nessun bisogno di velocita' per
    // un aggiornamento manuale una tantum).
    const byPlayer = new Map<string, PlayerImportRecord>();
    const errors: string[] = [];

    for (const season of SEASONS) {
      let rows: SeasonRow[];
      try {
        rows = await fetchSeason(season);
      } catch (err) {
        // Una stagione passata con selettori non piu' validi (o pagina inesistente) non deve
        // far fallire l'intero connettore: si salta quella stagione e si prova la successiva.
        errors.push(err instanceof Error ? err.message : String(err));
        continue;
      }

      for (const row of rows) {
        const key = `${row.name}|${row.team}`;
        const existing = byPlayer.get(key);
        if (existing) {
          existing.seasonStats!.push(row.stats);
        } else {
          byPlayer.set(key, {
            name: row.name,
            team: row.team,
            role: row.role,
            seasonStats: [row.stats],
          });
        }
      }
    }

    if (byPlayer.size === 0) {
      throw new Error(
        [
          "Nessuna statistica estratta da nessuna delle stagioni configurate: i selettori CSS " +
            "vanno probabilmente aggiornati alla struttura attuale del sito (vedi SELECTORS in " +
            "cima al file).",
          ...errors,
        ].join(" — "),
      );
    }

    return [...byPlayer.values()];
  },
};
