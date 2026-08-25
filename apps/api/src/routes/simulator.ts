import type { FastifyInstance } from "fastify";
import type { HierarchyLevel, PlayerRole } from "@sedinho/shared";
import { prisma } from "../db/prisma.js";
import { toLeagueConfig } from "../lib/league-mapper.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";
import { simulatePlayerAuction } from "../lib/simulator/simulatePlayerAuction.js";
import {
  simulateRosterSeason,
  type RosterSeasonPlayerInput,
} from "../lib/simulator/simulateRosterSeason.js";
import { buildActiveAuctionState } from "./auction.js";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

function bestHierarchyLevel(
  hierarchies: { level: string; reliability: number }[],
): HierarchyLevel | null {
  if (hierarchies.length === 0) return null;
  return [...hierarchies].sort((a, b) => b.reliability - a.reliability)[0]!.level as HierarchyLevel;
}

/** Rotta del Simulatore (sez. 15): Monte Carlo per un singolo giocatore alla volta, non
 * sull'intera asta (scope scelto esplicitamente con l'utente, vedi CLAUDE.md §5). Funziona
 * anche "prima dell'asta" (spec): se e' passato un `auctionId` usa i dati reali dell'asta in
 * corso (rivali/inflazione veri, come il Decision Engine), altrimenti una stima generica dalla
 * sola composizione rosa della lega — meno precisa, dichiarata come tale in ogni risposta. */
export async function simulatorRoutes(app: FastifyInstance) {
  app.post<{
    Body: { playerId: string; myBudget: number; auctionId?: string; iterations?: number };
  }>("/simulate/player", async (request, reply) => {
    const { playerId, myBudget, auctionId, iterations } = request.body;
    if (!Number.isFinite(myBudget) || myBudget <= 0) {
      return reply.code(400).send({ error: "myBudget deve essere un numero positivo" });
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { hierarchies: true, evaluations: { orderBy: { computedAt: "desc" }, take: 1 } },
    });
    if (!player) return reply.code(400).send({ error: "Giocatore non trovato" });

    const league = await prisma.league.findFirst();
    if (!league) return reply.code(404).send({ error: "Nessuna lega configurata" });
    const leagueConfig = toLeagueConfig(league);

    const evaluation = player.evaluations[0] ? toPlayerEvaluation(player.evaluations[0]) : null;
    const baselinePrice = evaluation?.value.expectedAuctionPrice ?? player.initialQuotation;
    if (baselinePrice === null) {
      return reply
        .code(400)
        .send({ error: "Nessuna quotazione o valutazione disponibile per questo giocatore." });
    }

    const role = player.role as PlayerRole;

    let rivalsInNeed: number;
    let marketInflation = 0;
    let dataSource: "auction" | "generic";

    if (auctionId) {
      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
      if (!auction) return reply.code(404).send({ error: "Asta non trovata" });
      const state = await buildActiveAuctionState(auction.id);
      rivalsInNeed = state.participants.filter((p) => p.rosterNeeded[role] > 0).length;
      marketInflation = state.market.roleDeflation[role] ?? state.market.priceInflation;
      dataSource = "auction";
    } else {
      // Proxy generico pre-asta (nessuna asta in corso): quota di slot di rosa dedicati a
      // questo ruolo sul totale, applicata al numero di partecipanti previsti dal Setup Wizard
      // (meno "io") — non sappiamo ancora chi sono i rivali ne' cosa hanno gia' comprato, e'
      // solo una stima di quanti probabilmente cercheranno questo ruolo prima o poi.
      const roleSlots = leagueConfig.rosterComposition[role];
      const totalSlots = ROLES.reduce((sum, r) => sum + leagueConfig.rosterComposition[r], 0);
      const roleShare = totalSlots > 0 ? roleSlots / totalSlots : 0;
      rivalsInNeed = Math.max(0, Math.round(roleShare * Math.max(0, leagueConfig.participants - 1)));
      dataSource = "generic";
    }

    const result = simulatePlayerAuction({
      playerId: player.id,
      baselinePrice,
      confidence: evaluation?.explanation.confidence ?? 0.3,
      hierarchyLevel: bestHierarchyLevel(player.hierarchies),
      valueScore: evaluation?.value.valueScore ?? null,
      rivalsInNeed,
      marketInflation,
      dataSource,
      myBudget,
      iterations,
    });

    return result;
  });

  // Simulatore di rosa (sez. 15, secondo blocco): rendimento stagionale atteso per un insieme
  // di giocatori già scelto (rosa d'asta reale o lista Obiettivi/shortlist) — il frontend decide
  // quali playerId passare, questa rotta non ha bisogno di sapere la provenienza. Non simula
  // l'asta: scope scelto esplicitamente con l'utente al posto di estendere anche a quello (vedi
  // CLAUDE.md §5, stesso limite di dati comportamentali del Simulatore per-giocatore).
  app.post<{ Body: { playerIds: string[]; iterations?: number } }>(
    "/simulate/roster",
    async (request, reply) => {
      const { playerIds, iterations } = request.body;
      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        return reply.code(400).send({ error: "playerIds deve essere un array non vuoto" });
      }

      const players = await prisma.player.findMany({
        where: { id: { in: playerIds } },
        include: { evaluations: { orderBy: { computedAt: "desc" }, take: 1 } },
      });

      const inputs: RosterSeasonPlayerInput[] = [];
      let excludedCount = 0;
      for (const player of players) {
        const evaluation = player.evaluations[0] ? toPlayerEvaluation(player.evaluations[0]) : null;
        const expectedFantasyPoints = evaluation?.production.expectedFantasyPoints ?? null;
        if (expectedFantasyPoints === null) {
          excludedCount += 1;
          continue;
        }
        inputs.push({
          playerId: player.id,
          name: player.name,
          role: player.role as PlayerRole,
          expectedFantasyPoints,
          starterProbability: evaluation?.reliability.starterProbability ?? null,
          floorScore: evaluation?.stability.floorScore ?? null,
          ceilingScore: evaluation?.stability.ceilingScore ?? null,
          volatilityIndex: evaluation?.stability.volatilityIndex ?? null,
        });
      }
      // playerId richiesti ma non trovati nel DB (es. rimossi) contano come esclusi anche loro.
      excludedCount += playerIds.length - players.length;

      if (inputs.length === 0) {
        return reply
          .code(400)
          .send({ error: "Nessun giocatore della selezione ha una produzione attesa nota (serve FSTATS)." });
      }

      const result = simulateRosterSeason({ players: inputs, excludedCount, iterations });
      return result;
    },
  );
}
