import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

interface CreateLeagueBody {
  name: string;
  participants: number;
  initialBudget: number;
  rosterComposition: Record<string, number>;
  allowedModules: string[];
  auctionMode: string;
  callOrder: Record<string, unknown>;
  rulesText: string;
  parsedRules?: unknown[];
}

/** Rotte per la configurazione della lega, prodotte dal Setup Wizard (sez. 3). */
export async function leagueRoutes(app: FastifyInstance) {
  app.get("/leagues", async () => {
    return prisma.league.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.get<{ Params: { id: string } }>("/leagues/:id", async (request, reply) => {
    const league = await prisma.league.findUnique({ where: { id: request.params.id } });
    if (!league) {
      return reply.code(404).send({ error: "League not found" });
    }
    return league;
  });

  app.post<{ Body: CreateLeagueBody }>("/leagues", async (request, reply) => {
    const body = request.body;
    const league = await prisma.league.create({
      data: {
        name: body.name,
        participants: body.participants,
        initialBudget: body.initialBudget,
        rosterComposition: JSON.stringify(body.rosterComposition),
        allowedModules: JSON.stringify(body.allowedModules),
        auctionMode: body.auctionMode,
        callOrder: JSON.stringify(body.callOrder),
        rulesText: body.rulesText,
        parsedRules: JSON.stringify(body.parsedRules ?? []),
      },
    });
    return reply.code(201).send(league);
  });
}
