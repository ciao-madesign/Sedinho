import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlayerListItem } from "@sedinho/shared";
import { playersApi, type PlayerDetail } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";

const MAX_PLAYERS = 4;
const PLAYER_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

function latestSeason(player: PlayerDetail) {
  return [...player.seasonStats].sort((a, b) => b.season.localeCompare(a.season))[0] ?? null;
}

/** Sistema grafico (sez. 10), primo blocco: "grafici sovrapponibili" è la funzionalità che la
 * spec segnala come fondamentale — 2+ giocatori confrontati sullo stesso grafico. Partito da un
 * sottoinsieme mirato (fantamedia storica, produzione, prezzo) concordato con l'utente, non
 * tutti i 9 tipi di grafico della spec: radar/heatmap/box plot/distribuzioni/timeline restano
 * da fare in un secondo giro. */
export function ComparePage() {
  const [pool, setPool] = useState<PlayerListItem[] | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, PlayerDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    playersApi
      .list()
      .then(setPool)
      .catch(() => setPool([]));
  }, []);

  useEffect(() => {
    const missing = selectedIds.filter((id) => !details[id]);
    if (missing.length === 0) return;
    setLoadingDetail(true);
    Promise.all(missing.map((id) => playersApi.get(id)))
      .then((fetched) => {
        setDetails((prev) => {
          const next = { ...prev };
          for (const d of fetched) next[d.id] = d;
          return next;
        });
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedIds, details]);

  const searchResults = useMemo(() => {
    if (!pool || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return pool
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [pool, search, selectedIds]);

  const selectedPlayers = selectedIds.map((id) => details[id]).filter((d): d is PlayerDetail => !!d);
  const colorOf = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length]!;

  function addPlayer(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= MAX_PLAYERS) return;
    setSelectedIds([...selectedIds, id]);
    setSearch("");
  }

  function removePlayer(id: string) {
    setSelectedIds(selectedIds.filter((x) => x !== id));
  }

  const fantamediaData = useMemo(() => {
    const seasons = new Set<string>();
    for (const p of selectedPlayers) for (const s of p.seasonStats) seasons.add(s.season);
    return [...seasons]
      .sort((a, b) => b.localeCompare(a))
      .map((season) => {
        const row: Record<string, string | number> = { stagione: season };
        for (const p of selectedPlayers) {
          const stat = p.seasonStats.find((s) => s.season === season);
          if (stat) row[p.name] = stat.fantasyAvg;
        }
        return row;
      });
  }, [selectedPlayers]);

  const productionData = selectedPlayers.map((p) => {
    const s = latestSeason(p);
    return { nome: p.name, Gol: s?.goals ?? 0, Assist: s?.assists ?? 0 };
  });

  const minutesData = selectedPlayers.map((p) => {
    const s = latestSeason(p);
    return { nome: p.name, Minuti: s?.minutes ?? 0 };
  });

  const priceData = selectedPlayers.map((p) => {
    const evaluation = p.evaluations[0];
    return {
      nome: p.name,
      "Quotazione ufficiale": p.initialQuotation ?? 0,
      "Prezzo atteso": evaluation?.value.expectedAuctionPrice ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Confronti</h1>
        <p className="mt-1 text-slate-400">
          Scegli fino a {MAX_PLAYERS} giocatori per confrontarli sullo stesso grafico: fantamedia
          storica, produzione, minuti, prezzo.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id, i) => {
            const player = pool?.find((p) => p.id === id);
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: colorOf(i), color: colorOf(i) }}
              >
                {player && <PlayerRoleBadge role={player.role} />}
                {player?.name ?? id}
                <button
                  type="button"
                  onClick={() => removePlayer(id)}
                  className="ml-1 text-slate-500 hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            );
          })}
          {selectedIds.length === 0 && (
            <span className="text-sm text-slate-600">Nessun giocatore selezionato.</span>
          )}
        </div>

        {selectedIds.length < MAX_PLAYERS && (
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca un giocatore da aggiungere…"
              className="w-full max-w-sm rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-sm overflow-hidden rounded-md border border-slate-800 bg-slate-950 shadow-lg">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPlayer(p.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
                  >
                    <PlayerRoleBadge role={p.role} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.team}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedPlayers.length === 0 ? (
        <p className="text-sm text-slate-500">
          {loadingDetail ? "Caricamento…" : "Seleziona almeno un giocatore per vedere i grafici."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Fantamedia per stagione">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={fantamediaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="stagione" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {selectedPlayers.map((p, i) => (
                  <Line
                    key={p.id}
                    type="monotone"
                    dataKey={p.name}
                    stroke={colorOf(i)}
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Gol e assist (ultima stagione disponibile)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={productionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="nome" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Gol" fill="#34d399" />
                <Bar dataKey="Assist" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Minuti giocati (ultima stagione disponibile)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={minutesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="nome" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="Minuti" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Quotazione ufficiale vs prezzo atteso">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="nome" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Quotazione ufficiale" fill="#64748b" />
                <Bar dataKey="Prezzo atteso" fill="#fbbf24" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <p className="text-xs text-slate-500">
        "Prezzo atteso" viene dal Player Evaluation Engine (sez. 8), non da un prezzo pagato
        realmente — nessuna asta con dati storici sufficienti a mostrare un "prezzo reale" per
        confronto oggi. Grafici radar/heatmap/box plot/distribuzioni/timeline della spec (sez.
        10) non sono ancora stati costruiti.
      </p>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 6,
  fontSize: 12,
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-300">{title}</h2>
      {children}
    </div>
  );
}
