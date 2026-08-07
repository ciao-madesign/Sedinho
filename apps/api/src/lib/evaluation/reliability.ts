import type {
  ExplanationFactor,
  HierarchyLevel,
  ReliabilityIndices,
} from "@sedinho/shared";
import { missingDataFactor, type IndexCalculation } from "./types.js";

interface HierarchyInput {
  level: HierarchyLevel;
  reliability: number;
}

interface RotationInput {
  turnoverFrequency: number;
  coachReliability: number;
}

const STARTER_WEIGHT: Record<HierarchyLevel, number> = {
  starter: 1,
  "first-alternate": 0.4,
  "second-alternate": 0.15,
};

/** Indici di Affidabilità (sez. 8). `hierarchy` viene da Fantacalciopedia (gerarchie di
 * ruolo, connettore reale) e `rotation` dal Rotation Engine (sez. 7,
 * `lib/rotation/updateTeamRotationProfiles.ts`, ricalcolato ad ogni "Aggiorna Database" prima
 * di questa valutazione): entrambe ora popolate quando la squadra/giocatore hanno dati
 * sufficienti — `null` resta un'informazione onesta ("dato non disponibile per QUESTO
 * giocatore/squadra"), non un limite strutturale come prima. */
export function computeReliabilityIndices(
  hierarchy: HierarchyInput | undefined,
  rotation: RotationInput | undefined,
  /** Frazione (0..1) di partite saltate per infortunio nell'ultima stagione con dato
   * disponibile (sez. 4 "Storico infortuni"), `undefined`/`null` se nessuna fonte la fornisce
   * ancora per questo giocatore. */
  injuryAbsenceRate: number | null | undefined,
): IndexCalculation<ReliabilityIndices> {
  const factors: ExplanationFactor[] = [];
  let starterProbability: number | null = null;
  let reliabilityScore: number | null = null;
  let rotationRisk: number | null = null;

  if (hierarchy) {
    starterProbability = Number(
      (hierarchy.reliability * STARTER_WEIGHT[hierarchy.level]).toFixed(2),
    );
    reliabilityScore = hierarchy.reliability;
    factors.push({
      label: "Gerarchia di ruolo",
      direction: hierarchy.level === "starter" ? "favorable" : "unfavorable",
      weight: 0.6,
      detail: `Livello "${hierarchy.level}" con affidabilità ${hierarchy.reliability} (fonte: Fantacalciopedia).`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Gerarchia di ruolo",
        "Dato non disponibile: richiede il connettore Fantacalciopedia (non ancora completato).",
      ),
    );
  }

  if (rotation) {
    rotationRisk = Number((rotation.turnoverFrequency * (1 - rotation.coachReliability)).toFixed(2));
    factors.push({
      label: "Rotazioni di squadra",
      direction: rotationRisk > 0.5 ? "unfavorable" : "favorable",
      weight: 0.4,
      detail: `Turnover ${rotation.turnoverFrequency}, stabilità allenatore ${rotation.coachReliability}.`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Profilo di rotazione squadra",
        "Dato non disponibile: nessun profilo di rotazione calcolato per questa squadra (richiede FSTATS/Fantacalciopedia).",
      ),
    );
  }

  let injuryRisk: number | null = null;
  if (injuryAbsenceRate !== null && injuryAbsenceRate !== undefined) {
    injuryRisk = Number(injuryAbsenceRate.toFixed(2));
    factors.push({
      label: "Storico infortuni",
      direction: injuryRisk > 0.15 ? "unfavorable" : "neutral",
      weight: 0.3,
      detail: `${Math.round(injuryRisk * 100)}% delle partite ufficiali saltate per infortunio nell'ultima stagione con dato disponibile.`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Rischio infortuni",
        "Dato non disponibile: nessuna fonte di storico infortuni ancora integrata per questo giocatore.",
      ),
    );
  }

  return {
    indices: { starterProbability, reliabilityScore, injuryRisk, rotationRisk },
    factors,
  };
}
