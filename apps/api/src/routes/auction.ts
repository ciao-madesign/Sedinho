import type { FastifyInstance } from "fastify";
import type { ActiveAuctionState, ParticipantAuctionSummary, PlayerRole } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toLeagueConfig } from "../lib/league-mapper.js";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

async function getSingleLeague() {
  return prisma.league.findFirst();
}

/** Ricostruisce lo stato completo dell'asta (sez. 11: "ogni inserimento aggiornerà
 * immediatamente" budget residui e fabbisogni di ruolo), ricalcolato da zero ad ogni chiamata
 * invece di essere tenuto in cache: per la scala di un'asta personale (poche decine di
 * inserimenti) è più semplice e robusto di uno stato incrementale da tenere sincronizzato. */
async function buildActiveAuctionState(auctionId: string): Promise<ActiveAuctionState> {
  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: {
      entries: {
        orderBy: { timestamp: "desc" },
        include: { player: true, buyer: true },
      },
    },
  });
  const league = await prisma.league.findUniqueOrThrow({ where: { id: auction.leagueId } });
  const leagueConfig = toLeagueConfig(league);
  const participants = await prisma.participant.findMany({
    where: { leagueId: auction.leagueId },
    orderBy: { createdAt: "asc" },
  });

  const participantSummaries: ParticipantAuctionSummary[] = participants.map((participant) => {
    const ownEntries = auction.entries.filter((entry) => entry.buyerId === participant.id);
    const budgetSpent = ownEntries.reduce((sum, entry) => sum + entry.price, 0);

    const rosterCounts = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<
      PlayerRole,
      number
    >;
    for (const entry of ownEntries) {
      const role = entry.player.role as PlayerRole;
      rosterCounts[role] += 1;
    }
    const rosterNeeded = Object.fromEntries(
      ROLES.map((role) => [
        role,
        Math.max(0, leagueConfig.rosterComposition[role] - rosterCounts[role]),
      ]),
    ) as Record<PlayerRole, number>;

    return {
      id: participant.id,
      name: participant.name,
      isMe: participant.isMe,
      budgetSpent,
      budgetRemaining: leagueConfig.initialBudget - budgetSpent,
      rosterCounts,
      rosterNeeded,
    };
  });

  return {
    id: auction.id,
    leagueId: auction.leagueId,
    startedAt: auction.startedAt.toISOString(),
    entries: auction.entries.map((entry) => ({
      id: entry.id,
      price: entry.price,
      timestamp: entry.timestamp.toISOString(),
      player: {
        id: entry.player.id,
        name: entry.player.name,
        role: entry.player.role as PlayerRole,
        team: entry.player.team,
      },
      buyer: { id: entry.buyer.id, name: entry.buyer.name },
    })),
    participants: participantSummaries,
  };
}

/** Rotte per l'asta live (sez. 11). Nessun "valore di mercato"/"probabilità residue": dipendono
 * dal Market Engine (sez. 13), non ancora implementato — meglio ometterli che inventarli. */
