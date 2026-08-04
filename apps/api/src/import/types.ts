import type { ImportSourceId, PlayerImportRecord } from "@sedinho/shared";

/** Un connettore verso una fonte dati esterna (sez. 5). Ogni fonte e' un modulo
 * intercambiabile: aggiungerne una nuova non richiede toccare l'orchestratore
 * (import/runImport.ts) oltre a registrarla nell'elenco dei connettori (principio
 * "Modularita'", CLAUDE.md sez. 2). */
export interface ImportConnector {
  id: ImportSourceId;
  label: string;
  /** Affidabilita' di base di questa fonte (0..1), usata come reliability di default
   * per i record che produce quando vengono salvati nel DB. */
  reliability: number;
  run(): Promise<PlayerImportRecord[]>;
}

/** Segnala un connettore volutamente non ancora completato (selettori da verificare in
 * locale, vedi commenti nei singoli connettori). L'orchestratore lo riconosce e riporta
 * lo stato "skipped" invece di "failed", per distinguere un lavoro non ancora fatto da
 * un errore reale durante uno scraping. */
export class ConnectorNotImplementedError extends Error {
  constructor(connectorId: string, detail: string) {
    super(`Connettore "${connectorId}" non ancora completato: ${detail}`);
    this.name = "ConnectorNotImplementedError";
  }
}
