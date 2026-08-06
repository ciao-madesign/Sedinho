import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { prisma } from "../db/prisma.js";
import { SESSION_COOKIE_NAME } from "./auth.js";

/** Rotte raggiungibili senza sessione valida: health check e i due endpoint che servono
 * proprio a crearne una. Tutto il resto richiede un cookie di sessione valido — richiesto
 * esplicitamente dall'utente per impedire che chiunque trovi l'URL pubblico possa vedere/
 * modificare la lega (vedi CLAUDE.md sez. 5). */
const PUBLIC_PATHS = new Set(["/health", "/auth/register", "/auth/login"]);

/** Registra il cookie parser e un hook `onRequest` globale che popola `request.user` da un
 * cookie di sessione valido (join su `Session`/`User`, sessioni scadute ignorate) e rifiuta con
 * 401 le richieste non pubbliche senza una sessione valida. Va registrato prima delle altre
 * rotte in `app.ts`. */
export async function registerAuthGuard(app: FastifyInstance) {
  await app.register(cookie);
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;

    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (session && session.expiresAt > new Date()) {
        request.user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        };
      }
    }

    if (!PUBLIC_PATHS.has(path) && !request.user) {
      reply.code(401).send({ error: "Non autenticato" });
    }
  });
}
