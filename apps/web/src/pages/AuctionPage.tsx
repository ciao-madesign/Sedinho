import { useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type {
  ActiveAuctionState,
  AuctionEntryView,
  DecisionPoolResult,
  DecisionRecommendation,
  LeagueConfig,
  MarketState,
  OpponentProfile,
  Participant,
  PlayerListItem,
  PlayerRole,
  RosterRadarAxes,
  ShortlistEntryView,
  ShortlistPriority,
} from "@sedinho/shared";
import { ApiError, auctionApi, leaguesApi, participantsApi, playersApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { ShortlistStarButton } from "../components/ShortlistStarButton.js";
import { AiCommentaryPanel } from "../components/AiCommentaryPanel.js";
import { ROSTER_RADAR_AXES } from "../lib/rosterRadarFormat.js";
import { useShortlist } from "../lib/useShortlist.js";
import { formatCredits, roleLabels } from "../lib/playerFormat.js";
import { priorityBadgeClass } from "../lib/shortlistFormat.js";

const ROLE_ORDER: PlayerRole[] = ["P", "D", "C", "A"];
const ROLE_FILTERS: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

interface SoldInfo {
  entryId: string;
  price: number;
  buyerName: string;
  buyerId: string;
}

/** Confronta il prezzo pagato con la quotazione ufficiale del singolo giocatore (non con lo
 * stato aggregato del Market Engine, sez. 13, vedi MarketPanel più sotto: granularità diversa,
 * questo è un giudizio per-inserimento). Un'euristica dichiarata, non un giudizio definitivo. */
function rateOperation(price: number, quotation: number | null) {
  if (quotation === null || quotation === 0) {
    return {
      label: "Nessuna quotazione di riferimento",
      tone: "text-slate-500",
      dot: "bg-slate-500",
      delta: null,
    };
  }
  const delta = price - quotation;
  if (delta <= 0) {
    return {
      label: `${Math.abs(delta)} cr. sotto quotazione`,
      tone: "text-emerald-400",
      dot: "bg-emerald-400",
      delta,
    };
  }
  if (delta <= Math.max(1, Math.round(quotation * 0.15))) {
    return {
      label: `${delta} cr. sopra quotazione`,
      tone: "text-slate-400",
      dot: "bg-slate-400",
      delta,
    };
  }
  return {
    label: `${delta} cr. sopra quotazione`,
    tone: "text-amber-400",
    dot: "bg-amber-400",
    delta,
  };
}

function formatSignedPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** Pannello del Market Engine (sez. 13): tutti e 6 i parametri della spec, calcolati
 * esclusivamente sugli inserimenti già registrati in questa asta (vedi
 * apps/api/src/lib/market/computeMarketState.ts). "Temperatura" è un'euristica dichiarata
 * (sovra/sotto-pagamento sugli ultimi 5 inserimenti), non una probabilità calibrata. */
function MarketPanel({ market }: { market: MarketState }) {
  const temperature =
    market.marketTemperature >= 0.65
      ? { label: "Caldo", tone: "text-amber-400" }
      : market.marketTemperature <= 0.35
        ? { label: "Freddo", tone: "text-sky-400" }
        : { label: "In linea", tone: "text-slate-300" };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Inflazione prezzi
          </div>
          <div
            className={`text-sm font-medium tabular-nums ${
              market.priceInflation > 0
                ? "text-amber-400"
                : market.priceInflation < 0
                  ? "text-emerald-400"
                  : "text-slate-300"
            }`}
          >
            {formatSignedPercent(market.priceInflation)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Temperatura mercato
          </div>
          <div className={`text-sm font-medium ${temperature.tone}`}>{temperature.label}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Budget residuo totale
          </div>
          <div className="text-sm font-medium tabular-nums text-slate-300">
            {formatCredits(market.remainingBudgetTotal)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Rilancio medio</div>
          <div className="text-sm font-medium tabular-nums text-slate-300">
            {formatCredits(market.averageBidValue)}
          </div>
        </div>
        <div className="ml-auto flex gap-4">
          {ROLE_ORDER.map((role) => {
            const scarcity = market.starterScarcityByRole[role];
            const deflation = market.roleDeflation[role];
            return (
              <div key={role} className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{role}</div>
                <div className="text-xs tabular-nums text-slate-400">
                  {scarcity !== undefined ? `${Math.round(scarcity * 100)}% titolari presi` : "—"}
                </div>
                {deflation !== undefined && (
                  <div
                    className={`text-[11px] tabular-nums ${
                      deflation > 0 ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {formatSignedPercent(deflation)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-600">
        Calcolato solo sugli inserimenti già fatti in questa asta — nessuna proiezione su quelli
        futuri. "Migliori opportunità" richiesto dalla spec dipende dal Decision Engine (sez.
        14), non ancora implementato.
      </p>
    </div>
  );
}

function NameParticipantsForm({
  count,
  onSubmit,
}: {
  count: number;
  onSubmit: (names: string[], meIndex: number) => Promise<void>;
}) {
  const [names, setNames] = useState<string[]>(() => Array(count).fill(""));
  const [meIndex, setMeIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(names, meIndex);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <p className="text-sm text-slate-400">
        Prima dell'asta, dai un nome ai {count} partecipanti della lega: serve per calcolare
        budget residuo e fabbisogno di ruolo di ognuno man mano che l'asta procede.
      </p>
      <div className="space-y-2">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              placeholder={`Partecipante ${i + 1}`}
              required
              className="flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
              <input
                type="radio"
                name="me"
                checked={meIndex === i}
                onChange={() => setMeIndex(i)}
                className="accent-emerald-500"
              />
              sono io
            </label>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
      >
        {submitting ? "Salvataggio…" : "Continua"}
      </button>
    </form>
  );
}

type BrowserSortKey = "quotation" | "value" | "starter" | "name";

const BROWSER_SORT_OPTIONS: { key: BrowserSortKey; label: string }[] = [
  { key: "quotation", label: "Prezzo" },
  { key: "value", label: "Valore" },
  { key: "starter", label: "Prob. titolare" },
  { key: "name", label: "Nome" },
];

/** Metrica mostrata sulla destra di ogni riga, coerente con l'ordinamento scelto: cosi' si
 * vede sempre il numero per cui si sta ordinando, non solo la quotazione fissa. */
function browserMetric(p: PlayerListItem, sortKey: BrowserSortKey): string {
  switch (sortKey) {
    case "value":
      return p.valueScore !== null ? `${Math.round(p.valueScore * 100)}%` : "—";
    case "starter":
      return p.starterProbability !== null ? `${Math.round(p.starterProbability * 100)}%` : "—";
    default:
      return formatCredits(p.initialQuotation);
  }
}

function PlayersBrowserPanel({
  players,
  soldMap,
  selectedId,
  onSelect,
  shortlistedIds,
  onToggleShortlist,
}: {
  players: PlayerListItem[];
  soldMap: Map<string, SoldInfo>;
  selectedId: string | null;
  onSelect: (player: PlayerListItem) => void;
  shortlistedIds: Set<string>;
  onToggleShortlist: (playerId: string) => void;
}) {
  const [role, setRole] = useState<PlayerRole | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<BrowserSortKey>("quotation");

  const teams = useMemo(
    () => Array.from(new Set(players.map((p) => p.team).filter(Boolean))).sort(),
    [players],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => role === "ALL" || p.role === role)
      .filter((p) => team === "ALL" || p.team === team)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        switch (sortKey) {
          case "value":
            return (b.valueScore ?? -1) - (a.valueScore ?? -1);
          case "starter":
            return (b.starterProbability ?? -1) - (a.starterProbability ?? -1);
          case "name":
            return a.name.localeCompare(b.name);
          default:
            return (b.initialQuotation ?? -1) - (a.initialQuotation ?? -1);
        }
      });
  }, [players, role, team, search, sortKey]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-800 bg-slate-900">
      <div className="space-y-2 border-b border-slate-800 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca giocatore…"
          className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                role === r ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r === "ALL" ? "Tutti" : r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
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
            onChange={(e) => setSortKey(e.target.value as BrowserSortKey)}
            className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          >
            {BROWSER_SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-h-[65vh] overflow-y-auto lg:max-h-[calc(100vh-260px)]">
        {filtered.map((p) => {
          const sold = soldMap.get(p.id);
          const star = (
            <ShortlistStarButton
              active={shortlistedIds.has(p.id)}
              onToggle={() => onToggleShortlist(p.id)}
            />
          );
          if (sold) {
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-sm opacity-40"
              >
                {star}
                <PlayerRoleBadge role={p.role} />
                <span className="flex-1 truncate line-through decoration-slate-600">{p.name}</span>
                <span className="whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                  {sold.buyerName} · {formatCredits(sold.price)}
                </span>
              </div>
            );
          }
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-sm transition-colors hover:bg-slate-800 ${
                selectedId === p.id ? "bg-emerald-500/10" : ""
              }`}
            >
              {star}
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <PlayerRoleBadge role={p.role} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-slate-500">{p.team}</span>
                <span className="w-10 whitespace-nowrap text-right text-xs tabular-nums text-slate-400">
                  {browserMetric(p, sortKey)}
                </span>
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-600">Nessun giocatore trovato.</p>
        )}
      </div>
    </div>
  );
}

/** Sezione "Obiettivi" (shortlist) tenuta in vista durante l'asta live, richiesta
 * esplicitamente dall'utente: mostra i giocatori marcati come obiettivo con lo stesso stato di
 * vendita in tempo reale del pannello a sinistra (stesso `soldMap`, ricalcolato ad ogni
 * inserimento), cliccabili per selezionarli nel form di assegnazione. */
function ShortlistPanel({
  entries,
  soldMap,
  selectedId,
  onSelect,
  onRemove,
  onSetPriority,
}: {
  entries: ShortlistEntryView[];
  soldMap: Map<string, SoldInfo>;
  selectedId: string | null;
  onSelect: (player: PlayerListItem) => void;
  onRemove: (entryId: string) => void;
  onSetPriority: (entryId: string, priority: ShortlistPriority | null) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nessun obiettivo ancora. Clicca la stella accanto a un giocatore per aggiungerlo.
      </p>
    );
  }

  // Priorità (1 = prima scelta) prima, poi chi non ha ancora una priorità assegnata — cosi' la
  // shortlist si riordina da sola man mano che l'utente la imposta, senza un controllo di
  // ordinamento separato in questo pannello compatto (a differenza di /shortlist).
  const sorted = [...entries].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
      <div className="flex flex-col gap-2">
        {sorted.map((entry) => {
          const sold = soldMap.get(entry.playerId);
          if (sold) {
            return (
              <div
                key={entry.id}
                className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs opacity-40"
              >
                <PlayerRoleBadge role={entry.player.role} />
                <span className="line-through decoration-slate-600">{entry.player.name}</span>
                <span className="text-slate-500">
                  {sold.buyerName} · {formatCredits(sold.price)}
                </span>
              </div>
            );
          }
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                selectedId === entry.playerId
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              <select
                value={entry.priority ?? ""}
                onChange={(e) =>
                  onSetPriority(
                    entry.id,
                    e.target.value ? (Number(e.target.value) as ShortlistPriority) : null,
                  )
                }
                title="Priorità"
                className={`rounded px-1 py-0.5 text-[11px] font-medium focus:outline-none ${
                  entry.priority ? priorityBadgeClass(entry.priority) : "bg-slate-800 text-slate-500"
                }`}
              >
                <option value="">—</option>
                <option value="1">1ª</option>
                <option value="2">2ª</option>
                <option value="3">3ª</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    id: entry.player.id,
                    name: entry.player.name,
                    team: entry.player.team,
                    role: entry.player.role,
                    birthDate: entry.player.birthDate,
                    availability: entry.player.availability,
                    initialQuotation: entry.player.initialQuotation,
                    valueScore: entry.player.valueScore,
                    expectedAuctionPrice: entry.player.expectedAuctionPrice,
                    starterProbability: entry.player.starterProbability,
                    hierarchyLevel: entry.player.hierarchyLevel,
                    setPieceTypes: entry.player.setPieceTypes,
                    confidence: null,
                  })
                }
                className="flex items-center gap-1.5"
              >
                <PlayerRoleBadge role={entry.player.role} />
                <span>{entry.player.name}</span>
                <span className="text-slate-500">{formatCredits(entry.player.initialQuotation)}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                className="ml-auto text-slate-700 hover:text-red-400"
                title="Rimuovi dagli obiettivi"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntryBar({
  selectedPlayer,
  participants,
  market,
  onClear,
  onSubmit,
  onAskDecision,
}: {
  selectedPlayer: PlayerListItem | null;
  participants: ActiveAuctionState["participants"];
  market: MarketState;
  onClear: () => void;
  onSubmit: (price: number, buyerId: string) => Promise<void>;
  onAskDecision: (
    candidatePrice: number | undefined,
    buyerId: string,
  ) => Promise<DecisionRecommendation>;
}) {
  const [price, setPrice] = useState("");
  const [buyerId, setBuyerId] = useState(participants[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionRecommendation | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  useEffect(() => {
    setDecision(null);
  }, [selectedPlayer?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError("Prezzo non valido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(priceNumber, buyerId);
      setPrice("");
      setDecision(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAskDecision() {
    setDecisionLoading(true);
    setError(null);
    try {
      const priceNumber = Number(price);
      const candidatePrice = Number.isFinite(priceNumber) && priceNumber > 0 ? priceNumber : undefined;
      setDecision(await onAskDecision(candidatePrice, buyerId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setDecisionLoading(false);
    }
  }

  if (!selectedPlayer) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
        Seleziona un giocatore dall'elenco a sinistra per assegnarlo.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4"
    >
      <div className="flex items-center gap-2">
        <PlayerRoleBadge role={selectedPlayer.role} />
        <div>
          <div className="font-medium">{selectedPlayer.name}</div>
          <div className="text-xs text-slate-500">
            {selectedPlayer.team} · quotazione {formatCredits(selectedPlayer.initialQuotation)}
            {selectedPlayer.initialQuotation !== null &&
              (() => {
                const roleAdjustment =
                  market.roleDeflation[selectedPlayer.role] ?? market.priceInflation;
                if (roleAdjustment === 0) return null;
                const adjusted = Math.round(
                  selectedPlayer.initialQuotation * (1 + roleAdjustment),
                );
                return (
                  <>
                    {" · atteso a mercato "}
                    <span className={roleAdjustment > 0 ? "text-amber-400" : "text-emerald-400"}>
                      {formatCredits(adjusted)} ({formatSignedPercent(roleAdjustment)})
                    </span>
                  </>
                );
              })()}
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-slate-600 hover:text-slate-300"
          title="Deseleziona"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-slate-500">Prezzo</label>
        <input
          type="number"
          min={1}
          autoFocus
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="crediti"
          className="w-24 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-slate-500">Acquirente</label>
        <select
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isMe ? " (io)" : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={handleAskDecision}
        disabled={decisionLoading}
        className="rounded border border-sky-500/40 px-3 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
      >
        {decisionLoading ? "…" : "Conviene rilanciare?"}
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
      >
        {submitting ? "…" : "Assegna"}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
      {decision && (
        <div className="w-full space-y-2 rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-sky-200">{decision.recommendation}</p>
            <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">
              confidenza {Math.round(decision.confidence * 100)}%
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {decision.valuation && (
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  decision.valuation.label === "sottopagato"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : decision.valuation.label === "sovrapagato"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-slate-800 text-slate-400"
                }`}
              >
                {decision.valuation.label} ({formatSignedPercent(decision.valuation.deltaVsMaxPrice)})
              </span>
            )}
            {decision.waitRecommended && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                conviene attendere
              </span>
            )}
            {decision.rosterRisk && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
                rischio rosa {Math.round(decision.rosterRisk.before * 100)}%→
                {Math.round(decision.rosterRisk.after * 100)}%
              </span>
            )}
            {decision.teamConcentration && decision.teamConcentration.after > 0 && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
                {Math.round(decision.teamConcentration.after * 100)}% rosa da questa squadra
              </span>
            )}
          </div>
          <div className="space-y-1">
            {decision.explanation.factors.map((factor, i) => (
              <p key={i} className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">{factor.label}:</span> {factor.detail}
              </p>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

function ParticipantRosterCard({
  participant,
  entries,
  quotationOf,
  onRemoveEntry,
  radarAxes,
}: {
  participant: ActiveAuctionState["participants"][number];
  entries: AuctionEntryView[];
  quotationOf: (playerId: string) => number | null;
  onRemoveEntry: (entryId: string) => void;
  radarAxes: RosterRadarAxes | undefined;
}) {
  const sorted = [...entries].sort(
    (a, b) => ROLE_ORDER.indexOf(a.player.role) - ROLE_ORDER.indexOf(b.player.role),
  );
  const spent = entries.reduce((sum, e) => sum + e.price, 0);

  return (
    <div
      className={`flex flex-col rounded-lg border ${
        participant.isMe ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900"
      }`}
    >
      <div className="border-b border-slate-800/60 p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {participant.name}
            {participant.isMe && <span className="ml-1.5 text-xs text-emerald-400">(io)</span>}
          </span>
          <span className="text-sm tabular-nums text-slate-300">
            {formatCredits(participant.budgetRemaining)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {ROLE_ORDER.map((role) => (
            <span
              key={role}
              className={`rounded px-1.5 py-0.5 ${
                participant.rosterNeeded[role] > 0
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-slate-800 text-slate-500"
              }`}
              title={roleLabels[role]}
            >
              {role} {participant.rosterCounts[role]}/
              {participant.rosterCounts[role] + participant.rosterNeeded[role]}
            </span>
          ))}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="p-3 text-xs text-slate-600">Nessun giocatore ancora.</p>
        ) : (
          sorted.map((entry) => {
            const rating = rateOperation(entry.price, quotationOf(entry.player.id));
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 border-b border-slate-800/40 px-3 py-1.5 text-sm last:border-0"
                title={rating.label}
              >
                <PlayerRoleBadge role={entry.player.role} />
                <span className="flex-1 truncate">{entry.player.name}</span>
                <span className="tabular-nums text-slate-300">{formatCredits(entry.price)}</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${rating.dot}`}
                />
                <button
                  type="button"
                  onClick={() => onRemoveEntry(entry.id)}
                  className="text-slate-700 hover:text-red-400"
                  title="Annulla"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
      {entries.length > 0 && (
        <div className="border-t border-slate-800/60 px-3 py-1.5 text-right text-xs text-slate-500">
          speso {formatCredits(spent)}
        </div>
      )}
      {radarAxes && entries.length > 0 && (
        <div className="border-t border-slate-800/60 p-2">
          <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={ROSTER_RADAR_AXES.map(({ key, label }) => ({ subject: label, value: radarAxes[key] }))}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={10} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke={participant.isMe ? "#34d399" : "#60a5fa"}
                fill={participant.isMe ? "#34d399" : "#60a5fa"}
                fillOpacity={0.25}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function formatPercentOrNA(value: number | null): string {
  return value !== null ? `${Math.round(value * 100)}%` : "n/d";
}

function topTeamPreference(teamPreferences: Record<string, number>): string | null {
  const entries = Object.entries(teamPreferences);
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => b[1] - a[1])[0]![0];
}

/** Pannello di profilazione avversari (sez. 12): un profilo per partecipante costruito
 * esclusivamente dagli inserimenti già fatti in questa asta (vedi
 * apps/api/src/lib/opponents/computeOpponentProfiles.ts). "n/d" dove manca ancora il dato
 * minimo per calcolare l'indice (es. concentrazione della spesa richiede almeno 2 acquisti),
 * mai un valore inventato. */
function OpponentsPanel({
  opponents,
  participants,
}: {
  opponents: OpponentProfile[];
  participants: ActiveAuctionState["participants"];
}) {
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 font-medium">Profilo avversari</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1.5 pr-4 font-medium">Partecipante</th>
              <th className="py-1.5 pr-4 text-right font-medium">Spesa media</th>
              <th className="py-1.5 pr-4 text-right font-medium">Overpay index</th>
              <th className="py-1.5 pr-4 text-right font-medium">Aggressività*</th>
              <th className="py-1.5 pr-4 text-right font-medium">Concentrazione</th>
              <th className="py-1.5 pr-4 text-right font-medium">Preferenza big</th>
              <th className="py-1.5 pr-4 text-right font-medium">Preferenza giovani</th>
              <th className="py-1.5 font-medium">Squadra preferita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {opponents.map((o) => (
              <tr key={o.participantId}>
                <td className="py-1.5 pr-4 font-medium">
                  {nameById.get(o.participantId) ?? "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {formatCredits(o.averageSpend)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {o.overpayIndex !== null ? `${o.overpayIndex.toFixed(2)}x` : "n/d"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {formatPercentOrNA(o.aggressiveness)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {formatPercentOrNA(o.spendConcentration)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {formatPercentOrNA(o.topPlayerPreference)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-300">
                  {formatPercentOrNA(o.youngPlayerPreference)}
                </td>
                <td className="py-1.5 text-slate-400">
                  {topTeamPreference(o.teamPreferences) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-600">
        *Nessun rilancio intermedio è registrato dall'asta (solo il prezzo finale di ogni
        inserimento): "aggressività" è una proxy sulla frequenza di sovrapprezzo rispetto alla
        quotazione, non una misura diretta dei rilanci. "n/d" dove manca ancora il dato minimo
        per calcolare l'indice.
      </p>
    </div>
  );
}

function TraitSlider({
  label,
  lowLabel,
  highLabel,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onCommit: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums text-slate-400">
          {value !== null ? Math.round(value * 100) : "—"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value !== null ? Math.round(value * 100) : 50}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onMouseUp={(e) => onCommit(Number(e.currentTarget.value) / 100)}
        onTouchEnd={(e) => onCommit(Number(e.currentTarget.value) / 100)}
        onKeyUp={(e) => onCommit(Number(e.currentTarget.value) / 100)}
        className={`w-full accent-indigo-500 ${value === null ? "opacity-40" : ""}`}
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

/** Tratti impostati manualmente dall'utente su ogni avversario (richiesto esplicitamente,
 * non in spec, vedi CLAUDE.md sez. 5): niente storico delle scorse edizioni della lega
 * disponibile, quindi l'utente fornisce la propria conoscenza diretta invece che il sistema la
 * calcoli da zero. Deliberatamente in un pannello SEPARATO da `OpponentsPanel` (colore/etichette
 * diversi): uno è un dato osservato dagli inserimenti reali, l'altro una stima soggettiva
 * dell'utente — "Spiegabile" richiede che restino distinguibili, mai fusi in un unico numero. */
function OpponentTraitsPanel({
  participants,
  onUpdate,
}: {
  participants: Participant[];
  onUpdate: (id: string, traits: Partial<Participant>) => void;
}) {
  const rivals = participants.filter((p) => !p.isMe);
  if (rivals.length === 0) return null;

  async function commit(id: string, traits: Partial<Participant>) {
    onUpdate(id, traits);
    try {
      await participantsApi.updateTraits(id, traits);
    } catch {
      // Salvataggio best-effort: lo stato locale resta comunque coerente con l'ultima modifica
      // dell'utente, un fallimento di rete non blocca l'asta live.
    }
  }

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.03] p-4">
      <h2 className="mb-1 font-medium text-indigo-200">Tratti avversari (impostati da te)</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        Stima soggettiva tua, non calcolata dai dati dell'asta: niente storico delle scorse
        edizioni della lega da cui derivarla automaticamente. Modificabile in qualsiasi momento,
        anche durante l'asta live.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rivals.map((p) => (
          <div key={p.id} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              <input
                value={p.preferredTeam ?? ""}
                onChange={(e) => onUpdate(p.id, { preferredTeam: e.target.value || null })}
                onBlur={(e) => commit(p.id, { preferredTeam: e.target.value || null })}
                placeholder="Squadra preferita"
                className="w-28 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-right text-xs placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2.5">
              <TraitSlider
                label="Tendenza al rilancio"
                lowLabel="Cauto"
                highLabel="Rilancia spesso"
                value={p.bidTendency}
                onChange={(v) => onUpdate(p.id, { bidTendency: v })}
                onCommit={(v) => commit(p.id, { bidTendency: v })}
              />
              <TraitSlider
                label="Stile di spesa"
                lowLabel="Tirchio"
                highLabel="Spendaccione"
                value={p.spendingStyle}
                onChange={(v) => onUpdate(p.id, { spendingStyle: v })}
                onCommit={(v) => commit(p.id, { spendingStyle: v })}
              />
              <TraitSlider
                label="Approccio"
                lowLabel="Segue le quotazioni"
                highLabel="Talent scout"
                value={p.scoutingStyle}
                onChange={(v) => onUpdate(p.id, { scoutingStyle: v })}
                onCommit={(v) => commit(p.id, { scoutingStyle: v })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const POOL_MODES: { mode: DecisionPoolResult["mode"]; label: string }[] = [
  { mode: "value-for-money", label: "Miglior qualità/prezzo" },
  { mode: "next-call", label: "Chi chiamare adesso" },
];

/** Decision Engine sul pool (sez. 14): le uniche 2 domande della spec che confrontano più
 * giocatori invece di uno solo, esposte come pannello a richiesta (stesso spirito on-demand di
 * `EntryBar`, non ricalcolato ad ogni poll dell'asta). "Chi chiamare adesso" e' sempre scoperto
 * su "io" (il partecipante `isMe`): non ha senso nominare per un rivale. */
function PoolRankingPanel({
  auctionId,
  meId,
}: {
  auctionId: string;
  meId: string | undefined;
}) {
  const [mode, setMode] = useState<DecisionPoolResult["mode"]>("value-for-money");
  const [role, setRole] = useState<PlayerRole | "ALL">("ALL");
  const [result, setResult] = useState<DecisionPoolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await auctionApi.decidePool(auctionId, {
          mode,
          role: role === "ALL" ? undefined : role,
          buyerId: meId,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1">
          {POOL_MODES.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setMode(opt.mode)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === opt.mode
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as PlayerRole | "ALL")}
          className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r} value={r}>
              {r === "ALL" ? "Tutti i ruoli" : r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRun}
          disabled={loading || (mode === "next-call" && !meId)}
          title={mode === "next-call" && !meId ? "Serve un partecipante \"io\" per questa domanda" : undefined}
          className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-40"
        >
          {loading ? "…" : "Calcola"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{result.explanation.summary}</p>
          {result.candidates.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun candidato con dati sufficienti.</p>
          ) : (
            <div className="divide-y divide-slate-800 rounded-md border border-slate-800">
              {result.candidates.map((c, i) => (
                <div key={c.playerId} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className="w-4 shrink-0 text-right text-xs tabular-nums text-slate-600">
                    {i + 1}
                  </span>
                  <PlayerRoleBadge role={c.role} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.team}</span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-400">
                        {c.price !== null ? formatCredits(c.price) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{c.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {result.explanation.factors
            .filter((f) => f.label !== "Formula")
            .map((f, i) => (
              <p key={i} className="text-[11px] text-slate-600">
                {f.detail}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

export function AuctionPage() {
  const [league, setLeague] = useState<LeagueConfig | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[] | undefined>(undefined);
  const [auction, setAuction] = useState<ActiveAuctionState | null | undefined>(undefined);
  const [players, setPlayers] = useState<PlayerListItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerListItem | null>(null);
  const [lastOperation, setLastOperation] = useState<{
    playerName: string;
    buyerName: string;
    price: number;
    rating: ReturnType<typeof rateOperation>;
  } | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<"obiettivi" | "occasioni" | null>(null);
  const shortlist = useShortlist();

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => setLeague(leagues[0] ?? null))
      .catch(() => setLeague(null));
    playersApi
      .list()
      .then(setPlayers)
      .catch(() => setPlayers([]));
  }, []);

  useEffect(() => {
    if (!league) return;
    participantsApi
      .list()
      .then(setParticipants)
      .catch(() => setParticipants([]));
    auctionApi
      .getActive()
      .then(setAuction)
      .catch(() => setAuction(null));
  }, [league]);

  const playersById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  const soldMap = useMemo(() => {
    const map = new Map<string, SoldInfo>();
    if (!auction) return map;
    for (const entry of auction.entries) {
      map.set(entry.player.id, {
        entryId: entry.id,
        price: entry.price,
        buyerName: entry.buyer.name,
        buyerId: entry.buyer.id,
      });
    }
    return map;
  }, [auction]);

  async function handleNameParticipants(names: string[], meIndex: number) {
    const created = await participantsApi.create(names, meIndex);
    setParticipants(created);
  }

  async function handleStartAuction() {
    setError(null);
    try {
      setAuction(await auctionApi.start());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    }
  }

  async function handleEndAuction() {
    if (!auction) return;
    if (!confirm("Terminare l'asta? Non sarà più possibile aggiungere inserimenti.")) return;
    await auctionApi.end(auction.id);
    setAuction(null);
  }

  async function handleUndo() {
    if (!auction) return;
    setUndoLoading(true);
    setLastOperation(null);
    try {
      const result = await auctionApi.undo(auction.id);
      setAuction(result.state);
      setUndoMessage(
        result.undone.type === "assign"
          ? `Annullato: ${result.undone.playerName} non è più assegnato a ${result.undone.buyerName}.`
          : `Ripristinato: ${result.undone.playerName} torna assegnato a ${result.undone.buyerName}.`,
      );
    } catch (err) {
      setUndoMessage(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setUndoLoading(false);
    }
  }

  async function handleAddEntry(price: number, buyerId: string) {
    if (!auction || !selectedPlayer) return;
    const updated = await auctionApi.addEntry(auction.id, {
      playerId: selectedPlayer.id,
      price,
      buyerId,
    });
    setAuction(updated);
    const buyer = updated.participants.find((p) => p.id === buyerId);
    setLastOperation({
      playerName: selectedPlayer.name,
      buyerName: buyer?.name ?? "",
      price,
      rating: rateOperation(price, selectedPlayer.initialQuotation),
    });
    setUndoMessage(null);
    setSelectedPlayer(null);
  }

  async function handleAskDecision(
    candidatePrice: number | undefined,
    buyerId: string,
  ): Promise<DecisionRecommendation> {
    if (!auction || !selectedPlayer) throw new Error("Nessun giocatore selezionato.");
    return auctionApi.decide(auction.id, { playerId: selectedPlayer.id, buyerId, candidatePrice });
  }

  async function handleRemoveEntry(entryId: string) {
    if (!auction) return;
    setAuction(await auctionApi.removeEntry(auction.id, entryId));
    setUndoMessage(null);
  }

  function handleUpdateParticipantTraits(id: string, traits: Partial<Participant>) {
    setParticipants((prev) => prev?.map((p) => (p.id === id ? { ...p, ...traits } : p)));
  }

  async function handleReset() {
    if (
      !confirm(
        "Azzerare partecipanti, asta e tutte le assegnazioni? Utile per fare prove, non è reversibile.",
      )
    ) {
      return;
    }
    await auctionApi.reset();
    setParticipants([]);
    setAuction(null);
    setSelectedPlayer(null);
    setLastOperation(null);
  }

  if (league === undefined || players === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (league === null) {
    return <p className="text-slate-400">Configura prima la lega dal Setup Wizard.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Asta</h1>
          <p className="mt-1 text-slate-400">
            {league.name} — {league.participants} partecipanti, {league.initialBudget} crediti a
            testa.
          </p>
        </div>
        {(participants?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={handleReset}
            title="Azzera partecipanti, asta e assegnazioni — utile per fare prove"
            className="whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-500 hover:border-red-500/50 hover:text-red-400"
          >
            Reset
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {participants === undefined ? (
        <p className="text-slate-400">Caricamento…</p>
      ) : participants.length === 0 ? (
        <NameParticipantsForm count={league.participants} onSubmit={handleNameParticipants} />
      ) : auction === undefined ? (
        <p className="text-slate-400">Caricamento…</p>
      ) : auction === null ? (
        <button
          type="button"
          onClick={handleStartAuction}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Inizia asta
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            {undoMessage ? (
              <p className="text-sm text-sky-300">{undoMessage}</p>
            ) : lastOperation ? (
              <p className="text-sm">
                <span className="font-medium">{lastOperation.playerName}</span> a{" "}
                <span className="font-medium">{lastOperation.buyerName}</span> per{" "}
                {formatCredits(lastOperation.price)} —{" "}
                <span className={lastOperation.rating.tone}>{lastOperation.rating.label}</span>
              </p>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenDrawer(openDrawer === "obiettivi" ? null : "obiettivi")}
                className={`whitespace-nowrap rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                  openDrawer === "obiettivi"
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                    : "border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-300"
                }`}
              >
                ★ Obiettivi{(shortlist.entries?.length ?? 0) > 0 ? ` (${shortlist.entries!.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setOpenDrawer(openDrawer === "occasioni" ? null : "occasioni")}
                className={`whitespace-nowrap rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                  openDrawer === "occasioni"
                    ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                    : "border-slate-700 text-slate-400 hover:border-sky-500/50 hover:text-sky-300"
                }`}
              >
                🎯 Occasioni
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoLoading}
                title="Annulla l'ultimo inserimento o l'ultima rimozione in questa asta"
                className="whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-40"
              >
                {undoLoading ? "…" : "Annulla ultima azione"}
              </button>
              <button
                type="button"
                onClick={handleEndAuction}
                className="whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500/50 hover:text-red-400"
              >
                Termina asta
              </button>
            </div>
          </div>

          <MarketPanel market={auction.market} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <PlayersBrowserPanel
              players={players}
              soldMap={soldMap}
              selectedId={selectedPlayer?.id ?? null}
              onSelect={setSelectedPlayer}
              shortlistedIds={new Set(shortlist.entries?.map((e) => e.playerId) ?? [])}
              onToggleShortlist={shortlist.toggle}
            />

            <div className="space-y-4">
              <EntryBar
                selectedPlayer={selectedPlayer}
                participants={auction.participants}
                market={auction.market}
                onClear={() => setSelectedPlayer(null)}
                onSubmit={handleAddEntry}
                onAskDecision={handleAskDecision}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {auction.participants.map((participant) => (
                  <ParticipantRosterCard
                    key={participant.id}
                    participant={participant}
                    entries={auction.entries.filter((e) => e.buyer.id === participant.id)}
                    quotationOf={(playerId) => playersById.get(playerId)?.initialQuotation ?? null}
                    onRemoveEntry={handleRemoveEntry}
                    radarAxes={auction.rosterRadar.find((r) => r.participantId === participant.id)?.axes}
                  />
                ))}
              </div>
            </div>
          </div>

          <OpponentsPanel opponents={auction.opponents} participants={auction.participants} />

          <OpponentTraitsPanel
            participants={participants ?? []}
            onUpdate={handleUpdateParticipantTraits}
          />

          {/* Sempre visibile, non un drawer (richiesto esplicitamente dall'utente): il
              commento AI deve restare sott'occhio durante l'asta senza doverlo riaprire ogni
              volta, a differenza di Obiettivi/Occasioni che restano pannelli a consultazione
              occasionale. */}
          <AiCommentaryPanel auction={auction} players={players} />

          <p className="text-xs text-slate-500">
            La valutazione per-giocatore confronta il prezzo pagato con la sua quotazione
            ufficiale; il pannello di mercato sopra aggrega tutti gli inserimenti dell'asta
            (sez. 13). "Migliori opportunità" richiesto dalla spec dipende dal Decision Engine
            (sez. 14), non ancora implementato.
          </p>

          {openDrawer && (
            <div className="fixed inset-0 z-40 flex justify-end">
              <button
                type="button"
                aria-label="Chiudi pannello"
                onClick={() => setOpenDrawer(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
              />
              <div className="relative z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-medium">
                    {openDrawer === "obiettivi" ? "★ Obiettivi" : "🎯 Occasioni"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpenDrawer(null)}
                    className="rounded px-2 py-1 text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
                {openDrawer === "obiettivi" ? (
                  <ShortlistPanel
                    entries={shortlist.entries ?? []}
                    soldMap={soldMap}
                    selectedId={selectedPlayer?.id ?? null}
                    onSelect={(p) => {
                      setSelectedPlayer(p);
                      setOpenDrawer(null);
                    }}
                    onRemove={shortlist.remove}
                    onSetPriority={shortlist.setPriority}
                  />
                ) : (
                  <PoolRankingPanel
                    auctionId={auction.id}
                    meId={auction.participants.find((p) => p.isMe)?.id}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
