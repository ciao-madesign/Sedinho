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

/** Dashboard interattiva (sez. 9). Placeholder di fondazione: le sezioni verranno
 * collegate al Player Evaluation Engine e ai filtri (ruolo, squadra, prezzo, età, rischio, titolarità). */
export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-slate-400">
          Configura la tua lega per iniziare a popolare il database e le valutazioni.
        </p>
      </div>
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
