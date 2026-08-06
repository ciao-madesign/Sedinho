import type { DecisionRecommendation, ExplanationFactor, PlayerRole } from "@sedinho/shared";

export interface DecisionEngineInput {
  player: { id: string; name: string; role: PlayerRole; initialQuotation: number | null };
  evaluation: { expectedAuctionPrice: number | null; valueScore: number | null; confidence: number } | null;
  market: { priceInflation: number; roleDeflation: number | null; marketTemperature: number };
  /** Partecipanti diversi dall'acquirente che hanno ancora bisogno di questo ruolo (rosterNeeded
   * > 0 in `ParticipantAuctionSummary`): proxy reale della domanda concorrente su questo
   * giocatore, non un dato inventato — nessuna informazione sui rilanci altrui e' disponibile
   * (vedi `OpponentProfile.aggressiveness`, sez. 12). */
  rivalsInNeed: number;
  buyer: { remainingBudget: number; rosterNeeded: number } | null;
  candidatePrice: number | null;
}

const RIVAL_BUMP_PER_RIVAL = 0.05;
const MAX_RIVAL_BUMP = 3;
const MARGINAL_OVERPAY_THRESHOLD = 0.1; // 10% sopra il prezzo massimo corretto: "al limite"

/** Motore di decisione puro (sez. 14), stesso pattern di Market/Opponent/Evaluation Engine:
 * nessuna dipendenza da Prisma/HTTP. Risponde solo alle due domande della spec più operative
 * durante un'asta con un rilancio concreto sul tavolo — "qual è il prezzo massimo corretto?" e
 * "conviene rilanciare [a questo prezzo]?" — combinando `PlayerEvaluation.value` (sez. 8),
 * `MarketState` (sez. 13) e la domanda concorrente reale desunta da `rosterNeeded` (sez. 11/12).
 * Le altre domande della spec (miglior rapporto qualità/prezzo tra più giocatori, chi chiamare
 * adesso, coppie, rischio rosa complessivo) richiedono di confrontare l'intero pool o l'intera
 * rosa, non solo il giocatore corrente: non implementate qui, deliberatamente non inventate. */
