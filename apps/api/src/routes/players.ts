import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";

interface ListPlayersQuery {
  role?: string;
  team?: string;
}

/** Rotte di lettura del database centrale dei giocatori (sez. 4, 9). */
export async function playerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListPlayersQuery }>("/players", async (request) => {
    const { role, team } = request.query;
    return prisma.player.findMany({
      where: {
        role: role || undefined,
        team: team || undefined,
      },
      orderBy: { name: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/players/:id", async (request, reply) => {
    const player = await prisma.player.findUnique({
      where: { id: request.params.id },
      include: {
        seasonStats: true,
        hierarchies: true,
        setPieceRoles: true,
        transfers: true,
        evaluations: { orderBy: { computedAt: "desc" }, take: 1 },
      },
    });
    if (!player) {
      return reply.code(404).send({ error: "Player not found" });
    }
    // Il confine JSON-string <-> tipi condivisi va sempre attraversato tramite il mapper
    // dedicato (vedi lib/evaluation-mapper.ts), mai esponendo le stringhe serializzate.
    return { ...player, evaluations: player.evaluations.map(toPlayerEvaluation) };
  });
}