export async function auctionRoutes(app: FastifyInstance) {
  app.get("/participants", async (_request, reply) => {
    const league = await getSingleLeague();
    if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });
    return prisma.participant.findMany({
      where: { leagueId: league.id },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post<{ Body: { names: string[]; meIndex?: number } }>(
    "/participants",
    async (request, reply) => {
      const league = await getSingleLeague();
      if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });

      const existing = await prisma.participant.count({ where: { leagueId: league.id } });
      if (existing > 0) {
        return reply
          .code(409)
          .send({ error: "I partecipanti sono già stati nominati per questa lega." });
      }

      const names = (request.body.names ?? []).map((name) => name.trim()).filter(Boolean);
      if (names.length !== league.participants) {
        return reply.code(400).send({
          error: `Servono esattamente ${league.participants} nomi (dal Setup Wizard), ricevuti ${names.length}.`,
        });
      }

      const created = await prisma.$transaction(
        names.map((name, index) =>
          prisma.participant.create({
            data: { leagueId: league.id, name, isMe: index === request.body.meIndex },
          }),
        ),
      );
      return reply.code(201).send(created);
    },
  );

  app.get("/auctions/active", async (_request, reply) => {
    const league = await getSingleLeague();
    if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });
    const auction = await prisma.auction.findFirst({
      where: { leagueId: league.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!auction) return reply.code(404).send({ error: "Nessuna asta attiva" });
    return buildActiveAuctionState(auction.id);
  });

  app.post("/auctions", async (_request, reply) => {
    const league = await getSingleLeague();
    if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });

    const participantsCount = await prisma.participant.count({ where: { leagueId: league.id } });
    if (participantsCount === 0) {
      return reply.code(400).send({ error: "Nomina prima i partecipanti (POST /participants)." });
    }

    const activeExisting = await prisma.auction.findFirst({
      where: { leagueId: league.id, endedAt: null },
    });
    if (activeExisting) {
      return reply
        .code(409)
        .send({ error: "Un'asta è già attiva.", auctionId: activeExisting.id });
    }

    const auction = await prisma.auction.create({ data: { leagueId: league.id } });
    return reply.code(201).send(await buildActiveAuctionState(auction.id));
  });

  app.post<{ Params: { id: string } }>("/auctions/:id/end", async (request, reply) => {
    const auction = await prisma.auction.findUnique({ where: { id: request.params.id } });
    if (!auction) return reply.code(404).send({ error: "Asta non trovata" });
    await prisma.auction.update({ where: { id: auction.id }, data: { endedAt: new Date() } });
    return { ended: true };
  });

  app.post<{
    Params: { id: string };
    Body: { playerId: string; price: number; buyerId: string };
  }>("/auctions/:id/entries", async (request, reply) => {
    const auction = await prisma.auction.findUnique({ where: { id: request.params.id } });
    if (!auction || auction.endedAt) {
      return reply.code(404).send({ error: "Asta non attiva" });
    }

    const { playerId, price, buyerId } = request.body;
    if (!Number.isFinite(price) || price <= 0) {
      return reply.code(400).send({ error: "Prezzo non valido" });
    }

    const [player, buyer] = await Promise.all([
      prisma.player.findUnique({ where: { id: playerId } }),
      prisma.participant.findUnique({ where: { id: buyerId } }),
    ]);
    if (!player) return reply.code(400).send({ error: "Giocatore non trovato" });
    if (!buyer || buyer.leagueId !== auction.leagueId) {
      return reply.code(400).send({ error: "Acquirente non valido" });
    }

    const alreadySold = await prisma.auctionEntry.findUnique({
      where: { auctionId_playerId: { auctionId: auction.id, playerId } },
    });
    if (alreadySold) {
      return reply.code(409).send({ error: `${player.name} è già stato assegnato in questa asta.` });
    }

    const stateBefore = await buildActiveAuctionState(auction.id);
    const buyerSummary = stateBefore.participants.find((p) => p.id === buyerId);
    if (buyerSummary && price > buyerSummary.budgetRemaining) {
      return reply.code(400).send({
        error: `Budget insufficiente: ${buyer.name} ha ${buyerSummary.budgetRemaining} crediti residui.`,
      });
    }

    await prisma.auctionEntry.create({ data: { auctionId: auction.id, playerId, price, buyerId } });
    return reply.code(201).send(await buildActiveAuctionState(auction.id));
  });

  app.delete<{ Params: { id: string; entryId: string } }>(
    "/auctions/:id/entries/:entryId",
    async (request, reply) => {
      const entry = await prisma.auctionEntry.findUnique({ where: { id: request.params.entryId } });
      if (!entry || entry.auctionId !== request.params.id) {
        return reply.code(404).send({ error: "Inserimento non trovato" });
      }
      await prisma.auctionEntry.delete({ where: { id: entry.id } });
      return buildActiveAuctionState(request.params.id);
    },
  );
}