export function computeDecisionRecommendation(input: DecisionEngineInput): DecisionRecommendation {
  const { player, evaluation, market, rivalsInNeed, buyer, candidatePrice } = input;
  const factors: ExplanationFactor[] = [];

  const baseline = evaluation?.expectedAuctionPrice ?? player.initialQuotation;
  if (baseline === null) {
    return {
      question: `Qual è il prezzo massimo corretto per ${player.name}?`,
      recommendation:
        "Dato insufficiente: nessuna quotazione ufficiale né valutazione disponibile per questo giocatore.",
      confidence: 0,
      explanation: {
        factors: [
          {
            label: "Prezzo di riferimento",
            direction: "neutral",
            weight: 0,
            detail: "Né quotazione ufficiale né prezzo atteso dal Player Evaluation Engine sono disponibili.",
          },
        ],
        confidence: 0,
        summary: "Nessun dato di prezzo disponibile per questo giocatore.",
      },
    };
  }

  factors.push({
    label: "Prezzo di riferimento",
    direction: "neutral",
    weight: 0.4,
    detail:
      evaluation?.expectedAuctionPrice !== null && evaluation?.expectedAuctionPrice !== undefined
        ? `Prezzo atteso dal Player Evaluation Engine: ${baseline} crediti (valueScore ${evaluation.valueScore !== null ? Math.round(evaluation.valueScore * 100) + "%" : "n/d"}).`
        : `Nessuna valutazione disponibile, usata la quotazione ufficiale: ${baseline} crediti.`,
  });

  const roleAdjustment = market.roleDeflation ?? market.priceInflation;
  const roleAdjustmentIsSpecific = market.roleDeflation !== null;
  factors.push({
    label: "Rettifica di mercato",
    direction: roleAdjustment > 0 ? "unfavorable" : roleAdjustment < 0 ? "favorable" : "neutral",
    weight: 0.3,
    detail: roleAdjustmentIsSpecific
      ? `Inflazione osservata sul ruolo ${player.role} in questa asta: ${formatSignedPercent(roleAdjustment)}.`
      : `Nessun inserimento ancora registrato per il ruolo ${player.role}: usata l'inflazione generale dell'asta (${formatSignedPercent(roleAdjustment)}).`,
  });

  const rivalBump = Math.min(rivalsInNeed, MAX_RIVAL_BUMP) * RIVAL_BUMP_PER_RIVAL;
  if (rivalsInNeed > 0) {
    factors.push({
      label: "Domanda concorrente",
      direction: "unfavorable",
      weight: 0.2,
      detail: `${rivalsInNeed} altri partecipanti hanno ancora bisogno di un ${player.role} in rosa: prezzo massimo alzato del ${Math.round(rivalBump * 100)}%.`,
    });
  } else {
    factors.push({
      label: "Domanda concorrente",
      direction: "favorable",
      weight: 0.1,
      detail: `Nessun altro partecipante ha ancora bisogno di un ${player.role} in rosa (in base al fabbisogno di ruolo residuo).`,
    });
  }

  const maxCorrectPrice = Math.max(1, Math.round(baseline * (1 + roleAdjustment) * (1 + rivalBump)));

  let confidence = evaluation?.confidence ?? 0.3;
  if (!roleAdjustmentIsSpecific) confidence *= 0.85;
  confidence = Number(confidence.toFixed(2));

  if (buyer) {
    factors.push({
      label: "Fabbisogno e budget dell'acquirente",
      direction: buyer.rosterNeeded > 0 ? "favorable" : "unfavorable",
      weight: 0.2,
      detail:
        buyer.rosterNeeded > 0
          ? `Serve ancora almeno un ${player.role} in rosa. Budget residuo: ${buyer.remainingBudget} crediti.`
          : `Il ruolo ${player.role} è già completo in rosa. Budget residuo: ${buyer.remainingBudget} crediti.`,
    });

    if (candidatePrice !== null && candidatePrice > buyer.remainingBudget) {
      return {
        question: `Conviene rilanciare su ${player.name} a ${candidatePrice} crediti?`,
        recommendation: `Budget insufficiente: servono ${candidatePrice} crediti, ne restano ${buyer.remainingBudget}.`,
        maxCorrectPrice,
        confidence,
        explanation: {
          factors,
          confidence,
          summary: `Prezzo massimo corretto stimato ${maxCorrectPrice} crediti, ma il budget residuo (${buyer.remainingBudget}) non copre il rilancio proposto.`,
        },
      };
    }
  }

  if (candidatePrice === null) {
    return {
      question: `Qual è il prezzo massimo corretto per ${player.name}?`,
      recommendation: `Prezzo massimo corretto stimato: ${maxCorrectPrice} crediti.`,
      maxCorrectPrice,
      confidence,
      explanation: {
        factors,
        confidence,
        summary: `Stima basata su prezzo di riferimento, rettifica di mercato per ruolo e domanda concorrente osservata.`,
      },
    };
  }

  const overpayRatio = (candidatePrice - maxCorrectPrice) / maxCorrectPrice;
  let recommendation: string;
  if (overpayRatio <= 0) {
    recommendation = `Conviene rilanciare: ${candidatePrice} crediti è entro il prezzo massimo corretto stimato (${maxCorrectPrice}).`;
  } else if (overpayRatio <= MARGINAL_OVERPAY_THRESHOLD) {
    recommendation = `Al limite: ${candidatePrice} crediti è leggermente sopra il prezzo massimo corretto stimato (${maxCorrectPrice}), valuta quanto ti serve il ruolo prima di continuare.`;
  } else {
    recommendation = `Meglio lasciar perdere: ${candidatePrice} crediti è ben sopra il prezzo massimo corretto stimato (${maxCorrectPrice}).`;
  }

  return {
    question: `Conviene rilanciare su ${player.name} a ${candidatePrice} crediti?`,
    recommendation,
    maxCorrectPrice,
    confidence,
    explanation: {
      factors,
      confidence,
      summary: `Prezzo proposto ${candidatePrice} crediti vs massimo corretto stimato ${maxCorrectPrice} crediti (${formatSignedPercent(overpayRatio)}).`,
    },
  };
}

function formatSignedPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
