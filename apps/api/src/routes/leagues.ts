import type { FastifyInstance } from "fastify";
import type { LeagueDraft } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toLeagueConfig, toLeagueWriteData } from "../lib/league-mapper.js";

/** Rotte per la configurazione della lega, prodotte dal Setup Wizard (sez. 3).
 * Sedinho e' un'app personale per un singolo fantallenatore: al piu' una League
 * esiste per volta (vedi CLAUDE.md, decisione "singola lega attiva"). */
export async function leagueRoutes(app: FastifyInstance) {
  app.get("/leagues", async () => {
    const rows = await prisma.league.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toLeagueConfig);
  });

  app.get<{ Params: { id: string } }>("/leagues/:id", async (request, reply) => {
    const row = await prisma.league.findUnique({ where: { id: request.params.id } });
    if (!row) {
      return reply.code(404).send({ error: "League not found" });
    }
    return toLeagueConfig(row);
  });

  app.post<{ Body: LeagueDraft }>("/leagues", async (request, reply) => {
    const existing = await prisma.league.findFirst();
    if (existing) {
      return reply.code(409).send({
        error: "A league already exists. Use PUT /leagues/:id to update it.",
        existingId: existing.id,
      });
    }
    const row = await prisma.league.create({ data: toLeagueWriteData(request.body) });
    return reply.code(201).send(toLeagueConfig(row));
  });

  app.put<{ Params: { id: string }; Body: LeagueDraft }>(
    "/leagues/:id",
    async (request, reply) => {
      const existing = await prisma.league.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ error: "League not found" });
      }
      const row = await prisma.league.update({
        where: { id: request.params.id },
        data: toLeagueWriteData(request.body),
      });
      return toLeagueConfig(row);
    },
  );
}
