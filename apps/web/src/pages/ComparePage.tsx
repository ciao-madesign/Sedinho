import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ActiveAuctionState, PlayerListItem, PlayerRole } from "@sedinho/shared";
import { auctionApi, playersApi, type PlayerDetail } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ROSTER_RADAR_AXES } from "../lib/rosterRadarFormat.js";

const MAX_PLAYERS = 4;
const PLAYER_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

type PlayerSortKey = "value" | "quotation" | "starter" | "name";

const ROLE_FILTERS: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

/** Stessi colori per ruolo usati altrove nell'app (`playerFormat.ts`, versione esadecimale per
 * Recharts che non legge le classi Tailwind). */
const ROLE_COLORS: Record<PlayerRole, string> = {
  P: "#fbbf24",
  D: "#38bdf8",
  C: "#34d399",
  A: "#fb7185",
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
}

const PLAYER_SORT_OPTIONS: { key: PlayerSortKey; label: string }[] = [
  { key: "value", label: "Valore" },
  { key: "quotation", label: "Quotazione" },
  { key: "starter", label: "Prob. titolare" },
  { key: "name", label: "Nome" },
];

function latestSeason(player: PlayerDetail) {
  return [...player.seasonStats].sort((a, b) => b.season.localeCompare(a.season))[0] ?? null;
}

/** Sistema grafico (sez. 10), primo blocco: "grafici sovrapponibili" è la funzionalità che la
 * spec segnala come fondamentale — 2+ giocatori confrontati sullo stesso grafico. Partito da un
 * sottoinsieme mirato (fantamedia storica, produzione, prezzo) concordato con l'utente, non
 * tutti i 9 tipi di grafico della spec: radar/heatmap/box plot/distribuzioni/timeline restano
 * da fare in un secondo giro. */
