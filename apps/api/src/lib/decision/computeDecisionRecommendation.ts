import type {
  DecisionRecommendation,
  ExplanationFactor,
  HierarchyLevel,
  PlayerAvailability,
  PlayerRole,
} from "@sedinho/shared";

/** Un giocatore già posseduto dall'acquirente (o il candidato stesso), ridotto ai soli campi
 * che servono per "rischio rosa" e "coppia/concentrazione squadra" — non l'intero
 * `PlayerListItem`, per tenere il motore puro e disaccoppiato da come il chiamante lo ottiene. */
export interface RosterPlayerInput {
  team: string;
  availability: PlayerAvailability;
  hierarchyLevel: HierarchyLevel | null;
}

export interface DecisionEngineInput {
  player: {
    id: string;
    name: string;
    role: PlayerRole;
    team: string;
    availability: PlayerAvailability;
    hierarchyLevel: HierarchyLevel | null;
    initialQuotation: number | null;
  };
  evaluation: { expectedAuctionPrice: number | null; valueScore: number | null; confidence: number } | null;
  market: { priceInflation: number; roleDeflation: number | null; marketTemperature: number };
  /** Partecipanti diversi dall'acquirente che hanno ancora bisogno di questo ruolo (rosterNeeded
   * > 0 in `ParticipantAuctionSummary`): proxy reale della domanda concorrente su questo
   * giocatore, non un dato inventato — nessuna informazione sui rilanci altrui e' disponibile
   * (vedi `OpponentProfile.aggressiveness`, sez. 12). */
  rivalsInNeed: number;
  buyer: { remainingBudget: number; rosterNeeded: number } | null;
  candidatePrice: number | null;
  /** Per "conviene attendere?": quanti altri giocatori dello stesso ruolo, ancora liberi, hanno
   * un valueScore comparabile (entro il 15%) a questo. `null` se non calcolabile (valueScore
   * del candidato mancante — vedi route). */
  alternativesAvailable: number | null;
  /** Per "rischio rosa" e "coppia": rosa già posseduta dall'acquirente. `null` se non e' stato
   * passato un `buyerId` (nessuna delle due domande e' applicabile), `[]` se l'acquirente non
   * ha ancora comprato nessuno (rischio/concentrazione di partenza a 0). */
  buyerRoster: RosterPlayerInput[] | null;
}

/** Tolleranza (frazione di valueScore) entro cui un altro giocatore libero dello stesso ruolo
 * conta come "alternativa comparabile" per "conviene attendere?" — esportata cosi' la rotta usa
 * la stessa soglia per contare `alternativesAvailable` nel pool. */
export const ALTERNATIVE_VALUE_SCORE_TOLERANCE = 0.15;

/** 0..1, più alto = rosa più rischiosa: media pesata di quota infortunati/non disponibili,
 * quota di riserve dichiarate (esclude i `null`, dato mancante non e' un rischio noto) e quota
 * massima di giocatori dalla stessa squadra. Euristica dichiarata (stesso spirito di
 * `OpponentProfile.aggressiveness`, sez. 12), non una probabilità calibrata. */
function computeRiskScore(roster: RosterPlayerInput[]): number {
  if (roster.length === 0) return 0;
  const unavailableShare = roster.filter((p) => p.availability !== "available").length / roster.length;
  const knownHierarchy = roster.filter((p) => p.hierarchyLevel !== null);
  const backupShare =
    knownHierarchy.length > 0
      ? knownHierarchy.filter((p) => p.hierarchyLevel !== "starter").length / knownHierarchy.length
      : 0;
  const teamCounts = new Map<string, number>();
  for (const p of roster) teamCounts.set(p.team, (teamCounts.get(p.team) ?? 0) + 1);
  const maxTeamShare = Math.max(...teamCounts.values()) / roster.length;
  return Number((0.4 * unavailableShare + 0.3 * backupShare + 0.3 * maxTeamShare).toFixed(2));
}

function teamShare(roster: RosterPlayerInput[], team: string): number {
  if (roster.length === 0) return 0;
  return Number((roster.filter((p) => p.team === team).length / roster.length).toFixed(2));
}

