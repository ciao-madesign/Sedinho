import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LeagueConfig, PlayerListItem } from "@sedinho/shared";
import { leaguesApi, playersApi } from "../lib/api.js";
import { ImportPanel } from "../components/ImportPanel.js";
import { PlayerRoleBadge } from "../components/PlayerRoleBadge.js";
import { formatCredits, formatPercent, setPieceLabels } from "../lib/playerFormat.js";

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

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => setLeague(leagues[0] ?? null))
      .catch(() => setLeague(null));
    playersApi.list().then(setPlayers).catch(() => setPlayers(null));
  }, []);

  const sections = useMemo<DashboardSectionData[]>(() => {
    const withValue = (players ?? []).filter((p) => p.valueScore !== null);
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

    const starters = (players ?? [])
      .filter((p) => p.hierarchyLevel === "starter")
      .sort((a, b) => (b.starterProbability ?? 0) - (a.starterProbability ?? 0))
      .slice(0, 5);

    const setPieceTakers = (players ?? [])
      .filter((p) => p.setPieceTypes.length > 0)
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
        players: [],
        metric: () => "",
        emptyReason: "Richiede uno storico delle gerarchie nel tempo, non ancora tracciato.",
      },
      {
        title: "Infortuni",
        players: [],
        metric: () => "",
        emptyReason: "Nessuna fonte di infortuni ancora collegata (candidato: lista infortunati Fantacalciopedia).",
      },
      {
        title: "Trasferimenti",
        players: [],
        metric: () => "",
        emptyReason: "Transfer Engine non ancora implementato (sez. 6 della spec).",
      },
      {
        title: "Giocatori in crescita",
        players: [],
        metric: () => "",
        emptyReason: "Serve uno storico multi-stagione: oggi è disponibile solo l'ultima stagione completata.",
      },
      {
        title: "Giocatori in calo",
        players: [],
        metric: () => "",
        emptyReason: "Serve uno storico multi-stagione: oggi è disponibile solo l'ultima stagione completata.",
      },
    ];
  }, [players]);

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
                  : (section.emptyReason ?? "Nessun dato disponibile.")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
