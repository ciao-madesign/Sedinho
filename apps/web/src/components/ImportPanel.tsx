import { useState } from "react";
import type { ImportRunSummary, ImportSourceResult, InjuryImportSummary } from "@sedinho/shared";
import { ApiError, importApi } from "../lib/api.js";

const sourceLabels: Record<string, string> = {
  "fantacalcio-it": "Fantacalcio.it",
  fstats: "FSTATS",
  fantacalciopedia: "Fantacalciopedia",
  transfermarkt: "Transfermarkt",
};

const statusStyles: Record<ImportSourceResult["status"], string> = {
  success: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-slate-500",
};

const statusLabels: Record<ImportSourceResult["status"], string> = {
  success: "OK",
  failed: "Errore",
  skipped: "Non implementato",
};

/** Pulsante "Aggiorna Database" (sez. 5): unico punto da cui parte l'import dati, mai
 * automatico. Mostra il riepilogo per fonte cosi' com'e' restituito da POST /import/run,
 * inclusi gli errori dei connettori non ancora completati o falliti. */
export function ImportPanel() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<ImportRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningInjuries, setRunningInjuries] = useState(false);
  const [injurySummary, setInjurySummary] = useState<InjuryImportSummary | null>(null);
  const [injuryError, setInjuryError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      setSummary(await importApi.run());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Errore imprevisto durante l'aggiornamento.",
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleRunInjuries() {
    setRunningInjuries(true);
    setInjuryError(null);
    try {
      setInjurySummary(await importApi.runInjuries());
    } catch (err) {
      setInjuryError(
        err instanceof ApiError ? err.message : "Errore imprevisto durante l'importazione infortuni.",
      );
    } finally {
      setRunningInjuries(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-medium">Aggiorna Database</h2>
          <p className="mt-1 text-sm text-slate-500">
            Importa trasferimenti, statistiche, gerarchie e quotazioni dalle fonti configurate.
            Nessun aggiornamento è automatico: parte solo da qui.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={handleRun}
          className="whitespace-nowrap rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          {running ? "Aggiornamento…" : "Aggiorna Database"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {summary && (
        <ul className="mt-4 space-y-2 text-sm">
          {summary.results.map((result) => (
            <li key={result.source} className="rounded border border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {sourceLabels[result.source] ?? result.source}
                </span>
                <span className={statusStyles[result.status]}>
                  {statusLabels[result.status]}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {result.recordsFound} trovati · {result.recordsUpserted} salvati ·{" "}
                {result.durationMs}ms
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {result.errors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          <li className="rounded border border-slate-800 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Valutazioni giocatori</span>
              <span className="text-slate-400">
                confidenza media {Math.round(summary.evaluation.averageConfidence * 100)}%
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {summary.evaluation.evaluated} giocatori ricalcolati. La confidenza cresce man
              mano che FSTATS e Fantacalciopedia vengono completati.
            </div>
          </li>
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
        <div>
          <h2 className="text-sm font-medium">Aggiorna infortuni (Transfermarkt)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Azione separata, non in spec: importa lo storico infortuni solo per i giocatori con
            quotazione più alta (una ricerca per giocatore, niente lista comoda come le altre
            fonti). Selettori non ancora verificati dal vivo: primo giro da controllare qui sotto.
          </p>
        </div>
        <button
          type="button"
          disabled={runningInjuries}
          onClick={handleRunInjuries}
          className="whitespace-nowrap rounded border border-sky-500/40 px-3 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
        >
          {runningInjuries ? "Importazione…" : "Aggiorna infortuni"}
        </button>
      </div>

      {injuryError && <p className="mt-2 text-sm text-red-400">{injuryError}</p>}

      {injurySummary && (
        <div className="mt-3 rounded border border-slate-800 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Transfermarkt</span>
            <span className="text-slate-400">
              {injurySummary.matched}/{injurySummary.targeted} giocatori trovati ·{" "}
              {injurySummary.seasonsUpdated} stagioni aggiornate
            </span>
          </div>
          {injurySummary.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {injurySummary.errors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
