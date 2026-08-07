import type { HierarchyLevel, PlayerRole } from "@sedinho/shared";
import { prisma } from "../../db/prisma.js";
import { computeTeamRotationProfiles, type RotationPlayerInput } from "./computeTeamRotationProfiles.js";

function latestSeason<T extends { season: string }>(seasons: T[]): T | undefined {
  return [...seasons].sort((a, b) => b.season.localeCompare(a.season))[0];
}

function bestHierarchyLevel(
  hierarchies: { level: string; reliability: number }[],
): HierarchyLevel | null {
  if (hierarchies.length === 0) return null;
  return [...hierarchies].sort((a, b) => b.reliability - a.reliability)[0]!.level as HierarchyLevel;
}

/** Confine DB del Rotation Engine (sez. 7): ricalcola e salva `TeamRotationProfile` per ogni
 * squadra con dati sufficienti, chiamato da `runImport` PRIMA di `evaluateAllPlayers` cosi' che
 * `reliability.rotationRisk` (già cablato in `computeReliabilityIndices`, finora sempre `null`
 * perché questa tabella era sempre vuota) inizi a popolarsi con un segnale reale. Preserva
 * `numberOfCompetitions` già impostato manualmente su una riga precedente (non sovrascritto con
 * il default 1 ad ogni "Aggiorna Database"). */
export async function updateTeamRotationProfiles(): Promise<number> {
  const [players, existingProfiles] = await Promise.all([
    prisma.player.findMany({ include: { seasonStats: true, hierarchies: true } }),
    prisma.teamRotationProfile.findMany({ select: { team: true, numberOfCompetitions: true } }),
  ]);

  const numberOfCompetitionsByTeam = Object.fromEntries(
    existingProfiles.map((p) => [p.team, p.numberOfCompetitions]),
  );

  const rotationInputs: RotationPlayerInput[] = players.map((player) => {
    const season = latestSeason(player.seasonStats);
    const minutesPerGame =
      season && season.appearances > 0 ? Number((season.minutes / season.appearances).toFixed(1)) : null;
    return {
      team: player.team,
      role: player.role as PlayerRole,
      hierarchyLevel: bestHierarchyLevel(player.hierarchies),
      minutesPerGame,
    };
  });

  const profiles = computeTeamRotationProfiles(rotationInputs, numberOfCompetitionsByTeam);

  for (const profile of profiles) {
    await prisma.teamRotationProfile.upsert({
      where: { team: profile.team },
      create: {
        team: profile.team,
        numberOfCompetitions: profile.numberOfCompetitions,
        turnoverFrequency: profile.turnoverFrequency,
        coachReliability: profile.coachReliability,
        turnoverProbabilityByRole: JSON.stringify(profile.turnoverProbabilityByRole),
        source: "computed",
      },
      update: {
        turnoverFrequency: profile.turnoverFrequency,
        coachReliability: profile.coachReliability,
        turnoverProbabilityByRole: JSON.stringify(profile.turnoverProbabilityByRole),
        source: "computed",
      },
    });
  }

  return profiles.length;
}
