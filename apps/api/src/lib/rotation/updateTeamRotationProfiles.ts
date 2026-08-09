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

/** Squadre di Serie A impegnate in una coppa europea nella stagione 2026-27 (dato pubblico,
 * verificato via ricerca web incrociata su piu' fonti — Sky Sport, Calcio e Finanza, Wikipedia
 * "2026-27 UEFA Champions/Europa/Conference League" — il 9 agosto 2026, non uno scraping):
 * Champions League Inter/Napoli/Roma/Como, Europa League Milan/Juventus, Conference League
 * Atalanta (7 squadre in totale, coerente con "Italia avrà 7 squadre nelle coppe nel 2026-27"
 * dopo la riduzione del posto Champions aggiuntivo). Chiave = sigla a 3 lettere di
 * Fantacalcio.it come da `Player.team` (CLAUDE.md §5): "INT"/"ATA" sono confermate da una
 * verifica diretta in produzione in una sessione precedente, le altre (NAP/ROM/COM/MIL/JUV)
 * seguono lo stesso pattern "prime 3 lettere del nome" ma NON sono state riconfermate contro
 * dati reali in produzione in questa sessione (nessun accesso a Neon/fantacalcio.it da qui,
 * vedi §5) — se al prossimo "Aggiorna Database" una di queste squadre non risultasse con
 * `numberOfCompetitions` maggiorato, il problema più probabile e' qui, non nel motore. Ogni
 * squadra non in questa mappa resta a 1 (sola Serie A) — mai un valore inventato per le coppe. */
const EUROPEAN_COMPETITIONS_2026_27 = new Set(["INT", "NAP", "ROM", "COM", "MIL", "JUV", "ATA"]);

/** Confine DB del Rotation Engine (sez. 7): ricalcola e salva `TeamRotationProfile` per ogni
 * squadra con dati sufficienti, chiamato da `runImport` PRIMA di `evaluateAllPlayers` cosi' che
 * `reliability.rotationRisk` (già cablato in `computeReliabilityIndices`, finora sempre `null`
 * perché questa tabella era sempre vuota) inizi a popolarsi con un segnale reale.
 * `numberOfCompetitions` viene da EUROPEAN_COMPETITIONS_2026_27 sopra (dato reale, va aggiornato
 * a mano ad ogni fine stagione quando cambiano le squadre europee — stesso spirito di
 * PREVIOUS_SEASON in fstats.ts), non più un default fisso a 1 per tutti. */
export async function updateTeamRotationProfiles(): Promise<number> {
  const players = await prisma.player.findMany({ include: { seasonStats: true, hierarchies: true } });

  const numberOfCompetitionsByTeam = Object.fromEntries(
    [...new Set(players.map((p) => p.team))].map((team) => [
      team,
      EUROPEAN_COMPETITIONS_2026_27.has(team) ? 2 : 1,
    ]),
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
