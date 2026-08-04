import type { FastifyInstance } from "fastify";
import { runImport } from "../import/runImport.js";

/** Rotta per il pulsante "Aggiorna Database" (sez. 5). Va chiamata solo da un'azione utente
 * esplicita nel frontend: nessun cron/interval deve mai invocarla (sez. 2, "Aggiornamento
 * manuale"). Sincrona per semplicita': se in futuro i connettori diventano lenti (es. pagine
 * Playwright multiple), valutare di renderla asincrona con polling di stato. */
export async function importRoutes(app: FastifyInstance) {
  app.post("/import/run", async () => {
    return runImport();
  });
}
