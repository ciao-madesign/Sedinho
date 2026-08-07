import type { PlayerEvaluation } from "@sedinho/shared";

/** Riassunto di una `PlayerEvaluation` ridotto ai soli campi che servono per l'impatto di un
 * trasferimento — non l'intera valutazione, per tenere il motore puro e disaccoppiato da come
 * il chiamante la ottiene. */
export interface TransferEvaluationSnapshot {
  starterProbability: number | null;
  expectedMinutes: number | null;
  /** Media dei 4 `BonusIndices` disponibili (rigori/punizioni/clean sheet/assist), `null` se
   * nessuno dei quattro è noto. */
  bonusAverage: number | null;
  /** Proxy di rischio (`reliability.injuryRisk`), `null` se non disponibile. */
  riskScore: number | null;
  valueScore: number | null;
}

export function snapshotFromEvaluation(evaluation: PlayerEvaluation): TransferEvaluationSnapshot {
  const bonusValues = [
    evaluation.bonus.penaltyPotential,
    evaluation.bonus.freeKickPotential,
    evaluation.bonus.cleanSheetPotential,
    evaluation.bonus.assistPotential,
  ].filter((v): v is number => v !== null);

  return {
    starterProbability: evaluation.reliability.starterProbability,
    expectedMinutes: evaluation.production.expectedMinutes,
    bonusAverage: bonusValues.length > 0 ? bonusValues.reduce((sum, v) => sum + v, 0) / bonusValues.length : null,
    riskScore: evaluation.reliability.injuryRisk,
    valueScore: evaluation.value.valueScore,
  };
}

export interface TransferImpactResult {
  startingRoleImpact: number;
  minutesImpact: number;
  bonusImpact: number;
  riskDelta: number;
  fantasyValueDelta: number;
  newStarterProbability: number;
  isHighlighted: boolean;
}

const HIGHLIGHT_THRESHOLD = 0.55; // sez. 6: "nuovi acquisti con probabilità di titolarità > 55%"
const MAX_EXPECTED_MINUTES = 90; // per normalizzare il delta minuti in -1..1

function clampDelta(x: number): number {
  return Number(Math.max(-1, Math.min(1, x)).toFixed(2));
}

/** Transfer Engine (sez. 6), motore puro: nessuna dipendenza da Prisma/HTTP, nessuno scraping
 * di calciomercato — il trasferimento viene rilevato per confronto diretto di `Player.team` tra
 * due "Aggiorna Database" successivi (vedi `import/upsert.ts`, l'unica fonte autorevole su
 * `team` e' Fantacalcio.it/quotazioni). L'impatto e' il confronto tra la `PlayerEvaluation` più
 * recente PRIMA del cambio squadra e quella ricalcolata SUBITO DOPO (stessa sessione di
 * "Aggiorna Database", vedi `import/runImport.ts`): non e' una previsione, e' la differenza
 * reale tra come il Player Evaluation Engine vedeva il giocatore prima e dopo. Ogni delta senza
 * dato sufficiente (prima o dopo) resta a 0 (neutro, "nessuna prova di cambiamento") — i campi
 * Prisma sono `Float` non-nullable (sez. 6 della spec li vuole sempre calcolati), quindi non si
 * può propagare `null` come altrove nell'app; lo `0` qui e' dichiarato esplicitamente come
 * "dato insufficiente", non "nessun impatto reale". */
export function computeTransferImpact(
  before: TransferEvaluationSnapshot,
  after: TransferEvaluationSnapshot,
): TransferImpactResult {
  const startingRoleImpact =
    before.starterProbability !== null && after.starterProbability !== null
      ? clampDelta(after.starterProbability - before.starterProbability)
      : 0;
  const minutesImpact =
    before.expectedMinutes !== null && after.expectedMinutes !== null
      ? clampDelta((after.expectedMinutes - before.expectedMinutes) / MAX_EXPECTED_MINUTES)
      : 0;
  const bonusImpact =
    before.bonusAverage !== null && after.bonusAverage !== null
      ? clampDelta(after.bonusAverage - before.bonusAverage)
      : 0;
  const riskDelta =
    before.riskScore !== null && after.riskScore !== null
      ? clampDelta(after.riskScore - before.riskScore)
      : 0;
  const fantasyValueDelta =
    before.valueScore !== null && after.valueScore !== null
      ? clampDelta(after.valueScore - before.valueScore)
      : 0;
  const newStarterProbability = after.starterProbability ?? 0;

  return {
    startingRoleImpact,
    minutesImpact,
    bonusImpact,
    riskDelta,
    fantasyValueDelta,
    newStarterProbability,
    isHighlighted: newStarterProbability > HIGHLIGHT_THRESHOLD,
  };
}
