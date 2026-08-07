import type { DecisionPoolCandidate, DecisionPoolResult, Explanation, PlayerRole } from "@sedinho/shared";

export interface PoolCandidateInput {
  id: string;
  name: string;
  role: PlayerRole;
  team: string;
  /** Prezzo di riferimento gia' rettificato per l'inflazione di ruolo osservata in questa asta
   * (o la quotazione ufficiale se non c'e' ancora un dato specifico per il ruolo) — calcolato
   * dal chiamante (stessa logica di `EntryBar` in `/auction`, "atteso a mercato"). */
  adjustedPrice: number | null;
  /** Punti fantamedia attesi per partita (`ProductionIndices.expectedFantasyPoints`, FSTATS):
   * la base di qualita' per il rapporto qualita'/prezzo, non `valueScore` (solo un percentile
   * della quotazione, non incorpora produzione — vedi `lib/evaluation/value.ts`). */
  expectedFantasyPoints: number | null;
}

export interface RankPoolOptions {
  mode: "value-for-money" | "next-call";
  /** Filtro di ruolo opzionale (es. utente ha selezionato un ruolo in UI). */
  role: PlayerRole | null;
  /** Per "chi chiamare adesso": solo i ruoli che mancano ancora all'acquirente. Ignorato in
   * modalita' "value-for-money" (quella domanda non e' scoperta su un acquirente specifico). */
  myNeededRoles: PlayerRole[];
  /** Per "chi chiamare adesso": quanti rivali hanno ancora bisogno di ciascun ruolo — meno
   * concorrenza ora puo' voler dire prezzo piu' basso, chiamarlo prima che la scarsita' del
   * ruolo (sez. 13) faccia salire l'inflazione. */
  rivalsInNeedByRole: Partial<Record<PlayerRole, number>>;
  /** Per "chi chiamare adesso": scarta candidati il cui prezzo atteso supera il budget residuo
   * dell'acquirente. `null` = nessun limite (nessun acquirente specificato). */
  budgetRemaining: number | null;
  limit: number;
}

/** Motore di decisione puro sul pool (sez. 14): le uniche 2 domande della spec che richiedono
 * di confrontare piu' giocatori invece di uno solo — "quale giocatore offre il miglior rapporto
 * qualità/prezzo?" (`mode: "value-for-money"`) e "chi dovrei chiamare adesso?"
 * (`mode: "next-call"`). Entrambe condividono lo stesso punteggio di base (punti attesi per
 * credito di prezzo), "next-call" applica in più il filtro sui ruoli mancanti, uno sconto per
 * la concorrenza dei rivali e un taglio sul budget residuo. Candidati senza dato sufficiente
 * (nessun prezzo o nessuna produzione attesa) sono esclusi dalla classifica, mai stimati a
 * caso — il conteggio degli esclusi resta nella spiegazione. */
export function rankPoolCandidates(
  pool: PoolCandidateInput[],
  options: RankPoolOptions,
): DecisionPoolResult {
  const { mode, role, myNeededRoles, rivalsInNeedByRole, budgetRemaining, limit } = options;

  let scoped = pool.filter((p) => role === null || p.role === role);
  if (mode === "next-call") {
    scoped = scoped.filter((p) => myNeededRoles.length === 0 || myNeededRoles.includes(p.role));
  }

  const withData = scoped.filter((p) => p.adjustedPrice !== null && p.adjustedPrice > 0 && p.expectedFantasyPoints !== null);
  const excludedCount = scoped.length - withData.length;

  const scored = withData
    .map((p) => {
      const pointsPerCredit = Number((p.expectedFantasyPoints! / p.adjustedPrice!).toFixed(3));
      let score = pointsPerCredit;
      let reason = `${p.expectedFantasyPoints!.toFixed(1)} punti fantamedia attesi ogni 1 credito di prezzo atteso (${p.adjustedPrice} cr.).`;

      if (mode === "next-call") {
        const rivals = rivalsInNeedByRole[p.role] ?? 0;
        const timingBonus = rivals === 0 ? 0.15 : rivals === 1 ? 0.05 : 0;
        if (timingBonus > 0) {
          score = Number((score * (1 + timingBonus)).toFixed(3));
          reason += ` Solo ${rivals} rival${rivals === 1 ? "e" : "i"} in cerca di un ${p.role}: buon momento per chiamarlo.`;
        } else {
          reason += ` ${rivals} rivali cercano ancora un ${p.role}: aspettati concorrenza sul prezzo.`;
        }
      }

      // Il taglio sul budget ha senso solo per "chi chiamare adesso" (scoperto su un
      // acquirente specifico): "miglior rapporto qualità/prezzo" e' una domanda di mercato
      // generale, non legata a quanto "io" ho ancora da spendere — altrimenti un affare
      // legittimo ma caro sparirebbe silenziosamente dalla classifica generale.
      const affordable =
        mode !== "next-call" || budgetRemaining === null || p.adjustedPrice! <= budgetRemaining;

      return { p, score, reason, affordable };
    })
    .filter((c) => c.affordable)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const candidates: DecisionPoolCandidate[] = scored.map(({ p, score, reason }) => ({
    playerId: p.id,
    name: p.name,
    role: p.role,
    team: p.team,
    price: p.adjustedPrice,
    pointsPerCredit: score,
    reason,
  }));

  const explanation: Explanation = {
    factors: [
      {
        label: "Formula",
        direction: "neutral",
        weight: 1,
        detail:
          mode === "value-for-money"
            ? "Punti fantamedia attesi (FSTATS) per credito di prezzo atteso a mercato: più alto, migliore l'affare. Non è valueScore (quello è solo un percentile della quotazione, non incorpora la produzione)."
            : "Stesso rapporto qualità/prezzo, filtrato sui ruoli che ti mancano ancora e con un piccolo bonus quando pochi rivali cercano ancora quel ruolo — un proxy sul momento giusto per chiamarlo, non una certezza.",
      },
      ...(excludedCount > 0
        ? [
            {
              label: "Candidati esclusi",
              direction: "neutral" as const,
              weight: 0,
              detail: `${excludedCount} giocatori scartati dalla classifica per mancanza di prezzo atteso o di statistiche FSTATS sufficienti.`,
            },
          ]
        : []),
    ],
    confidence: withData.length > 0 ? Math.min(1, withData.length / Math.max(1, scoped.length)) : 0,
    summary:
      candidates.length > 0
        ? `${candidates.length} candidati classificati su ${scoped.length} nel pool filtrato.`
        : "Nessun candidato con dati sufficienti in questo pool filtrato.",
  };

  return {
    mode,
    question:
      mode === "value-for-money"
        ? "Quale giocatore offre il miglior rapporto qualità/prezzo?"
        : "Chi dovrei chiamare adesso?",
    candidates,
    explanation,
  };
}
