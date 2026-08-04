import type { PlayerImportRecord } from "@sedinho/shared";
import { ConnectorNotImplementedError, type ImportConnector } from "../types.js";

/** Fantacalciopedia (FPEDIA) e' la fonte prevista per gerarchie di ruolo, rigoristi/tiratori
 * di punizioni e consigli d'acquisto (sez. 4 "Gerarchie" e "Calci piazzati"). E' storicamente
 * un sito a rendering server-side (Cheerio dovrebbe bastare, senza bisogno di Playwright),
 * ma la struttura reale delle pagine non e' stata verificata.
 *
 * Non implementato: il sandbox in cui e' stato scritto questo file non puo' raggiungere
 * fantacalciopedia.com (policy di rete) per ispezionare il markup.
 *
 * Per completarlo in locale, sul modello di connectors/fantacalcioIt.ts:
 *  1. `fetch` sulla scheda giocatore (o sull'elenco per ruolo/squadra).
 *  2. `cheerio.load(html)` e individuare i selettori per: livello di gerarchia
 *     (titolare/prima alternativa/seconda alternativa), rigorista 1/2/3, tiratore
 *     punizioni 1/2, mappandoli su HierarchyLevel/SetPieceType da
 *     packages/shared/src/types/player.ts.
 *  3. Sostituire il throw sotto con la logica reale. */
export const fantacalciopediaConnector: ImportConnector = {
  id: "fantacalciopedia",
  label: "Fantacalciopedia — Gerarchie e consigli",
  reliability: 0.7,

  async run(): Promise<PlayerImportRecord[]> {
    throw new ConnectorNotImplementedError(
      "fantacalciopedia",
      "selettori non verificabili dal sandbox di sviluppo (nessun accesso a internet), " +
        "vedi commento in cima al file",
    );
  },
};
