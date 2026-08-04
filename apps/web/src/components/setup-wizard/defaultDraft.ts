import type { LeagueDraft } from "@sedinho/shared";

/** Regolamento integrale fornito dall'utente (Travedona Serie A), conservato per riferimento
 * e come base per un futuro parsing assistito da AI (BYOK). */
const TRAVEDONA_RULES_TEXT = `REGOLAMENTO
TRAVEDONA SERIE A

REGOLE DI PARTECIPAZIONE
Ogni giocatore dovrà versare 80€ (di cui 20€ cauzione multe) entro e non oltre il giorno dell'asta di Febbraio.
Se un giocatore decidesse di ritirarsi prima della fine del campionato andrà a perdere tutta la somma versata.

MONTEPREMI
PRIMO POSTO 240€
SECONDO POSTO 160€
TERZO POSTO 100€
VINCITORE COPPA 100€
TOP SCORER DELL'ANNO (QUOTA MULTE ANNO PRECEDENTE) 35€ ANNATA 25/26

STRUTTURA COPPA FORMULA 1
Fase 1 dalla 1 alla 10 giornata con 10 squadre (eliminazione della 9ª e 10ª squadra)
Fase 2 dalla 11 alla 20 giornata con 8 squadre (eliminazione della 7ª e 8ª squadra)
Fase 3 dalla 21 alla 30 giornata con 6 squadre (eliminazione della 5ª e 6ª squadra)
Fase 4 finale dalla 31 alla 38 giornata con 4 squadre (VINCITORE 1 CLASSIFICATO ASSOLUTO)

FORMAZIONE SQUADRA
A disposizione 500 crediti per acquistare 25 giocatori così suddivisi: 3 PORTIERI, 8 DIFENSORI, 8 CENTROCAMPISTI, 6 ATTACCANTI.
E' possibile utilizzare anche meno di 500 crediti, i restanti rimarranno a disposizione per effettuare scambi e per l'asta di riparazione di metà anno.

CALCOLO GIORNATA
Verrà utilizzato il listone di fantagazzetta con le sue votazioni, i cambi saranno sempre e solo ruolo per ruolo (es. attaccante per attaccante, centrocampista per centrocampista, ecc.) senza il cambio modulo.
Tutto il dettaglio sul calcolo del singolo punteggio è visionabile sull'APP leghe Fantagazzetta.

SESSIONE SCAMBI
Saranno aperte sessioni di scambio durante ogni pausa nazionale e per tutto il mese di Gennaio, eccetto durante le giornate in corso. Il valore di un giocatore scambiato sarà sempre il medesimo.

MERCATO DI RIPARAZIONE (SETTEMBRE e GENNAIO)
Durante il mercato di riparazione non vi sarà nessun extra-budget, si potranno cedere volontariamente al massimo 8 giocatori così disposti: 2 PORTIERI 2 DIFENSORI 2 CENTROCAMPISTI 2 ATTACCANTI, il valore che si otterrà sarà lo stesso speso ad inizio anno.
I giocatori ceduti in un campionato estero non verranno conteggiati e saranno automaticamente svincolati con il riaccredito della spesa iniziale. Nel caso in cui un giocatore venga ceduto dal proprio club al di fuori della normale sessione di mercato invernale, il fantaallenatore non potrà effettuare lo svincolo e di conseguenza rimarrà in inferiorità numerica fino ad un eventuale mercato di riparazione.

RINVIO PARTITE
Per quanto riguarda il rinvio partite entro le 48h si attenderà il recupero, diversamente se 1 o 2 partite dovessero essere recuperate a data da destinarsi si applicherà il 6 politico. Se le partite da recuperare dovessero essere minimo il 30% (da 3 in su) si dovrà aspettare per poter calcolare la giornata.

PENALITA'
- Per ogni giorno di ritardo di pagamento quota verrà addebitata una multa di 1€
- Per ogni credito sforato all'asta verrà sottratto 1 punto sulla classifica finale
- Ogni volta che non si schiererà la formazione verrà attribuita la sconfitta a tavolino e verrà addebitata una multa di 5€

Questo regolamento è stato redatto dal Presidente di lega Simone Grassi, visionato ed approvato dal vice-Presidente Mirko Gagliardini.`;

/** Bozza precompilata a partire dal regolamento reale "Travedona Serie A", interamente
 * modificabile dall'utente nel wizard: nessun valore e' hard-coded nel motore, e' solo
 * il punto di partenza del form (sez. 2, "Configurabile"). */
