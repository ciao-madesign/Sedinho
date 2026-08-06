import type { FastifyInstance } from "fastify";
import type { PlayerListItem } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";

interface ListPlayersQuery {
  role?: string;
  team?: string;
  search?: string;
}

/** Rotte di lettura del database centrale dei giocatori (sez. 4, 9). */
export async function playerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListPlayersQuery }>("/players", async (request) => {
    const { role, team, search } = request.query;
    const players = await prisma.player.findMany({
      where: {
        role: role || undefined,
        team: team || undefined,
        name: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { name: "asc" },
      include: {
        evaluations: { orderBy: { computedAt: "desc" }, take: 1 },
        hierarchies: true,
        setPieceRoles: true,
      },
    });

    // Riga snella (PlayerListItem): solo il riassunto della PlayerEvaluation più recente, non
    // l'intera Explanation con tutti i factors (troppo pesante per ~700 giocatori in un colpo
    // solo). Il dettaglio completo resta su GET /players/:id.
    return players.map((player): PlayerListItem => {
      const latestEvaluation = player.evaluations[0]
        ? toPlayerEvaluation(player.evaluations[0])
        : null;
      // Più fonti possono aver scritto una PlayerHierarchy per lo stesso giocatore: si tiene
      // quella con la reliability più alta.
      const bestHierarchy = [...player.hierarchies].sort(
        (a, b) => b.reliability - a.reliability,
      )[0];

      return {
        id: player.id,
        name: player.name,
        team: player.team,
        role: player.role as PlayerListItem["role"],
        birthDate: player.birthDate ? player.birthDate.toISOString() : null,
        availability: player.availability as PlayerListItem["availability"],
        initialQuotation: player.initialQuotation ?? null,
        valueScore: latestEvaluation?.value.valueScore ?? null,
        expectedAuctionPrice: latestEvaluation?.value.expectedAuctionPrice ?? null,
        starterProbability: latestEvaluation?.reliability.starterProbability ?? null,
        hierarchyLevel: (bestHierarchy?.level as PlayerListItem["hierarchyLevel"]) ?? null,
        setPieceTypes: player.setPieceRoles.map(
          (setPiece) => setPiece.type as PlayerListItem["setPieceTypes"][number],
        ),
        confidence: latestEvaluation?.explanation.confidence ?? null,
      };
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
