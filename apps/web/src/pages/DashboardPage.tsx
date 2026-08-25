import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { HierarchyChange, LeagueConfig, PlayerListItem, Transfer } from "@sedinho/shared";
import { leaguesApi, playersApi } from "../lib/api.js";
import { ImportPanel } from "../components/ImportPanel.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import {
  DashboardFiltersBar,
  applyDashboardFilters,
  defaultDashboardFilters,
  type DashboardFiltersState,
} from "../components/DashboardFilters.js";
import {
  availabilityLabels,
  formatCredits,
  formatPercent,
  hierarchyLabels,
  setPieceLabels,
} from "../lib/playerFormat.js";

const NOT_LISTED_LABEL = "Fuori lista titolari";

interface DashboardSectionData {
  title: string;
  players: PlayerListItem[];
  metric: (p: PlayerListItem) => string;
  caption?: string;
  emptyReason?: string;
}

export function DashboardPage() {
  const [league, setLeague] = useState<LeagueConfig | null | undefined>(undefined);
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null);
  const [recentTransfers, setRecentTransfers] = useState<Transfer[] | null>(null);
  const [recentHierarchyChanges, setRecentHierarchyChanges] = useState<HierarchyChange[] | null>(null);
  const [filters, setFilters] = useState<DashboardFiltersState>(defaultDashboardFilters);

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => setLeague(leagues[0] ?? null))
      .catch(() => setLeague(null));
    playersApi.list().then(setPlayers).catch(() => setPlayers(null));
    playersApi
      .recentTransfers(5)
      .then(setRecentTransfers)
      .catch(() => setRecentTransfers(null));
    playersApi
      .recentHierarchyChanges(5)
      .then(setRecentHierarchyChanges)
      .catch(() => setRecentHierarchyChanges(null));
  }, []);

  const teams = useMemo(() => {
    if (!players) return [];
    return Array.from(new Set(players.map((p) => p.team).filter(Boolean))).sort();
  }, [players]);

  const filteredPlayers = useMemo(() => {
    if (!players) return null;
    // Un giocatore non più confermato dall'ultimo listone ufficiale non va mai suggerito nelle
    // sezioni "occasioni"/"titolari"/ecc. — resta visibile in PlayersPage con un badge, ma qui
    // sarebbe un consiglio attivamente fuorviante (potrebbe essere svincolato o fuori rosa).
    return applyDashboardFilters(players, filters).filter((p) => p.delistedAt === null);
  }, [players, filters]);

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(defaultDashboardFilters);

  const sections = useMemo<DashboardSectionData[]>(() => {
    const withValue = (filteredPlayers ?? []).filter((p) => p.valueScore !== null);
    const withQuotation = withValue.filter((p) => (p.initialQuotation ?? 0) > 1);
    const medianQuotation =
      withQuotation.length > 0
        ? [...withQuotation].sort(
            (a, b) => (a.initialQuotation ?? 0) - (b.initialQuotation ?? 0),
          )[Math.floor(withQuotation.length / 2)]?.initialQuotation ?? 0
        : 0;

    const bestValue = [...withValue]
      .sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0))
      .slice(0, 5);

    const overpriced = withQuotation
      .filter((p) => (p.initialQuotation ?? 0) >= medianQuotation && (p.valueScore ?? 1) <= 0.35)
      .sort((a, b) => (a.valueScore ?? 0) - (b.valueScore ?? 0))
      .slice(0, 5);

    const starters = (filteredPlayers ?? [])
      .filter((p) => p.hierarchyLevel === "starter")
      .sort((a, b) => (b.starterProbability ?? 0) - (a.starterProbability ?? 0))
      .slice(0, 5);

    const setPieceTakers = (filteredPlayers ?? [])
      .filter((p) => p.setPieceTypes.length > 0)
      .slice(0, 5);

    // Infortuni (sez. 9): stato ATTUALE (infortunato/squalificato), non uno storico — dal
    // connettore Fantacalciopedia/infortunati (vedi CLAUDE.md §5), stessa scelta di "Titolari"
    // sopra (la spec chiederebbe "nuovi", qui mostriamo lo stato corrente).
    const unavailable = (filteredPlayers ?? [])
      .filter((p) => p.availability !== "available")
      .slice(0, 5);

    // Trasferimenti (sez. 6, Transfer Engine): join tra i trasferimenti recenti e il pool
    // filtrato, cosi' la barra filtri della Dashboard si applica anche qui — un trasferimento
    // di un giocatore escluso dai filtri attuali (es. ruolo/squadra) non compare.
    const playersById = new Map((filteredPlayers ?? []).map((p) => [p.id, p]));
    const transferSummaryById = new Map(
      (recentTransfers ?? []).map((t) => [
        t.playerId,
        `${t.fromTeam ?? "?"} → ${t.toTeam}${t.isHighlighted ? " ★" : ""}`,
      ]),
    );
    const transferredPlayers = (recentTransfers ?? [])
      .map((t) => playersById.get(t.playerId))
      .filter((p): p is PlayerListItem => p !== undefined);

    // Cambi di gerarchia (sez. 4, storico `PlayerHierarchyChange`): stesso pattern di join di
    // Trasferimenti — il giocatore deve rispettare i filtri attuali per comparire.
    const hierarchyChangeSummaryById = new Map(
      (recentHierarchyChanges ?? []).map((c) => [
        c.playerId,
        `${c.fromLevel ? hierarchyLabels[c.fromLevel] : NOT_LISTED_LABEL} → ${c.toLevel ? hierarchyLabels[c.toLevel] : NOT_LISTED_LABEL}`,
      ]),
    );
    const hierarchyChangedPlayers = (recentHierarchyChanges ?? [])
      .map((c) => playersById.get(c.playerId))
      .filter((p): p is PlayerListItem => p !== undefined);

    const growing = (filteredPlayers ?? [])
      .filter((p) => (p.fantasyAvgTrend ?? 0) > 0)
      .sort((a, b) => (b.fantasyAvgTrend ?? 0) - (a.fantasyAvgTrend ?? 0))
      .slice(0, 5);

    const declining = (filteredPlayers ?? [])
      .filter((p) => (p.fantasyAvgTrend ?? 0) < 0)
      .sort((a, b) => (a.fantasyAvgTrend ?? 0) - (b.fantasyAvgTrend ?? 0))
      .slice(0, 5);

    return [
      {
        title: "Migliori occasioni",
        players: bestValue,
        metric: (p) => formatPercent(p.valueScore),
      },
      {
        title: "Giocatori sopravvalutati",
        players: overpriced,
        metric: (p) => formatCredits(p.initialQuotation),
        caption: "Quotazione medio-alta ma valore basso rispetto al ruolo.",
      },
      {
        title: "Titolari",
        players: starters,
        metric: (p) => formatPercent(p.starterProbability),
        caption: 'Sezione spec "nuovi titolari": senza storico gerarchie mostriamo i titolari attuali.',
      },
      {
        title: "Rigoristi e piazzati",
        players: setPieceTakers,
        metric: (p) => p.setPieceTypes.map((t) => setPieceLabels[t]).join(", "),
        caption: 'Sezione spec "nuovi rigoristi": mostriamo l\'assegnazione attuale, non un delta.',
      },
      {
        title: "Cambi di gerarchia",
        players: hierarchyChangedPlayers,
        metric: (p) => hierarchyChangeSummaryById.get(p.id) ?? "",
        caption: "Entrate/uscite dalla lista titolari (Fantacalciopedia) rilevate tra due import.",
        emptyReason:
          recentHierarchyChanges === null
            ? "Nessun dato disponibile."
            : "Nessun cambio rilevato finora: emerge confrontando due \"Aggiorna Database\" successivi.",
      },
      {
        title: "Infortuni",
        players: unavailable,
        metric: (p) => availabilityLabels[p.availability],
        caption: "Stato attuale (Fantacalciopedia/infortunati), non uno storico.",
        emptyReason: "Nessun giocatore infortunato/squalificato rilevato nell'ultimo \"Aggiorna Database\".",
      },
      {
        title: "Trasferimenti",
        players: transferredPlayers,
        metric: (p) => transferSummaryById.get(p.id) ?? "",
        caption: "Cambi squadra rilevati al listone ufficiale. ★ = probabile nuovo titolare.",
        emptyReason:
          recentTransfers === null
            ? "Nessun dato disponibile."
            : "Nessun trasferimento rilevato finora: emergono confrontando due \"Aggiorna Database\" successivi.",
      },
      {
        title: "Giocatori in crescita",
        players: growing,
        metric: (p) => `+${(p.fantasyAvgTrend ?? 0).toFixed(2)}`,
        caption: "Fantamedia Serie A: ultima stagione vs precedente.",
      },
      {
        title: "Giocatori in calo",
        players: declining,
        metric: (p) => (p.fantasyAvgTrend ?? 0).toFixed(2),
        caption: "Fantamedia Serie A: ultima stagione vs precedente.",
      },
    ];
  }, [filteredPlayers, recentTransfers, recentHierarchyChanges]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {league === undefined && <p className="mt-1 text-slate-400">Caricamento…</p>}
        {league === null && (
          <p className="mt-1 text-slate-400">
            Nessuna lega configurata.{" "}
            <Link to="/setup" className="text-emerald-400 hover:underline">
              Configura la tua lega
            </Link>{" "}
            per iniziare a popolare il database e le valutazioni.
          </p>
        )}
        {league && (
          <p className="mt-1 text-slate-400">
            {league.name} — {league.participants} partecipanti, {league.initialBudget} crediti,
            rosa {league.rosterComposition.P}P/{league.rosterComposition.D}D/
            {league.rosterComposition.C}C/{league.rosterComposition.A}A ·{" "}
            <Link to="/setup" className="text-emerald-400 hover:underline">
              modifica configurazione
            </Link>
          </p>
        )}
      </div>
      <ImportPanel />
      {players && (
        <DashboardFiltersBar filters={filters} onChange={setFilters} teams={teams} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.title} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-medium">{section.title}</h2>
            {section.caption && (
              <p className="mt-0.5 text-xs text-slate-600">{section.caption}</p>
            )}
            {section.players.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {section.players.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/players/${p.id}`}
                      className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <PlayerRoleBadge role={p.role} />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs tabular-nums text-slate-400">
                        {section.metric(p)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                {players === null
                  ? "Nessun dato disponibile."
                  : (section.emptyReason ??
                    (filtersActive
                      ? "Nessun giocatore corrisponde ai filtri attuali."
                      : "Nessun dato disponibile."))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