const RIVAL_BUMP_PER_RIVAL = 0.05;
const MAX_RIVAL_BUMP = 3;
const MARGINAL_OVERPAY_THRESHOLD = 0.1; // 10% sopra il prezzo massimo corretto: "al limite"

/** Motore di decisione puro (sez. 14), stesso pattern di Market/Opponent/Evaluation Engine:
 * nessuna dipendenza da Prisma/HTTP. Risponde a 6 delle 8 domande della spec per un giocatore
 * alla volta: "qual è il prezzo massimo corretto?", "conviene rilanciare [a questo prezzo]?",
 * "quanto vale realmente questo rilancio?" (campo `valuation`), "conviene attendere?" (campo
 * `waitRecommended`, richiede `alternativesAvailable` calcolato dal chiamante sul pool), "quanto
 * rischio introduco nella mia rosa?" (campo `rosterRisk`) e "conviene completare una coppia?"
 * (campo `teamConcentration`, proxy sulla concentrazione per squadra — nessun dato di sinergia
 * reale disponibile). Le ultime 2 domande della spec (miglior rapporto qualità/prezzo tra più
 * giocatori, chi chiamare adesso) richiedono di confrontare l'intero pool, non un giocatore alla
 * volta: vedi `rankPoolCandidates.ts`. */