export const defaultLeagueDraft: LeagueDraft = {
  name: "Travedona Serie A",
  participants: 10,
  initialBudget: 500,
  rosterComposition: { P: 3, D: 8, C: 8, A: 6 },
  allowedModules: ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1"],
  auctionMode: "classic-fixed-order",
  callOrder: {
    mode: "sequential",
    description: "Non specificato nel regolamento: valore di default, modificabile.",
  },
  rulesText: TRAVEDONA_RULES_TEXT,
  parsedRules: [
    {
      id: "rule-malus-overbid",
      category: "malus",
      description: "Credito sforato all'asta: sottratto 1 punto sulla classifica finale.",
      effect: { type: "auction-budget-exceeded", classificationPointsPenalty: 1 },
    },
    {
      id: "rule-malus-missing-lineup",
      category: "malus",
      description:
        "Formazione non schierata: sconfitta a tavolino e multa di 5€.",
      effect: { type: "missing-lineup", result: "forfeit-loss", fineEuro: 5 },
    },
    {
      id: "rule-malus-late-payment",
      category: "malus",
      description: "Ritardo pagamento quota: multa di 1€ per ogni giorno di ritardo.",
      effect: { type: "late-payment", fineEuroPerDay: 1 },
    },
    {
      id: "rule-modifier-postponement-minor",
      category: "modifier",
      description:
        "Rinvio di 1 o 2 partite a data da destinarsi: si applica il 6 politico.",
      effect: { type: "postponement", matchesPostponed: "1-2", rule: "6-politico" },
    },
    {
      id: "rule-modifier-postponement-major",
      category: "modifier",
      description:
        "Rinvio di almeno il 30% delle partite (da 3 in su): si attende per calcolare la giornata.",
      effect: { type: "postponement", thresholdPercent: 30, rule: "wait-for-recovery" },
    },
    {
      id: "rule-modifier-substitution-lock",
      category: "modifier",
      description: "I cambi sono sempre e solo ruolo per ruolo, mai cambio modulo.",
      effect: { type: "substitution-lock", scope: "same-role-only" },
    },
    {
      id: "rule-market-repair-window",
      category: "market",
      description:
        "Mercato di riparazione (Settembre e Gennaio): nessun extra-budget, cessione volontaria di massimo 8 giocatori (2 per ruolo), valore riacquisito uguale al valore speso ad inizio anno.",
      effect: {
        type: "repair-market",
        months: ["September", "January"],
        maxPlayersCeded: 8,
        perRoleLimit: { P: 2, D: 2, C: 2, A: 2 },
        valueRule: "same-as-purchase-price",
      },
    },
    {
      id: "rule-market-trade-window",
      category: "market",
      description:
        "Sessioni di scambio aperte durante ogni sosta nazionale e per tutto Gennaio (escluse le giornate in corso); il valore del giocatore scambiato resta invariato.",
      effect: {
        type: "trade-window",
        periods: ["international-breaks", "January"],
        excludeMatchdays: true,
        valueRule: "unchanged",
      },
    },
    {
      id: "rule-market-foreign-transfer",
      category: "market",
      description:
        "Giocatore ceduto a un campionato estero: svincolo automatico con riaccredito della spesa iniziale.",
      effect: { type: "foreign-transfer", autoRelease: true, refund: "purchase-price" },
    },
    {
      id: "rule-exception-off-window-transfer",
      category: "exception",
      description:
        "Giocatore ceduto dal proprio club fuori dalla sessione di mercato invernale: nessuno svincolo, squadra in inferiorità numerica fino al successivo mercato di riparazione.",
      effect: {
        type: "off-window-transfer",
        allowRelease: false,
        consequence: "numeric-disadvantage-until-next-repair-market",
      },
    },
    {
      id: "rule-exception-withdrawal",
      category: "exception",
      description:
        "Ritiro di un partecipante prima della fine del campionato: perde l'intera quota versata.",
      effect: { type: "participant-withdrawal", forfeitedAmountEuro: 80 },
    },
  ],
  entryFee: {
    amount: 80,
    currency: "EUR",
    depositAmount: 20,
    deadlineDescription: "Entro e non oltre il giorno dell'asta di Febbraio",
    withdrawalPenaltyDescription:
      "Chi si ritira prima della fine del campionato perde l'intera quota versata",
  },
  prizePool: [
    { id: "prize-1", label: "Primo posto", amount: 240, currency: "EUR" },
    { id: "prize-2", label: "Secondo posto", amount: 160, currency: "EUR" },
    { id: "prize-3", label: "Terzo posto", amount: 100, currency: "EUR" },
    { id: "prize-4", label: "Vincitore Coppa", amount: 100, currency: "EUR" },
    {
      id: "prize-5",
      label: "Top scorer dell'anno",
      amount: 35,
      currency: "EUR",
      notes: "Quota multe anno precedente, annata 25/26",
    },
  ],
  cupFormat: {
    enabled: true,
    name: "Coppa Formula 1",
    phases: [
      {
        id: "phase-1",
        name: "Fase 1",
        fromMatchday: 1,
        toMatchday: 10,
        teams: 10,
        eliminatedTeams: 2,
        notes: "Eliminazione della 9ª e 10ª squadra",
      },
      {
        id: "phase-2",
        name: "Fase 2",
        fromMatchday: 11,
        toMatchday: 20,
        teams: 8,
        eliminatedTeams: 2,
        notes: "Eliminazione della 7ª e 8ª squadra",
      },
      {
        id: "phase-3",
        name: "Fase 3",
        fromMatchday: 21,
        toMatchday: 30,
        teams: 6,
        eliminatedTeams: 2,
        notes: "Eliminazione della 5ª e 6ª squadra",
      },
      {
        id: "phase-4",
        name: "Fase 4 (finale)",
        fromMatchday: 31,
        toMatchday: 38,
        teams: 4,
        eliminatedTeams: 0,
        notes: "Vincitore = 1° classificato assoluto",
      },
    ],
  },
};

export function emptyLeagueDraft(): LeagueDraft {
  return {
    name: "",
    participants: 8,
    initialBudget: 500,
    rosterComposition: { P: 3, D: 8, C: 8, A: 6 },
    allowedModules: [],
    auctionMode: "classic-fixed-order",
    callOrder: { mode: "sequential" },
    rulesText: "",
    parsedRules: [],
  };
}
