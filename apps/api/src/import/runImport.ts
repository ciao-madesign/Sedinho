import type { ImportRunSummary, ImportSourceResult } from "@sedinho/shared";
import type { ImportConnector } from "./types.js";
import { ConnectorNotImplementedError } from "./types.js";
import { upsertPlayerImportRecords } from "./upsert.js";
import { fantacalcioItConnector } from "./connectors/fantacalcioIt.js";
import { fstatsConnector } from "./connectors/fstats.js";
import { fantacalciopediaConnector } from "./connectors/fantacalciopedia.js";
import { evaluateAllPlayers } from "../lib/evaluation/evaluateAllPlayers.js";

/** Elenco dei connettori attivi. Aggiungere una nuova fonte = aggiungere un modulo che
 * implementa ImportConnector e registrarlo qui: l'orchestratore non va toccato altrimenti
 * (principio "Modularita'", CLAUDE.md sez. 2). */
const connectors: ImportConnector[] = [
  fantacalcioItConnector,
  fstatsConnector,
  fantacalciopediaConnector,
];

/** Esegue tutti i connettori registrati e fa il merge dei risultati nel DB (sez. 5,
 * "Aggiorna Database"). Chiamata solo dalla rotta POST /import/run, innescata a sua volta
 * solo da un click utente in UI: nessuno scheduler/cron la invoca mai (sez. 2,
 * "Aggiornamento manuale" — principio non negoziabile). */
export async function runImport(): Promise<ImportRunSummary> {
  const startedAt = new Date();
  const results: ImportSourceResult[] = [];

  for (const connector of connectors) {
    const t0 = Date.now();
    try {
      const records = await connector.run();
      const { upserted, errors } = await upsertPlayerImportRecords(records, {
        source: connector.id,
        reliability: connector.reliability,
      });
      results.push({
        source: connector.id,
        status: "success",
        recordsFound: records.length,
        recordsUpserted: upserted,
        errors,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      const skipped = err instanceof ConnectorNotImplementedError;
      results.push({
        source: connector.id,
        status: skipped ? "skipped" : "failed",
        recordsFound: 0,
        recordsUpserted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: Date.now() - t0,
      });
    }
  }

  // Ricalcola le PlayerEvaluation di tutti i giocatori a fine import (sez. 8): resta
  // un'unica azione manuale end-to-end (il click su "Aggiorna Database"), coerente col
  // principio "Aggiornamento manuale" — nessun pulsante/endpoint separato necessario.
  const evaluation = await evaluateAllPlayers();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results,
    evaluation,
  };
}
