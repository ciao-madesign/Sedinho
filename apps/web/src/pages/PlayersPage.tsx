import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerListItem, PlayerRole } from "@sedinho/shared";
import { playersApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ShortlistStarButton } from "../components/ShortlistStarButton.js";
import { useShortlist } from "../lib/useShortlist.js";
import { formatCredits, formatPercent, roleLabels } from "../lib/playerFormat.js";

type SortKey = "name" | "quotation" | "value" | "starter";

const roleFilters: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "value", label: "Valore" },
  { key: "quotation", label: "Quotazione" },
  { key: "starter", label: "Prob. titolare" },
  { key: "name", label: "Nome" },
];

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerListItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<PlayerRole | "ALL">("ALL");
  const [team, setTeam] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const shortlist = useShortlist();

  useEffect(() => {
    playersApi
      .list()
      .then(setPlayers)
      .catch(() => setError("Impossibile caricare il database giocatori."));
  }, []);

  const teams = useMemo(() => {
    if (!players) return [];
    return Array.from(new Set(players.map((p) => p.team).filter(Boolean))).sort();
  }, [players]);

  const filtered = useMemo(() => {
    if (!players) return [];
    const query = search.trim().toLowerCase();
    return players
      .filter((p) => role === "ALL" || p.role === role)
      .filter((p) => team === "ALL" || p.team === team)
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .sort((a, b) => {
        switch (sortKey) {
          case "quotation":
            return (b.initialQuotation ?? -1) - (a.initialQuotation ?? -1);
          case "value":
            return (b.valueScore ?? -1) - (a.valueScore ?? -1);
          case "starter":
            return (b.starterProbability ?? -1) - (a.starterProbability ?? -1);
          default:
            return a.name.localeCompare(b.name);
        }
      });
  }, [players, role, team, search, sortKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Giocatori</h1>
        <p className="mt-1 text-slate-400">
          {error
            ? "Impossibile caricare il database giocatori."
            : players
              ? `${filtered.length} di ${players.length} giocatori nel database centrale.`
              : "Caricamento…"}
        </p>
      </div>

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

      {players && (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-4 py-2.5 font-medium"></th>
                  <th className="px-4 py-2.5 font-medium">Giocatore</th>
                  <th className="px-4 py-2.5 font-medium">Squadra</th>
                  <th className="px-4 py-2.5 font-medium text-right">Quotazione</th>
                  <th className="px-4 py-2.5 font-medium text-right">Valore</th>
                  <th className="px-4 py-2.5 font-medium text-right">Prob. titolare</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {filtered.map((player) => (
                  <tr key={player.id} className="transition-colors hover:bg-slate-900/60">
                    <td className="px-4 py-2.5">
                      <ShortlistStarButton
                        active={shortlist.entryByPlayerId.has(player.id)}
                        onToggle={() => shortlist.toggle(player.id)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/players/${player.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-emerald-400"
                      >
                        <PlayerRoleBadge role={player.role} />
                        {player.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{player.team || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                      {formatCredits(player.initialQuotation)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {player.valueScore !== null ? (
                        <span
                          className={
                            player.valueScore >= 0.7
                              ? "text-emerald-400"
                              : player.valueScore <= 0.3
                                ? "text-rose-400"
                                : "text-slate-300"
                          }
                        >
                          {formatPercent(player.valueScore)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                      {formatPercent(player.starterProbability)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {player.hierarchyLevel === "starter" && (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                            Titolare
                          </span>
                        )}
                        {player.setPieceTypes.length > 0 && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                            Piazzati
                          </span>
                        )}
                        {player.availability !== "available" && (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-400">
                            {player.availability === "injured" ? "Infortunato" : "Non disp."}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Ruolo: {roleLabels[role as PlayerRole] ?? "tutti i ruoli"}. La colonna "Valore" è il
        percentile della quotazione tra i giocatori dello stesso ruolo — le altre voci
        (produzione, bonus, stabilità) restano parziali finché le fonti collegate non coprono
        tutti i giocatori (vedi dettaglio).
      </p>
    </div>
  );
}
