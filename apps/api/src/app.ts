import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { leagueRoutes } from "./routes/leagues.js";
import { playerRoutes } from "./routes/players.js";
import { importRoutes } from "./routes/import.js";
import { debugRoutes } from "./routes/debug.js";

/** Costruisce l'istanza Fastify senza avviare il listener: riusata sia dal dev locale
 * (index.ts, che chiama .listen()) sia dalla function serverless di Vercel
 * (../api/[...path].ts a livello di repo, che inoltra le richieste senza mai chiamare
 * .listen() — vedi CLAUDE.md sez. "Deploy"). */
export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(healthRoutes);
  await app.register(leagueRoutes);
  await app.register(playerRoutes);
  await app.register(importRoutes);
  await app.register(debugRoutes);

  return app;
}
