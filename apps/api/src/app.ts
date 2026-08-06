import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAuthGuard } from "./lib/authGuard.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { leagueRoutes } from "./routes/leagues.js";
import { playerRoutes } from "./routes/players.js";
import { importRoutes } from "./routes/import.js";
import { auctionRoutes } from "./routes/auction.js";
import { shortlistRoutes } from "./routes/shortlist.js";

/** Costruisce l'istanza Fastify senza avviare il listener: riusata sia dal dev locale
 * (index.ts, che chiama .listen()) sia dalla function serverless di Vercel
 * (../api/[...path].ts a livello di repo, che inoltra le richieste senza mai chiamare
 * .listen() — vedi CLAUDE.md sez. "Deploy"). */
export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });

  // Autenticazione (richiesta esplicitamente dall'utente, vedi CLAUDE.md sez. 5): registrata
  // prima di tutte le altre rotte, l'hook onRequest che aggiunge protegge tutto cio' che
  // registriamo dopo tranne health/register/login.
  await registerAuthGuard(app);
  await app.register(authRoutes);

  await app.register(healthRoutes);
  await app.register(leagueRoutes);
  await app.register(playerRoutes);
  await app.register(importRoutes);
  await app.register(auctionRoutes);
  await app.register(shortlistRoutes);

  return app;
}
