import { useState } from "react";
import type { AuctionMode, CallOrderRule, LeagueDraft, PlayerRole } from "@sedinho/shared";

interface Props {
  draft: LeagueDraft;
  onChange: (patch: Partial<LeagueDraft>) => void;
}

const roleLabels: Record<PlayerRole, string> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
};

const auctionModeLabels: Record<AuctionMode, string> = {
  "classic-serpentina": "Classica a serpentina",
  "classic-fixed-order": "Classica a ordine fisso",
  custom: "Personalizzata",
};

const field = "block text-sm font-medium text-slate-300";
const input =
  "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";

export function StructureStep({ draft, onChange }: Props) {
  const [newModule, setNewModule] = useState("");

  const rosterTotal = Object.values(draft.rosterComposition).reduce((a, b) => a + b, 0);

  function updateRoster(role: PlayerRole, value: number) {
    onChange({ rosterComposition: { ...draft.rosterComposition, [role]: value } });
  }

  function addModule() {
    const trimmed = newModule.trim();
    if (trimmed && !draft.allowedModules.includes(trimmed)) {
      onChange({ allowedModules: [...draft.allowedModules, trimmed] });
    }
    setNewModule("");
  }

  function removeModule(module: string) {
    onChange({ allowedModules: draft.allowedModules.filter((m) => m !== module) });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className={field}>Nome lega</label>
        <input
          className={input}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={field}>Numero partecipanti</label>
          <input
            type="number"
            min={2}
            className={input}
            value={draft.participants}
            onChange={(e) => onChange({ participants: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={field}>Budget iniziale (crediti)</label>
          <input
            type="number"
            min={0}
            className={input}
            value={draft.initialBudget}
            onChange={(e) => onChange({ initialBudget: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <label className={field}>
          Composizione rosa <span className="text-slate-500">(totale: {rosterTotal})</span>
        </label>
        <div className="mt-1 grid grid-cols-4 gap-3">
          {(Object.keys(roleLabels) as PlayerRole[]).map((role) => (
            <div key={role}>
              <span className="text-xs text-slate-500">{roleLabels[role]}</span>
              <input
                type="number"
                min={0}
                className={input}
                value={draft.rosterComposition[role]}
                onChange={(e) => updateRoster(role, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={field}>Moduli consentiti</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {draft.allowedModules.map((module) => (
            <span
              key={module}
              className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-sm"
            >
              {module}
              <button
                type="button"
                onClick={() => removeModule(module)}
                className="text-slate-500 hover:text-red-400"
                aria-label={`Rimuovi modulo ${module}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className={input}
            placeholder="es. 4-3-3"
            value={newModule}
            onChange={(e) => setNewModule(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModule())}
          />
          <button
            type="button"
            onClick={addModule}
            className="whitespace-nowrap rounded border border-slate-700 px-3 py-2 text-sm hover:border-emerald-500"
          >
            Aggiungi
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={field}>Modalità asta</label>
          <select
            className={input}
            value={draft.auctionMode}
            onChange={(e) => onChange({ auctionMode: e.target.value as AuctionMode })}
          >
            {(Object.keys(auctionModeLabels) as AuctionMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {auctionModeLabels[mode]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={field}>Ordine di chiamata</label>
          <select
            className={input}
            value={draft.callOrder.mode}
            onChange={(e) =>
              onChange({
                callOrder: {
                  ...draft.callOrder,
                  mode: e.target.value as CallOrderRule["mode"],
                },
              })
            }
          >
            <option value="sequential">Sequenziale</option>
            <option value="random">Casuale</option>
            <option value="budget-based">Basato sul budget residuo</option>
            <option value="custom">Personalizzato</option>
          </select>
        </div>
      </div>

      <div>
        <label className={field}>Note ordine di chiamata (opzionale)</label>
        <input
          className={input}
          value={draft.callOrder.description ?? ""}
          onChange={(e) =>
            onChange({ callOrder: { ...draft.callOrder, description: e.target.value } })
          }
        />
      </div>
    </div>
  );
}
