import { Link } from "react-router-dom";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ShortlistStarButton } from "../components/ShortlistStarButton.js";
import { useShortlist } from "../lib/useShortlist.js";
import { formatCredits, formatPercent, setPieceLabels } from "../lib/playerFormat.js";

/** Sezione "Obiettivi" (shortlist): i giocatori che l'utente vuole tenere d'occhio, con
 * valutazioni live (stessa fonte di PlayersPage/PlayerDetailPage, il Player Evaluation Engine
 * ricalcolato ad ogni "Aggiorna Database") e, se c'è un'asta attiva, lo stato di vendita in
 * tempo reale — richiesto esplicitamente dall'utente per essere visibile "anche durante
 * l'asta" (vedi anche il pannello equivalente in AuctionPage). */
export function ShortlistPage() {
  const shortlist = useShortlist();

  if (shortlist.entries === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Obiettivi</h1>
        <p className="mt-1 text-slate-400">
          I giocatori che vuoi tenere d'occhio, con valutazione aggiornata ad ogni "Aggiorna
          Database". Aggiungili dalla{" "}
          <Link to="/players" className="text-emerald-400 hover:underline">
            pagina Giocatori
          </Link>{" "}
          o dal dettaglio di un giocatore.
        </p>
      </div>

      {shortlist.entries.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun obiettivo ancora. Vai su Giocatori e clicca la stella accanto a chi vuoi tenere d'occhio.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-4 py-2.5 font-medium"></th>
                <th className="px-4 py-2.5 font-medium">Giocatore</th>
                <th className="px-4 py-2.5 font-medium text-right">Quotazione</th>
                <th className="px-4 py-2.5 font-medium text-right">Valore</th>
                <th className="px-4 py-2.5 font-medium text-right">Prob. titolare</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
                <th className="px-4 py-2.5 font-medium">Stato asta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {shortlist.entries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-slate-900/60">
                  <td className="px-4 py-2.5">
                    <ShortlistStarButton active onToggle={() => shortlist.remove(entry.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/players/${entry.playerId}`}
                      className="flex items-center gap-2.5 font-medium hover:text-emerald-400"
                    >
                      <PlayerRoleBadge role={entry.player.role} />
                      {entry.player.name}
                      <span className="text-xs font-normal text-slate-500">
                        {entry.player.team}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                    {formatCredits(entry.player.initialQuotation)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {entry.player.valueScore !== null ? (
                      <span
                        className={
                          entry.player.valueScore >= 0.7
                            ? "text-emerald-400"
                            : entry.player.valueScore <= 0.3
                              ? "text-rose-400"
                              : "text-slate-300"
                        }
                      >
                        {formatPercent(entry.player.valueScore)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                    {formatPercent(entry.player.starterProbability)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {entry.player.hierarchyLevel === "starter" && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                          Titolare
                        </span>
                      )}
                      {entry.player.setPieceTypes.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400"
                        >
                          {setPieceLabels[t]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.sold ? (
                      <span className="whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                        preso da {entry.sold.buyerName} · {formatCredits(entry.sold.price)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
