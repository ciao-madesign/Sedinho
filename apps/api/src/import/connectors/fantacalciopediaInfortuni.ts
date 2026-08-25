import * as cheerio from "cheerio";
import type { PlayerAvailability, PlayerImportRecord, PlayerRole } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

/** Verificato dal vivo (agosto 2026, stessa rotta di debug su Vercel usata per gli altri
 * connettori — vedi CLAUDE.md §5/§8): la pagina "Lista infortunati Serie A aggiornata" ha due
 * sezioni con markup molto diverso:
 * 1. In alto, una card per ogni giocatore ATTUALMENTE infortunato (`div.giocatore` con
 *    l'icona `img.inf_calc`): nome (`h3.tit_calc`, formato "COGNOME NOME") e ruolo (`span.label`,
 *    testo "POR"/"DIF"/"CEN"/"ATT") — struttura affidabile, stesso pattern già usato dal
 *    connettore gerarchie (`fantacalciopedia.ts`, anch'esso legge `h3.tit_calc`).
 * 2. Più sotto, un paragrafo di TESTO LIBERO per squadra ("Fuori Adams e Ismajli fino a metà
 *    Maggio. Zapata nuovamente out, rientro per inizio Maggio. In dubbio Aboukhlal.") con
 *    l'unica etichetta strutturata riconoscibile essendo "Squalificati: Nome1, Nome2." — il
 *    resto (tipo di infortunio, data di rientro) è prosa italiana non strutturata, diversa da
 *    squadra a squadra: provare a estrarla via selettori/regex rischierebbe di produrre dati
 *    sbagliati o mal attribuiti (stesso principio già seguito per non stimare
 *    `injuryAbsenceRate` da fonti non affidabili, vedi CLAUDE.md §5) — quindi NON viene fatto.
 *    Solo la lista "Squalificati" viene letta, perché l'etichetta è un'ancora affidabile.
 * Risultato: `availability` reale (infortunato/squalificato) per chi compare in queste due
 * liste; "in dubbio"/tipo di infortunio/data di rientro restano fuori scope, onestamente non
 * disponibili in forma strutturata da questa fonte. */
const URL =
  "https://www.fantacalciopedia.com/articoli-fcp/consigli-fantacalcio/75-lista-infortunati-serie-a-aggiornata.html";

const ROLE_LABELS: Record<string, PlayerRole> = {
  POR: "P",
  DIF: "D",
  CEN: "C",
  ATT: "A",
};

async function fetchHtml(): Promise<string> {
  const res = await fetch(URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Richiesta a ${URL} fallita: HTTP ${res.status}`);
  }
  return res.text();
}

function parseInjuredCards($: cheerio.CheerioAPI): PlayerImportRecord[] {
  const records: PlayerImportRecord[] = [];

  $("div.giocatore").each((_, el) => {
    const $card = $(el);
    if ($card.find("img.inf_calc").length === 0) return; // solo card di infortunati confermati

    const name = $card.find("h3.tit_calc").first().text().trim();
    if (!name) return;

    const roleLabel = $card.find("span.label").first().text().trim().toUpperCase();
    const role = ROLE_LABELS[roleLabel];

    records.push({
      name,
      team: "", // non nel formato a 3 lettere del resto del DB, match per nome (vedi upsert.ts)
      role,
      availability: "injured",
    });
  });

  return records;
}

function parseSuspendedNames($: cheerio.CheerioAPI): PlayerImportRecord[] {
  const records: PlayerImportRecord[] = [];

  $("p").each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^Squalificati:?\s*(.*)$/i);
    if (!match) return;

    const namesPart = (match[1] ?? "").replace(/\.$/, "").trim();
    if (!namesPart || /^nessuno$/i.test(namesPart)) return;

    for (const rawName of namesPart.split(",")) {
      const name = rawName.replace(/\.$/, "").trim();
      if (!name) continue;
      records.push({ name, team: "", availability: "suspended" as PlayerAvailability });
    }
  });

  return records;
}

export const fantacalciopediaInfortuniConnector: ImportConnector = {
  id: "fantacalciopedia-infortuni",
  label: "Fantacalciopedia — Infortunati e squalificati",
  reliability: 0.75,
  canCreatePlayers: false, // nomi non nel formato canonico "Nome Cognome" del listone quotazioni

  async run(): Promise<PlayerImportRecord[]> {
    const html = await fetchHtml();
    const $ = cheerio.load(html);

    const records = [...parseInjuredCards($), ...parseSuspendedNames($)];
    if (records.length === 0) {
      throw new Error(
        "Nessun dato estratto: i selettori CSS vanno probabilmente aggiornati alla " +
          "struttura attuale della pagina (vedi commenti in cima al file).",
      );
    }

    return records;
  },
};
