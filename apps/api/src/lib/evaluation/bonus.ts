import type { BonusIndices, ExplanationFactor, SetPieceType } from "@sedinho/shared";
import { missingDataFactor, type IndexCalculation } from "./types.js";

interface SetPieceInput {
  type: SetPieceType;
  probability: number;
}

interface SeasonStatsInput {
  season: string;
  appearances: number;
  cleanSheets: number;
  xA: number;
  assists: number;
}

const PENALTY_TYPES: SetPieceType[] = ["penalty-1", "penalty-2", "penalty-3"];
const FREE_KICK_TYPES: SetPieceType[] = ["direct-free-kick-1", "direct-free-kick-2"];

function bestProbability(setPieces: SetPieceInput[], types: SetPieceType[]): number | null {
  const matches = setPieces.filter((sp) => types.includes(sp.type));
  if (matches.length === 0) return null;
  return Math.max(...matches.map((sp) => sp.probability));
}

/** Potenziale Bonus (sez. 8): rigori/punizioni da `SetPieceRole` (Fantacalciopedia), clean
 * sheet e assist da `SeasonStats` (FSTATS). Nessuna delle due fonti e' ancora popolata da un
 * connettore reale, quindi con i dati odierni restituisce sempre `null` per i campi senza
 * corrispondenza. */
export function computeBonusIndices(
  setPieces: SetPieceInput[],
  latestSeason: SeasonStatsInput | undefined,
): IndexCalculation<BonusIndices> {
  const factors: ExplanationFactor[] = [];

  const penaltyPotential = bestProbability(setPieces, PENALTY_TYPES);
  const freeKickPotential = bestProbability(setPieces, FREE_KICK_TYPES);

  if (penaltyPotential !== null || freeKickPotential !== null) {
    factors.push({
      label: "Calci piazzati",
      direction: "favorable",
      weight: 0.5,
      detail: `Probabilità rigore ${penaltyPotential ?? "n/d"}, punizione ${freeKickPotential ?? "n/d"} (fonte: Fantacalciopedia).`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Calci piazzati",
        "Dato non disponibile: richiede il connettore Fantacalciopedia (non ancora completato).",
      ),
    );
  }

  let cleanSheetPotential: number | null = null;
  let assistPotential: number | null = null;

  if (latestSeason && latestSeason.appearances > 0) {
    cleanSheetPotential = Number(
      (latestSeason.cleanSheets / latestSeason.appearances).toFixed(2),
    );
    const assistsPerGame =
      (latestSeason.xA > 0 ? latestSeason.xA : latestSeason.assists) / latestSeason.appearances;
    assistPotential = Number(Math.min(1, assistsPerGame / 0.3).toFixed(2));
    factors.push({
      label: "Statistiche stagionali",
      direction: "neutral",
      weight: 0.5,
      detail: `Clean sheet e assist per-partita dalla stagione ${latestSeason.season} (fonte: FSTATS).`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Statistiche stagionali",
        "Dato non disponibile: richiede il connettore FSTATS (non ancora completato).",
      ),
    );
  }

  return {
    indices: { penaltyPotential, freeKickPotential, cleanSheetPotential, assistPotential },
    factors,
  };
}
