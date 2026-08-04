import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LeagueConfig, LeagueDraft } from "@sedinho/shared";
import { ApiError, leaguesApi } from "../lib/api.js";
import { defaultLeagueDraft } from "../components/setup-wizard/defaultDraft.js";
import { StructureStep } from "../components/setup-wizard/StructureStep.js";
import { EconomyStep } from "../components/setup-wizard/EconomyStep.js";
import { RulesStep } from "../components/setup-wizard/RulesStep.js";
import { SummaryStep } from "../components/setup-wizard/SummaryStep.js";

const steps = ["Struttura", "Economia", "Regolamento", "Riepilogo"];

function toDraft(league: LeagueConfig): LeagueDraft {
  const { id, createdAt, updatedAt, ...rest } = league;
  return rest;
}

/** Setup Wizard del primo avvio (sez. 3). Sedinho gestisce una singola lega attiva:
 * se esiste gia' una League la carica in modifica, altrimenti parte da una bozza
 * precompilata (interamente modificabile) e crea una nuova League al salvataggio. */
export function SetupWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<LeagueDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leaguesApi
      .list()
      .then((leagues) => {
        const existing = leagues[0];
        if (existing) {
          setEditingId(existing.id);
          setDraft(toDraft(existing));
        } else {
          setDraft(defaultLeagueDraft);
        }
      })
      .catch(() => setDraft(defaultLeagueDraft))
      .finally(() => setLoading(false));
  }, []);

  function patch(p: Partial<LeagueDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  async function handleSubmit() {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await leaguesApi.update(editingId, draft);
      } else {
        await leaguesApi.create(draft);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !draft) {
    return <p className="text-slate-400">Caricamento…</p>;
  }

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
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={index === step ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div>
        {step === 0 && <StructureStep draft={draft} onChange={patch} />}
        {step === 1 && <EconomyStep draft={draft} onChange={patch} />}
        {step === 2 && <RulesStep draft={draft} onChange={patch} />}
        {step === 3 && (
          <SummaryStep
            draft={draft}
            isEditing={editingId !== null}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
          />
        )}
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
