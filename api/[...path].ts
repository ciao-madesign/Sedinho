import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "@sedinho/api";

/** Function serverless Vercel: inoltra ogni richiesta /api/* all'app Fastify di
 * @sedinho/api (sez. "Deploy" in CLAUDE.md). L'istanza viene riutilizzata tra invocazioni
 * quando il container resta "caldo" (evita di ricreare il pool di connessioni Prisma ad
 * ogni richiesta). Le rotte Fastify sono registrate senza prefisso /api (stessa
 * convenzione del proxy di sviluppo Vite): il prefisso va rimosso prima di inoltrare. */
let appPromise: ReturnType<typeof buildApp> | undefined;

function getApp() {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  await app.ready();

  if (req.url) {
    req.url = req.url.replace(/^\/api/, "") || "/";
  }

  app.server.emit("request", req, res);
}
