import type { ActiveAuctionState, PlayerListItem } from "@sedinho/shared";

const SYSTEM_PROMPT = `Sei un commentatore esperto di fantacalcio (Serie A, modalità Classic) che segue un'asta live per l'app Sedinho. Rispondi sempre in italiano, in modo diretto e conciso (massimo 80 parole), senza titoli o markdown pesante — un breve paragrafo o poche righe puntate, come un consulente che ti parla dal vivo durante l'asta. Ti vengono forniti dati reali già calcolati dai motori dell'app (valutazioni giocatori, stato di mercato, profili avversari): commenta e consiglia sulla base di QUESTI dati, non inventare statistiche o prezzi non presenti nel messaggio. Il tuo parere è un livello aggiuntivo generativo, non sostituisce i motori deterministici dell'app — dillo se ti chiedono "quanto è affidabile" questo commento. Valuta tutte le situazioni attive nell'asta nella tua risposta. Minimizza l'uso di token: vai dritto al punto, senza premesse o ripetizioni.`;

/** Costruisce il prompt per il commento AI live (richiesto esplicitamente dall'utente, non in
 * spec): riusa gli stessi dati già calcolati da Market/Opponent/Evaluation Engine invece di far
 * "indovinare" tutto al modello — il valore aggiunto è il commento in linguaggio naturale, non
 * i numeri, che restano quelli reali già mostrati nei pannelli dell'asta. */
export function buildAuctionCommentaryPrompt(
  state: ActiveAuctionState,
  players: PlayerListItem[],
): { system: string; user: string } {
  const soldIds = new Set(state.entries.map((e) => e.player.id));
  const me = state.participants.find((p) => p.isMe);

  const lastEntry = state.entries[0]; // già ordinati per timestamp desc

  const opponents = state.opponents
    .filter((o) => o.participantId !== me?.id)
    .map((o) => {
      const participant = state.participants.find((p) => p.id === o.participantId);
      return {
        nome: participant?.name ?? "?",
        budgetResiduo: o.remainingBudget,
        spesaMedia: Math.round(o.averageSpend),
        overpayIndex: o.overpayIndex !== null ? Number(o.overpayIndex.toFixed(2)) : null,
        preferenzaBig: o.topPlayerPreference,
        preferenzaGiovani: o.youngPlayerPreference,
        squadraPreferita:
          Object.entries(o.teamPreferences).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      };
    });

  const myNeededRoles = me
    ? Object.entries(me.rosterNeeded)
        .filter(([, n]) => n > 0)
        .map(([role]) => role)
    : [];

  const opportunities = players
    .filter((p) => !soldIds.has(p.id) && p.valueScore !== null)
    .filter((p) => myNeededRoles.length === 0 || myNeededRoles.includes(p.role))
    .sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0))
    .slice(0, 6)
    .map((p) => ({
      nome: p.name,
      ruolo: p.role,
      squadra: p.team,
      quotazione: p.initialQuotation,
      valueScore: p.valueScore,
    }));

  const payload = {
    ultimoInserimento: lastEntry
      ? {
          giocatore: lastEntry.player.name,
          ruolo: lastEntry.player.role,
          prezzoPagato: lastEntry.price,
          acquirente: lastEntry.buyer.name,
        }
      : null,
    mercato: {
      inflazionePrezzi: state.market.priceInflation,
      temperatura: state.market.marketTemperature,
      rilancioMedio: Math.round(state.market.averageBidValue),
      scarsitaTitolariPerRuolo: state.market.starterScarcityByRole,
    },
    avversari: opponents,
    ioStesso: me
      ? {
          nome: me.name,
          budgetResiduo: me.budgetRemaining,
          ruoliMancanti: myNeededRoles,
        }
      : null,
    occasioniDisponibili: opportunities,
  };

  const user = `Ecco lo stato attuale dell'asta (JSON):\n${JSON.stringify(payload, null, 2)}\n\nCommenta l'ultimo inserimento (se presente), dai 1-2 consigli operativi per me${me ? ` (${me.name})` : ""} e segnala 1-2 occasioni tra quelle disponibili elencate, coerenti con i ruoli che mi mancano.`;

  return { system: SYSTEM_PROMPT, user };
}
