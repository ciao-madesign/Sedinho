import { useEffect, useState } from "react";
import type { FinalReport, FinalReportOperation } from "@sedinho/shared";
import { ApiError, auctionApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { formatCredits, formatPercent, roleLabels } from "../lib/playerFormat.js";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-200">{value}</div>
      {sub && <div className="text-[11px] text-slate-600">{sub}</div>}
    </div>
  );
}

function OperationRow({ op }: { op: FinalReportOperation }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-800/60 px-3 py-1.5 text-sm last:border-0">
      <PlayerRoleBadge role={op.role} />
      <span className="flex-1 truncate">{op.name}</span>
      <span className="text-xs text-slate-500">{op.team}</span>
      <span className="tabular-nums text-slate-300">{formatCredits(op.price)}</span>
      {op.deltaPercent !== null && (
        <span
          className={`w-14 shrink-0 text-right text-xs tabular-nums ${
            op.deltaPercent < 0 ? "text-emerald-400" : op.deltaPercent > 0 ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {op.deltaPercent > 0 ? "+" : ""}
          {Math.round(op.deltaPercent * 100)}%
        </span>
      )}
    </div>
  );
}

/** Report finale (sez. 16): prodotto al termine dell'asta (o in corso, come report parziale)
 * per la rosa del partecipante "io" — tutti gli indicatori sono calcolati on-demand dai dati
 * già raccolti da Player Evaluation Engine + inserimenti dell'asta, nessuna nuova fonte. Tab
 * dedicata (coerente con la direzione UX §9). */
export function ReportPage() {
  const [auctionId, setAuctionId] = useState<string | null | undefined>(undefined);
  const [report, setReport] = useState<FinalReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auctionApi
      .getLatest()
      .then((a) => setAuctionId(a.id))
      .catch(() => setAuctionId(null));
  }, []);

  useEffect(() => {
    if (!auctionId) return;
    auctionApi
      .getReport(auctionId)
      .then(setReport)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
        setReport(null);
      });
  }, [auctionId]);

  if (auctionId === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (auctionId === null) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Report Finale</h1>
        <p className="text-sm text-slate-500">
          Nessuna asta trovata: il report si può calcolare solo dopo aver avviato almeno un'asta
          dalla tab Asta.
        </p>
      </div>
    );
  }
  if (report === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (report === null) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  const spentRatio = report.budgetInitial > 0 ? report.totalSpent / report.budgetInitial : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Report Finale</h1>
        <p className="mt-1 text-slate-400">
          {report.auctionEndedAt
            ? "Asta terminata — report completo sulla rosa acquistata."
            : "Asta ancora in corso: report parziale, aggiornato con i giocatori acquistati finora."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Giocatori in rosa" value={String(report.rosterSize)} />
        <StatTile
          label="Speso"
          value={formatCredits(report.totalSpent)}
          sub={`${Math.round(spentRatio * 100)}% di ${formatCredits(report.budgetInitial)}`}
        />
        <StatTile
          label="Valore teorico rosa"
          value={report.theoreticalValue !== null ? formatCredits(report.theoreticalValue) : "—"}
          sub={`dato su ${Math.round(report.theoreticalValueCoverage * 100)}% della rosa`}
        />
        <StatTile
          label="Punti attesi"
          value={report.expectedFantasyPoints !== null ? report.expectedFantasyPoints.toFixed(1) : "—"}
          sub={`dato su ${Math.round(report.expectedFantasyPointsCoverage * 100)}% della rosa`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Distribuzione del rischio</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-400">
              Basso: {report.riskDistribution.low}
            </span>
            <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-400">
              Medio: {report.riskDistribution.medium}
            </span>
            <span className="rounded bg-rose-500/10 px-2 py-1 text-rose-400">
              Alto: {report.riskDistribution.high}
            </span>
            {report.riskDistribution.unknown > 0 && (
              <span className="rounded bg-slate-800 px-2 py-1 text-slate-500">
                n/d: {report.riskDistribution.unknown}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Euristica su indisponibilità attuale e gerarchia dichiarata, non una probabilità
            calibrata.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Dipendenza da una squadra</h2>
          {report.teamDependency ? (
            <p className="text-sm text-slate-300">
              <span className="font-medium">{report.teamDependency.team}</span>:{" "}
              {Math.round(report.teamDependency.share * 100)}% della rosa
            </p>
          ) : (
            <p className="text-sm text-slate-600">Nessun giocatore ancora acquistato.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Equilibrio tra reparti</h2>
          <div className="space-y-1.5">
            {report.roleBalance.map((rb) => (
              <div key={rb.role} className="flex items-center gap-2 text-sm">
                <PlayerRoleBadge role={rb.role} />
                <span className="text-slate-500">{roleLabels[rb.role]}</span>
                <span className="ml-auto tabular-nums text-slate-300">{rb.count} giocatori</span>
                <span className="w-14 shrink-0 text-right tabular-nums text-slate-400">
                  {rb.averageValueScore !== null ? formatPercent(rb.averageValueScore) : "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Valore medio (percentile della quotazione nel ruolo) dei giocatori acquistati per
            reparto.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-300">Copertura calci piazzati</h2>
          <div className="space-y-2 text-sm">
            <p>
              Rigoristi:{" "}
              {report.penaltyCoverage.covered ? (
                <span className="text-emerald-400">{report.penaltyCoverage.players.join(", ")}</span>
              ) : (
                <span className="text-rose-400">nessuno in rosa</span>
              )}
            </p>
            <p>
              Punizioni/angoli:{" "}
              {report.setPieceCoverage.covered ? (
                <span className="text-emerald-400">{report.setPieceCoverage.players.join(", ")}</span>
              ) : (
                <span className="text-rose-400">nessuno in rosa</span>
              )}
            </p>
            <p className="text-[11px] text-slate-600">
              Esposizione al turnover (sez. 7):{" "}
              {report.turnoverExposure !== null ? formatPercent(report.turnoverExposure) : "n/d — Rotation Engine non ancora implementato"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-medium text-emerald-300">
            Migliori operazioni
          </h2>
          {report.bestOperations.length === 0 ? (
            <p className="p-3 text-sm text-slate-600">Nessun dato sufficiente.</p>
          ) : (
            report.bestOperations.map((op) => <OperationRow key={op.playerId} op={op} />)
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-medium text-rose-300">
            Peggiori operazioni
          </h2>
          {report.worstOperations.length === 0 ? (
            <p className="p-3 text-sm text-slate-600">Nessun dato sufficiente.</p>
          ) : (
            report.worstOperations.map((op) => <OperationRow key={op.playerId} op={op} />)
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm text-slate-300">{report.explanation.summary}</p>
        <div className="mt-2 space-y-1">
          {report.explanation.factors.map((f, i) => (
            <p key={i} className="text-xs text-slate-500">
              <span className="font-medium text-slate-400">{f.label}:</span> {f.detail}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
