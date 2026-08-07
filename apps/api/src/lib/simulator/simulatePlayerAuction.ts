import type {
  ExplanationFactor,
  HierarchyLevel,
  SimulatedBudgetOutcome,
  SimulatedPriceTier,
  SimulationResult,
} from "@sedinho/shared";

export interface SimulatePlayerAuctionInput {
  playerId: string;
  /** Prezzo atteso a mercato (Player Evaluation Engine) o quotazione ufficiale, prima di
   * qualunque rettifica di tier/mercato/domanda concorrente. */
  baselinePrice: number;
  confidence: number; // 0..1, da PlayerEvaluation.explanation.confidence
  hierarchyLevel: HierarchyLevel | null;
  valueScore: number | null;
  rivalsInNeed: number;
  marketInflation: number; // 0 se nessuna asta in corso
  dataSource: "auction" | "generic";
  myBudget: number;
  iterations?: number;
}

const RIVAL_BUMP_PER_RIVAL = 0.05;
const MAX_RIVAL_BUMP = 3;
const BASE_SIGMA = 0.25; // deviazione log relativa a confidenza piena
const CONFIDENCE_SIGMA_SPREAD = 0.35; // sigma extra a confidenza zero
const TIER_MULTIPLIERS: Record<SimulatedPriceTier, number> = { starter: 1, backup: 0.35, filler: 0.08 };
// Quasi ogni rosa tiene 1-2 slot per ruolo riempiti a 1 credito (dettaglio confermato
// esplicitamente dall'utente): per la fascia "filler" la maggioranza dei campioni simulati
// finisce esattamente a 1 credito, il resto segue comunque la distribuzione normale (rare
// aste dove anche un tappabuchi viene pagato di più per scarsità estrema di fine asta).
const FILLER_FLOOR_PROBABILITY = 0.7;
const DEFAULT_ITERATIONS = 4000;
const MIN_ITERATIONS = 500;
const MAX_ITERATIONS = 20000;

/** Fascia del giocatore prima di simulare: titolare (prezzo pieno), prima alternativa/rincalzo
 * (sconto forte) o riserva/tappabuchi (quasi sempre 1 credito). Preferisce `hierarchyLevel`
 * (gerarchia reale da Fantacalciopedia); se assente, fallback dichiarato sul `valueScore`
 * (percentile della quotazione nel ruolo) — meno affidabile, documentato nella spiegazione. */
function determineTier(
  hierarchyLevel: HierarchyLevel | null,
  valueScore: number | null,
): SimulatedPriceTier {
  if (hierarchyLevel === "starter") return "starter";
  if (hierarchyLevel === "first-alternate") return "backup";
  if (hierarchyLevel === "second-alternate") return "filler";
  if (valueScore === null) return "backup";
  if (valueScore >= 0.7) return "starter";
  if (valueScore >= 0.4) return "backup";
  return "filler";
}

// Box-Muller: campiona da una normale standard per costruire una distribuzione log-normale del
// prezzo simulato (mai negativa, coda lunga verso l'alto — coerente con come si comportano
// davvero le aste: pochi rilanci molto alti sui big, non simmetrici intorno alla media).
function sampleStandardNormal(): number {
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}

function formatSignedPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** Simulatore Monte Carlo per un SINGOLO giocatore (sez. 15): scope scelto esplicitamente con
 * l'utente al posto di simulare l'intera asta (avrebbe richiesto un modello di comportamento
 * per ogni rivale, non tarabile senza uno storico comportamentale reale — l'utente ha
 * confermato di non averlo, vedi CLAUDE.md §5/§10). La distribuzione resta un'euristica
 * dichiarata, informata da riferimenti qualitativi forniti dall'utente (fasce di prezzo per
 * ruolo/fascia, effetto "fine asta", riempitivi da 1 credito) ma NON calibrata su un dataset
 * storico reale — da ricalibrare se in futuro emergono dati veri. */
