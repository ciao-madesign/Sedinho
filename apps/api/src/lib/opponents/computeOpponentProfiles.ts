import type { OpponentProfile } from "@sedinho/shared";

export interface OpponentEntryInput {
  participantId: string;
  price: number;
  team: string;
  quotation: number | null;
  /** Percentile della quotazione tra i giocatori dello stesso ruolo (Player Evaluation Engine,
   * sez. 8, `value.valueScore`): proxy più vicino disponibile a "top player" senza un vero
   * Decision Engine. */
  valueScore: number | null;
  birthDate: string | null;
}

export interface OpponentParticipantInput {
  participantId: string;
  remainingBudget: number;
}

export interface ComputeOpponentProfilesInput {
  participants: OpponentParticipantInput[];
  entries: OpponentEntryInput[];
}

const TYPICAL_MIN_AGE = 18;
const TYPICAL_MAX_AGE = 38;

/** Motore di profilazione avversari (sez. 12), stesso pattern di Market Engine ed Evaluation
 * Engine: input già estratto dal DB, nessuna dipendenza da Prisma/HTTP. Costruisce un profilo
 * per partecipante esclusivamente dagli `AuctionEntry` già registrati — nessun indice inventato
 * dove il dato non esiste (vedi commento su `OpponentProfile` in packages/shared). */
export function computeOpponentProfiles(input: ComputeOpponentProfilesInput): OpponentProfile[] {
  const now = new Date();
  const updatedAt = now.toISOString();

  return input.participants.map(({ participantId, remainingBudget }) => {
    const ownEntries = input.entries.filter((e) => e.participantId === participantId);
    const totalSpent = ownEntries.reduce((sum, e) => sum + e.price, 0);
    const averageSpend = ownEntries.length > 0 ? totalSpent / ownEntries.length : 0;

    const withQuotation = ownEntries.filter(
      (e): e is OpponentEntryInput & { quotation: number } =>
        e.quotation !== null && e.quotation > 0,
    );
    const overpayIndex =
      withQuotation.length > 0
        ? withQuotation.reduce((sum, e) => sum + e.price / e.quotation, 0) / withQuotation.length
        : null;
    // Proxy dichiarata: nessun rilancio intermedio è registrato dal Live Auction Engine, solo
    // il prezzo finale di ogni inserimento (vedi OpponentProfile in packages/shared).
    const aggressiveness =
      withQuotation.length > 0
        ? withQuotation.filter((e) => e.price > e.quotation).length / withQuotation.length
        : null;

    const withValueScore = ownEntries.filter(
      (e): e is OpponentEntryInput & { valueScore: number } => e.valueScore !== null,
    );
    const topPlayerPreference =
      withValueScore.length > 0
        ? withValueScore.reduce((sum, e) => sum + e.valueScore, 0) / withValueScore.length
        : null;

    const ages = ownEntries
      .map((e) => ageFromBirthDate(e.birthDate, now))
      .filter((age): age is number => age !== null);
    const youngPlayerPreference =
      ages.length > 0
        ? ages.reduce(
            (sum, age) =>
              sum +
              clamp01(1 - (age - TYPICAL_MIN_AGE) / (TYPICAL_MAX_AGE - TYPICAL_MIN_AGE)),
            0,
          ) / ages.length
        : null;

    const teamPreferences: Record<string, number> = {};
    if (ownEntries.length > 0) {
      for (const entry of ownEntries) {
        if (!entry.team) continue;
        teamPreferences[entry.team] = (teamPreferences[entry.team] ?? 0) + 1;
      }
      for (const team of Object.keys(teamPreferences)) {
        teamPreferences[team] = teamPreferences[team]! / ownEntries.length;
      }
    }

    // Indice di Herfindahl-Hirschman sulle quote di spesa, rinormalizzato in 0..1: sotto 2
    // acquisti la concentrazione non è un dato significativo (con un solo acquisto vale sempre
    // "tutto su un giocatore", non dice nulla sul comportamento).
    let spendConcentration: number | null = null;
    if (ownEntries.length >= 2 && totalSpent > 0) {
      const hhi = ownEntries.reduce((sum, e) => sum + (e.price / totalSpent) ** 2, 0);
      const minHhi = 1 / ownEntries.length;
      spendConcentration = clamp01((hhi - minHhi) / (1 - minHhi));
    }

    return {
      participantId,
      aggressiveness,
      averageSpend,
      topPlayerPreference,
      youngPlayerPreference,
      teamPreferences,
      spendConcentration,
      remainingBudget,
      overpayIndex,
      updatedAt,
    };
  });
}

function ageFromBirthDate(birthDate: string | null, now: Date): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
