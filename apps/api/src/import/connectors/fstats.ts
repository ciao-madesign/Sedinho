import type { PlayerImportRecord } from "@sedinho/shared";
import { ConnectorNotImplementedError, type ImportConnector } from "../types.js";

/** FSTATS espone statistiche avanzate (xG, xA, tiri, ecc.) probabilmente dietro una dashboard
 * client-side: servira' Playwright (gia' installato come dipendenza di apps/api) per
 * renderizzare la pagina prima di poter estrarre i dati con selettori affidabili.
 *
 * Non implementato: il sandbox in cui e' stato scritto questo file non puo' raggiungere
 * fstats.it (policy di rete) per ispezionare la struttura reale delle pagine.
 *
 * Per completarlo in locale:
 *  1. `const browser = await chromium.launch()` (import { chromium } from "playwright"),
 *     aprire la pagina statistiche di un giocatore, ispezionare `await page.content()`
 *     o gli strumenti dev del browser per individuare i selettori giusti.
 *  2. Mappare i campi trovati sulla forma di `ImportedSeasonStats` (xG, xA, shots,
 *     shotsOnTarget, ...) da packages/shared/src/types/import.ts.
 *  3. Sostituire il throw sotto con la logica reale, sul modello di
 *     connectors/fantacalcioIt.ts (fetch/parse + errori per riga, non per l'intero batch). */
export const fstatsConnector: ImportConnector = {
  id: "fstats",
  label: "FSTATS — Statistiche avanzate",
  reliability: 0.75,

  async run(): Promise<PlayerImportRecord[]> {
    throw new ConnectorNotImplementedError(
      "fstats",
      "selettori non verificabili dal sandbox di sviluppo (nessun accesso a internet); " +
        "richiede Playwright per il rendering client-side, vedi commento in cima al file",
    );
  },
};