export function ComparePage() {
  const [mode, setMode] = useState<"giocatori" | "rose">("giocatori");
  const [pool, setPool] = useState<PlayerListItem[] | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<PlayerRole | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [sortKey, setSortKey] = useState<PlayerSortKey>("value");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, PlayerDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [auction, setAuction] = useState<ActiveAuctionState | null | undefined>(undefined);
  const [scatterRole, setScatterRole] = useState<PlayerRole | "ALL">("ALL");

  useEffect(() => {
    playersApi
      .list()
      .then(setPool)
      .catch(() => setPool([]));
  }, []);

  useEffect(() => {
    if (mode !== "rose" || auction !== undefined) return;
    auctionApi
      .getActive()
      .then(setAuction)
      .catch(() => setAuction(null));
  }, [mode, auction]);

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

  const teams = useMemo(() => {
    if (!pool) return [];
    return Array.from(new Set(pool.map((p) => p.team).filter(Boolean))).sort();
  }, [pool]);

  const searchResults = useMemo(() => {
    if (!pool) return [];
    const q = search.trim().toLowerCase();
    return pool
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => role === "ALL" || p.role === role)
      .filter((p) => team === "ALL" || p.team === team)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
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
  }, [pool, search, role, team, sortKey, selectedIds]);

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

  // "Giocatore vs media ruolo/squadra" (sez. 10): medie calcolate su TUTTO il pool (non sul
  // sottoinsieme di giocatori selezionati per il confronto), cosi' rappresentano davvero "la
  // media della categoria" e non si spostano ad ogni selezione.
  const roleAverages = useMemo(() => {
    const byRole: Partial<Record<PlayerRole, number[]>> = {};
    for (const p of pool ?? []) {
      if (p.fantasyAvg === null) continue;
      (byRole[p.role] ??= []).push(p.fantasyAvg);
    }
    return Object.fromEntries(
      (Object.keys(byRole) as PlayerRole[]).map((role) => [role, average(byRole[role]!)]),
    ) as Partial<Record<PlayerRole, number>>;
  }, [pool]);

  const teamAverages = useMemo(() => {
    const byTeam: Record<string, number[]> = {};
    for (const p of pool ?? []) {
      if (p.fantasyAvg === null) continue;
      (byTeam[p.team] ??= []).push(p.fantasyAvg);
    }
    return Object.fromEntries(Object.entries(byTeam).map(([team, vals]) => [team, average(vals)]));
  }, [pool]);

  const vsAverageData = selectedPlayers.map((p) => {
    const s = latestSeason(p);
    return {
      nome: p.name,
      Fantamedia: s?.fantasyAvg ?? 0,
      "Media ruolo": roleAverages[p.role] ?? 0,
      "Media squadra": teamAverages[p.team] ?? 0,
    };
  });

  // Scatter valore/prezzo (sez. 10): su tutto il pool (filtrabile per ruolo), non solo sui
  // giocatori selezionati per il confronto — serve a scovare occasioni a colpo d'occhio, non a
  // confrontare giocatori specifici. Solo giocatori con entrambi i dati noti, mai un punto
  // inventato per un valore mancante.
  const scatterData = useMemo(() => {
    return (pool ?? [])
      .filter((p) => scatterRole === "ALL" || p.role === scatterRole)
      .filter((p) => p.initialQuotation !== null && p.valueScore !== null)
      .map((p) => ({
        id: p.id,
        nome: p.name,
        role: p.role,
        quotazione: p.initialQuotation!,
        valore: Math.round(p.valueScore! * 100),
      }));
  }, [pool, scatterRole]);

  const scatterByRole = useMemo(() => {
    const roles: PlayerRole[] = scatterRole === "ALL" ? ["P", "D", "C", "A"] : [scatterRole];
    return roles.map((role) => ({
      role,
      points: scatterData.filter((p) => p.role === role),
    }));
  }, [scatterData, scatterRole]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Confronti</h1>
        <p className="mt-1 text-slate-400">
          {mode === "giocatori"
            ? `Scegli fino a ${MAX_PLAYERS} giocatori per confrontarli sullo stesso grafico: fantamedia storica, produzione, minuti, prezzo.`
            : "Confronta le rose dei partecipanti a un'asta in corso, sovrapposte sullo stesso radar."}
        </p>
      </div>

      <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-900 p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode("giocatori")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "giocatori" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Giocatori
        </button>
        <button
          type="button"
          onClick={() => setMode("rose")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "rose" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Rose
        </button>
      </div>

      {mode === "giocatori" && (
      <>
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome…"
                className="w-56 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1">
                {ROLE_FILTERS.map((r) => (
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
                className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
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
                onChange={(e) => setSortKey(e.target.value as PlayerSortKey)}
                className="ml-auto rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
              >
                {PLAYER_SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    Ordina per {opt.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-800 bg-slate-950">
              {searchResults.length === 0 ? (
                <p className="p-3 text-center text-sm text-slate-600">Nessun giocatore trovato.</p>
              ) : (
                searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPlayer(p.id)}
                    className="flex w-full items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-900"
                  >
                    <PlayerRoleBadge role={p.role} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.team}</span>
                  </button>
                ))
              )}
            </div>
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

          <ChartCard title="Fantamedia vs media ruolo/squadra">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={vsAverageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="nome" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Fantamedia" fill="#34d399" />
                <Bar dataKey="Media ruolo" fill="#60a5fa" />
                <Bar dataKey="Media squadra" fill="#f472b6" />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-slate-600">
              Medie calcolate sull'ultima stagione Serie A disponibile per ogni giocatore del
              database (0 se nessun giocatore del ruolo/squadra ha fantamedia nota).
            </p>
          </ChartCard>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-300">Scatter quotazione vs valore</h2>
          <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setScatterRole(r)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  scatterRole === r
                    ? "bg-emerald-500 text-slate-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r === "ALL" ? "Tutti" : r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="quotazione"
              name="Quotazione"
              unit=" cr."
              stroke="#64748b"
              fontSize={12}
            />
            <YAxis
              type="number"
              dataKey="valore"
              name="Valore"
              unit="%"
              domain={[0, 100]}
              stroke="#64748b"
              fontSize={12}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={tooltipStyle}
              formatter={(value: number, key: string) =>
                key === "quotazione" ? `${value} cr.` : `${value}%`
              }
              labelFormatter={() => ""}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {scatterByRole.map(({ role, points }) => (
              <Scatter key={role} name={role} data={points} fill={ROLE_COLORS[role]} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-slate-600">
          Ogni punto è un giocatore: quotazione ufficiale (asse X) vs percentile di valore nel
          proprio ruolo (asse Y, `valueScore` del Player Evaluation Engine). In alto a sinistra =
          quotazione bassa ma valore alto, potenziali occasioni. Solo giocatori con entrambi i
          dati noti.
        </p>
      </div>

      <p className="text-xs text-slate-500">
        "Prezzo atteso" viene dal Player Evaluation Engine (sez. 8), non da un prezzo pagato
        realmente — nessuna asta con dati storici sufficienti a mostrare un "prezzo reale" per
        confronto oggi. Grafici istogrammi/box plot/heatmap/distribuzioni/timeline della spec
        (sez. 10) non sono ancora stati costruiti.
      </p>
      </>
      )}

      {mode === "rose" && (
        <RosterComparisonSection auction={auction} />
      )}
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

const ROSTER_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c"];

/** Confronto tra rose (richiesto esplicitamente dall'utente, non in spec): tutte le rose
 * sovrapposte sullo stesso radar, stesso principio "grafici sovrapponibili" già usato per il
 * confronto giocatori sopra — ma qui il radar per singola rosa vive già dentro ogni card in
 * `/auction` (una rosa alla volta, per tenerla leggibile durante l'asta); questa vista invece
 * esiste apposta per il confronto diretto tra più rose, che li' non c'era. Richiede un'asta in
 * corso: il radar di rosa (`rosterRadar`) è calcolato server-side solo dentro
 * `ActiveAuctionState`, non esiste un concetto di "rosa" fuori da un'asta. */
function RosterComparisonSection({ auction }: { auction: ActiveAuctionState | null | undefined }) {
  if (auction === undefined) {
    return <p className="text-sm text-slate-400">Caricamento…</p>;
  }
  if (auction === null) {
    return (
      <p className="text-sm text-slate-500">
        Nessuna asta in corso: il confronto tra rose richiede un'asta attiva (i dati di rosa
        vengono calcolati live durante l'asta, non esistono fuori da una). Avviala dalla tab{" "}
        <span className="text-slate-300">Asta</span>.
      </p>
    );
  }

  const nameById = new Map(auction.participants.map((p) => [p.id, p.name]));
  const data = ROSTER_RADAR_AXES.map(({ key, label }) => {
    const row: Record<string, string | number> = { subject: label };
    for (const profile of auction.rosterRadar) {
      row[nameById.get(profile.participantId) ?? profile.participantId] = profile.axes[key];
    }
    return row;
  });

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-300">Radar di rosa — tutti i partecipanti</h2>
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="subject" stroke="#94a3b8" fontSize={12} />
          <PolarRadiusAxis domain={[0, 100]} stroke="#475569" fontSize={10} tickCount={5} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {auction.rosterRadar.map((profile, i) => {
            const name = nameById.get(profile.participantId) ?? profile.participantId;
            const color = ROSTER_COLORS[i % ROSTER_COLORS.length];
            return (
              <Radar
                key={profile.participantId}
                name={name}
                dataKey={name}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
              />
            );
          })}
        </RadarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate-500">
        0-100 per asse, dai dati già calcolati dal Player Evaluation Engine (bonus/valore/
        stabilità) — nessun nuovo dato raccolto. "Affidabilità" e "Scommessa" sono proxy
        dichiarate su età e stabilità storica del rendimento, non una previsione garantita.
      </p>
    </div>
  );
}
