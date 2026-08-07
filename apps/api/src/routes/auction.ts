import type { FastifyInstance } from "fastify";
import type {
  ActiveAuctionState,
  HierarchyLevel,
  ParticipantAuctionSummary,
  PlayerAvailability,
  PlayerRole,
} from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toLeagueConfig } from "../lib/league-mapper.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";
import { computeMarketState } from "../lib/market/computeMarketState.js";
import { computeOpponentProfiles } from "../lib/opponents/computeOpponentProfiles.js";
import {
  ALTERNATIVE_VALUE_SCORE_TOLERANCE,
  computeDecisionRecommendation,
} from "../lib/decision/computeDecisionRecommendation.js";
import { rankPoolCandidates } from "../lib/decision/rankPoolCandidates.js";
import { computeRosterRadar } from "../lib/roster/computeRosterRadar.js";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

async function getSingleLeague() {
  return prisma.league.findFirst();
}

// Un titolare/riserva per giocatore (una fonte puo' aver scritto piu' righe PlayerHierarchy per
// lo stesso giocatore): si tiene quella con la reliability piu' alta, stesso criterio di
// routes/players.ts.
function bestHierarchyLevel(
  hierarchies: { level: string; reliability: number }[],
): HierarchyLevel | null {
  if (hierarchies.length === 0) return null;
  return [...hierarchies].sort((a, b) => b.reliability - a.reliability)[0]!.level as HierarchyLevel;
}

/** Ricostruisce lo stato completo dell'asta (sez. 11: "ogni inserimento aggiornerà
 * immediatamente" budget residui e fabbisogni di ruolo), ricalcolato da zero ad ogni chiamata
 * invece di essere tenuto in cache: per la scala di un'asta personale (poche decine di
 * inserimenti) è più semplice e robusto di uno stato incrementale da tenere sincronizzato. */
