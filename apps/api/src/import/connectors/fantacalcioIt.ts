import * as cheerio from "cheerio";
import type { PlayerImportRecord, PlayerRole } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

const QUOTATIONS_URL = "https://www.fantacalcio.it/quotazioni-fantacalcio";

/** Selettori CSS per il listone quotazioni ufficiali, verificati dal vivo (agosto 2026)
 * tramite una rotta di debug temporanea deployata su Vercel (il sandbox di sviluppo non
 * ha accesso a internet, vedi CLAUDE.md). Il ruolo Classic e' esposto come attributo
 * `data-filter-role-classic` sulla riga stessa (es. "p"|"d"|"c"|"a"), non come testo di un
 * elemento figlio. Se il markup cambia di nuovo, questo e' l'unico punto da aggiornare. */
const SELECTORS = {
  tableRow: "table.pills-table tr.player-row",
  roleAttr: "data-filter-role-classic",
  name: ".player-name",
  team: ".player-team",
  quotationClassic: ".player-classic-initial-price",
};

const ROLE_MAP: Record<string, PlayerRole> = { p: "P", d: "D", c: "C", a: "A" };

export const fantacalcioItConnector: ImportConnector = {
  id: "fantacalcio-it",
  label: "Fantacalcio.it — Quotazioni ufficiali",
  reliability: 0.9,
  canCreatePlayers: true, // unica fonte con nome completo + squadra nel formato canonico

  async run(): Promise<PlayerImportRecord[]> {
    const res = await fetch(QUOTATIONS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
      },
    });
    if (!res.ok) {
      throw new Error(`Richiesta a Fantacalcio.it fallita: HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const records: PlayerImportRecord[] = [];

    $(SELECTORS.tableRow).each((_, row) => {
      const $row = $(row);
      const roleRaw = ($row.attr(SELECTORS.roleAttr) ?? "").toLowerCase();
      const name = $row.find(SELECTORS.name).first().text().trim();
      const team = $row.find(SELECTORS.team).first().text().trim();
      const quotationRaw = $row.find(SELECTORS.quotationClassic).first().text().trim();

      if (!name || !team) return; // riga di intestazione o vuota, ignorata

      const role = ROLE_MAP[roleRaw];
      const quotation = Number(quotationRaw.replace(/[^\d]/g, ""));

      records.push({
        name,
        team,
        role,
        initialQuotation: Number.isFinite(quotation) && quotation > 0 ? quotation : undefined,
      });
    });

    if (records.length === 0) {
      throw new Error(
        "Nessun record estratto dal listone: i selettori CSS in questo connettore vanno " +
          "probabilmente aggiornati alla struttura attuale del sito (vedi commento SELECTORS " +
          "in cima al file).",
      );
    }

    return records;
  },
};
