import type {
  Explanation,
  ExplanationFactor,
  PlayerRole,
  RosterSeasonPlayerOutcome,
  RosterSeasonSimulationResult,
  SimulatedPriceRange,
} from "@sedinho/shared";

export interface RosterSeasonPlayerInput {
  playerId: string;
  name: string;
  role: PlayerRole;
  /** Media fantavoto a partita (ProductionIndices.expectedFantasyPoints, da FSTATS). */
  expectedFantasyPoints: number;
  starterProbability: number | null;
  floorScore: number | null;
  ceilingScore: number | null;
  volatilityIndex: number | null;
}

export interface SimulateRosterSeasonInput {
  players: RosterSeasonPlayerInput[];
  /** Giocatori della rosa scartati a monte (nessuna produzione attesa nota) — mai stimati a
   * caso, solo contati per trasparenza (principio "Spiegabile"). */
  excludedCount: number;
  iterations?: number;
}

// Serie A: 20 squadre, andata/ritorno — costante stabile (a differenza delle coppe europee,
// non cambia stagione per stagione), non richiede aggiornamento manuale come
// EUROPEAN_COMPETITIONS_2026_27 nel Rotation Engine.
const MATCHDAYS = 38;
const DEFAULT_ITERATIONS = 3000;
const MIN_ITERATIONS = 500;
const MAX_ITERATIONS = 10000;
// Deviazione "tipica" dichiarata per partita, non calibrata su dati reali partita-per-partita
// (l'unica varianza misurabile con lo schema attuale è tra stagioni, vedi sotto).
const BASE_MATCH_SIGMA_FRACTION = 0.35;
const DEFAULT_STARTER_PROBABILITY = 0.5;

function sampleStandardNormal(): number {
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}

/** `volatilityIndex` (coefficiente di variazione tra STAGIONI, unico proxy disponibile con lo
 * schema attuale — vedi lib/evaluation/stability.ts) modula una deviazione di base per partita
 * invece di sostituirla: un giocatore incostante tra le stagioni oscilla un po' di più anche
 * nel modello partita-per-partita, ma resta un compromesso dichiarato, non un dato misurato. */
function matchSigmaFor(mean: number, volatilityIndex: number | null): number {
  const adjustment = volatilityIndex !== null ? 0.7 + Math.min(1, volatilityIndex) * 1.3 : 1;
  return Math.max(0.1, mean * BASE_MATCH_SIGMA_FRACTION * adjustment);
}

/** Simulatore di rosa (sez. 15, secondo blocco): Monte Carlo su un intero campionato per un
 * insieme di giocatori già scelto (rosa d'asta reale o lista Obiettivi) — non simula l'asta,
 * solo il rendimento stagionale della rosa data, richiesto esplicitamente dall'utente come
 * alternativa più semplice e già alla portata rispetto a simulare anche l'esito dell'asta
 * (che l'utente ha deciso di non fare, stesso limite di dati comportamentali già documentato
 * per il Simulatore per-giocatore, vedi CLAUDE.md §5). Per ogni giocatore, per ogni giornata
 * simulata: gioca con probabilità `starterProbability`, e se gioca il fantavoto è campionato
 * da una normale centrata sulla produzione attesa a partita, con deviazione dichiarata (non
 * calibrata) modulata dalla volatilità multi-stagione. Somma sulle 38 giornate per giocatore,
 * poi sulla rosa. */
export function simulateRosterSeason(input: SimulateRosterSeasonInput): RosterSeasonSimulationResult {
  const { players, excludedCount } = input;
  const iterations = Math.min(
    MAX_ITERATIONS,
    Math.max(MIN_ITERATIONS, input.iterations ?? DEFAULT_ITERATIONS),
  );

  const totals: number[] = new Array(iterations).fill(0);
  const perPlayerSeasonSum = new Map<string, number>();

  for (const player of players) {
    const starterProbability = player.starterProbability ?? DEFAULT_STARTER_PROBABILITY;
    const mean = player.expectedFantasyPoints;
    const sigma = matchSigmaFor(mean, player.volatilityIndex);
    const floor = player.floorScore ?? 0;
    const ceiling = player.ceilingScore ?? mean * 1.8;

    let seasonSum = 0;
    for (let i = 0; i < iterations; i++) {
      let seasonTotal = 0;
      for (let m = 0; m < MATCHDAYS; m++) {
        if (Math.random() >= starterProbability) continue;
        const z = sampleStandardNormal();
        seasonTotal += Math.min(ceiling, Math.max(floor, mean + z * sigma));
      }
      totals[i]! += seasonTotal;
      seasonSum += seasonTotal;
    }
    perPlayerSeasonSum.set(player.playerId, seasonSum / iterations);
  }

  totals.sort((a, b) => a - b);
  const totalPointsRange: SimulatedPriceRange = {
    p10: Number(percentile(totals, 0.1).toFixed(1)),
    p50: Number(percentile(totals, 0.5).toFixed(1)),
    p90: Number(percentile(totals, 0.9).toFixed(1)),
    mean: Number((totals.reduce((sum, v) => sum + v, 0) / totals.length).toFixed(1)),
  };

  const perPlayer: RosterSeasonPlayerOutcome[] = players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    role: p.role,
    expectedSeasonPoints: Number((perPlayerSeasonSum.get(p.playerId) ?? 0).toFixed(1)),
  }));

  const factors: ExplanationFactor[] = [
    {
      label: "Produzione attesa per partita",
      direction: "neutral",
      weight: 0.4,
      detail:
        "Media fantavoto a partita dal Player Evaluation Engine (FSTATS), sommata sulle giornate " +
        "in cui il modello stima che il giocatore scenda in campo.",
    },
    {
      label: "Probabilità di titolarità",
      direction: "neutral",
      weight: 0.3,
      detail: players.some((p) => p.starterProbability === null)
        ? "Alcuni giocatori non hanno una probabilità di titolarità nota (nessuna gerarchia " +
          "Fantacalciopedia): usato un valore neutro (50%)."
        : "Da Fantacalciopedia (gerarchia titolare/riserva).",
    },
    {
      label: "Variabilità partita-per-partita",
      direction: "neutral",
      weight: 0.3,
      detail:
        "Proxy dichiarato: la varianza reale disponibile con lo schema attuale è tra STAGIONI " +
        "(floor/ceiling/volatilità), non tra partite — usata per modulare una deviazione tipica " +
        "di base, non un dato calibrato sul vero andamento settimanale.",
    },
  ];

  if (excludedCount > 0) {
    factors.push({
      label: "Copertura rosa",
      direction: "unfavorable",
      weight: 0.2,
      detail: `${excludedCount} giocatori esclusi dalla simulazione: nessuna produzione attesa nota (serve FSTATS).`,
    });
  }

  const explanation: Explanation = {
    factors,
    confidence:
      players.length > 0 ? Number((players.length / (players.length + excludedCount)).toFixed(2)) : 0,
    summary:
      `Simulazione su ${iterations} campionati (${MATCHDAYS} giornate ciascuno) per ${players.length} ` +
      `giocatori: punti totali di rosa mediani ${totalPointsRange.p50} (range ${totalPointsRange.p10}-${totalPointsRange.p90}).`,
  };

  return {
    iterations,
    matchdays: MATCHDAYS,
    playersIncluded: players.length,
    playersExcluded: excludedCount,
    totalPointsRange,
    perPlayer,
    explanation,
  };
}
