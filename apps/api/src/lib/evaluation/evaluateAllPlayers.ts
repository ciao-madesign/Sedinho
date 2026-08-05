import type { HierarchyLevel, SetPieceType } from "@sedinho/shared";
import { prisma } from "../../db/prisma.js";
import { toPlayerEvaluationWriteData } from "../evaluation-mapper.js";
import { evaluatePlayer } from "./evaluatePlayer.js";

export interface EvaluateAllPlayersSummary {
  evaluated: number;
  averageConfidence: number;
}

/** Ricalcola e salva la `PlayerEvaluation` di ogni giocatore nel DB (sez. 8). Sequenziale
 * (non `Promise.all`) perche' in produzione `DATABASE_URL` e' una connessione pooled Neon con
 * `connection_limit=1` (vedi CLAUDE.md sez. 8 "Deploy"): query concorrenti si limiterebbero a
 * mettersi in coda comunque. Alla scala di un singolo utente/lega (poche centinaia di
 * giocatori) va bene, coerente con la stessa scelta gia' fatta per `upsertPlayerImportRecords`. */
export async function evaluateAllPlayers(): Promise<EvaluateAllPlayersSummary> {
  const players = await prisma.player.findMany({
    include: { seasonStats: true, hierarchies: true, setPieceRoles: true },
  });
  const rotationProfiles = await prisma.teamRotationProfile.findMany();
  const rotationByTeam = new Map(rotationProfiles.map((r) => [r.team, r]));

  const quotationsByRole = new Map<string, number[]>();
  for (const player of players) {
    if (player.initialQuotation === null || player.initialQuotation === undefined) continue;
    const list = quotationsByRole.get(player.role) ?? [];
    list.push(player.initialQuotation);
    quotationsByRole.set(player.role, list);
  }

  let totalConfidence = 0;

  for (const player of players) {
    const bestHierarchy = [...player.hierarchies].sort(
      (a, b) => b.reliability - a.reliability,
    )[0];
    const rotation = rotationByTeam.get(player.team);

    const result = evaluatePlayer({
      initialQuotation: player.initialQuotation ?? undefined,
      roleQuotations: quotationsByRole.get(player.role) ?? [],
      seasons: player.seasonStats.map((s) => ({
        season: s.season,
        appearances: s.appearances,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        xG: s.xG,
        xA: s.xA,
        fantasyAvg: s.fantasyAvg,
        cleanSheets: s.cleanSheets,
      })),
      hierarchy: bestHierarchy
        ? { level: bestHierarchy.level as HierarchyLevel, reliability: bestHierarchy.reliability }
        : undefined,
      rotation: rotation
        ? {
            turnoverFrequency: rotation.turnoverFrequency,
            coachReliability: rotation.coachReliability,
          }
        : undefined,
      setPieces: player.setPieceRoles.map((sp) => ({
        type: sp.type as SetPieceType,
        probability: sp.probability,
      })),
    });

    await prisma.playerEvaluation.create({
      data: toPlayerEvaluationWriteData(player.id, result),
    });
    totalConfidence += result.explanation.confidence;
  }

  return {
    evaluated: players.length,
    averageConfidence: players.length > 0 ? Number((totalConfidence / players.length).toFixed(2)) : 0,
  };
}
