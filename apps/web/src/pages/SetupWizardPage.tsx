import { useState } from "react";

const steps = ["Struttura", "Regolamento", "Riepilogo"];

/** Setup Wizard del primo avvio (sez. 3). Placeholder di fondazione: raccoglie i campi
 * di base della struttura della lega; l'analisi automatica del regolamento (bonus/malus/
 * modificatori) verrà collegata al backend in una fase successiva. */
export function SetupWizardPage() {
  const [step, setStep] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurazione della lega</h1>
        <p className="mt-1 text-slate-400">
          Sedinho non contiene regole predefinite: ogni algoritmo userà i parametri che
          fornisci qui.
        </p>
      </div>

      <ol className="flex gap-4 text-sm">
        {steps.map((label, index) => (
          <li
            key={label}
            className={index === step ? "text-emerald-400" : "text-slate-500"}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <p className="text-slate-400">Step "{steps[step]}" — in costruzione.</p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
        >
          Indietro
        </button>
        <button
          type="button"
          disabled={step === steps.length - 1}
          onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          Avanti
        </button>
      </div>
    </div>
  );
}
