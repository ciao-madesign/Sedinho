import type { HierarchyLevel, PlayerRole, RosterRadarProfile } from "@sedinho/shared";

export interface RosterRadarPlayerInput {
  role: PlayerRole;
  birthDateIso: string | null;
  hierarchyLevel: HierarchyLevel | null;
  valueScore: number | null;
  bonus: {
    penaltyPotential: number | null;
    freeKickPotential: number | null;
    cleanSheetPotential: number | null;
    assistPotential: number | null;
  };
  stability: {
    consistencyIndex: number | null;
    volatilityIndex: number | null;
  };
}

export interface RosterRadarParticipantInput {
  participantId: string;
  players: RosterRadarPlayerInput[];
}

export interface ComputeRosterRadarInput {
  participants: RosterRadarParticipantInput[];
  /** Totale slot di rosa previsti dalla lega (somma di `rosterComposition`), denominatore per
   * l'asse "profondità". */
  totalRosterSlots: number;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
// Range di età usato per normalizzare affidabilità/scommessa (proxy dichiarata, non calibrata:
// nessun dato reale su come età e rendimento fantacalcio si relazionano in questa lega).
const RELIABILITY_AGE_MIN = 20;
const RELIABILITY_AGE_MAX = 35;
const GAMBLE_AGE_MIN = 18;
const GAMBLE_AGE_MAX = 30;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function ageFromBirthDate(birthDateIso: string | null): number | null {
  if (!birthDateIso) return null;
  const birth = new Date(birthDateIso).getTime();
  if (Number.isNaN(birth)) return null;
  return (Date.now() - birth) / MS_PER_YEAR;
}

/** Motore puro per il radar di rosa (richiesto esplicitamente dall'utente, non in spec): 6 assi
 * 0..100 per ogni partecipante, ricalcolati dai soli dati già prodotti dal Player Evaluation
 * Engine (sez. 8) — nessuna nuova fonte, solo un'aggregazione per rosa invece che per singolo
 * giocatore. Ogni asse tratta un partecipante senza dati sufficienti come 0 (non `null`): a
 * differenza degli indici per-giocatore, qui l'assenza di giocatori in una categoria è
 * un'informazione reale ("zero investimento fin qui"), non un dato mancante da nascondere. */
export function computeRosterRadar(input: ComputeRosterRadarInput): RosterRadarProfile[] {
  const { participants, totalRosterSlots } = input;

  return participants.map(({ participantId, players }) => {
    const bonusValues = players.flatMap((p) =>
      [p.bonus.penaltyPotential, p.bonus.freeKickPotential, p.bonus.cleanSheetPotential, p.bonus.assistPotential].filter(
        (v): v is number => v !== null,
      ),
    );
    const bonus = Math.round((average(bonusValues) ?? 0) * 100);

    const starters = players.filter((p) => p.hierarchyLevel === "starter").length;
    const depth = totalRosterSlots > 0 ? Math.round(clamp01(starters / totalRosterSlots) * 100) : 0;

    const attackScores = players
      .filter((p) => p.role === "A" && p.valueScore !== null)
      .map((p) => p.valueScore!);
    const attack = Math.round((average(attackScores) ?? 0) * 100);

    const defenseScores = players
      .filter((p) => (p.role === "D" || p.role === "P") && p.valueScore !== null)
      .map((p) => p.valueScore!);
    const defense = Math.round((average(defenseScores) ?? 0) * 100);

    const reliabilityScores = players
      .map((p) => {
        const age = ageFromBirthDate(p.birthDateIso);
        const ageScore =
          age !== null ? clamp01((age - RELIABILITY_AGE_MIN) / (RELIABILITY_AGE_MAX - RELIABILITY_AGE_MIN)) : null;
        const consistency = p.stability.consistencyIndex;
        if (ageScore === null && consistency === null) return null;
        if (ageScore === null) return consistency;
        if (consistency === null) return ageScore;
        return 0.5 * ageScore + 0.5 * consistency;
      })
      .filter((v): v is number => v !== null);
    const reliability = Math.round((average(reliabilityScores) ?? 0) * 100);

    const gambleScores = players
      .map((p) => {
        const age = ageFromBirthDate(p.birthDateIso);
        const youthScore =
          age !== null ? clamp01((GAMBLE_AGE_MAX - age) / (GAMBLE_AGE_MAX - GAMBLE_AGE_MIN)) : null;
        const volatility = p.stability.volatilityIndex !== null ? Math.min(1, p.stability.volatilityIndex) : null;
        if (youthScore === null && volatility === null) return null;
        if (youthScore === null) return volatility;
        if (volatility === null) return youthScore;
        return 0.5 * youthScore + 0.5 * volatility;
      })
      .filter((v): v is number => v !== null);
    const gamble = Math.round((average(gambleScores) ?? 0) * 100);

    return {
      participantId,
      axes: { bonus, depth, attack, defense, reliability, gamble },
    };
  });
}
