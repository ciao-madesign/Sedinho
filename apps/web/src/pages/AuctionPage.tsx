import { useEffect, useMemo, useState } from "react";
import type {
  ActiveAuctionState,
  AuctionEntryView,
  LeagueConfig,
  Participant,
  PlayerListItem,
  PlayerRole,
} from "@sedinho/shared";
import { ApiError, auctionApi, leaguesApi, participantsApi, playersApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { formatCredits, roleLabels } from "../lib/playerFormat.js";

const ROLE_ORDER: PlayerRole[] = ["P", "D", "C", "A"];
const ROLE_FILTERS: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

interface SoldInfo {
  entryId: string;
  price: number;
  buyerName: string;
  buyerId: string;
}

/** Confronta il prezzo pagato con la quotazione ufficiale (oggi l'unico riferimento di valore
 * disponibile, vedi value.ts: expectedAuctionPrice === initialQuotation finché il Market
 * Engine, sez. 13, non esiste). Un'euristica dichiarata, non un giudizio definitivo. */
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
}: {
  players: PlayerListItem[];
  soldMap: Map<string, SoldInfo>;
  selectedId: string | null;
  onSelect: (player: PlayerListItem) => void;
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
          if (sold) {
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-sm opacity-40"
              >
                <PlayerRoleBadge role={p.role} />
                <span className="flex-1 truncate line-through decoration-slate-600">{p.name}</span>
                <span className="whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                  {sold.buyerName} · {formatCredits(sold.price)}
                </span>
              </div>
            );
          }
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={`flex w-full items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${
                selectedId === p.id ? "bg-emerald-500/10" : ""
              }`}
            >
              <PlayerRoleBadge role={p.role} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-slate-500">{p.team}</span>
              <span className="w-10 whitespace-nowrap text-right text-xs tabular-nums text-slate-400">
                {browserMetric(p, sortKey)}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-600">Nessun giocatore trovato.</p>
        )}
      </div>
    </div>
  );
}

function EntryBar({
  selectedPlayer,
  participants,
  onClear,
  onSubmit,
}: {
  selectedPlayer: PlayerListItem | null;
  participants: ActiveAuctionState["participants"];
  onClear: () => void;
  onSubmit: (price: number, buyerId: string) => Promise<void>;
}) {
  const [price, setPrice] = useState("");
  const [buyerId, setBuyerId] = useState(participants[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSubmitting(false);
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
        type="submit"
        disabled={submitting}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
      >
        {submitting ? "…" : "Assegna"}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </form>
  );
}

function ParticipantRosterCard({
  participant,
  entries,
  quotationOf,
  onRemoveEntry,
}: {
  participant: ActiveAuctionState["participants"][number];
  entries: AuctionEntryView[];
  quotationOf: (playerId: string) => number | null;
  onRemoveEntry: (entryId: string) => void;
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
    setSelectedPlayer(null);
  }

  async function handleRemoveEntry(entryId: string) {
    if (!auction) return;
    setAuction(await auctionApi.removeEntry(auction.id, entryId));
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
          <div className="flex items-center justify-between">
            {lastOperation ? (
              <p className="text-sm">
                <span className="font-medium">{lastOperation.playerName}</span> a{" "}
                <span className="font-medium">{lastOperation.buyerName}</span> per{" "}
                {formatCredits(lastOperation.price)} —{" "}
                <span className={lastOperation.rating.tone}>{lastOperation.rating.label}</span>
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleEndAuction}
              className="whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500/50 hover:text-red-400"
            >
              Termina asta
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <PlayersBrowserPanel
              players={players}
              soldMap={soldMap}
              selectedId={selectedPlayer?.id ?? null}
              onSelect={setSelectedPlayer}
            />

            <div className="space-y-4">
              <EntryBar
                selectedPlayer={selectedPlayer}
                participants={auction.participants}
                onClear={() => setSelectedPlayer(null)}
                onSubmit={handleAddEntry}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {auction.participants.map((participant) => (
                  <ParticipantRosterCard
                    key={participant.id}
                    participant={participant}
                    entries={auction.entries.filter((e) => e.buyer.id === participant.id)}
                    quotationOf={(playerId) => playersById.get(playerId)?.initialQuotation ?? null}
                    onRemoveEntry={handleRemoveEntry}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            La valutazione dell'operazione confronta il prezzo pagato con la quotazione ufficiale
            (unico riferimento disponibile oggi). "Valore di mercato" e "probabilità residue"
            richiesti dalla spec dipendono dal Market Engine (sez. 13), non ancora implementato.
          </p>
        </div>
      )}
    </div>
  );
}
