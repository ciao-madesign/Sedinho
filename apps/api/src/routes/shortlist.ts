import type { FastifyInstance } from "fastify";
import type { HierarchyLevel, ShortlistEntryView } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";

/** Rotte per gli obiettivi d'asta dell'utente (sez. 9/11, richiesti esplicitamente per essere
 * "tenuti in vista anche durante l'asta"): Sedinho e' single-user, quindi nessuno scoping per
 * lega/partecipante, solo un elenco piatto di `ShortlistEntry`. */
export async function shortlistRoutes(app: FastifyInstance) {
  app.get("/shortlist", async (): Promise<ShortlistEntryView[]> => {
    const entries = await prisma.shortlistEntry.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        player: {
          include: {
            evaluations: { orderBy: { computedAt: "desc" }, take: 1 },
            hierarchies: true,
            setPieceRoles: true,
          },
        },
      },
    });

    // Se c'e' un'asta attiva, si arricchisce ogni riga con lo stato di vendita — stesso motivo
    // del pannello giocatori dell'asta (PlayersBrowserPanel): la shortlist deve restare
    // aggiornata "in diretta" durante l'asta, non solo fuori.
    const league = await prisma.league.findFirst();
    const activeAuction = league
      ? await prisma.auction.findFirst({
          where: { leagueId: league.id, endedAt: null },
          include: { entries: { include: { buyer: true } } },
        })
      : null;
    const soldByPlayerId = new Map(
      (activeAuction?.entries ?? []).map((entry) => [
        entry.playerId,
        { price: entry.price, buyerId: entry.buyerId, buyerName: entry.buyer.name },
      ]),
    );

    return entries.map((entry): ShortlistEntryView => {
      const latestEvaluation = entry.player.evaluations[0]
        ? toPlayerEvaluation(entry.player.evaluations[0])
        : null;
      const bestHierarchy = [...entry.player.hierarchies].sort(
        (a, b) => b.reliability - a.reliability,
      )[0];

      return {
        id: entry.id,
        playerId: entry.playerId,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
        player: {
          id: entry.player.id,
          name: entry.player.name,
          team: entry.player.team,
          role: entry.player.role as ShortlistEntryView["player"]["role"],
          birthDate: entry.player.birthDate ? entry.player.birthDate.toISOString() : null,
          availability: entry.player.availability as ShortlistEntryView["player"]["availability"],
          initialQuotation: entry.player.initialQuotation ?? null,
          valueScore: latestEvaluation?.value.valueScore ?? null,
          expectedAuctionPrice: latestEvaluation?.value.expectedAuctionPrice ?? null,
          starterProbability: latestEvaluation?.reliability.starterProbability ?? null,
          hierarchyLevel: (bestHierarchy?.level as HierarchyLevel | undefined) ?? null,
          setPieceTypes: entry.player.setPieceRoles.map(
            (sp) => sp.type as ShortlistEntryView["player"]["setPieceTypes"][number],
          ),
        },
        sold: soldByPlayerId.get(entry.playerId) ?? null,
      };
    });
  });

  app.post<{ Body: { playerId: string; note?: string } }>(
    "/shortlist",
    async (request, reply) => {
      const { playerId, note } = request.body;
      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player) return reply.code(400).send({ error: "Giocatore non trovato" });

      const existing = await prisma.shortlistEntry.findUnique({ where: { playerId } });
      if (existing) {
        return reply.code(409).send({ error: `${player.name} è già nella shortlist.` });
      }

      const created = await prisma.shortlistEntry.create({
        data: { playerId, note: note?.trim() || null },
      });
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string }; Body: { note?: string } }>(
    "/shortlist/:id",
    async (request, reply) => {
      const entry = await prisma.shortlistEntry.findUnique({ where: { id: request.params.id } });
      if (!entry) return reply.code(404).send({ error: "Obiettivo non trovato" });
      const updated = await prisma.shortlistEntry.update({
        where: { id: entry.id },
        data: { note: request.body.note?.trim() || null },
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>("/shortlist/:id", async (request, reply) => {
    const entry = await prisma.shortlistEntry.findUnique({ where: { id: request.params.id } });
    if (!entry) return reply.code(404).send({ error: "Obiettivo non trovato" });
    await prisma.shortlistEntry.delete({ where: { id: entry.id } });
    return { removed: true };
  });
}
