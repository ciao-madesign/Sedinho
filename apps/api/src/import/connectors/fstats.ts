import * as cheerio from "cheerio";
import type { PlayerImportRecord, PlayerRole } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

/** "FSTATS" era un nome di fonte segnaposto, mai una URL reale (fstats.it non risolve in
 * rete). Verificato dal vivo (agosto 2026, stessa tecnica del debug-proxy su Vercel usata per
 * fantacalcio.it/quotazioni, vedi CLAUDE.md): fantacalcio.it pubblica anche una pagina
 * statistiche server-side per stagione, `/statistiche-serie-a/{stagione}`. La stagione
 * corrente (2026/27) e' ancora a 0 presenze/voti perche' non e' ancora iniziata: si usa quindi
 * l'ultima stagione completata come fonte di dati storici reali. **Va aggiornata manualmente
 * di anno in anno** (nessun calcolo automatico della "stagione precedente": la spec vieta
 * comunque ogni automazione, sez. 2 "Aggiornamento manuale"). */
const PREVIOUS_SEASON = "2025-26";
const STATS_URL = `https://www.fantacalcio.it/statistiche-serie-a/${PREVIOUS_SEASON}`;

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

export const fstatsConnector: ImportConnector = {
  id: "fstats",
  label: "FSTATS — Statistiche avanzate",
  reliability: 0.75,

  async run(): Promise<PlayerImportRecord[]> {
    const res = await fetch(STATS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
      },
    });
    if (!res.ok) {
      throw new Error(`Richiesta a fantacalcio.it/statistiche-serie-a fallita: HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const records: PlayerImportRecord[] = [];

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

      records.push({
        name,
        team,
        role,
        seasonStats: [
          {
            season: PREVIOUS_SEASON,
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
        ],
      });
    });

    if (records.length === 0) {
      throw new Error(
        "Nessuna statistica estratta dalla pagina: i selettori CSS vanno probabilmente " +
          "aggiornati alla struttura attuale del sito (vedi commento SELECTORS in cima al file).",
      );
    }

    return records;
  },
};
