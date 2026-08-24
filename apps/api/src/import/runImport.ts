import type { ImportRunSummary, ImportSourceResult } from "@sedinho/shared";
import type { ImportConnector } from "./types.js";
import { ConnectorNotImplementedError } from "./types.js";
import { upsertPlayerImportRecords, type DetectedTransfer } from "./upsert.js";
import { fantacalcioItConnector } from "./connectors/fantacalcioIt.js";
import { fstatsConnector } from "./connectors/fstats.js";
import { fantacalciopediaConnector } from "./connectors/fantacalciopedia.js";
import { evaluateAllPlayers } from "../lib/evaluation/evaluateAllPlayers.js";
import { updateTeamRotationProfiles } from "../lib/rotation/updateTeamRotationProfiles.js";
import { prisma } from "../db/prisma.js";
import { toPlayerEvaluation } from "../lib/evaluation-mapper.js";
import { computeTransferImpact, snapshotFromEvaluation } from "../lib/transfer/computeTransferImpact.js";
import { snapshotHierarchyBySource, persistHierarchyChanges } from "../lib/hierarchy/updateHierarchyHistory.js";
import { updateDelistedPlayers } from "./updateDelistedPlayers.js";

/** Elenco dei connettori attivi. Aggiungere una nuova fonte = aggiungere un modulo che
 * implementa ImportConnector e registrarlo qui: l'orchestratore non va toccato altrimenti
 * (principio "Modularita'", CLAUDE.md sez. 2). */
const connectors: ImportConnector[] = [
  fantacalcioItConnector,
  fstatsConnector,
  fantacalciopediaConnector,
];

/** Esegue tutti i connettori registrati e fa il merge dei risultati nel DB (sez. 5,
 * "Aggiorna Database"). Chiamata solo dalla rotta POST /import/run, innescata a sua volta
 * solo da un click utente in UI: nessuno scheduler/cron la invoca mai (sez. 2,
 * "Aggiornamento manuale" — principio non negoziabile). */
export async function runImport(): Promise<ImportRunSummary> {
  const startedAt = new Date();
  const results: ImportSourceResult[] = [];
  const allDetectedTransfers: DetectedTransfer[] = [];

  for (const connector of connectors) {
    const t0 = Date.now();
    try {
      // Cambi di gerarchia (sez. 4 Dashboard): istantanea PRIMA dell'upsert di questo
      // connettore per la sua fonte — generico per qualunque connettore scriva `hierarchy`
      // (oggi solo Fantacalciopedia), cosi' l'orchestratore non va toccato se in futuro se ne
      // aggiunge un altro (principio "Modularità").
      const hierarchyBefore = await snapshotHierarchyBySource(connector.id);

      const records = await connector.run();
      const { upserted, errors, detectedTransfers, matchedPlayerIds } = await upsertPlayerImportRecords(
        records,
        {
          source: connector.id,
          reliability: connector.reliability,
          canCreatePlayers: connector.canCreatePlayers,
        },
      );
      allDetectedTransfers.push(...detectedTransfers);

      const hierarchyAfter = await snapshotHierarchyBySource(connector.id);
      await persistHierarchyChanges(connector.id, hierarchyBefore, hierarchyAfter);

      // Giocatori non più confermati dal listone (sez. 5, bug segnalato dall'utente: "vedo
      // giocatori non più presenti nella lista ufficiale ma ancora presenti nel mio
      // database"): solo la fonte autorevole sull'intera rosa (canCreatePlayers) può dire
      // "questo giocatore non c'è più" — le altre fonti coprono solo un sottoinsieme, quindi
      // la loro assenza da un record non significa nulla.
      if (connector.canCreatePlayers) {
        await updateDelistedPlayers(matchedPlayerIds);
      }

      results.push({
        source: connector.id,
        status: "success",
        recordsFound: records.length,
        recordsUpserted: upserted,
        errors,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      const skipped = err instanceof ConnectorNotImplementedError;
      results.push({
        source: connector.id,
        status: skipped ? "skipped" : "failed",
        recordsFound: 0,
        recordsUpserted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: Date.now() - t0,
      });
    }
  }

  // Rotation Engine (sez. 7): ricalcola i profili di rotazione per squadra PRIMA delle
  // PlayerEvaluation, cosi' `reliability.rotationRisk` (già cablato nel motore, vedi
  // lib/evaluation/reliability.ts) trova un profilo reale invece di restare sempre `null`.
  await updateTeamRotationProfiles();

  // Ricalcola le PlayerEvaluation di tutti i giocatori a fine import (sez. 8): resta
  // un'unica azione manuale end-to-end (il click su "Aggiorna Database"), coerente col
  // principio "Aggiornamento manuale" — nessun pulsante/endpoint separato necessario.
  const evaluation = await evaluateAllPlayers();

  // Transfer Engine (sez. 6): per ogni cambio squadra rilevato durante l'upsert (solo
  // Fantacalcio.it/quotazioni puo' scriverlo, vedi import/upsert.ts), confronta la
  // PlayerEvaluation appena ricalcolata (skip 0, "dopo") con quella immediatamente precedente
  // (skip 1, "prima") e persiste una riga Transfer con l'impatto reale — non una previsione.
  // Sequenziale per lo stesso motivo di evaluateAllPlayers/upsertPlayerImportRecords
  // (connection_limit=1 in produzione).
  let transfersDetected = 0;
  for (const transfer of allDetectedTransfers) {
    const [afterRow, beforeRow] = await prisma.playerEvaluation.findMany({
      where: { playerId: transfer.playerId },
      orderBy: { computedAt: "desc" },
      take: 2,
    });
    if (!afterRow || !beforeRow) continue;

    const impact = computeTransferImpact(
      snapshotFromEvaluation(toPlayerEvaluation(beforeRow)),
      snapshotFromEvaluation(toPlayerEvaluation(afterRow)),
    );

    await prisma.transfer.create({
      data: {
        playerId: transfer.playerId,
        fromTeam: transfer.fromTeam,
        toTeam: transfer.toTeam,
        date: new Date(),
        startingRoleImpact: impact.startingRoleImpact,
        minutesImpact: impact.minutesImpact,
        bonusImpact: impact.bonusImpact,
        riskDelta: impact.riskDelta,
        fantasyValueDelta: impact.fantasyValueDelta,
        newStarterProbability: impact.newStarterProbability,
        isHighlighted: impact.isHighlighted,
        source: "fantacalcio-it",
      },
    });
    transfersDetected += 1;
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results,
    evaluation,
    transfersDetected,
  };
}
