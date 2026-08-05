import { useEffect, useMemo, useState } from "react";
import type { ActiveAuctionState, LeagueConfig, Participant, PlayerListItem } from "@sedinho/shared";
import { ApiError, auctionApi, leaguesApi, participantsApi, playersApi } from "../lib/api.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { formatCredits, roleLabels } from "../lib/playerFormat.js";

const ROLE_ORDER = ["P", "D", "C", "A"] as const;

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

function PlayerAutocomplete({
  players,
  excludeIds,
  onSelect,
}: {
  players: PlayerListItem[];
  excludeIds: Set<string>;
  onSelect: (player: PlayerListItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !excludeIds.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [players, excludeIds, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Cerca giocatore…"
        className="w-56 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-72 overflow-hidden rounded-md border border-slate-800 bg-slate-900 shadow-lg">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  setQuery(p.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-800"
              >
                <PlayerRoleBadge role={p.role} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-slate-500">{p.team}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryForm({
  players,
  auction,
  onSubmit,
}: {
  players: PlayerListItem[];
  auction: ActiveAuctionState;
  onSubmit: (playerId: string, price: number, buyerId: string) => Promise<void>;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerListItem | null>(null);
  const [price, setPrice] = useState("");
  const [buyerId, setBuyerId] = useState(auction.participants[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soldIds = useMemo(
    () => new Set(auction.entries.map((e) => e.player.id)),
    [auction.entries],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayer) {
      setError("Seleziona un giocatore dalla ricerca.");
      return;
    }
    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError("Prezzo non valido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(selectedPlayer.id, priceNumber, buyerId);
      setSelectedPlayer(null);
      setPrice("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-slate-500">Giocatore</label>
        <PlayerAutocomplete
          players={players}
          excludeIds={soldIds}
          onSelect={setSelectedPlayer}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-slate-500">Prezzo</label>
        <input
          type="number"
          min={1}
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
          {auction.participants.map((p) => (
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

function ParticipantsPanel({ auction }: { auction: ActiveAuctionState }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {auction.participants.map((p) => (
        <div
          key={p.id}
          className={`rounded-lg border p-4 ${
            p.isMe ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {p.name}
              {p.isMe && <span className="ml-1.5 text-xs text-emerald-400">(io)</span>}
            </span>
            <span className="text-sm tabular-nums text-slate-300">
              {formatCredits(p.budgetRemaining)}
            </span>
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            {ROLE_ORDER.map((role) => (
              <span
                key={role}
                className={`rounded px-1.5 py-0.5 ${
                  p.rosterNeeded[role] > 0
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-slate-800 text-slate-500"
                }`}
                title={roleLabels[role]}
              >
                {role} {p.rosterCounts[role]}/{p.rosterCounts[role] + p.rosterNeeded[role]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuctionPage() {
  const [league, setLeague] = useState<LeagueConfig | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[] | undefined>(undefined);
  const [auction, setAuction] = useState<ActiveAuctionState | null | undefined>(undefined);
  const [players, setPlayers] = useState<PlayerListItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAddEntry(playerId: string, price: number, buyerId: string) {
    if (!auction) return;
    setAuction(await auctionApi.addEntry(auction.id, { playerId, price, buyerId }));
  }

  async function handleRemoveEntry(entryId: string) {
    if (!auction) return;
    setAuction(await auctionApi.removeEntry(auction.id, entryId));
  }

  if (league === undefined || players === undefined) {
    return <p className="text-slate-400">Caricamento…</p>;
  }
  if (league === null) {
    return <p className="text-slate-400">Configura prima la lega dal Setup Wizard.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asta</h1>
        <p className="mt-1 text-slate-400">
          {league.name} — {league.participants} partecipanti, {league.initialBudget} crediti a
          testa.
        </p>
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
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-4">
            <EntryForm players={players} auction={auction} onSubmit={handleAddEntry} />
            <button
              type="button"
              onClick={handleEndAuction}
              className="ml-4 whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500/50 hover:text-red-400"
            >
              Termina asta
            </button>
          </div>

          <ParticipantsPanel auction={auction} />

          <div>
            <h2 className="mb-2 font-medium">Assegnazioni ({auction.entries.length})</h2>
            {auction.entries.length === 0 ? (
              <p className="text-sm text-slate-500">Nessuna assegnazione ancora.</p>
            ) : (
              <ul className="divide-y divide-slate-900 overflow-hidden rounded-lg border border-slate-800">
                {auction.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <PlayerRoleBadge role={entry.player.role} />
                      <span className="font-medium">{entry.player.name}</span>
                      <span className="text-slate-500">{entry.player.team}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatCredits(entry.price)}</span>
                      <span className="text-slate-400">→ {entry.buyer.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entry.id)}
                        className="text-xs text-slate-600 hover:text-red-400"
                      >
                        annulla
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-slate-500">
            "Valore di mercato" e "probabilità residue" (previsti dalla spec) non ci sono ancora:
            dipendono dal Market Engine (sez. 13), non ancora implementato.
          </p>
        </div>
      )}
    </div>
  );
}