export function simulatePlayerAuction(input: SimulatePlayerAuctionInput): SimulationResult {
  const {
    playerId,
    baselinePrice,
    confidence,
    hierarchyLevel,
    valueScore,
    rivalsInNeed,
    marketInflation,
    dataSource,
    myBudget,
    iterations: requestedIterations,
  } = input;

  const iterations = Math.min(
    MAX_ITERATIONS,
    Math.max(MIN_ITERATIONS, requestedIterations ?? DEFAULT_ITERATIONS),
  );

  const tier = determineTier(hierarchyLevel, valueScore);
  const rivalBump = Math.min(rivalsInNeed, MAX_RIVAL_BUMP) * RIVAL_BUMP_PER_RIVAL;
  const centerPrice = Math.max(
    1,
    baselinePrice * TIER_MULTIPLIERS[tier] * (1 + marketInflation) * (1 + rivalBump),
  );
  const sigma = BASE_SIGMA + (1 - confidence) * CONFIDENCE_SIGMA_SPREAD;

  const samples: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    if (tier === "filler" && Math.random() < FILLER_FLOOR_PROBABILITY) {
      samples[i] = 1;
      continue;
    }
    const z = sampleStandardNormal();
    const price = centerPrice * Math.exp(z * sigma - (sigma * sigma) / 2);
    samples[i] = Math.max(1, Math.round(price));
  }
  samples.sort((a, b) => a - b);

  const priceRange = {
    p10: percentile(samples, 0.1),
    p50: percentile(samples, 0.5),
    p90: percentile(samples, 0.9),
    mean: Number((samples.reduce((sum, v) => sum + v, 0) / samples.length).toFixed(1)),
  };

  const winProbability = Number(
    (samples.filter((p) => p <= myBudget).length / samples.length).toFixed(2),
  );

  // "Strategie alternative" (spec sez. 15): stessi campioni simulati, letti a budget diversi
  // invece di risimulare da capo per ognuno — piu' economico e coerente.
  const budgetSteps = [0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.8].map((mult) =>
    Math.max(1, Math.round(centerPrice * mult)),
  );
  const winProbabilityByBudget: SimulatedBudgetOutcome[] = [...new Set(budgetSteps)]
    .sort((a, b) => a - b)
    .map((budget) => ({
      budget,
      winProbability: Number((samples.filter((p) => p <= budget).length / samples.length).toFixed(2)),
    }));

  const tierLabel =
    tier === "starter" ? "titolare" : tier === "backup" ? "prima alternativa/rincalzo" : "riserva/tappabuchi";

  const factors: ExplanationFactor[] = [
    {
      label: "Fascia del giocatore",
      direction: "neutral",
      weight: 0.3,
      detail:
        hierarchyLevel !== null
          ? `Classificato come ${tierLabel} (gerarchia da Fantacalciopedia): i tappabuchi finiscono quasi sempre intorno a 1 credito (slot di riempimento), i titolari seguono invece il prezzo pieno.`
          : `Nessun dato di gerarchia per questo giocatore: fascia "${tierLabel}" stimata dal valueScore (percentile della quotazione), meno affidabile di un dato di gerarchia reale.`,
    },
    {
      label: "Incertezza sulla valutazione",
      direction: confidence < 0.5 ? "unfavorable" : "neutral",
      weight: 0.25,
      detail: `Confidenza della valutazione ${Math.round(confidence * 100)}%: più bassa è, più ampio il ventaglio di prezzi simulati (deviazione relativa ${Math.round(sigma * 100)}%).`,
    },
    {
      label: "Domanda concorrente",
      direction: rivalsInNeed > 0 ? "unfavorable" : "favorable",
      weight: 0.25,
      detail:
        dataSource === "auction"
          ? `${rivalsInNeed} partecipanti dell'asta in corso hanno ancora bisogno di questo ruolo: prezzo centrale alzato del ${Math.round(rivalBump * 100)}%.`
          : `Stima pre-asta (nessuna asta in corso): ~${rivalsInNeed} rivali probabilmente cercano ancora questo ruolo, in base alla sola composizione rosa della lega — prezzo centrale alzato del ${Math.round(rivalBump * 100)}%. Sarà più precisa avviando un'asta reale.`,
    },
    {
      label: "Rettifica di mercato",
      direction: marketInflation > 0 ? "unfavorable" : marketInflation < 0 ? "favorable" : "neutral",
      weight: 0.2,
      detail:
        dataSource === "auction"
          ? `Inflazione osservata sul ruolo in questa asta: ${formatSignedPercent(marketInflation)}.`
          : `Nessuna asta in corso: nessuna rettifica di mercato applicata (0%). L'effetto "fine asta" (i giocatori rimasti costano di più quando i big sono già venduti) non è modellabile senza un'asta reale in corso.`,
    },
  ];

  return {
    playerId,
    iterations,
    tier,
    dataSource,
    priceRange,
    winProbability,
    winProbabilityByBudget,
    explanation: {
      factors,
      confidence: dataSource === "auction" ? confidence : Number((confidence * 0.7).toFixed(2)),
      summary: `Simulazione su ${iterations} scenari: prezzo mediano stimato ${priceRange.p50} crediti (range ${priceRange.p10}-${priceRange.p90}), probabilità di aggiudicazione al tuo budget (${myBudget} cr.) ${Math.round(winProbability * 100)}%.`,
    },
  };
}
