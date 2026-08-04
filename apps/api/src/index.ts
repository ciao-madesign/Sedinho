import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { leagueRoutes } from "./routes/leagues.js";
import { playerRoutes } from "./routes/players.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(healthRoutes);
await app.register(leagueRoutes);
await app.register(playerRoutes);

const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
