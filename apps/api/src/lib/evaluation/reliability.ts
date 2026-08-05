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
 * ruolo), `rotation` da un profilo di rotazione a livello squadra: nessuna delle due fonti
 * e' ancora popolata da un connettore reale (solo Fantacalcio.it, quotazioni, e' attivo),
 * quindi con i dati odierni questa categoria restituisce sempre `null` — ma la logica e' gia'
 * pronta a calcolare valori reali non appena quelle righe esistono nel DB. */
export function computeReliabilityIndices(
  hierarchy: HierarchyInput | undefined,
  rotation: RotationInput | undefined,
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

  factors.push(
    missingDataFactor(
      "Rischio infortuni",
      "Dato non disponibile: nessuna fonte di storico infortuni ancora integrata.",
    ),
  );

  return {
    indices: { starterProbability, reliabilityScore, injuryRisk: null, rotationRisk },
    factors,
  };
}
