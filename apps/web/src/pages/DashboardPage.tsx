import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LeagueConfig } from "@sedinho/shared";
import { leaguesApi } from "../lib/api.js";
import { ImportPanel } from "../components/ImportPanel.js";

const sections = [
  "Migliori occasioni",
  "Giocatori sopravvalutati",
  "Nuovi titolari",
  "Nuovi rigoristi",
  "Cambi di gerarchia",
  "Infortuni",
  "Trasferimenti",
  "Giocatori in crescita",
  "Giocatori in calo",
];

/** Dashboard interattiva (sez. 9). Le sezioni sono ancora placeholder: verranno collegate
 * al Player Evaluation Engine e ai filtri (ruolo, squadra, prezzo, età, rischio, titolarità)
 * una volta popolato il database giocatori. */
export function DashboardPage() {
  const [league, setLeague] = useState<LeagueConfig | null | undefined>(undefined);

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => setLeague(leagues[0] ?? null))
      .catch(() => setLeague(null));
  }, []);

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
          <div key={section} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-medium">{section}</h2>
            <p className="mt-2 text-sm text-slate-500">Nessun dato disponibile.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