export function computeDecisionRecommendation(input: DecisionEngineInput): DecisionRecommendation {
  const { player, evaluation, market, rivalsInNeed, buyer, candidatePrice, alternativesAvailable, buyerRoster } =
    input;
  const factors: ExplanationFactor[] = [];

  // Calcolati subito (non dipendono dal prezzo) cosi' da essere disponibili anche nel ramo
  // "nessun prezzo di riferimento" sotto — i fattori testuali vengono pero' accodati piu' tardi,
  // dopo quelli sul prezzo, per tenere l'ordine di lettura naturale (prezzo prima, rosa dopo).
  const rosterRisk = buyerRoster
    ? { before: computeRiskScore(buyerRoster), after: computeRiskScore([...buyerRoster, player]) }
    : null;
  const teamConcentration = buyerRoster
    ? { before: teamShare(buyerRoster, player.team), after: teamShare([...buyerRoster, player], player.team) }
    : null;
  const rosterFactors: ExplanationFactor[] = [];
  if (rosterRisk) {
    const delta = rosterRisk.after - rosterRisk.before;
    rosterFactors.push({
      label: "Rischio introdotto in rosa",
      direction: delta > 0.03 ? "unfavorable" : delta < -0.03 ? "favorable" : "neutral",
      weight: 0.15,
      detail: `Rischio rosa stimato (indisponibilità, riserve dichiarate, concentrazione per squadra): ${Math.round(rosterRisk.before * 100)}% → ${Math.round(rosterRisk.after * 100)}% con questo acquisto.`,
    });
  }
  if (teamConcentration) {
    const alreadyHasTeammate = teamConcentration.before > 0;
    rosterFactors.push({
      label: "Coppia / concentrazione squadra",
      direction: teamConcentration.after > 0.34 ? "unfavorable" : alreadyHasTeammate ? "favorable" : "neutral",
      weight: 0.1,
      detail: alreadyHasTeammate
        ? `Hai già ${Math.round(teamConcentration.before * 100)}% della rosa dalla ${player.team}: con questo acquisto sale al ${Math.round(teamConcentration.after * 100)}% — possibile coppia della stessa squadra (es. attacco o clean sheet), ma aumenta la dipendenza da un solo team.`
        : `Nessun altro giocatore della ${player.team} in rosa: questo acquisto porterebbe la concentrazione su questa squadra al ${Math.round(teamConcentration.after * 100)}%.`,
    });
  }

  const baseline = evaluation?.expectedAuctionPrice ?? player.initialQuotation;
  if (baseline === null) {
    return {
      question: `Qual è il prezzo massimo corretto per ${player.name}?`,
      recommendation:
        "Dato insufficiente: nessuna quotazione ufficiale né valutazione disponibile per questo giocatore.",
      confidence: 0,
      valuation: null,
      waitRecommended: null,
      alternativesAvailable,
      rosterRisk,
      teamConcentration,
      explanation: {
        factors: [
          {
            label: "Prezzo di riferimento",
            direction: "neutral",
            weight: 0,
            detail: "Né quotazione ufficiale né prezzo atteso dal Player Evaluation Engine sono disponibili.",
          },
          ...rosterFactors,
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

  factors.push(...rosterFactors);

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
        valuation: buildValuation(candidatePrice, maxCorrectPrice),
        waitRecommended: null,
        alternativesAvailable,
        rosterRisk,
        teamConcentration,
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
      valuation: null,
      waitRecommended: null,
      alternativesAvailable,
      rosterRisk,
      teamConcentration,
      explanation: {
        factors,
        confidence,
        summary: `Stima basata su prezzo di riferimento, rettifica di mercato per ruolo e domanda concorrente osservata.`,
      },
    };
  }

  const overpayRatio = (candidatePrice - maxCorrectPrice) / maxCorrectPrice;
  const waitRecommended = overpayRatio > MARGINAL_OVERPAY_THRESHOLD && (alternativesAvailable ?? 0) > 0;

  let recommendation: string;
  if (overpayRatio <= 0) {
    recommendation = `Conviene rilanciare: ${candidatePrice} crediti è entro il prezzo massimo corretto stimato (${maxCorrectPrice}).`;
  } else if (overpayRatio <= MARGINAL_OVERPAY_THRESHOLD) {
    recommendation = `Al limite: ${candidatePrice} crediti è leggermente sopra il prezzo massimo corretto stimato (${maxCorrectPrice}), valuta quanto ti serve il ruolo prima di continuare.`;
  } else if (waitRecommended) {
    recommendation = `Conviene attendere: ${candidatePrice} crediti è ben sopra il prezzo massimo corretto stimato (${maxCorrectPrice}) e ci sono ${alternativesAvailable} alternative con valore comparabile ancora libere per il ruolo ${player.role}.`;
  } else {
    recommendation = `Meglio lasciar perdere: ${candidatePrice} crediti è ben sopra il prezzo massimo corretto stimato (${maxCorrectPrice}).`;
  }

  if (alternativesAvailable !== null) {
    factors.push({
      label: "Alternative disponibili",
      direction: alternativesAvailable > 0 ? "favorable" : "neutral",
      weight: 0.1,
      detail:
        alternativesAvailable > 0
          ? `${alternativesAvailable} altri giocatori dello stesso ruolo, ancora liberi, hanno un valueScore comparabile (entro il ${Math.round(ALTERNATIVE_VALUE_SCORE_TOLERANCE * 100)}%).`
          : `Nessun altro giocatore dello stesso ruolo con valueScore comparabile è ancora libero: se salta questo, l'alternativa più vicina è di livello diverso.`,
    });
  }

  return {
    question: `Conviene rilanciare su ${player.name} a ${candidatePrice} crediti?`,
    recommendation,
    maxCorrectPrice,
    confidence,
    valuation: buildValuation(candidatePrice, maxCorrectPrice),
    waitRecommended,
    alternativesAvailable,
    rosterRisk,
    teamConcentration,
    explanation: {
      factors,
      confidence,
      summary: `Prezzo proposto ${candidatePrice} crediti vs massimo corretto stimato ${maxCorrectPrice} crediti (${formatSignedPercent(overpayRatio)}).`,
    },
  };
}

const VALUATION_TOLERANCE = 0.05; // entro il 5% dal prezzo massimo corretto: "in linea"

/** "Quanto vale realmente questo rilancio?" (sez. 14): stessa base numerica di
 * `maxCorrectPrice`/`overpayRatio` gia' calcolati sopra, ma espressa come giudizio di valore
 * esplicito invece che come raccomandazione si/no — utile anche per valutare un prezzo GIA'
 * pagato (es. un inserimento passato), non solo un rilancio candidato. */
function buildValuation(
  candidatePrice: number,
  maxCorrectPrice: number,
): DecisionRecommendation["valuation"] {
  const deltaVsMaxPrice = Number(((candidatePrice - maxCorrectPrice) / maxCorrectPrice).toFixed(2));
  const label =
    deltaVsMaxPrice <= -VALUATION_TOLERANCE
      ? "sottopagato"
      : deltaVsMaxPrice <= VALUATION_TOLERANCE
        ? "in linea"
        : "sovrapagato";
  return { label, deltaVsMaxPrice };
}

function formatSignedPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
