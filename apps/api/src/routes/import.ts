import type { FastifyInstance } from "fastify";
import { runImport } from "../import/runImport.js";
import { runTransfermarktInjuries } from "../import/transfermarktInjuries.js";

/** Rotta per il pulsante "Aggiorna Database" (sez. 5). Va chiamata solo da un'azione utente
 * esplicita nel frontend: nessun cron/interval deve mai invocarla (sez. 2, "Aggiornamento
 * manuale"). Sincrona per semplicita': se in futuro i connettori diventano lenti (es. pagine
 * Playwright multiple), valutare di renderla asincrona con polling di stato. */
export async function importRoutes(app: FastifyInstance) {
  app.post("/import/run", async () => {
    return runImport();
  });

  // Azione separata da "Aggiorna Database", richiesta esplicitamente dall'utente: importa lo
  // storico infortuni da Transfermarkt solo per i giocatori con quotazione più alta (vedi
  // import/transfermarktInjuries.ts per il perché non è incorporata nel giro standard).
  app.post("/import/injuries", async () => {
    return runTransfermarktInjuries();
  });
}
