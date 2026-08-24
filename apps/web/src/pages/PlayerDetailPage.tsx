import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ExplanationFactor } from "@sedinho/shared";
import { playersApi, type PlayerDetail } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ShortlistStarButton } from "../components/ShortlistStarButton.js";
import { useShortlist } from "../lib/useShortlist.js";
import {
  availabilityLabels,
  formatCredits,
  formatPercent,
  hierarchyLabels,
  roleLabels,
  setPieceLabels,
} from "../lib/playerFormat.js";

const directionStyles: Record<ExplanationFactor["direction"], string> = {
  favorable: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  unfavorable: "border-rose-500/30 bg-rose-500/5 text-rose-300",
  neutral: "border-slate-700 bg-slate-900 text-slate-400",
};

function IndexGrid({ indices }: { indices: Record<string, number | null> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Object.entries(indices).map(([key, value]) => (
        <div key={key} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{key}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {value === null ? <span className="text-slate-700">n/d</span> : formatPercent(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerDetail | null | undefined>(undefined);
  const shortlist = useShortlist();

  useEffect(() => {
    if (!id) return;
    setPlayer(undefined);
    playersApi
      .get(id)
      .then(setPlayer)
      .catch(() => setPlayer(null));
  }, [id]);

  if (player === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (player === null) {
    return (
      <div className="space-y-3">
        <p className="text-slate-400">Giocatore non trovato.</p>
        <Link to="/players" className="text-emerald-400 hover:underline">
          ← Torna ai giocatori
        </Link>
      </div>
    );
  }

  const evaluation = player.evaluations[0];

  return (
    <div className="space-y-6">
      <Link to="/players" className="text-sm text-slate-500 hover:text-slate-300">
        ← Giocatori
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <PlayerRoleBadge role={player.role} />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {player.name}
            <ShortlistStarButton
              active={shortlist.entryByPlayerId.has(player.id)}
              onToggle={() => shortlist.toggle(player.id)}
            />
          </h1>
          <p className="text-sm text-slate-400">
            {roleLabels[player.role]} · {player.team || "squadra sconosciuta"} ·{" "}
            {availabilityLabels[player.availability]}
          </p>
        </div>
      </div>

      {player.delistedAt && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          Non più confermato dall'ultimo listone ufficiale Fantacalcio.it (dal{" "}
          {new Date(player.delistedAt).toLocaleDateString("it-IT")}). I dati sotto restano quelli
          dell'ultimo aggiornamento in cui era presente — potrebbe essere svincolato, fuori rosa o
          semplicemente non ancora ricomparso nel listone.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Quotazione</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCredits(player.initialQuotation)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Prezzo atteso</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCredits(evaluation?.value.expectedAuctionPrice ?? null)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Prob. titolare</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatPercent(evaluation?.reliability.starterProbability ?? null)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Confidenza dati</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
            {formatPercent(evaluation?.explanation.confidence ?? null)}
          </div>
        </div>
      </div>

      {(player.hierarchies.length > 0 || player.setPieceRoles.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {player.hierarchies.map((h) => (
            <span
              key={h.id}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
            >
              {hierarchyLabels[h.level]} · {formatPercent(h.reliability)} affidabilità
            </span>
          ))}
          {player.setPieceRoles.map((sp) => (
            <span
              key={sp.id}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300"
            >
              {setPieceLabels[sp.type]} · {formatPercent(sp.probability)}
            </span>
          ))}
        </div>
      )}

      {evaluation ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Affidabilità</h2>
            <IndexGrid
              indices={{
                Titolarità: evaluation.reliability.starterProbability,
                Affidabilità: evaluation.reliability.reliabilityScore,
                "Rischio infortunio": evaluation.reliability.injuryRisk,
                "Rischio turnover": evaluation.reliability.rotationRisk,
              }}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Produzione attesa</h2>
            <IndexGrid
              indices={{
                Gol: evaluation.production.expectedGoals,
                Assist: evaluation.production.expectedAssists,
                Minuti: evaluation.production.expectedMinutes,
                Fantapunti: evaluation.production.expectedFantasyPoints,
              }}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Bonus</h2>
            <IndexGrid
              indices={{
                Rigori: evaluation.bonus.penaltyPotential,
                Punizioni: evaluation.bonus.freeKickPotential,
                "Porta inviolata": evaluation.bonus.cleanSheetPotential,
                Assist: evaluation.bonus.assistPotential,
              }}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Stabilità</h2>
            <IndexGrid
              indices={{
                "Rendimento minimo": evaluation.stability.floorScore,
                "Rendimento massimo": evaluation.stability.ceilingScore,
                Costanza: evaluation.stability.consistencyIndex,
                Volatilità: evaluation.stability.volatilityIndex,
              }}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Convenienza</h2>
            <IndexGrid
              indices={{
                Valore: evaluation.value.valueScore,
                Efficienza: evaluation.value.efficiencyIndex,
                Opportunità: evaluation.value.opportunityScore,
              }}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Spiegazione</h2>
            <p className="text-sm text-slate-400">{evaluation.explanation.summary}</p>
            <div className="space-y-2">
              {evaluation.explanation.factors.map((factor, index) => (
                <div
                  key={index}
                  className={`rounded-md border px-3 py-2 text-sm ${directionStyles[factor.direction]}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{factor.label}</span>
                    <span className="text-xs tabular-nums opacity-70">
                      peso {formatPercent(factor.weight)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs opacity-80">{factor.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Nessuna valutazione ancora calcolata per questo giocatore.
        </p>
      )}

      {player.seasonStats.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Storico fantamedia</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Stagione</th>
                  <th className="px-3 py-2 font-medium text-right">Presenze</th>
                  <th className="px-3 py-2 font-medium text-right">Media voto</th>
                  <th className="px-3 py-2 font-medium text-right">Fantamedia</th>
                  <th className="px-3 py-2 font-medium text-right">Gol</th>
                  <th className="px-3 py-2 font-medium text-right">Assist</th>
                  <th className="px-3 py-2 font-medium text-right">% partite saltate per infortunio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {[...player.seasonStats]
                  .sort((a, b) => b.season.localeCompare(a.season))
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        {s.season} · {s.competition}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.appearances}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.averageRating.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.fantasyAvg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.goals}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.assists}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {s.injuryAbsenceRate !== null
                          ? `${Math.round(s.injuryAbsenceRate * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Storico multi-stagione (finché disponibile dalla fonte). "% partite saltate per
            infortunio" richiede uno storico infortuni per giocatore non ancora collegato da
            nessuna fonte: resta "—" finché non lo sarà, mai una stima.
          </p>
        </section>
      )}

      {player.transfers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Trasferimenti</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Da</th>
                  <th className="px-3 py-2 font-medium">A</th>
                  <th className="px-3 py-2 font-medium text-right">Prob. titolarità dopo</th>
                  <th className="px-3 py-2 font-medium text-right">Impatto titolarità</th>
                  <th className="px-3 py-2 font-medium text-right">Impatto minuti</th>
                  <th className="px-3 py-2 font-medium text-right">Impatto bonus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {[...player.transfers]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((t) => (
                    <tr key={t.id} className={t.isHighlighted ? "bg-emerald-950/30" : undefined}>
                      <td className="px-3 py-2 text-slate-400">
                        {new Date(t.date).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-3 py-2">{t.fromTeam}</td>
                      <td className="px-3 py-2">{t.toTeam}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Math.round(t.newStarterProbability * 100)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.startingRoleImpact > 0 ? "+" : ""}
                        {t.startingRoleImpact}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.minutesImpact > 0 ? "+" : ""}
                        {t.minutesImpact}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.bonusImpact > 0 ? "+" : ""}
                        {t.bonusImpact}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Cambio squadra rilevato confrontando la valutazione del giocatore prima e dopo il
            trasferimento (sez. 6): un impatto a 0 significa "dato insufficiente per calcolarlo",
            non necessariamente "nessun cambiamento". Righe evidenziate: probabilità di titolarità
            dopo il trasferimento oltre il 55%.
          </p>
        </section>
      )}
    </div>
  );
}
