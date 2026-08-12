import type { ShortlistEntryView } from "@sedinho/shared";

const SYSTEM_PROMPT = `Sei un assistente che monitora le notizie di calciomercato e infortuni di Serie A dell'ultima ora per un utente impegnato in un'asta fantacalcio live sull'app Sedinho. Usa lo strumento di ricerca web per trovare notizie REALI e recenti (ultime 24-48 ore quando possibile): trasferimenti, nuovi acquisti, cessioni, infortuni, squalifiche. Rispondi in italiano con un elenco puntato breve (massimo 6-8 voci), ogni voce con giocatore/squadra coinvolti e cosa è successo in una riga. Nessuna voce inventata: se non trovi nulla di rilevante di recente, dillo esplicitamente invece di riempire l'elenco. Non ripetere le fonti nel testo (vengono mostrate separatamente), non usare markdown pesante (niente titoli, niente tabelle).`;

/** Notizie di mercato dell'ultima ora (non in spec, richiesto esplicitamente dall'utente prima
 * del go-live, vedi CLAUDE.md §5 e §10 punto 29): stesso pattern BYOK del Commento AI, ma con
 * ricerca web assistita da AI invece di un connettore di scraping dedicato — scelta esplicita
 * dell'utente dopo che sia il sandbox di sviluppo (bloccato su ogni sito di news calcio provato:
 * fantacalcio.it, tuttomercatoweb.com, sky sport, gazzetta, persino x.com) sia un tentativo di
 * scraping "alla cieca" sono stati scartati. Query mirata sui giocatori negli Obiettivi (sez.
 * "Shortlist / Obiettivi d'asta") non ancora venduti, quando disponibili — più utile di una
 * ricerca generica "Serie A" perché centrata su cosa interessa davvero all'utente in quel
 * momento dell'asta; fallback a una ricerca generica se la shortlist è vuota. */
export function buildMarketNewsPrompt(
  shortlistNotSold: ShortlistEntryView[],
): { system: string; user: string } {
  const players = shortlistNotSold
    .slice(0, 15)
    .map((e) => `${e.player.name} (${e.player.team})`);

  const user =
    players.length > 0
      ? `Cerca le notizie di calciomercato/infortuni/squalifiche dell'ultima ora di Serie A, dando priorità a questi giocatori (i miei obiettivi d'asta, non ancora venduti) e alle loro squadre:\n${players.join(", ")}\n\nSe non trovi nulla su di loro, includi comunque le notizie di mercato Serie A più rilevanti del momento in generale.`
      : `Cerca le notizie di calciomercato/infortuni/squalifiche più rilevanti dell'ultima ora per la Serie A (nessun obiettivo specifico impostato nella shortlist).`;

  return { system: SYSTEM_PROMPT, user };
}
