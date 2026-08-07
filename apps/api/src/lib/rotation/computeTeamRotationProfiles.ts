import type { HierarchyLevel, PlayerRole } from "@sedinho/shared";

export interface RotationPlayerInput {
  team: string;
  role: PlayerRole;
  hierarchyLevel: HierarchyLevel | null;
  /** Minuti per partita nell'ultima stagione con statistiche disponibili (FSTATS), `null` se
   * nessun dato. */
  minutesPerGame: number | null;
}

export interface TeamRotationProfileResult {
  team: string;
  turnoverFrequency: number;
  coachReliability: number;
  numberOfCompetitions: number;
  turnoverProbabilityByRole: Partial<Record<PlayerRole, number>>;
}

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];
// Nessuna fonte reale di "affidabilità allenatore" (quanto e' prevedibile nelle scelte di
// formazione) e' disponibile: valore neutro fisso, non calibrato — la differenziazione tra
// squadre viene comunque da turnoverFrequency, calcolato dai dati reali sotto.
const NEUTRAL_COACH_RELIABILITY = 0.5;
// +15% di turnover stimato per ogni competizione oltre alla sola Serie A (Champions/Europa/
// Conference/Coppa Italia, sez. 7): euristica dichiarata, non calibrata su dati reali di
// affaticamento/calendario. `numberOfCompetitions` di default vale 1 per tutte le squadre
// (nessun elenco verificato delle squadre nelle coppe 2026-27 disponibile in questa sessione,
// vedi CLAUDE.md §5) finche' non viene impostato manualmente.
const COMPETITION_MULTIPLIER_STEP = 0.15;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Rotation Engine (sez. 7), motore puro: nessuna dipendenza da Prisma/HTTP. `turnoverFrequency`
 * e' un segnale REALE (non un dato inventato) derivato dai minuti per partita già raccolti da
 * FSTATS — rapporto tra i minuti medi delle riserve (gerarchia non-titolare) e quelli dei
 * titolari per la stessa squadra: più è vicino a 1, più quella squadra fa giocare le riserve
 * quanto i titolari (rotazione alta, l'intuizione della spec: "il dodicesimo uomo dell'Inter
 * gioca statisticamente più minuti del dodicesimo uomo del Sassuolo"). Una squadra senza
 * abbastanza dati (nessun titolare/riserva con minuti noti) resta semplicemente FUORI dal
 * risultato — mai un valore inventato, coerente con `TeamRotationProfile.turnoverFrequency`
 * non-nullable in schema: se non calcolabile, niente riga, non un finto default. */
export function computeTeamRotationProfiles(
  players: RotationPlayerInput[],
  numberOfCompetitionsByTeam: Record<string, number>,
): TeamRotationProfileResult[] {
  const teams = [...new Set(players.map((p) => p.team))];
  const results: TeamRotationProfileResult[] = [];

  for (const team of teams) {
    const teamPlayers = players.filter((p) => p.team === team);
    const numberOfCompetitions = Math.max(1, numberOfCompetitionsByTeam[team] ?? 1);
    const competitionMultiplier = 1 + (numberOfCompetitions - 1) * COMPETITION_MULTIPLIER_STEP;

    const starters = teamPlayers.filter((p) => p.hierarchyLevel === "starter" && p.minutesPerGame !== null);
    const backups = teamPlayers.filter(
      (p) => p.hierarchyLevel !== null && p.hierarchyLevel !== "starter" && p.minutesPerGame !== null,
    );
    const starterAvg = average(starters.map((p) => p.minutesPerGame!));
    const backupAvg = average(backups.map((p) => p.minutesPerGame!));
    if (starterAvg === null || starterAvg <= 0 || backupAvg === null) continue;

    const turnoverFrequency = Number(
      Math.min(1, (backupAvg / starterAvg) * competitionMultiplier).toFixed(2),
    );

    const turnoverProbabilityByRole: Partial<Record<PlayerRole, number>> = {};
    for (const role of ROLES) {
      const roleStarterAvg = average(starters.filter((p) => p.role === role).map((p) => p.minutesPerGame!));
      const roleBackupAvg = average(backups.filter((p) => p.role === role).map((p) => p.minutesPerGame!));
      if (roleStarterAvg !== null && roleStarterAvg > 0 && roleBackupAvg !== null) {
        turnoverProbabilityByRole[role] = Number(
          Math.min(1, (roleBackupAvg / roleStarterAvg) * competitionMultiplier).toFixed(2),
        );
      }
    }

    results.push({
      team,
      turnoverFrequency,
      coachReliability: NEUTRAL_COACH_RELIABILITY,
      numberOfCompetitions,
      turnoverProbabilityByRole,
    });
  }

  return results;
}