export async function buildActiveAuctionState(auctionId: string): Promise<ActiveAuctionState> {
  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: {
      entries: {
        where: { revokedAt: null },
        orderBy: { timestamp: "desc" },
        include: {
          player: { include: { hierarchies: true } },
          buyer: true,
        },
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

  const remainingBudgetTotal = participantSummaries.reduce(
    (sum, p) => sum + p.budgetRemaining,
    0,
  );

  // Un titolare per giocatore (una fonte puo' avere scritto piu' righe PlayerHierarchy per lo
  // stesso giocatore, vedi league-mapper.ts pattern analogo su GET /players): serve un elenco
  // deduplicato per non gonfiare lo scarsità dei titolari.
  const starterRows = await prisma.playerHierarchy.findMany({
    where: { level: "starter" },
    distinct: ["playerId"],
    select: { playerId: true, player: { select: { role: true } } },
  });
  const soldPlayerIds = new Set(auction.entries.map((entry) => entry.playerId));
  const starters = starterRows.map((row) => ({
    role: row.player.role as PlayerRole,
    sold: soldPlayerIds.has(row.playerId),
  }));

  const market = computeMarketState({
    auctionId: auction.id,
    entries: auction.entries.map((entry) => ({
      role: entry.player.role as PlayerRole,
      price: entry.price,
      quotation: entry.player.initialQuotation ?? null,
      timestamp: entry.timestamp.toISOString(),
    })),
    remainingBudgetTotal,
    starters,
  });

  // Valutazione completa per giocatore (piu' righe PlayerEvaluation storiche per lo stesso
  // giocatore, ordinate per computedAt desc: si tiene solo la prima incontrata, la piu'
  // recente). Riusata sia per il valueScore dei profili avversari sia per bonus/stabilita' del
  // radar di rosa sotto — un'unica query invece di due.
  const evaluationRows = await prisma.playerEvaluation.findMany({
    where: { playerId: { in: [...new Set(auction.entries.map((e) => e.playerId))] } },
    orderBy: { computedAt: "desc" },
  });
  const evaluationByPlayerId = new Map<string, ReturnType<typeof toPlayerEvaluation>>();
  for (const row of evaluationRows) {
    if (!evaluationByPlayerId.has(row.playerId)) {
      evaluationByPlayerId.set(row.playerId, toPlayerEvaluation(row));
    }
  }

  const opponents = computeOpponentProfiles({
    participants: participantSummaries.map((p) => ({
      participantId: p.id,
      remainingBudget: p.budgetRemaining,
    })),
    entries: auction.entries.map((entry) => ({
      participantId: entry.buyerId,
      price: entry.price,
      team: entry.player.team,
      quotation: entry.player.initialQuotation ?? null,
      valueScore: evaluationByPlayerId.get(entry.playerId)?.value.valueScore ?? null,
      birthDate: entry.player.birthDate ? entry.player.birthDate.toISOString() : null,
    })),
  });

  // Radar di rosa (richiesto esplicitamente dall'utente, non in spec): un profilo per
  // partecipante dai soli giocatori gia' acquistati in questa asta, riusando la stessa
  // valutazione gia' recuperata sopra (nessun nuovo dato raccolto).
  const rosterRadar = computeRosterRadar({
    participants: participantSummaries.map((p) => ({
      participantId: p.id,
      players: auction.entries
        .filter((entry) => entry.buyerId === p.id)
        .map((entry) => {
          const evaluation = evaluationByPlayerId.get(entry.playerId);
          return {
            role: entry.player.role as PlayerRole,
            birthDateIso: entry.player.birthDate ? entry.player.birthDate.toISOString() : null,
            hierarchyLevel: bestHierarchyLevel(entry.player.hierarchies),
            valueScore: evaluation?.value.valueScore ?? null,
            bonus: evaluation
              ? {
                  penaltyPotential: evaluation.bonus.penaltyPotential,
                  freeKickPotential: evaluation.bonus.freeKickPotential,
                  cleanSheetPotential: evaluation.bonus.cleanSheetPotential,
                  assistPotential: evaluation.bonus.assistPotential,
                }
              : { penaltyPotential: null, freeKickPotential: null, cleanSheetPotential: null, assistPotential: null },
            stability: evaluation
              ? {
                  consistencyIndex: evaluation.stability.consistencyIndex,
                  volatilityIndex: evaluation.stability.volatilityIndex,
                }
              : { consistencyIndex: null, volatilityIndex: null },
          };
        }),
    })),
    totalRosterSlots: ROLES.reduce((sum, role) => sum + leagueConfig.rosterComposition[role], 0),
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
    market,
    opponents,
    rosterRadar,
  };
}

/** Rotte per l'asta live (sez. 11), incluso lo stato del Market Engine (sez. 13, vedi
 * lib/market/computeMarketState.ts) e i profili avversari (sez. 12, vedi
 * lib/opponents/computeOpponentProfiles.ts). "Migliori opportunità" resta assente: dipende dal
 * Decision Engine (sez. 14), non ancora implementato — meglio ometterlo che inventarlo. */
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

  // Tratti manuali sull'avversario (richiesto esplicitamente dall'utente, non in spec): niente
  // storico delle scorse edizioni della lega disponibile, quindi l'utente fornisce la propria
  // conoscenza diretta invece che il sistema la calcoli da zero (vedi CLAUDE.md sez. 5). Restano
  // sempre `number | null`/`string | null`: nessun default fittizio, "non impostato" e' uno
  // stato esplicito distinto da uno slider a 0.
  app.patch<{
    Params: { id: string };
    Body: {
      preferredTeam?: string | null;
      bidTendency?: number | null;
      spendingStyle?: number | null;
      scoutingStyle?: number | null;
    };
  }>("/participants/:id", async (request, reply) => {
    const participant = await prisma.participant.findUnique({ where: { id: request.params.id } });
    if (!participant) return reply.code(404).send({ error: "Partecipante non trovato" });

    const { preferredTeam, bidTendency, spendingStyle, scoutingStyle } = request.body;
    for (const [key, value] of Object.entries({ bidTendency, spendingStyle, scoutingStyle })) {
      if (value !== undefined && value !== null && (value < 0 || value > 1)) {
        return reply.code(400).send({ error: `${key} deve essere tra 0 e 1.` });
      }
    }

    const updated = await prisma.participant.update({
      where: { id: participant.id },
      data: {
        ...(preferredTeam !== undefined && { preferredTeam }),
        ...(bidTendency !== undefined && { bidTendency }),
        ...(spendingStyle !== undefined && { spendingStyle }),
        ...(scoutingStyle !== undefined && { scoutingStyle }),
      },
    });
    return updated;
  });

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

  // Cancella tutti i Participant e le Auction (con relativi AuctionEntry, in cascata) della
  // lega: pensata per fare prove prima dell'asta vera senza doversi portare dietro dati di
  // test — richiesta esplicita dell'utente, non usata da nessun flusso automatico.
  app.post("/auctions/reset", async (_request, reply) => {
    const league = await getSingleLeague();
    if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });

    await prisma.auction.deleteMany({ where: { leagueId: league.id } });
    await prisma.participant.deleteMany({ where: { leagueId: league.id } });

    return { reset: true };
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

    const alreadySold = await prisma.auctionEntry.findFirst({
      where: { auctionId: auction.id, playerId, revokedAt: null },
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
      if (!entry || entry.auctionId !== request.params.id || entry.revokedAt) {
        return reply.code(404).send({ error: "Inserimento non trovato" });
      }
      // Soft-delete (revokedAt), non un DELETE vero: cosi' "Annulla ultima azione" può
      // ripristinare anche una rimozione fatta da qui, non solo dal pulsante dedicato.
      await prisma.auctionEntry.update({
        where: { id: entry.id },
        data: { revokedAt: new Date() },
      });
      return buildActiveAuctionState(request.params.id);
    },
  );

  // "Annulla ultima azione" (sez. 11, richiesto esplicitamente dall'utente): trova l'evento
  // più recente tra tutti gli inserimenti dell'asta — o la creazione di un inserimento attivo
  // (campo `timestamp`) o la rimozione di uno annullato (campo `revokedAt`) — e lo inverte.
  // Un solo livello di undo (l'ultimo evento), non uno storico completo: coerente con lo scope
  // "solo asta live" scelto esplicitamente, non un undo generico per tutta l'app.
  app.post<{ Params: { id: string } }>("/auctions/:id/undo", async (request, reply) => {
    const auction = await prisma.auction.findUnique({ where: { id: request.params.id } });
    if (!auction) return reply.code(404).send({ error: "Asta non trovata" });

    const [lastActive, lastRevoked] = await Promise.all([
      prisma.auctionEntry.findFirst({
        where: { auctionId: auction.id, revokedAt: null },
        orderBy: { timestamp: "desc" },
        include: { player: true, buyer: true },
      }),
      prisma.auctionEntry.findFirst({
        where: { auctionId: auction.id, revokedAt: { not: null } },
        orderBy: { revokedAt: "desc" },
        include: { player: true, buyer: true },
      }),
    ]);

    const lastActiveAt = lastActive?.timestamp.getTime() ?? -Infinity;
    const lastRevokedAt = lastRevoked?.revokedAt?.getTime() ?? -Infinity;

    if (lastActiveAt === -Infinity && lastRevokedAt === -Infinity) {
      return reply.code(400).send({ error: "Niente da annullare in questa asta." });
    }

    let undone: { type: "assign" | "remove"; playerName: string; buyerName: string };
    if (lastRevokedAt > lastActiveAt) {
      // L'ultimo evento e' stata una rimozione: la si ripristina.
      await prisma.auctionEntry.update({
        where: { id: lastRevoked!.id },
        data: { revokedAt: null },
      });
      undone = { type: "remove", playerName: lastRevoked!.player.name, buyerName: lastRevoked!.buyer.name };
    } else {
      // L'ultimo evento e' stata un'assegnazione: la si annulla (soft-delete).
      await prisma.auctionEntry.update({
        where: { id: lastActive!.id },
        data: { revokedAt: new Date() },
      });
      undone = { type: "assign", playerName: lastActive!.player.name, buyerName: lastActive!.buyer.name };
    }

    return { undone, state: await buildActiveAuctionState(auction.id) };
  });

  // Decision Engine (sez. 14): risponde on-demand per un candidato specifico (giocatore +
  // eventuale prezzo proposto), non pre-calcolato per tutti i giocatori ad ogni poll
  // dell'asta — non avrebbe senso calcolare una raccomandazione per centinaia di giocatori
  // ogni volta che lo stato dell'asta viene ricaricato.
  app.post<{
    Params: { id: string };
    Body: { playerId: string; buyerId?: string; candidatePrice?: number };
  }>("/auctions/:id/decision", async (request, reply) => {
    const auction = await prisma.auction.findUnique({ where: { id: request.params.id } });
    if (!auction) return reply.code(404).send({ error: "Asta non trovata" });

    const { playerId, buyerId, candidatePrice } = request.body;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { hierarchies: true },
    });
    if (!player) return reply.code(400).send({ error: "Giocatore non trovato" });

    const [state, latestEvaluationRow] = await Promise.all([
      buildActiveAuctionState(auction.id),
      prisma.playerEvaluation.findFirst({
        where: { playerId },
        orderBy: { computedAt: "desc" },
      }),
    ]);

    const role = player.role as PlayerRole;
    const buyerSummary = buyerId ? state.participants.find((p) => p.id === buyerId) : undefined;
    const rivalsInNeed = state.participants.filter(
      (p) => p.id !== buyerId && p.rosterNeeded[role] > 0,
    ).length;

    const latestEvaluation = latestEvaluationRow ? toPlayerEvaluation(latestEvaluationRow) : null;

    // "Conviene attendere?" (sez. 14): altri giocatori dello stesso ruolo, ancora liberi in
    // questa asta, con valueScore comparabile (entro ALTERNATIVE_VALUE_SCORE_TOLERANCE).
    let alternativesAvailable: number | null = null;
    if (latestEvaluation?.value.valueScore !== null && latestEvaluation?.value.valueScore !== undefined) {
      const candidateValueScore = latestEvaluation.value.valueScore;
      const soldPlayerIds = new Set(state.entries.map((e) => e.player.id));
      const roleRows = await prisma.player.findMany({
        where: { role, id: { notIn: [...soldPlayerIds, playerId] } },
        select: { id: true },
      });
      const roleEvaluations = await prisma.playerEvaluation.findMany({
        where: { playerId: { in: roleRows.map((r) => r.id) } },
        orderBy: { computedAt: "desc" },
      });
      const seen = new Set<string>();
      let count = 0;
      for (const row of roleEvaluations) {
        if (seen.has(row.playerId)) continue;
        seen.add(row.playerId);
        const vs = toPlayerEvaluation(row).value.valueScore;
        if (vs !== null && Math.abs(vs - candidateValueScore) <= ALTERNATIVE_VALUE_SCORE_TOLERANCE) {
          count += 1;
        }
      }
      alternativesAvailable = count;
    }

    // "Rischio rosa" e "coppia" (sez. 14): rosa gia' posseduta dall'acquirente, solo se e' stato
    // passato un buyerId (altrimenti le due domande non sono applicabili).
    let buyerRoster:
      | { team: string; availability: PlayerAvailability; hierarchyLevel: HierarchyLevel | null }[]
      | null = null;
    if (buyerId) {
      const buyerPlayerIds = state.entries.filter((e) => e.buyer.id === buyerId).map((e) => e.player.id);
      const buyerPlayers =
        buyerPlayerIds.length > 0
          ? await prisma.player.findMany({
              where: { id: { in: buyerPlayerIds } },
              include: { hierarchies: true },
            })
          : [];
      buyerRoster = buyerPlayers.map((p) => ({
        team: p.team,
        availability: p.availability as PlayerAvailability,
        hierarchyLevel: bestHierarchyLevel(p.hierarchies),
      }));
    }

    const recommendation = computeDecisionRecommendation({
      player: {
        id: player.id,
        name: player.name,
        role,
        team: player.team,
        availability: player.availability as PlayerAvailability,
        hierarchyLevel: bestHierarchyLevel(player.hierarchies),
        initialQuotation: player.initialQuotation,
      },
      evaluation: latestEvaluation
        ? {
            expectedAuctionPrice: latestEvaluation.value.expectedAuctionPrice,
            valueScore: latestEvaluation.value.valueScore,
            confidence: latestEvaluation.explanation.confidence,
          }
        : null,
      market: {
        priceInflation: state.market.priceInflation,
        roleDeflation: state.market.roleDeflation[role] ?? null,
        marketTemperature: state.market.marketTemperature,
      },
      rivalsInNeed,
      buyer: buyerSummary
        ? { remainingBudget: buyerSummary.budgetRemaining, rosterNeeded: buyerSummary.rosterNeeded[role] }
        : null,
      candidatePrice: candidatePrice ?? null,
      alternativesAvailable,
      buyerRoster,
    });

    return recommendation;
  });

  // Decision Engine sul pool (sez. 14): "miglior rapporto qualità/prezzo" e "chi dovrei
  // chiamare adesso" — le uniche 2 domande della spec che confrontano piu' giocatori invece di
  // uno solo. On-demand come /decision, non pre-calcolato ad ogni poll.
  app.post<{
    Params: { id: string };
    Body: { mode: "value-for-money" | "next-call"; role?: PlayerRole; buyerId?: string; limit?: number };
  }>("/auctions/:id/decision/pool", async (request, reply) => {
    const auction = await prisma.auction.findUnique({ where: { id: request.params.id } });
    if (!auction) return reply.code(404).send({ error: "Asta non trovata" });

    const { mode, role, buyerId, limit } = request.body;
    if (mode !== "value-for-money" && mode !== "next-call") {
      return reply.code(400).send({ error: "mode deve essere value-for-money o next-call" });
    }

    const state = await buildActiveAuctionState(auction.id);
    const soldPlayerIds = new Set(state.entries.map((e) => e.player.id));
    const buyerSummary = buyerId ? state.participants.find((p) => p.id === buyerId) : undefined;

    const players = await prisma.player.findMany({
      where: { id: { notIn: [...soldPlayerIds] }, role: role || undefined },
      include: { evaluations: { orderBy: { computedAt: "desc" }, take: 1 } },
    });

    const pool = players.map((p) => {
      const evaluation = p.evaluations[0] ? toPlayerEvaluation(p.evaluations[0]) : null;
      const baseline = evaluation?.value.expectedAuctionPrice ?? p.initialQuotation ?? null;
      const roleAdjustment =
        state.market.roleDeflation[p.role as PlayerRole] ?? state.market.priceInflation;
      const adjustedPrice = baseline !== null ? Math.round(baseline * (1 + roleAdjustment)) : null;
      return {
        id: p.id,
        name: p.name,
        role: p.role as PlayerRole,
        team: p.team,
        adjustedPrice,
        expectedFantasyPoints: evaluation?.production.expectedFantasyPoints ?? null,
      };
    });

    const rivalsInNeedByRole = Object.fromEntries(
      ROLES.map((r) => [
        r,
        state.participants.filter((p) => p.id !== buyerId && p.rosterNeeded[r] > 0).length,
      ]),
    ) as Partial<Record<PlayerRole, number>>;

    const result = rankPoolCandidates(pool, {
      mode,
      role: role ?? null,
      myNeededRoles: buyerSummary
        ? ROLES.filter((r) => buyerSummary.rosterNeeded[r] > 0)
        : [],
      rivalsInNeedByRole,
      budgetRemaining: buyerSummary?.budgetRemaining ?? null,
      limit: limit ?? 8,
    });

    return result;
  });
}
