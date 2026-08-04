import type { LeagueDraft } from "@sedinho/shared";

interface Props {
  draft: LeagueDraft;
  isEditing: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}

const card = "rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2";
const dt = "text-xs uppercase tracking-wide text-slate-500";

export function SummaryStep({ draft, isEditing, submitting, error, onSubmit }: Props) {
  return (
    <div className="space-y-4">
      <section className={card}>
        <h3 className="font-medium">Struttura</h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className={dt}>Nome</div>
            <div>{draft.name || "—"}</div>
          </div>
          <div>
            <div className={dt}>Partecipanti</div>
            <div>{draft.participants}</div>
          </div>
          <div>
            <div className={dt}>Budget</div>
            <div>{draft.initialBudget}</div>
          </div>
          <div>
            <div className={dt}>Rosa</div>
            <div>
              {draft.rosterComposition.P}P / {draft.rosterComposition.D}D /{" "}
              {draft.rosterComposition.C}C / {draft.rosterComposition.A}A
            </div>
          </div>
          <div>
            <div className={dt}>Moduli</div>
            <div>{draft.allowedModules.join(", ") || "—"}</div>
          </div>
          <div>
            <div className={dt}>Asta</div>
            <div>{draft.auctionMode}</div>
          </div>
        </div>
      </section>

      {draft.entryFee && (
        <section className={card}>
          <h3 className="font-medium">Quota di iscrizione</h3>
          <p className="text-sm">
            {draft.entryFee.amount} {draft.entryFee.currency}
            {draft.entryFee.depositAmount
              ? ` (di cui ${draft.entryFee.depositAmount} ${draft.entryFee.currency} cauzione)`
              : ""}
          </p>
          {draft.entryFee.deadlineDescription && (
            <p className="text-sm text-slate-400">{draft.entryFee.deadlineDescription}</p>
          )}
        </section>
      )}

      {draft.prizePool && draft.prizePool.length > 0 && (
        <section className={card}>
          <h3 className="font-medium">Montepremi</h3>
          <ul className="space-y-1 text-sm">
            {draft.prizePool.map((prize) => (
              <li key={prize.id}>
                {prize.label}: {prize.amount} {prize.currency}
              </li>
            ))}
          </ul>
        </section>
      )}

      {draft.cupFormat?.enabled && (
        <section className={card}>
          <h3 className="font-medium">{draft.cupFormat.name || "Coppa"}</h3>
          <ul className="space-y-1 text-sm">
            {draft.cupFormat.phases.map((phase) => (
              <li key={phase.id}>
                {phase.name}: giornate {phase.fromMatchday}-{phase.toMatchday}, {phase.teams}{" "}
                squadre{phase.eliminatedTeams ? `, elimina ${phase.eliminatedTeams}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card}>
        <h3 className="font-medium">Regole ({draft.parsedRules.length})</h3>
        <ul className="space-y-1 text-sm">
          {draft.parsedRules.map((rule) => (
            <li key={rule.id}>
              <span className="text-emerald-400">[{rule.category}]</span> {rule.description}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
      >
        {submitting ? "Salvataggio…" : isEditing ? "Salva modifiche" : "Crea lega"}
      </button>
    </div>
  );
}
