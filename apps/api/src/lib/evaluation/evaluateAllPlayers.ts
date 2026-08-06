import type { HierarchyLevel, SetPieceType } from "@sedinho/shared";
import { prisma } from "../../db/prisma.js";
import { toPlayerEvaluationWriteData } from "../evaluation-mapper.js";
import { evaluatePlayer, type PlayerEvaluationInput } from "./evaluatePlayer.js";

export interface EvaluateAllPlayersSummary {
  evaluated: number;
  averageConfidence: number;
}

interface PlayerWithRelations {
  id: string;
  role: string;
  team: string;
  initialQuotation: number | null;
  seasonStats: {
    season: string;
    appearances: number;
    minutes: number;
    goals: number;
    assists: number;
    xG: number;
    xA: number;
    fantasyAvg: number;
    cleanSheets: number;
    injuryAbsenceRate: number | null;
  }[];
  hierarchies: { level: string; reliability: number }[];
  setPieceRoles: { type: string; probability: number }[];
}

/** Assembla l'input per `evaluatePlayer` (motore puro) a partire dalle righe Prisma di UN
 * giocatore + la distribuzione di quotazioni del suo ruolo (serve al percentile in value.ts).
 * Condiviso tra `evaluateAllPlayers` (tutti i giocatori) e `evaluateSinglePlayer` (un solo
 * giocatore, es. dopo un aggiornamento mirato come l'import infortuni da Transfermarkt). */
function buildEvaluationInput(
  player: PlayerWithRelations,
  rotation: { turnoverFrequency: number; coachReliability: number } | undefined,
  roleQuotations: number[],
): PlayerEvaluationInput {
  const bestHierarchy = [...player.hierarchies].sort((a, b) => b.reliability - a.reliability)[0];

  return {
    initialQuotation: player.initialQuotation ?? undefined,
    roleQuotations,
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
      injuryAbsenceRate: s.injuryAbsenceRate ?? null,
    })),
    hierarchy: bestHierarchy
      ? { level: bestHierarchy.level as HierarchyLevel, reliability: bestHierarchy.reliability }
      : undefined,
    rotation,
    setPieces: player.setPieceRoles.map((sp) => ({
      type: sp.type as SetPieceType,
      probability: sp.probability,
    })),
  };
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
    const rotation = rotationByTeam.get(player.team);
    const result = evaluatePlayer(
      buildEvaluationInput(player, rotation, quotationsByRole.get(player.role) ?? []),
    );

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

/** Ricalcola la `PlayerEvaluation` di UN solo giocatore, senza ricaricare l'intero DB: usata
 * dopo un aggiornamento mirato che tocca un giocatore alla volta (es. import infortuni da
 * Transfermarkt, on-demand dal dettaglio giocatore) invece di richiamare `evaluateAllPlayers`
 * (che ricalcolerebbe ~760 giocatori per un solo dato cambiato). La distribuzione di quotazioni
 * del ruolo resta comunque necessaria per il percentile (value.ts): query mirata, solo
 * `initialQuotation` dei giocatori dello stesso ruolo, non l'intera riga. */
export async function evaluateSinglePlayer(playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { seasonStats: true, hierarchies: true, setPieceRoles: true },
  });
  if (!player) return;

  const [rotation, roleQuotationRows] = await Promise.all([
    prisma.teamRotationProfile.findFirst({ where: { team: player.team } }),
    prisma.player.findMany({
      where: { role: player.role, initialQuotation: { not: null } },
      select: { initialQuotation: true },
    }),
  ]);

  const roleQuotations = roleQuotationRows
    .map((r) => r.initialQuotation)
    .filter((q): q is number => q !== null);

  const result = evaluatePlayer(
    buildEvaluationInput(
      player,
      rotation
        ? { turnoverFrequency: rotation.turnoverFrequency, coachReliability: rotation.coachReliability }
        : undefined,
      roleQuotations,
    ),
  );

  await prisma.playerEvaluation.create({ data: toPlayerEvaluationWriteData(player.id, result) });
}
