import type { FastifyInstance } from "fastify";
import type { PlayerListItem } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";
import { toTransfer } from "../lib/transfer-mapper.js";
import { toHierarchyChange } from "../lib/hierarchyChange-mapper.js";

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
        // Un giocatore fuori dal listone ufficiale (svincolato/uscito dalla Serie A) non deve
        // comparire in nessuna lista/statistica/media (richiesto esplicitamente dall'utente:
        // altera le statistiche e appesantisce le pagine senza utilità) — escluso qui, alla
        // fonte, cosi' ogni pagina che consuma GET /players (Giocatori, Dashboard, Confronti,
        // pannello giocatori dell'Asta) ne e' automaticamente libera senza filtrare da sola.
        // GET /players/:id resta SENZA questo filtro: un giocatore già in una rosa d'asta o
        // citato in un Trasferimento deve restare raggiungibile da un link diretto.
        delistedAt: null,
      },
      orderBy: { name: "asc" },
      include: {
        evaluations: { orderBy: { computedAt: "desc" }, take: 1 },
        hierarchies: true,
        setPieceRoles: true,
        seasonStats: { where: { competition: "Serie A" }, orderBy: { season: "desc" } },
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
      // "In crescita"/"in calo" (Dashboard, sez. 9): confronta la fantamedia delle 2 stagioni
      // Serie A più recenti con dato reale (`seasonStats` già ordinato desc per stagione). Un
      // giocatore con meno di 2 stagioni o senza presenze in una di esse resta `null`, mai una
      // stima su una sola stagione.
      const seasonsWithAvg = player.seasonStats.filter((s) => s.appearances > 0);
      const [latestSeason, previousSeason] = seasonsWithAvg;
      const fantasyAvgTrend =
        latestSeason && previousSeason
          ? Number((latestSeason.fantasyAvg - previousSeason.fantasyAvg).toFixed(2))
          : null;

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
        fantasyAvgTrend,
        fantasyAvg: latestSeason?.fantasyAvg ?? null,
      };
    });
  });

  // Trasferimenti recenti (sez. 6, Transfer Engine) per la sezione "Trasferimenti" della
  // Dashboard (sez. 9): non serve il dettaglio giocatore, solo l'evento + il playerId, il
  // frontend fa il join con la lista giocatori già caricata.
  app.get<{ Querystring: { limit?: string } }>("/transfers/recent", async (request) => {
    const limit = Math.min(Number(request.query.limit) || 10, 50);
    const transfers = await prisma.transfer.findMany({
      orderBy: { date: "desc" },
      take: limit,
    });
    return transfers.map(toTransfer);
  });

  // Cambi di gerarchia recenti (sez. 4 Dashboard "Cambi di gerarchia") — stesso pattern di
  // /transfers/recent: solo l'evento + playerId, il frontend fa il join con la lista giocatori
  // già caricata (e già filtrata dalla barra filtri).
  app.get<{ Querystring: { limit?: string } }>("/hierarchy-changes/recent", async (request) => {
    const limit = Math.min(Number(request.query.limit) || 10, 50);
    const changes = await prisma.playerHierarchyChange.findMany({
      orderBy: { date: "desc" },
      take: limit,
    });
    return changes.map(toHierarchyChange);
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
