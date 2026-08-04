import { useState } from "react";
import type { LeagueDraft, ParsedRule } from "@sedinho/shared";

interface Props {
  draft: LeagueDraft;
  onChange: (patch: Partial<LeagueDraft>) => void;
}

const categoryLabels: Record<ParsedRule["category"], string> = {
  bonus: "Bonus",
  malus: "Malus",
  modifier: "Modificatore",
  formation: "Regola di formazione",
  market: "Regola di mercato",
  exception: "Eccezione",
};

const field = "block text-sm font-medium text-slate-300";
const input =
  "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";
const textarea = `${input} font-mono text-xs`;

function newId() {
  return `rule-${crypto.randomUUID()}`;
}

export function RulesStep({ draft, onChange }: Props) {
  function updateRule(index: number, patch: Partial<ParsedRule>) {
    onChange({
      parsedRules: draft.parsedRules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }

  function removeRule(index: number) {
    onChange({ parsedRules: draft.parsedRules.filter((_, i) => i !== index) });
  }

  function addRule() {
    onChange({
      parsedRules: [
        ...draft.parsedRules,
        { id: newId(), category: "exception", description: "", effect: {} },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Regole strutturate</h3>
          <button
            type="button"
            onClick={addRule}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:border-emerald-500"
          >
            Aggiungi regola
          </button>
        </div>
        <div className="space-y-4">
          {draft.parsedRules.map((rule, index) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onChange={(patch) => updateRule(index, patch)}
              onRemove={() => removeRule(index)}
            />
          ))}
          {draft.parsedRules.length === 0 && (
            <p className="text-sm text-slate-500">Nessuna regola strutturata ancora presente.</p>
          )}
        </div>
      </div>

      <div>
        <label className={field}>Testo integrale del regolamento</label>
        <p className="mt-1 text-xs text-slate-500">
          Conservato per riferimento e per un futuro parsing assistito da AI (richiede una API
          key personale).
        </p>
        <textarea
          rows={10}
          className={`${input} mt-2`}
          value={draft.rulesText}
          onChange={(e) => onChange({ rulesText: e.target.value })}
        />
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onChange,
  onRemove,
}: {
  rule: ParsedRule;
  onChange: (patch: Partial<ParsedRule>) => void;
  onRemove: () => void;
}) {
  const [effectText, setEffectText] = useState(() => JSON.stringify(rule.effect, null, 2));
  const [effectError, setEffectError] = useState<string | null>(null);

  function handleEffectBlur() {
    try {
      const parsed = JSON.parse(effectText || "{}");
      setEffectError(null);
      onChange({ effect: parsed });
    } catch {
      setEffectError("JSON non valido: le modifiche non sono state salvate.");
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <div className="w-48 shrink-0">
          <select
            className={input}
            value={rule.category}
            onChange={(e) => onChange({ category: e.target.value as ParsedRule["category"] })}
          >
            {(Object.keys(categoryLabels) as ParsedRule["category"][]).map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          rows={2}
          className={`${input} flex-1`}
          placeholder="Descrizione della regola"
          value={rule.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 text-slate-500 hover:text-red-400"
          aria-label="Rimuovi regola"
        >
          ×
        </button>
      </div>
      <div className="mt-3">
        <label className="text-xs text-slate-500">
          Effetto (JSON usato dal motore matematico)
        </label>
        <textarea
          rows={4}
          className={`${textarea} mt-1`}
          value={effectText}
          onChange={(e) => setEffectText(e.target.value)}
          onBlur={handleEffectBlur}
        />
        {effectError && <p className="mt-1 text-xs text-red-400">{effectError}</p>}
      </div>
    </div>
  );
}
