import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LeagueConfig, PlayerListItem, SimulationResult } from "@sedinho/shared";
import { ApiError, auctionApi, leaguesApi, playersApi, simulatorApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { formatCredits } from "../lib/playerFormat.js";

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 6,
  fontSize: 12,
};

const tierLabels: Record<SimulationResult["tier"], string> = {
  starter: "Titolare",
  backup: "Prima alternativa / rincalzo",
  filler: "Riserva / tappabuchi",
};

/** Simulatore (sez. 15): Monte Carlo per un giocatore alla volta, scope scelto esplicitamente
 * con l'utente al posto di simulare l'intera asta (vedi CLAUDE.md §5) — nessuno storico
 * comportamentale reale dei rivali su cui tarare un modello multi-partecipante. Tab dedicata
 * (coerente con la direzione UX in CLAUDE.md §9), funziona anche senza un'asta attiva: usa i
 * dati reali dell'asta in corso quando c'è, altrimenti una stima generica pre-asta. */
export function SimulatorPage() {
  const [league, setLeague] = useState<LeagueConfig | null | undefined>(undefined);
  const [pool, setPool] = useState<PlayerListItem[] | undefined>(undefined);
  const [activeAuctionId, setActiveAuctionId] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlayerListItem | null>(null);
  const [budget, setBudget] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => setLeague(leagues[0] ?? null))
      .catch(() => setLeague(null));
    playersApi
      .list()
      .then(setPool)
      .catch(() => setPool([]));
    auctionApi
      .getActive()
      .then((auction) => {
        setActiveAuctionId(auction.id);
        const me = auction.participants.find((p) => p.isMe);
        if (me) setBudget(String(me.budgetRemaining));
      })
      .catch(() => setActiveAuctionId(null));
  }, []);

  useEffect(() => {
    if (activeAuctionId === undefined) return;
    if (activeAuctionId === null && league && !budget) {
      setBudget(String(league.initialBudget));
    }
  }, [activeAuctionId, league, budget]);

  const searchResults = useMemo(() => {
    if (!pool || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [pool, search]);

  async function handleSimulate() {
    if (!selected) return;
    const myBudget = Number(budget);
    if (!Number.isFinite(myBudget) || myBudget <= 0) {
      setError("Inserisci un budget valido.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResult(
        await simulatorApi.simulatePlayer({
          playerId: selected.id,
          myBudget,
          auctionId: activeAuctionId ?? undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  const chartData = result?.winProbabilityByBudget.map((o) => ({
    budget: o.budget,
    "Probabilità di aggiudicazione": Math.round(o.winProbability * 100),
  }));

  if (league === undefined || pool === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (league === null) {
    return <p className="text-slate-400">Configura prima la lega dal Setup Wizard.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulatore</h1>
        <p className="mt-1 text-slate-400">
          Scegli un giocatore e un budget: simula migliaia di scenari di prezzo e restituisce
          intervallo, probabilità di aggiudicazione e come cambia a budget diversi.{" "}
          {activeAuctionId ? (
            <span className="text-emerald-400">Sta usando i dati reali dell'asta in corso.</span>
          ) : (
            <span className="text-amber-400">
              Nessuna asta in corso: stima generica dalla sola composizione rosa della lega.
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="relative">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
            Giocatore
          </label>
          <input
            value={selected ? selected.name : search}
            onChange={(e) => {
              setSelected(null);
              setResult(null);
              setSearch(e.target.value);
            }}
            placeholder="Cerca un giocatore…"
            className="w-64 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          {!selected && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border border-slate-800 bg-slate-950 shadow-lg">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setSearch("");
                  }}
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
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
            Il tuo budget (cr.)
          </label>
          <input
            type="number"
            min={1}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-28 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleSimulate}
          disabled={!selected || loading}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          {loading ? "Simulo…" : "Simula"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
              {tierLabels[result.tier]}
            </span>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">
              {result.iterations.toLocaleString("it-IT")} scenari simulati
            </span>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">
              confidenza {Math.round(result.explanation.confidence * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="p10" value={formatCredits(result.priceRange.p10)} />
            <StatTile label="Mediano" value={formatCredits(result.priceRange.p50)} highlight />
            <StatTile label="p90" value={formatCredits(result.priceRange.p90)} />
            <StatTile
              label="Prob. aggiudicazione"
              value={`${Math.round(result.winProbability * 100)}%`}
              highlight
            />
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-300">
              Probabilità di aggiudicazione per budget (strategie alternative)
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="budget" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="Probabilità di aggiudicazione" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-medium text-slate-300">Analisi di sensibilità</h2>
            {result.explanation.factors.map((factor, i) => (
              <p key={i} className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">{factor.label}:</span> {factor.detail}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Nessuno storico prezzi reale della tua lega è disponibile: la distribuzione simulata è
        un'euristica dichiarata (informata da alcuni riferimenti qualitativi forniti, non
        calibrata su un dataset reale), non una previsione garantita.
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${highlight ? "text-emerald-400" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}
