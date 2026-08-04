import * as cheerio from "cheerio";
import type { PlayerImportRecord, PlayerRole } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

const QUOTATIONS_URL = "https://www.fantacalcio.it/quotazioni-fantacalcio";

/** Selettori CSS per il listone quotazioni ufficiali. NON VERIFICATI dal vivo: il sandbox
 * di sviluppo in cui e' stato scritto questo file non ha accesso a internet (policy di rete),
 * quindi sono una stima ragionevole della struttura nota del sito, da confermare/correggere
 * eseguendo `npm run dev:api` in locale e chiamando POST /import/run. Se il markup del sito
 * e' cambiato, questo e' l'unico punto da aggiornare: la logica sotto resta valida finche'
 * ogni riga della tabella espone ruolo, nome, squadra e quotazione in qualche forma. */
const SELECTORS = {
  tableRow: "table.table-players tbody tr, table.player-table tbody tr",
  role: ".player-role, td:nth-child(1)",
  name: ".player-name, td:nth-child(3)",
  team: ".player-team, td:nth-child(4)",
  quotationClassic: ".price-classic, td:nth-child(5)",
};

const ROLE_MAP: Record<string, PlayerRole> = { P: "P", D: "D", C: "C", A: "A" };

export const fantacalcioItConnector: ImportConnector = {
  id: "fantacalcio-it",
  label: "Fantacalcio.it — Quotazioni ufficiali",
  reliability: 0.9,

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
      const roleRaw = $row.find(SELECTORS.role).first().text().trim().toUpperCase();
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
