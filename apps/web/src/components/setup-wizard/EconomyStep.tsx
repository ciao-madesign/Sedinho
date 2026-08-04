import type { CupPhase, LeagueDraft, PrizePoolEntry } from "@sedinho/shared";

interface Props {
  draft: LeagueDraft;
  onChange: (patch: Partial<LeagueDraft>) => void;
}

const field = "block text-sm font-medium text-slate-300";
const input =
  "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";
const card = "rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function EconomyStep({ draft, onChange }: Props) {
  const entryFeeEnabled = draft.entryFee !== undefined;
  const prizePoolEnabled = draft.prizePool !== undefined;
  const cupEnabled = draft.cupFormat?.enabled ?? false;

  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Quota di iscrizione</h3>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={entryFeeEnabled}
              onChange={(e) =>
                onChange({
                  entryFee: e.target.checked
                    ? { amount: 0, currency: "EUR" }
                    : undefined,
                })
              }
            />
            attiva
          </label>
        </div>
        {draft.entryFee && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={field}>Importo</label>
              <input
                type="number"
                min={0}
                className={input}
                value={draft.entryFee.amount}
                onChange={(e) =>
                  onChange({ entryFee: { ...draft.entryFee!, amount: Number(e.target.value) } })
                }
              />
            </div>
            <div>
              <label className={field}>Valuta</label>
              <input
                className={input}
                value={draft.entryFee.currency}
                onChange={(e) =>
                  onChange({ entryFee: { ...draft.entryFee!, currency: e.target.value } })
                }
              />
            </div>
            <div>
              <label className={field}>Cauzione (opzionale)</label>
              <input
                type="number"
                min={0}
                className={input}
                value={draft.entryFee.depositAmount ?? ""}
                onChange={(e) =>
                  onChange({
                    entryFee: {
                      ...draft.entryFee!,
                      depositAmount: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className={field}>Scadenza (testo libero)</label>
              <input
                className={input}
                value={draft.entryFee.deadlineDescription ?? ""}
                onChange={(e) =>
                  onChange({
                    entryFee: { ...draft.entryFee!, deadlineDescription: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <label className={field}>Penale in caso di ritiro (testo libero)</label>
              <input
                className={input}
                value={draft.entryFee.withdrawalPenaltyDescription ?? ""}
                onChange={(e) =>
                  onChange({
                    entryFee: {
                      ...draft.entryFee!,
                      withdrawalPenaltyDescription: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Montepremi</h3>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={prizePoolEnabled}
              onChange={(e) => onChange({ prizePool: e.target.checked ? [] : undefined })}
            />
            attivo
          </label>
        </div>
        {draft.prizePool && (
          <div className="space-y-3">
            {draft.prizePool.map((prize, index) => (
              <div key={prize.id} className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2">
                <input
                  className={input}
                  placeholder="Etichetta (es. Primo posto)"
                  value={prize.label}
                  onChange={(e) =>
                    onChange({
                      prizePool: patchPrize(draft.prizePool!, index, { label: e.target.value }),
                    })
                  }
                />
                <input
                  type="number"
                  className={input}
                  placeholder="Importo"
                  value={prize.amount}
                  onChange={(e) =>
                    onChange({
                      prizePool: patchPrize(draft.prizePool!, index, {
                        amount: Number(e.target.value),
                      }),
                    })
                  }
                />
                <input
                  className={input}
                  placeholder="Valuta"
                  value={prize.currency}
                  onChange={(e) =>
                    onChange({
                      prizePool: patchPrize(draft.prizePool!, index, {
                        currency: e.target.value,
                      }),
                    })
                  }
                />
                <input
                  className={input}
                  placeholder="Note (opzionale)"
                  value={prize.notes ?? ""}
                  onChange={(e) =>
                    onChange({
                      prizePool: patchPrize(draft.prizePool!, index, { notes: e.target.value }),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({ prizePool: draft.prizePool!.filter((_, i) => i !== index) })
                  }
                  className="text-slate-500 hover:text-red-400"
                  aria-label="Rimuovi voce montepremi"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  prizePool: [
                    ...draft.prizePool!,
                    { id: newId("prize"), label: "", amount: 0, currency: "EUR" },
                  ],
                })
              }
              className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:border-emerald-500"
            >
              Aggiungi voce
            </button>
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Coppa / torneo parallelo</h3>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={cupEnabled}
              onChange={(e) =>
                onChange({
                  cupFormat: e.target.checked
                    ? { enabled: true, name: "", phases: draft.cupFormat?.phases ?? [] }
                    : { enabled: false, phases: draft.cupFormat?.phases ?? [] },
                })
              }
            />
            attiva
          </label>
        </div>
        {cupEnabled && draft.cupFormat && (
          <div className="space-y-4">
            <div>
              <label className={field}>Nome torneo</label>
              <input
                className={input}
                value={draft.cupFormat.name ?? ""}
                onChange={(e) =>
                  onChange({ cupFormat: { ...draft.cupFormat!, name: e.target.value } })
                }
              />
            </div>
            <div className="space-y-3">
              {draft.cupFormat.phases.map((phase, index) => (
                <div key={phase.id} className="grid grid-cols-6 gap-2">
                  <input
                    className={`${input} col-span-2`}
                    placeholder="Nome fase"
                    value={phase.name}
                    onChange={(e) =>
                      onChange({
                        cupFormat: {
                          ...draft.cupFormat!,
                          phases: patchPhase(draft.cupFormat!.phases, index, {
                            name: e.target.value,
                          }),
                        },
                      })
                    }
                  />
                  <input
                    type="number"
                    className={input}
                    placeholder="Da giornata"
                    value={phase.fromMatchday}
                    onChange={(e) =>
                      onChange({
                        cupFormat: {
                          ...draft.cupFormat!,
                          phases: patchPhase(draft.cupFormat!.phases, index, {
                            fromMatchday: Number(e.target.value),
                          }),
                        },
                      })
                    }
                  />
                  <input
                    type="number"
                    className={input}
                    placeholder="A giornata"
                    value={phase.toMatchday}
                    onChange={(e) =>
                      onChange({
                        cupFormat: {
                          ...draft.cupFormat!,
                          phases: patchPhase(draft.cupFormat!.phases, index, {
                            toMatchday: Number(e.target.value),
                          }),
                        },
                      })
                    }
                  />
                  <input
                    type="number"
                    className={input}
                    placeholder="Squadre"
                    value={phase.teams}
                    onChange={(e) =>
                      onChange({
                        cupFormat: {
                          ...draft.cupFormat!,
                          phases: patchPhase(draft.cupFormat!.phases, index, {
                            teams: Number(e.target.value),
                          }),
                        },
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className={input}
                      placeholder="Eliminate"
                      value={phase.eliminatedTeams}
                      onChange={(e) =>
                        onChange({
                          cupFormat: {
                            ...draft.cupFormat!,
                            phases: patchPhase(draft.cupFormat!.phases, index, {
                              eliminatedTeams: Number(e.target.value),
                            }),
                          },
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          cupFormat: {
                            ...draft.cupFormat!,
                            phases: draft.cupFormat!.phases.filter((_, i) => i !== index),
                          },
                        })
                      }
                      className="text-slate-500 hover:text-red-400"
                      aria-label="Rimuovi fase"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    cupFormat: {
                      ...draft.cupFormat!,
                      phases: [
                        ...draft.cupFormat!.phases,
                        {
                          id: newId("phase"),
                          name: "",
                          fromMatchday: 1,
                          toMatchday: 1,
                          teams: 0,
                          eliminatedTeams: 0,
                        },
                      ],
                    },
                  })
                }
                className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:border-emerald-500"
              >
                Aggiungi fase
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function patchPrize(
  prizes: PrizePoolEntry[],
  index: number,
  patch: Partial<PrizePoolEntry>,
): PrizePoolEntry[] {
  return prizes.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

function patchPhase(phases: CupPhase[], index: number, patch: Partial<CupPhase>): CupPhase[] {
  return phases.map((p, i) => (i === index ? { ...p, ...patch } : p));
}
