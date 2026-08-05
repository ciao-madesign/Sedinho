import * as cheerio from "cheerio";
import type { PlayerImportRecord, PlayerRole, SetPieceType } from "@sedinho/shared";
import type { ImportConnector } from "../types.js";

/** Verificato dal vivo (agosto 2026, stesso debug-proxy su Vercel usato per fantacalcio.it,
 * vedi CLAUDE.md): fantacalciopedia.com e' server-side (Cheerio basta, niente Playwright).
 * Due fonti reali usate qui:
 * 1. Le liste filtrate `/lista-calciatori-serie-a/{ruolo}/titolare` (una request per ruolo):
 *    ogni giocatore elencato E' per definizione classificato "titolare" dalla fonte stessa.
 *    Non fabrichiamo livelli per chi non compare in lista (nessuna "prima/seconda riserva"
 *    reale disponibile senza aprire 600+ pagine giocatore singole, non praticabile in una
 *    function serverless): chi non e' nella lista titolari resta senza `PlayerHierarchy`,
 *    piu' onesto di un livello indovinato (principio "Spiegabile", CLAUDE.md sez. 2).
 * 2. L'articolo annuale "Rigoristi e tiratori": per squadra elenca, in ORDINE, chi tira
 *    rigori/punizioni/angoli. L'ordine e' reale; la probabilita' numerica assegnata a ogni
 *    posizione (vedi RANK_PROBABILITY) e' invece una curva euristica dichiarata, non un dato
 *    misurato — stesso spirito del resto del motore (vedi lib/evaluation/value.ts). */
const BASE_URL = "https://www.fantacalciopedia.com";
const RIGORISTI_URL = `${BASE_URL}/articoli-fcp/consigli-fantacalcio/216-rigoristi-e-tiratori-2026-27.html`;

const ROLE_LISTS: { path: string; role: PlayerRole }[] = [
  { path: "portieri", role: "P" },
  { path: "difensori", role: "D" },
  { path: "centrocampisti", role: "C" },
  { path: "attaccanti", role: "A" },
];

const TITOLARE_RELIABILITY = 0.8;

const PENALTY_TYPES: SetPieceType[] = ["penalty-1", "penalty-2", "penalty-3"];
const PENALTY_RANK_PROBABILITY = [0.75, 0.2, 0.1];
const FREE_KICK_TYPES: SetPieceType[] = ["direct-free-kick-1", "direct-free-kick-2"];
const FREE_KICK_RANK_PROBABILITY = [0.6, 0.3];
const CORNER_RANK_PROBABILITY = 0.5;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Richiesta a ${url} fallita: HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchHierarchyRecords(): Promise<PlayerImportRecord[]> {
  const records: PlayerImportRecord[] = [];

  for (const { path, role } of ROLE_LISTS) {
    const html = await fetchHtml(`${BASE_URL}/lista-calciatori-serie-a/${path}/titolare`);
    const $ = cheerio.load(html);
    const names = new Set<string>();

    $("h3.tit_calc").each((_, el) => {
      const name = $(el).text().trim();
      if (name) names.add(name);
    });

    for (const name of names) {
      records.push({
        name,
        team: "", // non esposto su questa lista; il match avviene per nome (vedi import/upsert.ts)
        role,
        hierarchy: { level: "starter", reliability: TITOLARE_RELIABILITY },
      });
    }
  }

  return records;
}

interface TeamSetPieces {
  team: string;
  rigoristi: string[];
  puniz: string[];
  corner: string[];
}

function parseRigoristiSections(html: string): TeamSetPieces[] {
  const $ = cheerio.load(html);
  const sections: TeamSetPieces[] = [];

  $("h2").each((_, el) => {
    const heading = $(el).text().trim();
    const match = heading.match(/^Tiratori (.+?) \d{4}\/\d{2}$/i);
    if (!match?.[1]) return;
    const team = match[1].trim();
    const list = $(el).nextAll("ul").first();
    if (!list.length) return;

    const rigoristi: string[] = [];
    const puniz: string[] = [];
    const corner: string[] = [];

    list.find("li").each((_, li) => {
      const $li = $(li);
      const label = $li.find("strong").first().text().toLowerCase();
      const namesText = $li.text().replace($li.find("strong").first().text(), "").trim();
      const names = namesText
        .split(",")
        .map((n) => n.replace(/\.$/, "").trim())
        .filter(Boolean);

      if (label.includes("rigorist")) rigoristi.push(...names);
      else if (label.includes("punizion")) puniz.push(...names);
      else if (label.includes("angolo")) corner.push(...names);
    });

    sections.push({ team, rigoristi, puniz, corner });
  });

  return sections;
}

async function fetchSetPieceRecords(): Promise<PlayerImportRecord[]> {
  const html = await fetchHtml(RIGORISTI_URL);
  const sections = parseRigoristiSections(html);

  const byName = new Map<string, { team: string; setPieces: Map<SetPieceType, number> }>();
  const add = (team: string, name: string, type: SetPieceType, probability: number) => {
    const entry = byName.get(name) ?? { team, setPieces: new Map<SetPieceType, number>() };
    entry.setPieces.set(type, probability);
    byName.set(name, entry);
  };

  for (const section of sections) {
    section.rigoristi.forEach((name, i) => {
      const type = PENALTY_TYPES[i];
      const probability = PENALTY_RANK_PROBABILITY[i];
      if (type && probability !== undefined) add(section.team, name, type, probability);
    });
    section.puniz.forEach((name, i) => {
      const type = FREE_KICK_TYPES[i];
      const probability = FREE_KICK_RANK_PROBABILITY[i];
      if (type && probability !== undefined) add(section.team, name, type, probability);
    });
    const firstCorner = section.corner[0];
    if (firstCorner) add(section.team, firstCorner, "corner", CORNER_RANK_PROBABILITY);
  }

  return Array.from(byName.entries()).map(([name, { team, setPieces }]) => ({
    name,
    team,
    setPieces: Array.from(setPieces.entries()).map(([type, probability]) => ({
      type,
      probability,
    })),
  }));
}

export const fantacalciopediaConnector: ImportConnector = {
  id: "fantacalciopedia",
  label: "Fantacalciopedia — Gerarchie e consigli",
  reliability: 0.7,
  canCreatePlayers: false, // nomi come "BARELLA NICOLO'"/solo cognome, squadra non sempre nota

  async run(): Promise<PlayerImportRecord[]> {
    const [hierarchyRecords, setPieceRecords] = await Promise.all([
      fetchHierarchyRecords(),
      fetchSetPieceRecords(),
    ]);

    const records = [...hierarchyRecords, ...setPieceRecords];
    if (records.length === 0) {
      throw new Error(
        "Nessun dato estratto: i selettori CSS vanno probabilmente aggiornati alla " +
          "struttura attuale del sito (vedi commenti in cima al file).",
      );
    }

    return records;
  },
};
