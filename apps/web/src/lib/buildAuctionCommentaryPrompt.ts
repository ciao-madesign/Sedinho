import type { ActiveAuctionState, PlayerListItem } from "@sedinho/shared";

/** Esportato (non solo uso interno) cosi' il pannello puo' riusarlo identico per i turni di
 * follow-up della chat (richiesta esplicitamente dall'utente), che non ricostruiscono l'intero
 * payload JSON dell'asta — solo il primo turno lo fa, vedi buildAuctionCommentaryPrompt sotto. */
export const SYSTEM_PROMPT = `Sei un commentatore esperto di fantacalcio (Serie A, modalità Classic) che segue un'asta live per l'app Sedinho. Rispondi sempre in italiano, in modo diretto e conciso (massimo 80 parole), senza titoli o markdown pesante — un breve paragrafo o poche righe puntate, come un consulente che ti parla dal vivo durante l'asta. Ti vengono forniti dati reali già calcolati dai motori dell'app (valutazioni giocatori, stato di mercato, profili avversari): commenta e consiglia sulla base di QUESTI dati, non inventare statistiche o prezzi non presenti nel messaggio. Il tuo parere è un livello aggiuntivo generativo, non sostituisce i motori deterministici dell'app — dillo se ti chiedono "quanto è affidabile" questo commento. Valuta tutte le situazioni attive nell'asta nella tua risposta. Minimizza l'uso di token: vai dritto al punto, senza premesse o ripetizioni. Se l'utente ti fa una domanda di follow-up dopo un commento, rispondi nello stesso stile diretto e conciso basandoti sui dati già condivisi in questa conversazione — non hai accesso a dati più aggiornati di quelli già visti.`;

/** Costruisce il prompt per il commento AI live (richiesto esplicitamente dall'utente, non in
 * spec): riusa gli stessi dati già calcolati da Market/Opponent/Evaluation Engine invece di far
 * "indovinare" tutto al modello — il valore aggiunto è il commento in linguaggio naturale, non
 * i numeri, che restano quelli reali già mostrati nei pannelli dell'asta. `sinceTimestamp` è il
 * timestamp dell'inserimento più recente all'ULTIMA generazione (richiesto esplicitamente:
 * "l'AI osserva cosa è cambiato dall'ultima osservazione"): `null` alla primissima chiamata di
 * questa sessione, altrimenti delimita i "movimenti recenti" da segnalare esplicitamente. */
export function buildAuctionCommentaryPrompt(
  state: ActiveAuctionState,
  players: PlayerListItem[],
  sinceTimestamp: string | null,
): { system: string; user: string } {
  const soldIds = new Set(state.entries.map((e) => e.player.id));
  const me = state.participants.find((p) => p.isMe);

  const lastEntry = state.entries[0]; // già ordinati per timestamp desc

  // "Movimenti recenti" (richiesto esplicitamente): tutti gli inserimenti successivi
  // all'ultima osservazione, non solo l'ultimissimo — se tra un commento e l'altro sono
  // successe più assegnazioni, il modello deve vederle tutte. Alla primissima osservazione
  // (sinceTimestamp null) si limita al solo ultimo inserimento, stesso comportamento di prima.
  const recentMoves = (
    sinceTimestamp ? state.entries.filter((e) => e.timestamp > sinceTimestamp) : state.entries.slice(0, 1)
  )
    .slice(0, 12)
    .map((e) => ({
      giocatore: e.player.name,
      ruolo: e.player.role,
      prezzoPagato: e.price,
      acquirente: e.buyer.name,
    }));

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
    movimentiDaUltimaOsservazione: recentMoves,
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

  const intro =
    sinceTimestamp === null
      ? "Prima osservazione di questa sessione d'asta."
      : recentMoves.length > 0
        ? `Dall'ultima volta che hai commentato ci sono stati ${recentMoves.length} nuovi inserimenti (vedi "movimentiDaUltimaOsservazione").`
        : "Dall'ultima volta che hai commentato non ci sono stati nuovi inserimenti: aggiorna comunque il tuo consiglio se lo stato di mercato è cambiato.";

  const user = `${intro}\n\nEcco lo stato attuale dell'asta (JSON):\n${JSON.stringify(payload, null, 2)}\n\nCommenta cosa è cambiato dall'ultima osservazione (o l'ultimo inserimento, se è la prima volta), dai 1-2 consigli operativi per me${me ? ` (${me.name})` : ""} e segnala 1-2 occasioni tra quelle disponibili elencate, coerenti con i ruoli che mi mancano.`;

  return { system: SYSTEM_PROMPT, user };
}
