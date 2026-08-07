import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerRole, ShortlistPriority } from "@sedinho/shared";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ShortlistStarButton } from "../components/ShortlistStarButton.js";
import { useShortlist } from "../lib/useShortlist.js";
import { formatCredits, formatPercent, setPieceLabels } from "../lib/playerFormat.js";
import { priorityBadgeClass, priorityLabels } from "../lib/shortlistFormat.js";

type SortKey = "priority" | "name" | "quotation" | "value" | "starter";

const roleFilters: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Priorità" },
  { key: "value", label: "Valore" },
  { key: "quotation", label: "Quotazione" },
  { key: "starter", label: "Prob. titolare" },
  { key: "name", label: "Nome" },
];

const priorityFilters: (ShortlistPriority | "ALL" | "NONE")[] = ["ALL", 1, 2, 3, "NONE"];

/** Sezione "Obiettivi" (shortlist): i giocatori che l'utente vuole tenere d'occhio, con
 * valutazioni live (stessa fonte di PlayersPage/PlayerDetailPage, il Player Evaluation Engine
 * ricalcolato ad ogni "Aggiorna Database") e, se c'è un'asta attiva, lo stato di vendita in
 * tempo reale — richiesto esplicitamente dall'utente per essere visibile "anche durante
 * l'asta" (vedi anche il pannello equivalente in AuctionPage). Filtri/ordinamento (stesso
 * pattern di PlayersPage, richiesti esplicitamente dall'utente): la shortlist tipicamente ha
 * poche decine di righe, ma diventa comunque più leggibile da ordinare/filtrare a ridosso
 * dell'asta. */
export function ShortlistPage() {
  const shortlist = useShortlist();
  const [role, setRole] = useState<PlayerRole | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState<ShortlistPriority | "ALL" | "NONE">("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");

  const teams = useMemo(() => {
    if (!shortlist.entries) return [];
    return Array.from(new Set(shortlist.entries.map((e) => e.player.team).filter(Boolean))).sort();
  }, [shortlist.entries]);

  const filtered = useMemo(() => {
    if (!shortlist.entries) return [];
    const query = search.trim().toLowerCase();
    return shortlist.entries
      .filter((e) => role === "ALL" || e.player.role === role)
      .filter((e) => team === "ALL" || e.player.team === team)
      .filter((e) => priorityFilter === "ALL" || (priorityFilter === "NONE" ? e.priority === null : e.priority === priorityFilter))
      .filter((e) => !query || e.player.name.toLowerCase().includes(query))
      .sort((a, b) => {
        switch (sortKey) {
          case "priority":
            return (a.priority ?? 99) - (b.priority ?? 99);
          case "quotation":
            return (b.player.initialQuotation ?? -1) - (a.player.initialQuotation ?? -1);
          case "value":
            return (b.player.valueScore ?? -1) - (a.player.valueScore ?? -1);
          case "starter":
            return (b.player.starterProbability ?? -1) - (a.player.starterProbability ?? -1);
          default:
            return a.player.name.localeCompare(b.player.name);
        }
      });
  }, [shortlist.entries, role, team, priorityFilter, search, sortKey]);

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
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome…"
              className="w-56 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-900 p-1">
              {roleFilters.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    role === r
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r === "ALL" ? "Tutti" : r}
                </button>
              ))}
            </div>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="ALL">Tutte le squadre</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-900 p-1">
              {priorityFilters.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    priorityFilter === p
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p === "ALL" ? "Tutte" : p === "NONE" ? "Senza priorità" : priorityLabels[p]}
                </button>
              ))}
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="ml-auto rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  Ordina per {opt.label.toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun obiettivo corrisponde ai filtri.</p>
          ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-4 py-2.5 font-medium"></th>
                <th className="px-4 py-2.5 font-medium">Priorità</th>
                <th className="px-4 py-2.5 font-medium">Giocatore</th>
                <th className="px-4 py-2.5 font-medium text-right">Quotazione</th>
                <th className="px-4 py-2.5 font-medium text-right">Valore</th>
                <th className="px-4 py-2.5 font-medium text-right">Prob. titolare</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
                <th className="px-4 py-2.5 font-medium">Stato asta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filtered.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-slate-900/60">
                  <td className="px-4 py-2.5">
                    <ShortlistStarButton active onToggle={() => shortlist.remove(entry.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={entry.priority ?? ""}
                      onChange={(e) =>
                        shortlist.setPriority(
                          entry.id,
                          e.target.value ? (Number(e.target.value) as ShortlistPriority) : null,
                        )
                      }
                      className={`rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none ${
                        entry.priority ? priorityBadgeClass(entry.priority) : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      <option value="">—</option>
                      <option value="1">{priorityLabels[1]}</option>
                      <option value="2">{priorityLabels[2]}</option>
                      <option value="3">{priorityLabels[3]}</option>
                    </select>
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
        </>
      )}
    </div>
  );
}
