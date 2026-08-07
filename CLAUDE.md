# CLAUDE.md — Contesto di progetto per Sedinho

Questo file è la memoria persistente del progetto: va aggiornato ad ogni sessione di
lavoro rilevante (nuovo modulo, decisione architetturale, cambio di scope) così che
chiunque (umano o Claude) riprenda il lavoro possa orientarsi senza rileggere l'intera
history.

> Specifica funzionale completa: [`docs/specs/funzionale-v1.md`](docs/specs/funzionale-v1.md).
> Le sezioni citate qui sotto (es. "sez. 8") si riferiscono a quel documento.

## 1. Cos'è Sedinho

App web personale per un singolo fantallenatore. Copre l'intero ciclo stagionale:
configurazione lega → database giocatori → aggiornamento manuale dati → asta live con
supporto decisionale → report finale. Principi non negoziabili (sez. 2):

1. **Configurabile**: nessuna regola hard-coded, tutto deriva dal Setup Wizard.
2. **Spiegabile**: ogni score espone fattori favorevoli/contrari, peso, affidabilità
   (vedi `Explanation` in `packages/shared/src/types/common.ts`).
3. **Aggiornamento manuale**: nessuno scraping automatico/schedulato; un solo pulsante
   "Aggiorna Database" innesca l'aggiornamento (sez. 5).
4. **Modulare**: ogni engine (Transfer, Rotation, Evaluation, Market, Decision,
   Simulatore) deve poter essere sostituito senza toccare gli altri.

## 2. Stack tecnologico (scelto, non solo "proposto")

| Layer | Scelta | Note |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Tailwind CSS per lo styling, Recharts per i grafici (sez. 10) |
| Backend | Node.js + TypeScript + Fastify | API REST, `tsx` per il dev loop; in produzione gira come function serverless Vercel (vedi sez. 9 "Deploy") |
| ORM / DB | Prisma + **PostgreSQL (Neon)** | `apps/api/prisma/schema.prisma`; migrato da SQLite (sez. 17) perché le function serverless Vercel hanno filesystem effimero |
| Routing frontend | react-router-dom | |
| Tipi condivisi | `packages/shared` (workspace npm) | Unica fonte di verità per i tipi di dominio, usata sia da `apps/api` che da `apps/web` |
| Package manager | npm workspaces (monorepo) | root `package.json` con `workspaces: ["apps/*", "packages/*"]` |
| Scraping | Playwright + Cheerio | Connettori modulari in `apps/api/src/import/connectors/`, invocati solo dal pulsante "Aggiorna Database" (mai in automatico) |
| Deploy | Vercel (frontend statico + function `/api`) + Neon (Postgres) | Vedi sez. 9 |

## 3. Struttura del repository

```
Sedinho/
├── api/
│   └── index.ts               # function serverless Vercel: inoltra /api/* a @sedinho/api (vedi sez. 9)
├── apps/
│   ├── api/                  # Backend Fastify + Prisma
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── app.ts        # buildApp(): costruisce l'istanza Fastify (riusata da index.ts e dalla function Vercel)
│   │       ├── index.ts      # entrypoint dev locale, chiama buildApp().listen()
│   │       ├── db/prisma.ts  # client Prisma condiviso
│   │       ├── lib/league-mapper.ts  # confine JSON-string <-> tipi condivisi (SQLite/Postgres via Prisma non hanno sempre Json comodo)
│   │       ├── lib/evaluation/, lib/market/, lib/opponents/, lib/decision/  # motori puri (sez. 8/13/12/14), nessuna dipendenza Prisma/HTTP
│   │       ├── import/       # pipeline "Aggiorna Database": types, upsert, runImport, connectors/
│   │       │   └── connectors/   # fantacalcioIt, fstats (3 stagioni), fantacalciopedia — tutti reali, vedi §5
│   │       └── routes/       # health, leagues, players, import, auction (asta/mercato/avversari/decisioni), shortlist
│   └── web/                  # Frontend Vite + React
│       └── src/
│           ├── App.tsx       # routing
│           ├── components/
│           │   ├── Layout.tsx
│           │   ├── ImportPanel.tsx        # pulsante "Aggiorna Database" + riepilogo per fonte
│           │   └── setup-wizard/   # StructureStep, EconomyStep, RulesStep, SummaryStep, defaultDraft
│           ├── pages/        # DashboardPage, SetupWizardPage, ...
│           └── lib/api.ts    # client fetch tipizzato verso /api (proxy Vite → :3001 in dev)
├── packages/
│   └── shared/                # Tipi TS condivisi (League, Player, Evaluation, Auction, Import, ...)
├── docs/
│   └── specs/funzionale-v1.md # Specifica funzionale originale (fonte di verità del dominio)
├── vercel.json                 # buildCommand multi-step, rewrite /api/* -> function, rewrite SPA
└── CLAUDE.md                  # questo file
```

## 4. Stato di avanzamento

Legenda: ✅ implementato · 🚧 scaffolding presente, logica da costruire · ⬜ non iniziato.

| Area (sez. spec) | Stato | Note |
|---|---|---|
| Monorepo, tooling, CLAUDE.md | ✅ | Fondamenta poste in questa sessione |
| Tipi di dominio condivisi (`packages/shared`) | ✅ | League (+ EntryFee/PrizePool/CupFormat), Player, SeasonStats, Hierarchy, SetPieces, TeamRotation, Transfer, PlayerEvaluation, Auction/Market/Decision |
| Schema DB (Prisma/SQLite) | ✅ | Rispecchia i tipi condivisi; 2 migrazioni applicate (`init`, `league-financials`) |
| Setup Wizard (sez. 3) | ✅ | 4 step reali (Struttura, Economia, Regolamento, Riepilogo) in `SetupWizardPage` + `components/setup-wizard/*`, collegati a `POST`/`PUT /leagues`; precompilato (editabile) con il regolamento reale "Travedona Serie A"; regole (`ParsedRule[]`) inserite tramite form strutturato manuale, non parsing automatico (vedi §5) |
| Database centrale giocatori (sez. 4) | ✅ | Schema pronto (incl. `initialQuotation`), API di lettura (`GET /players` con filtri ruolo/squadra/ricerca + riassunto valutazione, `GET /players/:id` con dettaglio completo); **popolato con dati reali** (~760 giocatori, cresce ad ogni "Aggiorna Database" con trasferimenti/nuovi arrivi) tramite i 3 connettori attivi in produzione; UI: `PlayersPage` (lista filtrabile/ordinabile) + `PlayerDetailPage` (spiegazione completa per categoria, incl. **storico fantamedia multi-stagione** — `SeasonStats` supportava già righe multiple per giocatore, serviva solo far scrivere più stagioni a FSTATS, vedi §5 — e colonna "% partite saltate per infortunio", `null` finché nessuna fonte la fornisce) |
| Sistema di aggiornamento / scraping (sez. 5) | 🚧 | Pipeline completa: `POST /import/run` (pulsante "Aggiorna Database" in Dashboard) orchestra connettori modulari (`ImportConnector`) e fa upsert con source/reliability. **Tutti e 3 i connettori sono reali e verificati in produzione**: Fantacalcio.it/quotazioni (identità/quotazione/ruolo, unico autorizzato a creare nuovi `Player`), FSTATS (in realtà `fantacalcio.it/statistiche-serie-a/{stagione}`, ora **3 stagioni** — `2025-26`/`2024-25`/`2023-24`, storico fantamedia richiesto esplicitamente dall'utente, vedi §5), Fantacalciopedia (gerarchie "titolare" + rigoristi/tiratori punizioni). Vedi §5 decisioni per il matching fuzzy per nome e `canCreatePlayers`. Le due stagioni passate aggiunte a FSTATS **non sono state verificate dal vivo** in questa sessione (stesso limite di rete, vedi sotto): stessi selettori della stagione corrente, presunti stabili ma da confermare in produzione |
| Transfer Engine (sez. 6) | ⬜ | Modello dati presente (`Transfer`), motore di calcolo impatto non implementato |
| Rotation Engine (sez. 7) | ⬜ | Modello dati presente (`TeamRotationProfile`), coefficienti non calcolati |
| Player Evaluation Engine (sez. 8) | 🚧 | Motore puro in `apps/api/src/lib/evaluation/` (un calcolatore per categoria + `evaluatePlayer` orchestratore, nessuna dipendenza da Prisma/HTTP), ricalcolato in automatico a fine `POST /import/run` (`evaluateAllPlayers`) e salvato come nuova riga `PlayerEvaluation` per giocatore. Indici `number \| null`: `null` = dato non disponibile, sempre spiegato in `explanation.factors`. Con tutti e 3 i connettori ora reali, `explanation.confidence` è significativamente più alta di prima (produzione/bonus/stabilità/affidabilità reali per i giocatori coperti da FSTATS/Fantacalciopedia); resta `null` solo dove nessuna fonte ha dati per quel giocatore/indice specifico. `reliability.injuryRisk` collegato a `SeasonStats.injuryAbsenceRate` (% partite saltate per infortunio, richiesto esplicitamente dall'utente): il campo/indice esiste end-to-end (schema → motore → UI) ma resta `null` per tutti — il tentativo di collegarlo a Transfermarkt (batch, poi on-demand un giocatore alla volta) è stato **abbandonato**: ogni richiesta, anche singola, falliva con HTTP 504 generato da CloudFront (blocco a livello di rete/infrastruttura sugli IP Vercel, non un problema di selettori o header, vedi §5) |
| Dashboard (sez. 9) | 🚧 | Header collegato alla League reale (nome, partecipanti, budget, rosa) con CTA a `/setup` se non configurata. Delle 9 sezioni spec, 4 collegate a dati reali (Migliori occasioni, Sopravvalutati, Titolari, Rigoristi/piazzati — vedi §5 sui limiti di "nuovi"); le altre 5 (cambi gerarchia, infortuni, trasferimenti, in crescita/in calo) restano placeholder onesti con la ragione esplicita (richiedono storico o motori non ancora costruiti), non dati finti. **Filtri implementati**: `DashboardFiltersBar` (`components/DashboardFilters.tsx`) — ruolo, squadra, fascia prezzo (quotazione), età, rischio (disponibilità), titolarità, tutti quelli richiesti dalla spec sez. 9 — filtra il pool di giocatori condiviso da tutte le sezioni prima che ognuna estragga la propria top-5 (vedi §5 sulla scelta di una barra unica invece di controlli per pannello) |
| Sistema grafico (sez. 10) | 🚧 | Prima pagina dedicata `/confronti` ("Confronti" in nav, coerente con la direzione UX §9 "tab dedicate"): selezione di fino a 4 giocatori (ricerca per nome + chip rimovibili), 4 grafici **sovrapponibili** (la funzionalità che la spec segnala come "fondamentale") con Recharts — fantamedia storica (linea, una serie per giocatore), gol/assist ultima stagione (barre raggruppate), minuti ultima stagione (barre), quotazione ufficiale vs prezzo atteso Evaluation Engine (barre raggruppate). Scope concordato con l'utente come primo blocco, non tutti i 9 tipi di grafico della spec: radar, scatter (dispersione), istogrammi, box plot, heatmap, distribuzioni, timeline restano ⬜. "Prezzo reale" (spec: "prezzo stimato vs reale") non disponibile: nessuna asta con abbastanza dati storici, solo "prezzo atteso" dal motore di valutazione |
| Live Auction Engine (sez. 11) | 🚧 | Nuovo modello `Participant` (chi sono i partecipanti, non solo il numero); `Auction`/`AuctionEntry` ora collegati con foreign key reali (a `League`/`Player`/`Participant`, prima erano stringhe libere). Rotte `apps/api/src/routes/auction.ts`: nomina partecipanti, avvia/termina asta, aggiungi/rimuovi un inserimento (giocatore+prezzo+acquirente, l'unico input richiesto dalla spec), reset di partecipanti/asta per fare prove, con validazione budget e "un giocatore non può essere venduto due volte nella stessa asta" (vincolo DB). Ogni inserimento ricalcola budget residuo e fabbisogno di ruolo per tutti i partecipanti (da zero, non incrementale — scala di un'asta personale). UI `/auction` a due colonne: pannello giocatori filtrabile per ruolo/nome con quelli già assegnati mostrati ingrigiti (badge acquirente + prezzo pagato), rosa di ogni partecipante visibile in tempo reale con prezzo reale per giocatore, valutazione sintetica dell'operazione (prezzo pagato vs quotazione ufficiale, unico riferimento disponibile oggi), pannello **Obiettivi** (shortlist, vedi riga sotto) e **Market Engine** sopra le rose, pulsante "Conviene rilanciare?" nell'`EntryBar` collegato al Decision Engine, pulsante **"Annulla ultima azione"** (undo, richiesto esplicitamente dall'utente, scope limitato all'asta live) che inverte l'evento più recente (assegnazione o rimozione) via soft-delete su `AuctionEntry.revokedAt` — vedi §5. **Non implementato**: "migliori opportunità" dipende da domande del Decision Engine non ancora coperte — omesso, non inventato |
| Shortlist / Obiettivi d'asta (non in spec, richiesto esplicitamente dall'utente) | ✅ | Modello `ShortlistEntry` (`playerId` univoco, nota opzionale, **priorità opzionale 1/2/3** — "prima/seconda/terza scelta", richiesta esplicitamente dall'utente subito dopo, `null` = non ancora assegnata), single-user come tutto il resto dell'app (nessuno scoping per lega/partecipante, vedi §5). Rotte `apps/api/src/routes/shortlist.ts`: `GET/POST/PATCH/DELETE /shortlist` (POST/PATCH validano `priority` in {1,2,3,null}), arricchito con la valutazione più recente (stesso riassunto di `PlayerListItem`) e, se c'è un'asta attiva, con lo stato di vendita in tempo reale. UI: stella (`ShortlistStarButton`) per aggiungere/rimuovere da `PlayersPage`, `PlayerDetailPage` e dal pannello giocatori dell'asta; nuova pagina dedicata `/shortlist` (tab "Obiettivi" in nav) per la gestione fuori asta, con ricerca nome + filtro ruolo + filtro squadra + **filtro/ordinamento per priorità** + ordinamento (stesso pattern di `PlayersPage`, richiesto esplicitamente dall'utente) — selettore priorità inline per riga, ordina di default per priorità (1ª prima, senza priorità in fondo); in `/auction` non è più un blocco sempre visibile ma un **pannello laterale apribile** (drawer a destra, pulsante "★ Obiettivi" in testata con contatore) — richiesto esplicitamente dall'utente, stesso pattern del pannello Commento AI sotto, per lasciare più spazio verticale al resto della console quando non serve; il pannello compatto nel drawer si riordina da solo per priorità (senza un controllo di ordinamento separato, non c'è spazio) e ha lo stesso selettore priorità inline. Etichette/colori priorità condivisi tra le due viste in `apps/web/src/lib/shortlistFormat.ts`, non duplicati |
| Autenticazione (non in spec, richiesta esplicitamente dall'utente) | ✅ | Modelli `User`/`Session` (Prisma). Non e' multi-tenancy: più utenti possono avere un account ma condividono tutti gli stessi dati (una sola `League`, vedi sotto "singola lega attiva") — serve solo a impedire che chiunque trovi l'URL pubblico veda/modifichi la lega, richiesta esplicita dell'utente ("in futuro magari più utenti e più leghe", oggi solo il primo pezzo). Sessioni come righe DB referenziate da un token opaco in un cookie httpOnly (`lib/auth.ts`/`lib/authGuard.ts`), non JWT (vedi §5 sul perché). Registrazione (`POST /auth/register`) protetta da un codice di invito condiviso (env var `SIGNUP_CODE`, da impostare su Vercel come `DATABASE_URL`), non aperta a chiunque. Hook `onRequest` globale (`registerAuthGuard`) protegge tutte le rotte tranne `/health`, `/auth/register`, `/auth/login`. UI: `LoginPage` (toggle accedi/registrati) mostrata al posto dell'app se non autenticati, nome utente + "Esci" in `Layout`. **Verificato in produzione dall'utente** (primo account registrato dopo aver impostato `SIGNUP_CODE`) |
| Commento AI live in asta (non in spec, richiesto esplicitamente dall'utente) | 🚧 | `AiCommentaryPanel` in `/auction`, ora dentro un **pannello laterale apribile** (drawer a destra, pulsante "💬 Commento AI" in testata, richiesto esplicitamente dall'utente insieme al drawer Obiettivi sopra): usa la chiave Anthropic **dell'utente**, chiamata **direttamente dal browser** (mai dal nostro server, richiesta esplicita — vedi `lib/anthropicClient.ts`), con l'header `anthropic-dangerous-direct-browser-access` che l'API pubblica richiede apposta per permetterlo. Chiave in `sessionStorage` (sparisce alla chiusura scheda), mai salvata nel DB, mai condivisa tra utenti anche sulla stessa lega. Modello scelto da un menu popolato da `GET /v1/models` con quella chiave (evita di hardcodare un model id che cambia nel tempo). **Prompt di sistema di default, fisso e riusato identico ad ogni chiamata** (`SYSTEM_PROMPT` in `lib/buildAuctionCommentaryPrompt.ts`, richiesto esplicitamente dall'utente "per contestualizzare e definire le risposte"): definisce persona/lingua/lunghezza/stile della risposta e ricorda al modello di basarsi solo sui dati forniti; era già presente prima di questa richiesta esplicita, qui solo confermato/documentato come il meccanismo che la soddisfa — non generato da zero. Il messaggio utente (`lib/buildAuctionCommentaryPrompt.ts`) riusa i dati già calcolati da Market/Opponent/Evaluation Engine (ultimo inserimento, profili avversari, mio budget/fabbisogno, top occasioni disponibili filtrate per i ruoli che mi mancano) — il modello commenta e consiglia su dati reali, non li inventa. Non ancora collegato ai tratti manuali sugli avversari (vedi riga sopra). Generazione solo on-demand (pulsante), mai automatica: ogni chiamata consuma crediti sulla chiave personale. **Non ancora verificato dal vivo con una chiave reale** in questa sessione (il sandbox raggiunge api.anthropic.com, ma non ho una chiave da testare): la forma delle richieste segue la documentazione pubblica dell'API Messages, da confermare al primo uso reale |
| Profilazione avversari (sez. 12) | 🚧 | Motore puro `apps/api/src/lib/opponents/computeOpponentProfiles.ts` (stesso pattern di Market/Evaluation Engine), ricalcolato ad ogni chiamata a `buildActiveAuctionState` e incluso in `ActiveAuctionState.opponents`. Un profilo per partecipante dai soli `AuctionEntry` già registrati: spesa media e budget residuo (reali), overpay index (prezzo/quotazione medio), concentrazione spesa (Herfindahl-Hirschman rinormalizzato, richiede ≥2 acquisti), preferenza "big" (`valueScore` medio dei giocatori presi), preferenza giovani (età media rispetto al range 18-38), squadra preferita (quota acquisti per squadra). "Aggressività" è una proxy dichiarata (frequenza di sovrapprezzo): il Live Auction Engine registra solo il prezzo finale di ogni inserimento, non i rilanci intermedi che la spec chiederebbe — nessuna aggressività "vera" calcolabile con questo modello dati. Ogni indice non calcolabile per mancanza di dati è `number \| null` (mai un finto 0), visibile in `/auction` come "n/d" nel pannello `OpponentsPanel` |
| Tratti avversari manuali (non in spec, richiesto esplicitamente dall'utente) | ✅ | L'utente ha confermato di non avere lo storico delle scorse edizioni della lega (offerta ritirata, vedi §10 punto 19/22): al suo posto, 4 campi opzionali su `Participant` (`preferredTeam`, `bidTendency`, `spendingStyle`, `scoutingStyle`, tutti nullable) che l'utente imposta di propria conoscenza diretta sui rivali. `PATCH /participants/:id` (`apps/api/src/routes/auction.ts`) valida i tre float in 0..1. UI: `OpponentTraitsPanel` in `/auction`, sotto `OpponentsPanel` (sez. 12) ma in un riquadro **visivamente separato** (bordo indigo invece di slate, etichettato "impostati da te") — deliberato, per non confondere un dato osservato dagli inserimenti reali con una stima soggettiva dell'utente (principio "Spiegabile"). Sliders (`TraitSlider`) aggiornano lo stato locale ad ogni tick per reattività ma chiamano l'API solo al rilascio (`onMouseUp`/`onTouchEnd`/`onKeyUp`), non ad ogni tick, per non spammare `PATCH` durante il trascinamento; il campo squadra preferita salva su `onBlur`. Salvataggio best-effort (nessun retry/rollback in UI su errore di rete): coerente con la scala "un utente, un'asta live", non vale la complessità di uno stato di sincronizzazione. Esclude sempre il partecipante `isMe` (non ha senso profilare se stessi). Non ancora consumato da `buildAuctionCommentaryPrompt.ts` (il commento AI, sez. sotto): prossimo passo naturale se l'utente lo richiede. |
| Market Engine (sez. 13) | 🚧 | Motore puro `apps/api/src/lib/market/computeMarketState.ts` (stesso pattern del Player Evaluation Engine: input già estratto dal DB, nessuna dipendenza Prisma/HTTP), ricalcolato ad ogni chiamata a `buildActiveAuctionState` (`routes/auction.ts`) e incluso in `ActiveAuctionState.market`, restituito da `GET /auctions/active` e da ogni mutazione. Calcola tutti e 6 i parametri della spec dai soli `AuctionEntry` già registrati: inflazione prezzi, svalutazione per ruolo, temperatura di mercato (euristica dichiarata su sovra/sotto-pagamento degli ultimi 5 inserimenti, non una probabilità calibrata), budget residuo totale, scarsità titolari per ruolo (frazione di titolari noti già venduti), rilancio medio. "Modifica le valutazioni" (spec) implementato in modo mirato: `EntryBar` in `/auction` mostra un "atteso a mercato" per il giocatore selezionato (quotazione ufficiale rettificata per l'inflazione del suo ruolo) accanto alla quotazione ufficiale, mai al posto di essa — nessun dato persistito viene sovrascritto (vedi §5) |
| Decision Engine (sez. 14) | ✅ | Risponde a tutte e 8 le domande della spec. Motore puro `apps/api/src/lib/decision/computeDecisionRecommendation.ts`, esposto on-demand da `POST /auctions/:id/decision` (`{playerId, buyerId?, candidatePrice?}`), non pre-calcolato per ogni giocatore ad ogni poll dell'asta: risponde a 6 domande per-giocatore — "prezzo massimo corretto", "conviene rilanciare?", "quanto vale realmente questo rilancio?" (campo `valuation`, sottopagato/in linea/sovrapagato vs `maxCorrectPrice`), "conviene attendere?" (campo `waitRecommended`, richiede alternative con valueScore comparabile ancora libere nello stesso ruolo, contate dalla rotta), "quanto rischio introduco in rosa?" (campo `rosterRisk`, euristica su indisponibilità/riserve dichiarate/concentrazione per squadra, before/after) e "conviene completare una coppia?" (campo `teamConcentration`, proxy sulla quota di rosa dalla stessa squadra — nessun dato di sinergia reale disponibile). Le ultime 2 domande ("miglior rapporto qualità/prezzo tra più giocatori", "chi dovrei chiamare adesso") confrontano l'intero pool, non un giocatore alla volta: nuovo motore `rankPoolCandidates.ts`, esposto da `POST /auctions/:id/decision/pool` (`{mode, role?, buyerId?, limit?}`), che classifica per punti fantamedia attesi (FSTATS) per credito di prezzo atteso — **non** `PlayerListItem.valueScore` (quello e' solo un percentile della quotazione, non incorpora la produzione, sarebbe stato fuorviante chiamarlo "rapporto qualità/prezzo"); "chi chiamare adesso" filtra sui ruoli mancanti e aggiunge un piccolo bonus quando pochi rivali cercano ancora quel ruolo. UI: `EntryBar` mostra badge compatti per valutazione/attesa/rischio/concentrazione oltre a raccomandazione e fattori; nuovo drawer "🎯 Occasioni" in `/auction` per le 2 domande sul pool (toggle qualità/prezzo vs chi chiamare, filtro ruolo) |
| Simulatore (sez. 15) | 🚧 | Scope concordato esplicitamente con l'utente: Monte Carlo per un **singolo giocatore alla volta**, non simulazione dell'intera asta con migliaia di partecipanti simulati (avrebbe richiesto un modello di comportamento per ogni rivale, non tarabile senza uno storico comportamentale reale — offerta ritirata dall'utente, vedi §10). Motore puro `apps/api/src/lib/simulator/simulatePlayerAuction.ts`: classifica il giocatore in una fascia (titolare/prima alternativa/riserva-tappabuchi, da `hierarchyLevel` o fallback su `valueScore`) — quasi ogni rosa tiene 1-2 slot per ruolo riempiti a 1 credito, dettaglio confermato esplicitamente dall'utente, quindi i tappabuchi hanno una distribuzione diversa dai titolari, non un'unica curva per ruolo. Simula migliaia di scenari (log-normale, deviazione legata alla confidenza della valutazione) e restituisce intervallo di prezzo (p10/p50/p90), probabilità di aggiudicazione al budget indicato, la stessa curva letta ad altri budget ("strategie alternative") e un'analisi di sensibilità testuale (Explanation). Rotta `POST /simulate/player` (`{playerId, myBudget, auctionId?, iterations?}`): con `auctionId` di un'asta attiva usa domanda concorrente/inflazione **reali** (stessa logica del Decision Engine); senza, una stima generica pre-asta dalla sola composizione rosa della lega (dichiarata come meno precisa in ogni risposta). Tab dedicata `/simulatore` (coerente con la direzione UX §9), funziona anche senza asta attiva. **Nessuno storico prezzi reale della lega dell'utente e' disponibile**: la distribuzione resta un'euristica dichiarata, informata da alcuni riferimenti qualitativi forniti dall'utente (fasce di prezzo indicative per ruolo/fascia, effetto "fine asta") ma non calibrata su un dataset reale — vedi §5. |
| Report finale (sez. 16) | ⬜ | Non iniziato |

## 5. Decisioni architetturali prese

- **Monorepo npm workspaces** invece di due repo separati: semplifica la condivisione
  dei tipi (`@sedinho/shared`) tra frontend e backend, coerente con "Modularità" (sez. 2).
- **SQLite via Prisma** per partire senza infrastruttura, con `datasource` isolato in
  `schema.prisma` per rendere la migrazione a PostgreSQL un cambio di una riga + env var,
  come richiesto esplicitamente dalla spec (sez. 17).
- **Ogni entità di dominio importata/derivata porta `source` + `updatedAt` + `reliability`**
  (nel DB: campi diretti sui modelli; nei tipi condivisi: `DataSourceMeta`) per rispettare
  il principio di trasparenza sui dati (sez. 5).
- **`Explanation`/`ExplanationFactor` come tipo trasversale**: qualunque engine che produce
  un punteggio o una raccomandazione dovrà restituire anche una `Explanation`, per rispettare
  il principio "Spiegabile" (sez. 2). Va riusato invece di inventare strutture ad-hoc per
  singolo engine.
- **Nessun job schedulato/automatico**: qualunque futura integrazione di scraping
  (Playwright/Cheerio) deve essere invocata solo da un'azione utente esplicita
  ("Aggiorna Database"), mai da cron/interval.
- **Singola lega attiva**: Sedinho è un'app personale per un singolo fantallenatore, non
  multi-lega. L'API impone l'invariante lato server: `POST /leagues` risponde `409` se una
  `League` esiste già (suggerendo `PUT /leagues/:id`). Il frontend non ha un selettore lega:
  `SetupWizardPage` carica automaticamente la lega esistente (se presente) in modalità
  modifica, altrimenti parte da una bozza precompilata.
- **SQLite via Prisma non supporta il tipo `Json`** (a differenza di Postgres): tutti i campi
  strutturati (`rosterComposition`, `parsedRules`, `entryFee`, `prizePool`, `cupFormat`, ...)
  sono colonne `String` con JSON serializzato manualmente. Il confine di
  serializzazione/deserializzazione è isolato in `apps/api/src/lib/league-mapper.ts`: le rotte
  e il resto del codice lavorano sempre con i tipi condivisi tipizzati, mai con le stringhe
  JSON grezze. Se si aggiungono altri modelli con campi strutturati, seguire lo stesso pattern
  (mapper dedicato) invece di esporre le stringhe serializzate nelle risposte API.
- **Regole del regolamento (`ParsedRule[]`) inserite via form strutturato, non parsing AI**:
  su richiesta esplicita dell'utente, il Setup Wizard non chiama nessun LLM per estrarre le
  regole dal testo del regolamento. L'utente compila categoria + descrizione + `effect` (JSON
  libero) per ogni regola tramite `RulesStep`; il testo integrale del regolamento resta comunque
  salvato in `rulesText` come riferimento e come base per un eventuale parsing assistito da AI
  futuro, opzionale e BYOK (l'utente fornirebbe la propria API key, non stiamo integrando
  nessuna chiamata LLM lato server per ora).
- **`LeagueConfig` esteso con dati amministrativi opzionali** (`entryFee`, `prizePool`,
  `cupFormat`): non usati da nessun engine di valutazione/decisione, servono solo a non perdere
  informazioni reali del regolamento fornito dall'utente (quota d'iscrizione, montepremi,
  struttura di un torneo/coppa parallelo). Vanno tenuti opzionali: un regolamento senza questi
  elementi non deve fallire la creazione della lega.
- **Il sandbox di sviluppo (Claude Code on the web) non ha accesso a internet generico**: solo
  un allowlist ristretto (npm, GitHub, Anthropic, poco altro). fantacalcio.it, fstats.it e
  fantacalciopedia.com sono bloccati dalla policy di rete (403 a livello di proxy). Di
  conseguenza i connettori di scraping **non possono essere testati dal vivo in questa
  sessione**: vanno scritti qui e verificati/corretti eseguendo `npm run dev:api` in locale
  (dove presumibilmente internet è libero) o in un ambiente con policy meno restrittiva. Prima
  di investire tempo a "indovinare" selettori CSS per un sito complesso, conviene chiedere
  all'utente HTML/markup reale, oppure accettare che il primo giro vada rifinito in locale.
- **Connettori di import come moduli intercambiabili** (`apps/api/src/import/connectors/`,
  interfaccia `ImportConnector` in `import/types.ts`): ogni fonte implementa `run(): Promise<
  PlayerImportRecord[]>` e viene registrata nell'elenco in `import/runImport.ts`. Aggiungere
  una fonte non richiede toccare l'orchestratore. Un connettore non ancora completato lancia
  `ConnectorNotImplementedError` (riconosciuto dall'orchestratore come stato "skipped", distinto
  da "failed") invece di restituire dati finti o silenziosamente vuoti.
- **Matching giocatore per (name, team) esatto, con fallback fuzzy per nome** in fase di upsert
  (`import/upsert.ts`): non esiste ancora un id esterno persistito per fonte, e FSTATS/
  Fantacalciopedia usano grafie diverse dal listone quotazioni (es. "BARELLA NICOLO'" invece di
  "Nicolò Barella", o solo cognome). Se il match esatto fallisce, `findPlayerByFuzzyName` cerca
  un giocatore esistente che condivida almeno un token di nome normalizzato (accent-insensitive),
  prima filtrato per ruolo poi (se non trova nulla) senza filtro — necessario perché le fonti non
  sempre concordano sulla classificazione di ruolo (es. trequartisti C per una fonte, A per
  un'altra). Accettato solo se univoco, altrimenti niente match (meglio saltare che sbagliare).
- **`ImportConnector.canCreatePlayers`**: solo Fantacalcio.it/quotazioni (nome completo + squadra
  nel formato canonico) può creare nuovi `Player` o sovrascriverne `name`/`team`. FSTATS e
  Fantacalciopedia (formati diversi, meno affidabili per l'identità) possono solo aggiornare
  giocatori già esistenti (via match esatto o fuzzy) — mai crearne di nuovi né rinominarli.
  **Lezione da un incidente reale**: la primissima versione del fallback fuzzy permetteva comunque
  la creazione quando il match falliva (dato che queste fonti forniscono comunque un ruolo),
  verificato in produzione: ha creato ~124 giocatori duplicati con nome/squadra mal formattati in
  un singolo giro di `POST /import/run`. Ripulito manualmente via query dirette su Neon (righe
  identificate con precisione da `source`+`createdAt`, zero collisioni di nome col resto della
  tabella) prima di introdurre `canCreatePlayers`. Prima di fidarsi di un fallback "crea se non
  trovi", chiedersi sempre se la fonte è davvero autorevole per l'*identità* del giocatore, non
  solo per il dato che arricchisce.
- **Il campo `Player.team` è la sigla a 3 lettere di Fantacalcio.it (es. "INT", "ATA"), non il
  nome esteso**: assunzione iniziale sbagliata (mai verificata direttamente) corretta ispezionando
  i dati reali in produzione durante l'incidente sopra. Tutti i connettori e `findPlayerByFuzzyName`
  ne tengono conto: FSTATS e Fantacalciopedia non si affidano al confronto per `team` (spesso
  assente o in formato diverso), solo al nome.
- **`POST /import/run` sincrona**: per la scala di un singolo utente/lega va bene una richiesta
  che attende il completamento di tutti i connettori. Se in futuro Playwright su più pagine la
  rende lenta, valutare di renderla asincrona con un job id e polling di stato, senza cambiare
  l'interfaccia `ImportConnector` sottostante.
- **Migrazione da SQLite a PostgreSQL (Neon)**: necessaria per deployare su Vercel, le cui
  function serverless hanno filesystem effimero (SQLite su file non è utilizzabile in
  produzione). Vedi sez. 8 "Deploy" per i dettagli. I campi che erano `String` con JSON
  serializzato manualmente (per l'assenza del tipo `Json` in Prisma su SQLite) sono rimasti
  `String` anche su Postgres per non introdurre un secondo cambiamento contestuale: **Postgres
  supporterebbe il tipo `Json` nativo di Prisma**, quindi è un refactor pulito disponibile per
  il futuro (rimuoverebbe il bisogno di `league-mapper.ts`), ma non è stato fatto ora.
- **Player Evaluation Engine come modulo puro** (`apps/api/src/lib/evaluation/`): un
  calcolatore per categoria (`reliability.ts`, `production.ts`, `bonus.ts`, `stability.ts`,
  `value.ts`), ognuno una funzione pura `input -> { indices, factors }` senza dipendenze da
  Prisma/HTTP, assemblati da `evaluatePlayer.ts` in un'unica `PlayerEvaluation`. Il confine col
  DB (query Prisma + persistenza) è isolato in `evaluateAllPlayers.ts` e nel mapper
  `lib/evaluation-mapper.ts` (stesso pattern di `league-mapper.ts`), cosi' il motore resta
  testabile in isolamento e sostituibile (principio "Modularità").
- **Indici `number | null`, mai un finto zero**: ogni campo di `ReliabilityIndices` /
  `ProductionIndices` / `BonusIndices` / `StabilityIndices` / `ValueIndices` è `number | null`
  (tipi in `packages/shared/src/types/evaluation.ts`). `null` significa esplicitamente "dato
  non disponibile" — la fonte che manca (FSTATS, Fantacalciopedia, Market Engine, ...) è sempre
  nominata in un `ExplanationFactor` con `weight: 0` dentro `explanation.factors` (principio
  "Spiegabile"). `explanation.confidence` è la frazione di campi calcolati con dati reali su 20
  totali. Con le sole quotazioni Fantacalcio.it disponibili oggi, solo `value.valueScore`
  (percentile della quotazione tra i giocatori dello stesso ruolo) e
  `value.expectedAuctionPrice` (= `initialQuotation`) sono reali; il resto è `null` finché
  FSTATS (statistiche) e Fantacalciopedia (gerarchie, calci piazzati) restano stub — la stessa
  logica calcolerà valori veri senza modifiche non appena quelle tabelle si popolano.
- **Ricalcolo automatico a fine "Aggiorna Database", non un bottone separato**:
  `POST /import/run` chiama `evaluateAllPlayers()` come ultimo passo, che crea una nuova riga
  `PlayerEvaluation` per ogni giocatore (storico append-only, `GET /players/:id` prende la più
  recente per `computedAt`). Resta un'unica azione manuale end-to-end, coerente col principio
  "Aggiornamento manuale": non serve un endpoint/pulsante dedicato in più. Sequenziale (non
  `Promise.all`) per lo stesso motivo di `upsertPlayerImportRecords`: `DATABASE_URL` in
  produzione è una pooled connection Neon con `connection_limit=1`.
- **Deploy su Vercel via GitHub, non via upload manuale**: il progetto Vercel `sedinho` è
  collegato al repo GitHub con branch di produzione `main` (vedi sez. 8). Un `git push` su
  `main` innesca da solo un deploy automatico in produzione — **non serve invocare deploy
  manuali** (il tool di upload diretto dei file è stato usato solo per il primissimo deploy,
  prima che il progetto Vercel esistesse, ed è anche la causa del bug di routing su
  `api/[...path].ts` descritto in sez. 8: quel percorso di deploy non passa dalla build da
  git e ha trattato il nome file con parentesi in modo diverso).
- **Ogni push va sempre replicato su `main`, senza fermarsi a verificare l'esito del deploy**:
  richiesta esplicita dell'utente. Il branch di lavoro (`claude/sedinho-project-foundation-
  3weesw` o equivalente) resta la storia di sviluppo, ma `main` deve restare allineato ad ogni
  push perché è l'unico branch che Vercel builda in produzione (vedi sopra). Non serve
  interrogare `list_deployments`/`get_deployment` per controllare che il build sia `READY`:
  se il deploy fallisce, se ne accorge l'utente stesso controllando manualmente.
- **`GET /players` restituisce `PlayerListItem` (riga snella), non l'intero `Player` +
  relazioni**: solo il riassunto della `PlayerEvaluation` più recente (`valueScore`,
  `expectedAuctionPrice`, `starterProbability`, `confidence`) più `hierarchyLevel` e
  `setPieceTypes`, non l'intera `Explanation` con tutti i `factors` — troppo pesante per
  ~760 giocatori in un'unica risposta. Il dettaglio completo (inclusa la spiegazione per
  categoria) resta su `GET /players/:id`, usato da `PlayerDetailPage`.
- **Le collezioni annidate su `GET /players/:id` (seasonStats, hierarchies, setPieceRoles) non
  passano da un mapper verso i tipi condivisi con `meta: DataSourceMeta`**: sono le righe
  Prisma cosi' come sono (`source`/`updatedAt`/`reliability` come campi piatti). Solo
  `evaluations` attraversa `evaluation-mapper.ts`. Il frontend (`apps/web/src/lib/api.ts`)
  definisce tipi locali (`PlayerSeasonStatsRow` ecc.) che rispecchiano la risposta reale
  invece di riusare i tipi condivisi mismatched — scelta pragmatica per ora, un mapper
  dedicato (stesso pattern di `league-mapper.ts`/`evaluation-mapper.ts`) è un refactor pulito
  disponibile per il futuro se questi campi iniziano a servire altrove.
- **Il sandbox di sviluppo non raggiunge nemmeno Neon (porta 5432), non solo i siti da
  scrapare**: `npm run dev:api` in locale fallisce con "Can't reach database server" anche
  con `DATABASE_URL` correttamente valorizzata (verificato: la env var arriva al processo,
  è la connessione TCP a fallire). Quindi anche la UI non è testabile in locale in questa
  sessione — verificata invece sul deploy Vercel di produzione (che ha accesso reale), stessa
  tecnica già usata per i connettori.
- **`Participant` come modello nuovo, separato da `League.participants`**: quel campo è solo il
  numero di partecipanti scelto nel Setup Wizard, non chi sono. L'asta live (sez. 11) ha bisogno
  di sapere chi per calcolare budget residuo/fabbisogno di ruolo per ciascuno: `Participant`
  (nome + `isMe`, per distinguere "la mia rosa" nel report finale, sez. 16) viene creato al volo
  al primo avvio asta (`POST /participants`), non nel Setup Wizard, per non appesantire quel
  flusso con un input utile solo più avanti.
- **Generare una migrazione Prisma senza accesso al DB**: `prisma migrate dev` (e anche
  `migrate diff --from-migrations`) hanno bisogno di una connessione reale (anche solo a un
  shadow DB) per calcolare il diff, quindi falliscono nel sandbox di sviluppo (vedi sopra).
  `prisma migrate diff --from-schema-datamodel <schema-vecchio> --to-schema-datamodel <schema-
  nuovo> --script` invece confronta due file schema.prisma direttamente, senza toccare nessun
  database: usato per generare `migrations/20260805123450_auction_participants/migration.sql`
  (schema vecchio recuperato con `git show HEAD:...schema.prisma`). Verificato a mano che le
  tabelle toccate (`Auction`/`AuctionEntry`) fossero vuote in produzione prima di introdurre
  foreign key `NOT NULL` su di esse.
- **Stato dell'asta ricalcolato da zero ad ogni richiesta, non incrementale**: `GET /auctions/
  active` (e la risposta di ogni mutazione) rifà la query completa e ricalcola budget/fabbisogni
  per tutti i partecipanti ogni volta, invece di tenere uno stato aggregato aggiornato in
  modo incrementale. Più semplice e impossibile da far disallineare, accettabile alla scala di
  un'asta personale (poche decine di inserimenti, un solo utente).
- **Vincoli di integrità lato DB, non solo applicativi**: `@@unique([auctionId, playerId])` su
  `AuctionEntry` impedisce di vendere due volte lo stesso giocatore nella stessa asta anche in
  caso di race condition; il prezzo viene comunque validato anche applicativamente contro il
  budget residuo del partecipante prima dell'insert (calcolato ricostruendo lo stato, vedi sopra).
- **`POST /auctions/reset`**: cancella tutti i `Participant` e le `Auction` (con `AuctionEntry`
  in cascata) della lega — richiesto esplicitamente dall'utente per poter fare prove prima
  dell'asta vera senza doversi portare dietro dati di test (la nomina dei partecipanti è
  altrimenti irreversibile, `POST /participants` risponde 409 se già fatta). Pulsante "Reset"
  in `/auction`, con conferma nativa del browser: non c'è undo, va usato consapevolmente.
- **`/auction` a due colonne, non un form isolato**: pannello sinistro con l'intero database
  giocatori filtrabile (ruolo, squadra, nome) e ordinabile (prezzo, valore, prob. titolare,
  nome); cliccare un giocatore lo seleziona per l'assegnazione invece di doverlo ridigitare in
  un autocomplete separato (l'autocomplete della prima versione è stato rimosso, ridondante con
  questo pannello). La metrica mostrata a destra di ogni riga segue l'ordinamento scelto, cosi'
  si vede sempre il numero per cui si sta ordinando. I giocatori già assegnati non spariscono
  dalla lista: restano visibili ingrigiti con badge acquirente+prezzo, cosi' rimane chiaro chi è
  ancora disponibile scorrendo tutta la rosa. Rosa di ogni partecipante sempre visibile (non
  dietro un accordion) con prezzo pagato per ogni giocatore e un indicatore a pallino colorato
  (`rateOperation` in `AuctionPage.tsx`) che confronta prezzo pagato e quotazione ufficiale del
  singolo giocatore — granularità volutamente diversa dal `MarketPanel` aggregato (sez. 13,
  aggiunto in una sessione successiva), non un placeholder in attesa di quello. Le classi Tailwind per
  il colore del pallino sono stringhe letterali (`bg-emerald-400` ecc.), mai costruite a
  runtime con `.replace()`: Tailwind scansiona il sorgente per stringhe di classe statiche, una
  classe assemblata dinamicamente non verrebbe inclusa nel CSS generato e il pallino
  risulterebbe invisibile.
- **"Valore" nel pannello giocatori dell'asta è `value.valueScore` (Player Evaluation Engine,
  sez. 8), non una valutazione del Market Engine**: l'utente ha chiesto di ordinare per
  "valutazione market engine", ma quel motore (sez. 13) non esiste ancora — usato l'indice più
  vicino disponibile oggi (percentile della quotazione tra i giocatori dello stesso ruolo) con
  l'etichetta "Valore" già usata altrove nell'app (`PlayersPage`), non rinominato per finta
  precisione che non c'è.
- **Un push su GitHub può disallinearsi dal checkout locale del sandbox tra un turno e
  l'altro**: durante questa sessione un commit (`48c70f0`, il reset dell'asta) risultava assente
  da `git log` locale nonostante fosse stato pushato con successo in un turno precedente e
  verificato live su Vercel — il container aveva ripristinato uno stato del filesystem
  antecedente a quel commit, ma il branch remoto era intatto. Verificato interrogando
  direttamente l'API GitHub (`list_commits`) invece di fidarsi solo di `git log`/`git status`
  locali; risolto con `git fetch` + `git merge --ff-only` (mai `reset --hard`, per non perdere
  lavoro locale non ancora pushato) prima di ricreare qualsiasi modifica "mancante" a mano.
  Se una modifica fatta in un turno precedente sembra sparita, controllare prima lo stato reale
  su GitHub piuttosto che assumere che non sia mai stata salvata.
- **Filtri Dashboard: una barra condivisa, non un set di controlli per pannello**: la spec
  (sez. 9) dice "ogni pannello sarà filtrabile per ruolo, squadra, fascia prezzo, età, rischio,
  titolarità". Interpretazione scelta: un'unica `DashboardFiltersBar` sopra la griglia di
  sezioni filtra il pool di `PlayerListItem` condiviso da tutte le sezioni prima che ciascuna
  estragga la propria top-5 — ogni pannello resta "filtrabile" (riflette la barra), ma senza
  duplicare 6 controlli per ognuna delle 9 sezioni. Coerente con la direzione UX "interfaccia
  semplice, pochi input" (sez. 9 di questo file). "Rischio" è mappato sul campo reale
  `availability` (disponibile vs infortunato/squalificato/in dubbio) — non esiste ancora un
  indice di rischio calcolato, quindi si usa il dato più vicino disponibile invece di inventare
  una metrica. "Età" richiede `birthDate`: aggiunto a `PlayerListItem` (non c'era, serviva solo
  al dettaglio) — un giocatore senza `birthDate` noto viene escluso dal risultato quando il
  filtro età è attivo (mai un'età finta), stesso pattern già usato per prezzo/quotazione
  mancante.
- **"Aggressività" nel Profilo avversari (sez. 12) è una proxy dichiarata, non i rilanci
  veri**: la spec chiede "aggressività nei rilanci", ma il Live Auction Engine (sez. 11) non
  registra rilanci intermedi — solo il prezzo finale di ogni inserimento (giocatore+prezzo+
  acquirente, l'unico input previsto dalla spec sez. 11 stessa). Costruire un'asta "a voce" con
  storico dei rilanci sarebbe un cambio di modello dati molto più grande, non fatto qui.
  `aggressiveness` è quindi calcolata come frequenza di sovrapprezzo rispetto alla quotazione
  ufficiale — un proxy ragionevole ma esplicitamente etichettato come tale in UI (nota a piè di
  tabella in `OpponentsPanel`), non spacciato per una misura diretta dei rilanci.
- **`OpponentProfile` con campi `number | null` dove il dato minimo non c'è**: stesso pattern
  del Player Evaluation Engine (sez. 8). `spendConcentration` richiede almeno 2 acquisti (con
  un solo acquisto l'indice di concentrazione vale sempre "tutto su un giocatore", non dice
  nulla); `overpayIndex`/`aggressiveness` richiedono almeno un acquisto con quotazione nota;
  `topPlayerPreference`/`youngPlayerPreference` richiedono rispettivamente `valueScore` e
  `birthDate` noti sui giocatori acquistati. Il tipo originale (scritto in una sessione
  precedente, prima che il motore esistesse) li dichiarava `number` non nullable: corretto in
  questa sessione insieme all'implementazione, non lasciato inconsistente.
- **Shortlist single-user, nessuno scoping per lega/partecipante**: come tutto il resto di
  Sedinho (vedi sopra "singola lega attiva"), `ShortlistEntry` ha solo `playerId` (univoco,
  niente doppioni) e una nota libera opzionale, senza `leagueId`. Stesso pattern di
  `PlayerHierarchy`/`SetPieceRole`: relazione diretta a `Player`, cascade delete.
- **Priorità sugli obiettivi come campo `Int?` a 3 valori (1/2/3), non una posizione libera in
  una lista ordinabile**: richiesto esplicitamente dall'utente ("dividere gli obiettivi per
  priorità: prime scelte, seconde scelte, terze scelte... riordinabili per priorità e
  filtrabili"). Scelte 3 fasce fisse invece di un drag-and-drop con posizione intera arbitraria
  (che avrebbe richiesto rinumerare tutte le righe ad ogni spostamento, complessità non
  giustificata per "tenere d'occhio 3 livelli di preferenza" durante un'asta): un `<select>`
  1ª/2ª/3ª/— per riga, in entrambe le viste (`/shortlist` e il drawer Obiettivi in `/auction`).
  `null` = non ancora assegnata, mai un default implicito — un obiettivo appena aggiunto non è
  "terza scelta" per default, semplicemente non ha ancora una priorità. Più obiettivi possono
  condividere la stessa fascia (nessun vincolo di unicità): l'utente può avere 3 "prime scelte"
  per ruoli diversi. Ordinamento di default in entrambe le viste: priorità crescente con "senza
  priorità" sempre in fondo (`?? 99` nel comparatore). Etichette/colori (`priorityLabels`/
  `priorityBadgeClass`) centralizzati in `apps/web/src/lib/shortlistFormat.ts` invece di
  duplicati tra `ShortlistPage` e il pannello compatto in `/auction`, per restare coerenti.
- **Simulatore: singolo giocatore alla volta, non l'intera asta**: la spec (sez. 15) parla di
  "migliaia di aste" simulate con "comportamento storico dei partecipanti" — ma l'utente ha
  confermato di non avere storico (vedi punto 19/22 sotto), e simulare l'intera asta avrebbe
  comunque richiesto un modello di comportamento/offerta per OGNI rivale, non tarabile senza
  dati comportamentali reali. Scelta esplicita con l'utente (`AskUserQuestion`): un Monte Carlo
  per un giocatore alla volta, che riusa gli stessi dati del Decision Engine appena esteso
  (rivali in cerca del ruolo, inflazione di mercato) invece di inventare un modello
  multi-agente. **L'utente ha comunque fornito alcuni riferimenti qualitativi** prima di
  partire (fasce di prezzo indicative per ruolo/fascia in stagioni-record passate dei
  giocatori citati, l'effetto "quando i big sono venduti i rimasti del ruolo costano di più",
  e soprattutto che quasi ogni rosa tiene 1-2 slot per ruolo riempiti a 1 credito) — usati per
  informare la forma del modello (fasce titolare/rincalzo/tappabuchi con distribuzioni diverse,
  non un'unica curva per ruolo) ma **non trattati come un dataset calibrabile**: sono aneddoti
  su singoli giocatori in stagioni diverse, non abbastanza osservazioni per stimare una vera
  deviazione standard. Il motore resta un'euristica dichiarata, documentata come tale in ogni
  risposta (`explanation`), non spacciata per una previsione calibrata.
- **Fascia titolare/rincalzo/tappabuchi stimata dal motore, non chiesta all'utente**: scelta
  esplicita con l'utente ("stimi da solo") invece di aggiungere un input manuale
  "titolare o riserva?" ad ogni simulazione. Usa `hierarchyLevel` (gerarchia reale da
  Fantacalciopedia) quando disponibile; se assente, fallback dichiarato sul `valueScore`
  (percentile della quotazione nel ruolo) — meno affidabile, la spiegazione lo dice esplicitamente.
  I tappabuchi (`hierarchyLevel: "second-alternate"` o fallback equivalente) hanno il 70% di
  probabilità di essere simulati esattamente a 1 credito (costante dichiarata, non calibrata),
  il resto segue comunque la distribuzione normale — cattura il caso raro in cui anche un
  tappabuchi viene pagato di più per scarsità estrema di fine asta, senza fingere che sia la
  norma.
- **Simulatore funziona con o senza un'asta attiva**: la spec dice "prima dell'asta", ma i dati
  più accurati (domanda concorrente reale, inflazione di mercato) esistono solo dentro
  un'asta già avviata (stesso identico limite del Decision Engine). `POST /simulate/player`
  accetta un `auctionId` opzionale: se c'è un'asta attiva la usa (dati reali, `dataSource:
  "auction"`), altrimenti stima i rivali in cerca di quel ruolo dalla sola composizione rosa
  della lega (`dataSource: "generic"`, quota di slot per ruolo × partecipanti previsti — non
  sappiamo ancora chi sono i rivali ne' cosa hanno comprato). Ogni risposta dichiara quale delle
  due fonti ha usato, mai silenziosamente. La pagina dedicata `/simulatore` (coerente con
  CLAUDE.md sez. 9, "tab dedicate" per aree funzionali principali) precompila il budget dal
  budget residuo reale se c'è un'asta attiva, altrimenti dal budget iniziale della lega.
- **Storico fantamedia: bastava far scrivere più stagioni al connettore FSTATS, non un nuovo
  modello**: `SeasonStats` aveva già `@@unique([playerId, season, competition])` e
  `syncSeasonStats` (import/upsert.ts) già faceva upsert per stagione — il gap era solo che
  `fstatsConnector` interrogava un'unica `PREVIOUS_SEASON` hardcoded. Esteso a un elenco
  `SEASONS` (`2025-26`/`2024-25`/`2023-24`, va aggiornato manualmente ad ogni fine stagione,
  stesso spirito di `PREVIOUS_SEASON`) con una request per stagione, unite per `(name, team)` in
  un solo `PlayerImportRecord` con più `seasonStats`. Una stagione con selettori non più validi
  o pagina inesistente non blocca le altre (try/catch per stagione, non per l'intero
  connettore). **Le stagioni 2024-25/2023-24 non sono state verificate dal vivo** in questa
  sessione (stesso limite di rete di sempre, vedi sopra): stessa struttura pagina presunta
  stabile, ma la prima verifica reale va fatta in produzione come per tutti i connettori.
- **"% partite saltate per infortunio" collegata all'indice `injuryRisk` già esistente (mai
  usato) invece di un campo grezzo isolato**: `ReliabilityIndices.injuryRisk` era `number | null`
  fin dalla prima sessione ma sempre `null` con un commento "nessuna fonte ancora integrata" —
  esattamente lo slot giusto. Aggiunto `SeasonStats.injuryAbsenceRate` (`Float?`, frazione 0..1),
  propagato fino a `computeReliabilityIndices` (terzo parametro) usando la stagione più recente
  disponibile per il giocatore. **Nessun connettore lo popola ancora**: fantacalciopedia.com non
  ha un elenco storico infortuni per giocatore raggiungibile senza aprire 600+ pagine singole
  (limite già documentato per le gerarchie, vedi sopra "non praticabile in una function
  serverless") — inventare un URL/selettore da verificare mai dal vivo avrebbe rischiato lo
  stesso tipo di incidente già capitato con `canCreatePlayers`. Meglio collegare tutta la
  pipeline (schema → motore → UI, "% partite saltate per infortunio" in `PlayerDetailPage`) e
  lasciarla onestamente vuota (`—` in UI) finché una fonte reale e verificabile non emerge,
  piuttosto che inventare uno scraper probabilmente sbagliato. **Attenzione al default**: a
  differenza degli altri campi di `SeasonStats` (colonne non-nullable con `@default(0)`, dove
  "la fonte non lo manda" e "vale zero" coincidono), `injuryAbsenceRate` è nullable e 0 è un
  valore reale diverso da "sconosciuto" — escluso apposta dal loop generico `?? 0` in
  `syncSeasonStats` (import/upsert.ts) per non scrivere un finto 0.
- **Decision Engine: tutte e 8 le domande della spec, 6 per-giocatore + 2 sul pool intero**:
  "qual è il prezzo massimo corretto" e "conviene rilanciare a X" (gia' c'erano) restano la base
  numerica (`maxCorrectPrice`, `overpayRatio`) da cui derivano le altre 4 domande per-giocatore,
  aggiunte come campi extra sulla STESSA risposta invece di nuovi endpoint (evita di
  moltiplicare le chiamate per una console che gia' interroga `/decision` ad ogni "Conviene
  rilanciare?"): `valuation` ("quanto vale realmente questo rilancio?", sottopagato/in
  linea/sovrapagato), `waitRecommended` ("conviene attendere?", richiede
  `alternativesAvailable` — altri giocatori dello stesso ruolo, liberi, con valueScore entro il
  15% — calcolato dalla rotta contando sul pool, non dal motore puro), `rosterRisk` ("rischio
  rosa", euristica dichiarata su indisponibilità/riserve dichiarate/concentrazione per squadra,
  before/after) e `teamConcentration` ("coppia", quota di rosa già dalla stessa squadra del
  candidato, before/after — proxy sulla concentrazione, nessun dato di sinergia reale tipo rete
  di assist e' disponibile). Tutti e 4 i campi sono `null` quando il dato che richiedono non e'
  stato fornito (`candidatePrice` per i primi due, `buyerId` per gli ultimi due), stesso pattern
  `number | null` degli altri motori. Le ultime 2 domande ("miglior rapporto qualità/prezzo tra
  più giocatori", "chi dovrei chiamare adesso") confrontano l'intero pool, non un giocatore alla
  volta: nuovo motore separato `rankPoolCandidates.ts`, nuovo endpoint `POST /auctions/:id/
  decision/pool` (`{mode, role?, buyerId?, limit?}`). **Lezione sul valueScore**: la prima idea
  per "miglior rapporto qualità/prezzo" era ordinare per `PlayerListItem.valueScore`, gia'
  disponibile — sbagliato, perche' `valueScore` (`lib/evaluation/value.ts`) e' solo il percentile
  della *quotazione* tra i giocatori dello stesso ruolo, non incorpora nessuna produzione attesa
  (lo dice il commento nel file stesso). Usarlo per "qualità/prezzo" avrebbe silenziosamente
  restituito solo "i giocatori più economici del ruolo", non i migliori affari. Corretto usando
  `ProductionIndices.expectedFantasyPoints` (FSTATS, ora reale) diviso il prezzo atteso rettificato
  per l'inflazione di ruolo — una vera stima punti-per-credito, con i candidati senza
  produzione/prezzo esclusi dalla classifica (mai stimati a caso) e il conteggio degli esclusi
  in `explanation`. Endpoint on-demand invece che pre-calcolato dentro `buildActiveAuctionState`:
  calcolare una raccomandazione per ogni giocatore o l'intero pool ad ogni poll dell'asta sarebbe
  sprecato, entrambe le domande hanno senso solo quando l'utente le pone esplicitamente. UI:
  `EntryBar` mostra badge compatti (valutazione/attendere/rischio rosa/concentrazione squadra)
  oltre a raccomandazione e fattori testuali gia' esistenti; nuovo drawer "🎯 Occasioni" in
  `/auction` (stesso pattern apribile di Obiettivi/Commento AI, vedi sotto) con toggle
  qualità/prezzo vs chi chiamare adesso e filtro ruolo — "chi chiamare adesso" e' sempre scoperto
  sul partecipante `isMe`, non ha senso nominare un giocatore per un rivale.
- **2 bug trovati e corretti rileggendo il codice del Decision Engine a mente fredda** (il
  sandbox non riesce a raggiungere Neon/Vercel da questa sessione per un test dal vivo contro
  produzione, stessa limitazione di rete gia' documentata sopra — vedi §10 "verifica asta live":
  revisione del codice al posto dell'esecuzione reale). (1) `teamConcentration` e la componente
  di concentrazione per squadra dentro `rosterRisk` restituivano sempre "100% da questa squadra"
  per il PRIMISSIMO acquisto di qualunque partecipante — non perche' fosse vero, ma perche' con
  una rosa di un solo giocatore qualunque concentrazione e' banalmente 100% per costruzione.
  Esattamente l'errore che `OpponentProfile.spendConcentration` (sez. 12) aveva gia' imparato a
  evitare ("richiede almeno 2 acquisti") — reintrodotto qui per distrazione. Corretto applicando
  la stessa soglia: `teamConcentration` resta `null` finche' l'acquirente non ha gia' almeno 1
  giocatore in rosa, e la componente di concentrazione dentro `computeRiskScore` e' 0 finche' la
  rosa (compreso il candidato) non arriva ad almeno 2 giocatori. (2) Il taglio per budget residuo
  in `rankPoolCandidates` si applicava SEMPRE, anche in modalita' "miglior rapporto
  qualità/prezzo" — che pero' e' esplicitamente documentata come domanda di mercato generale,
  non legata a un acquirente specifico. Un affare legittimo ma piu' caro del budget residuo di
  "io" spariva silenziosamente dalla classifica generale. Corretto: il filtro budget ora si
  applica solo in modalita' "chi chiamare adesso" (`next-call`), coerente con la documentazione
  della funzione. Nessuno dei due bug e' stato colto dalla type-check (entrambi type-safe, solo
  logicamente sbagliati): lezione che compilare pulito non basta, serve rileggere la logica a
  mente fredda quando l'esecuzione reale non e' possibile.
- **Undo scope: solo l'asta live, non un undo generico per tutta l'app**: richiesto
  esplicitamente dall'utente, con lo scope chiarito esplicitamente ("solo asta live" scelto tra
  le opzioni proposte) per evitare di costruire un log di modifiche generico su ogni entità
  (config lega, Setup Wizard, import dati...), progetto molto più grande e non richiesto.
  Implementato con **soft-delete** invece di un log di eventi separato: `AuctionEntry.revokedAt`
  (nullable, migrazione `20260806140000_auction_entry_undo`) — `null` = inserimento attivo,
  valorizzato = annullato. "Annulla ultima azione" (`POST /auctions/:id/undo`) trova l'evento
  più recente tra TUTTI gli inserimenti dell'asta confrontando `timestamp` (creazioni attive) e
  `revokedAt` (rimozioni) e lo inverte: se l'ultimo evento era un'assegnazione, la annulla
  (soft-delete); se era una rimozione, la ripristina (`revokedAt: null`). Un solo livello di
  undo (l'ultimo evento), non uno storico completo — coerente con lo scope scelto. Il vincolo
  "un giocatore non può essere venduto due volte" (prima `@@unique([auctionId, playerId])`)
  è diventato un **indice unico parziale** (`WHERE revokedAt IS NULL`, solo nella migrazione SQL:
  Prisma schema language non supporta constraint con `WHERE`), altrimenti riassegnare un
  giocatore dopo un annulla fallirebbe contro la vecchia riga (ora annullata, non più cancellata
  davvero). Il pulsante di rimozione riga-per-riga in `ParticipantRosterCard` ora fa lo stesso
  soft-delete (non più un `DELETE` reale): cosi' "Annulla ultima azione" può ripristinare anche
  una rimozione fatta da lì, non solo dal pulsante undo dedicato.
- **Autenticazione: sessioni DB con token opaco, non JWT**: richiesta esplicitamente dall'utente
  ("più utenti, per ora una sola lega, in futuro magari più utenti e più leghe" — quindi login
  multi-utente ma nessuna vera multi-tenancy per ora, tutti condividono la stessa `League`).
  `@fastify/jwt@8` (l'ultima versione compatibile con Fastify 4, già in uso) dipende da una
  versione di `fast-jwt` con multiple CVE note incluso un bypass di autenticazione — non
  accettabile per la funzionalità che dovrebbe proteggere l'accesso. Scartato senza aggiungere
  la dipendenza. Al suo posto: `Session` (riga DB con token opaco generato via
  `crypto.randomBytes`, referenziata da un cookie httpOnly) — più semplice da revocare (basta
  cancellare la riga, es. al logout) e senza rischio di algorithm confusion/validazione debole
  tipici dei JWT. Password hash con `crypto.scrypt` (built-in Node, no `bcryptjs`): stesso
  criterio, un pacchetto in meno da tenere aggiornato senza vantaggi reali a questa scala.
  **Registrazione protetta da codice di invito condiviso** (env var `SIGNUP_CODE`, impostata
  manualmente su Vercel come `DATABASE_URL`): la scelta dell'utente ("proteggere l'accesso") non
  avrebbe senso se chiunque potesse registrarsi liberamente — niente inviti individuali o
  approvazione admin, un solo codice condiviso, coerente con la scala "pochi utenti fidati" di
  un'app personale. **Nessuno scoping dei dati per utente**: `League`/`Player`/`Auction`/ecc.
  restano globali come prima (single-lega), l'autenticazione aggiunge solo "chi può entrare",
  non "chi vede cosa" — un eventuale multi-lega vero (menzionato dall'utente come possibilità
  futura) richiederebbe aggiungere `userId`/`leagueId` a ogni tabella, cambio molto più grande
  non fatto qui. **Hook `onRequest` globale** (`registerAuthGuard`, registrato prima di ogni
  altra rotta in `app.ts`) invece di un middleware per singola rotta: più semplice da verificare
  che non manchi da nessuna parte, con un'allowlist esplicita (`/health`, `/auth/register`,
  `/auth/login`) invece di dover ricordarsi di proteggere ogni nuova rotta manualmente.
- **Commento AI live: chiamata diretta dal browser all'API Anthropic, il nostro server non la
  vede mai**: richiesto esplicitamente dall'utente ("ogni utente può inserire la propria chiave
  e questa è utilizzabile solo dall'utente che la carica, in sessione, no sul server").
  Implementato con l'header `anthropic-dangerous-direct-browser-access` (che l'API pubblica di
  Anthropic richiede apposta per questo caso d'uso, normalmente le chiamate da browser sono
  bloccate per non esporre la chiave a chi ispeziona le richieste di rete — qui è una scelta
  esplicita dell'utente con la propria chiave). Chiave in `sessionStorage`, non `localStorage`:
  sparisce alla chiusura della scheda/finestra invece di restare indefinitamente sul
  dispositivo, coerente con "in sessione" nella richiesta dell'utente. **Modello scelto da un
  menu** (`GET /v1/models` con la chiave dell'utente) invece di un model id hardcoded nel
  codice: i model id di Anthropic cambiano nel tempo, un valore fisso si sarebbe rotto alla
  prima deprecazione. **Il prompt riusa i dati già calcolati dai motori esistenti** (Market/
  Opponent/Evaluation Engine) invece di far ricostruire tutto al modello da zero: il valore
  aggiunto di questa funzionalità è il commento in linguaggio naturale, i numeri restano quelli
  reali già mostrati nei pannelli dell'asta — coerente col principio "Spiegabile" (non un output
  black-box scollegato dai motori dell'app). Dichiarato esplicitamente in UI che è un "parere
  generativo aggiuntivo, non un motore deterministico dell'app". **Non testato dal vivo con una
  chiave reale** in questa sessione: la forma delle richieste segue la documentazione pubblica
  dell'API Messages (nota all'addestramento), ma senza una chiave da usare per verificare non
  posso escludere piccoli disallineamenti (es. formato esatto della risposta `/v1/models`) da
  correggere al primo uso reale.
- **Sistema grafico: primo blocco mirato invece di tutti i 9 tipi di grafico della spec**:
  concordato esplicitamente con l'utente. La spec (sez. 10) segnala "grafici sovrapponibili"
  come "funzionalità fondamentale" (2+ giocatori confrontati sullo stesso grafico): `/confronti`
  parte da lì con 4 grafici (fantamedia storica, gol/assist, minuti, prezzo) invece di provare a
  coprire subito radar/scatter/istogrammi/box plot/heatmap/distribuzioni/timeline. Selezione
  giocatori con un `useEffect` che scarica solo i `PlayerDetail` mancanti (cache in memoria per
  id): riapre lo stesso giocatore in un'altra sessione di confronto senza rifare la request.
  Bundle JS cresciuto da ~250KB a ~650KB con il primo uso reale di Recharts (prima solo
  installato, mai importato): accettabile alla scala di un'app personale, non ottimizzato con
  code-splitting per ora — se in futuro altre pagine iniziano a pesare, valutare `dynamic
  import()` solo per `/confronti`.
- **Import infortuni Transfermarkt: tentato e abbandonato, non un blocco risolvibile lato
  nostro codice**: richiesto esplicitamente dall'utente, non in spec. Prima versione: azione
  batch (`POST /import/injuries`) sui 20 giocatori con quotazione più alta — **0/20 trovati,
  HTTP 504 su ogni richiesta**, verificato in produzione. Sostituita con un'azione on-demand per
  un solo giocatore (`POST /players/:id/injuries`, pulsante "Cerca infortuni" nel dettaglio
  giocatore) più header browser-like — **stesso esito, verificato con la rotta di debug
  temporanea** (`GET /debug/transfermarkt`, deployata su Vercel): il corpo della risposta 504 è
  una pagina di errore generata da CloudFront ("We can't connect to the server for this app...
  too much traffic or a configuration error"), non una sfida anti-bot/captcha. Pattern
  deterministico e identico prima/dopo il cambio di header: sintomo tipico di un blocco per IP
  a livello di CDN sui range cloud/datacenter di Vercel, non risolvibile cambiando header o
  selettori lato nostro (servirebbe un proxy con IP residenziali, out of scope). **Rimosso su
  richiesta esplicita dell'utente** dopo la conferma del blocco: `import/transfermarktInjuries.ts`,
  `routes/debug.ts`, la rotta `POST /players/:id/injuries`, il pulsante "Cerca infortuni" e
  `evaluateSinglePlayer` (usato solo da questo flusso) sono stati eliminati. **Cosa resta**: lo
  slot `SeasonStats.injuryAbsenceRate`/`reliability.injuryRisk` (schema, tipi, motore di
  valutazione, colonna "—" in `PlayerDetailPage`) — infrastruttura generica e innocua, pronta a
  popolarsi automaticamente se in futuro emerge una fonte diversa e verificabile, senza bisogno
  di altre modifiche allo schema.
- **Tratti avversari manuali su `Participant`, non un nuovo modello**: l'utente ha ritirato
  l'offerta di fornire dati storici della propria lega ("non ho lo storico purtroppo") e ha
  chiesto invece di poter impostare a mano, per ogni avversario, squadra preferita/tendenza al
  rilancio/stile di spesa/approccio (talent scout vs quotazioni ufficiali) — la sua conoscenza
  diretta al posto di un calcolo automatico impossibile senza storico. Aggiunti 4 campi
  nullable direttamente su `Participant` (non un modello separato: sono attributi del
  partecipante, non eventi con una loro identità) e una rotta `PATCH /participants/:id`.
  **Deliberatamente non fusi con `OpponentProfile`** (sez. 12, calcolato dai soli `AuctionEntry`
  reali): stesso principio già seguito per lo slot `injuryAbsenceRate` sopra — un dato osservato
  e uno soggettivo devono restare distinguibili in UI, mai lo stesso numero. In `/auction`,
  `OpponentTraitsPanel` è un riquadro separato (bordo indigo, non slate) sotto `OpponentsPanel`,
  esplicitamente etichettato "impostati da te". Sliders senza pulsante "Salva": aggiornano lo
  stato locale ad ogni tick (reattività) ma chiamano l'API solo al rilascio
  (`onMouseUp`/`onTouchEnd`/`onKeyUp`), altrimenti trascinare uno slider spammerebbe `PATCH`
  decine di volte — richiesto "modificabili... in live durante l'asta", quindi niente form/submit
  separato, la modifica è il salvataggio. Non ancora collegati al prompt del Commento AI: prossimo
  passo naturale ma non richiesto esplicitamente finora, non aggiunto per non indovinare come
  l'utente vorrebbe che il modello li usasse.
- **Obiettivi e Commento AI come drawer laterali apribili in `/auction`, non più blocchi sempre
  visibili**: richiesto esplicitamente dall'utente ("pannello laterale apribile... per avere la
  shortlist sotto occhio durante l'asta"), esteso per coerenza anche al pannello Commento AI
  (menzionato subito dopo come "altro pannello durante l'asta"). Un unico stato
  `openDrawer: "obiettivi" | "ai" | null` in `AuctionPage`, un solo drawer alla volta (più
  semplice di uno stack, sufficiente perché sono due pannelli di consultazione, non editing
  concorrente) — overlay con backdrop cliccabile per chiudere, pulsanti in testata con badge
  del conteggio per "Obiettivi". Selezionare un giocatore dal drawer Obiettivi chiude il drawer
  automaticamente (porta l'utente dritto su `EntryBar` per assegnarlo), scelta di flow non
  esplicitamente richiesta ma coerente con lo scopo del click. Il prompt di sistema di default
  per il Commento AI (`SYSTEM_PROMPT` in `buildAuctionCommentaryPrompt.ts`, "per contestualizzare
  e definire le risposte") era già implementato da una sessione precedente e riusato identico ad
  ogni chiamata — nessun nuovo codice necessario per soddisfare questa parte della richiesta,
  solo verificato che il meccanismo esistente la copre già.

## 6. Convenzioni di sviluppo

- TypeScript strict ovunque (`tsconfig.base.json`: `strict: true`,
  `noUncheckedIndexedAccess: true`). Non allentare questi flag.
- I tipi di dominio vivono in `packages/shared`; se un tipo serve sia a `apps/api` che a
  `apps/web`, va lì e non duplicato.
- Le rotte Fastify sono organizzate un file per risorsa in `apps/api/src/routes/`,
  registrate in `src/index.ts`.
- Le pagine React vivono in `apps/web/src/pages/`, i componenti riusabili in
  `apps/web/src/components/`.
- Commenti nel codice solo per spiegare il "perché" legato a un vincolo della spec
  (es. riferimento a una sezione) o a un comportamento non ovvio — non per descrivere
  cosa fa il codice.
- Ogni volta che si implementa un pezzo della spec, aggiornare la tabella nella sezione 4
  di questo file.

## 7. Come sviluppare in locale

```bash
npm install                       # installa tutte le workspace (genera anche il client Prisma via postinstall)

# Backend — serve un Postgres (Neon consigliato, coerente con la produzione)
cp apps/api/.env.example apps/api/.env   # compilare DATABASE_URL (pooled) e DIRECT_URL (diretta)
npm run prisma:migrate            # crea/applica le migrazioni
npm run dev:api                   # avvia Fastify su :3001

# Frontend (in un altro terminale)
npm run dev:web                   # avvia Vite su :5173 (proxy /api → :3001)
```

Nota: il DB di sviluppo può essere un branch Neon separato da quello di produzione (Neon
supporta il branching del database), oppure un Postgres locale — basta che `schema.prisma`
resti `provider = "postgresql"`.

## 8. Deploy (Vercel + Neon)

Sedinho è deployato in produzione su **Vercel** (frontend + API come function serverless)
con database **Neon** (Postgres). URL produzione: `sedinho.vercel.app`.

**Perché**: il sandbox di sviluppo di questa sessione non ha accesso a internet generico
(vedi §5), quindi gli scraping connector non erano testabili dal vivo qui. Vercel invece ha
accesso reale a internet, quindi diventa anche l'ambiente per verificare/correggere i
connettori (vedi il caso Fantacalcio.it sotto).

**Architettura**:
- Repo GitHub `ciao-madesign/Sedinho` collegato a Vercel (progetto `sedinho`, team
  `ciao-madesigns-projects`). **Branch di produzione: `main`** — un push su `main` innesca
  un deploy automatico in produzione; push su altri branch generano deploy "preview".
- `vercel.json` (root): `buildCommand` costruisce `packages/shared` → `apps/api` → esegue
  `prisma migrate deploy` → costruisce `apps/web`; `outputDirectory: apps/web/dist`;
  `rewrites`: `/api/:path*` → `/api/index` (function), tutto il resto → `/index.html` (SPA).
- `api/index.ts` (root, **non** `apps/api`): unica function serverless Vercel, importa
  `buildApp` da `@sedinho/api` (`apps/api/package.json` espone `main`/`exports` verso
  `dist/app.js`) e inoltra ogni richiesta con `app.server.emit("request", req, res)` dopo
  aver rimosso il prefisso `/api` da `req.url` (stessa convenzione del proxy Vite in dev).
  **Nota**: inizialmente il file si chiamava `api/[...path].ts` (convenzione catch-all
  dinamica) ma il routing multi-segmento (es. `/api/import/run`) falliva con 404 a livello
  di piattaforma Vercel quando deployato — sostituito con nome fisso `api/index.ts` +
  rewrite esplicito, molto più affidabile.
- Env var richieste sul progetto Vercel: `DATABASE_URL` (connection string Neon *pooled*,
  con `?pgbouncer=true&connection_limit=1`), `DIRECT_URL` (connection string Neon
  *non-pooled*, usata da `prisma migrate deploy` in fase di build) e `SIGNUP_CODE` (codice di
  invito richiesto per `POST /auth/register`, sez. 5 "Autenticazione" — senza questa env var
  la registrazione risponde sempre 503, per non lasciarla aperta per errore). Non gestibili via
  tool: vanno impostate manualmente da Vercel → Project Settings → Environment Variables.
  **`SIGNUP_CODE` non è ancora stata impostata da questa sessione**: finché resta assente, la
  registrazione di nuovi account fallisce in produzione — va aggiunta manualmente prima di poter
  creare il primo utente.
- Progetto Neon `sedinho` isolato dagli altri progetti dell'account (`easydoc`, `Adapta`).

**Verificato in produzione**: `GET /api/health`, CRUD `League` via Postgres reale, e tutti e 3 i
connettori di import (~760 giocatori, cresce ad ogni aggiornamento). Tecnica usata per tutti:
rotta di debug temporanea (`GET /debug/fetch|links|find`, rimossa a lavoro finito) deployata su
Vercel per ispezionare il markup reale dal vivo, dato che questa sessione non può raggiungere
questi siti direttamente (vedi sopra). Stesso schema per Fantacalcio.it (quotazioni, agosto
2026), FSTATS/`fantacalcio.it/statistiche-serie-a` (statistiche, questa sessione) e
Fantacalciopedia (gerarchie/rigoristi, questa sessione).

## 9. Direzione UX (richiesta esplicita dell'utente, agosto 2026)

L'utente ha fornito il logo principale (`apps/web/public/logo.jpg`, usato in header e favicon)
e ha chiesto esplicitamente, come direzione per il resto del frontend:

- **Interfaccia semplice, pochi input, molto accattivante graficamente** — non un pannello
  tecnico denso di controlli, un prodotto curato. Vale come criterio guida per ogni nuova
  schermata, non solo per quelle già fatte.
- **Tab dedicate per le aree funzionali principali della spec**, in particolare: asta live
  (sez. 11), simulazione di campionato/Simulatore (sez. 15), schermate di confronto tra
  giocatori/squadre/ruoli (sez. 10, "grafici sovrapponibili"). Man mano che questi motori
  vengono implementati (oggi tutti ⬜, vedi sez. 4), vanno accompagnati da una tab/route
  dedicata in `apps/web`, non ammassati nella Dashboard.
- Non è un'implementazione da fare subito: è la lente con cui valutare ogni scelta di UI da
  qui in avanti. Quando si affronta sez. 10 (grafici), 11 (asta live) o 15 (simulatore),
  ripartire da qui prima di improvvisare la UI.

## 10. Prossimi passi consigliati

1. ~~Completare i connettori stub FSTATS e Fantacalciopedia~~ — fatto, tutti e 3 reali e
   verificati in produzione (vedi sez. 4 e 5, incluso l'incidente `canCreatePlayers` e la
   correzione sul formato di `Player.team`). Prossimo passo naturale: verificare che i valori
   reali prodotti dal Player Evaluation Engine abbiano senso su dati veri (le formule sono
   scritte "alla cieca", senza uno storico reale su cui tararle) ed eventualmente affinarle.
   La curva euristica rango→probabilità dei rigoristi (`fantacalciopedia.ts`) è un candidato
   naturale da rivedere con calma.
2. ~~Implementare il Player Evaluation Engine~~ — fatto: `apps/api/src/lib/evaluation/`.
3. ~~Collegare la Dashboard a dati reali~~ — fatto: `PlayersPage`/`PlayerDetailPage` collegate
   a dati reali con filtri; 4 delle 9 sezioni Dashboard sono reali, le altre 5 sono placeholder
   onesti (vedi sez. 4). ~~Filtri per pannello~~ — fatto: `DashboardFiltersBar` (ruolo/squadra/
   fascia prezzo/età/rischio/titolarità, vedi §5). Prossimo naturale: sistema grafico (sez. 10).
4. ~~Aggiungere una vista di dettaglio giocatore~~ — fatto: `PlayerDetailPage`, collegata a
   `GET /players/:id`, mostra tutta la `Explanation` per categoria.
5. Valutare se/quando introdurre il parsing assistito da AI del regolamento (BYOK,
   vedi §5): non urgente, il form strutturato manuale del Setup Wizard copre già il
   caso d'uso attuale.
6. Impostare `main` come default branch su GitHub (Settings → Branches) se non già fatto:
   coerente con l'essere anche il branch di produzione Vercel.
7. ~~Costruire il Live Auction Engine~~ — fatto il nucleo richiesto dalla spec (giocatore+
   prezzo+acquirente, budget/fabbisogni ricalcolati ad ogni inserimento). Non testato con dati
   reali in produzione in questa sessione (crea partecipanti/un'asta reali per la lega
   dell'utente, non dati usa-e-getta come i connettori): da verificare dal vivo, o testare con
   nomi fittizi e ripulire dopo.
8. ~~Filtri Dashboard per pannello~~ — fatto: `DashboardFiltersBar` (ruolo/squadra/prezzo/età/
   rischio/titolarità, vedi §5).
9. ~~Market Engine (sez. 13)~~ — fatto: `computeMarketState.ts`, incluso in
   `ActiveAuctionState.market` e visibile in `/auction` (`MarketPanel` + "atteso a mercato" in
   `EntryBar`).
10. ~~Profilazione avversari (sez. 12)~~ — fatto: `computeOpponentProfiles.ts`, incluso in
    `ActiveAuctionState.opponents` e visibile in `/auction` (`OpponentsPanel`, tabella sotto le
    rose). Market Engine e Profilazione avversari non sono ancora stati testati con dati reali
    di un'asta vera (stesso limite del punto 7: creano dati reali per la lega dell'utente).
11. ~~Shortlist/Obiettivi d'asta~~ — fatto (non in spec, richiesto esplicitamente dall'utente):
    `ShortlistEntry`, rotte `/shortlist`, pagina dedicata `/shortlist`, stella in
    `PlayersPage`/`PlayerDetailPage`/pannello giocatori asta, pannello dedicato in `/auction`
    con stato di vendita live.
12. ~~Storico fantamedia multi-stagione~~ — fatto: FSTATS ora importa 3 stagioni invece di 1,
    `PlayerDetailPage` mostra tutte le righe ordinate per stagione decrescente. Non verificato
    dal vivo per le 2 stagioni passate (vedi §5).
13. ~~"% partite saltate per infortunio" via Transfermarkt~~ — **tentato e abbandonato**: sia il
    batch (20 giocatori) sia l'on-demand (1 giocatore alla volta, header browser-like) davano
    HTTP 504 su ogni richiesta. Verificato con una rotta di debug temporanea che il 504 è
    generato da CloudFront (l'infrastruttura davanti a Transfermarkt), pattern tipico di un
    blocco per IP sui range cloud di Vercel — non risolvibile lato nostro codice. Rimosso su
    richiesta dell'utente: `import/transfermarktInjuries.ts`, `routes/debug.ts`, la rotta
    `POST /players/:id/injuries` e il pulsante "Cerca infortuni" non esistono più (vedi §5). Lo
    slot `injuryAbsenceRate`/`injuryRisk` resta nello schema/motore/UI (mostra "—"), pronto per
    una fonte diversa se mai ne emerge una verificabile. Candidati non esplorati: un servizio
    proxy/scraping a pagamento (richiederebbe una API key dell'utente, BYOK) o una fonte diversa
    da Transfermarkt.
14. ~~Decision Engine (sez. 14)~~ — fatto, tutte e 8 le domande della spec: le 6 per-giocatore
    (`POST /auctions/:id/decision`, badge + fattori in `EntryBar`) e le 2 sul pool intero
    (`POST /auctions/:id/decision/pool`, drawer "🎯 Occasioni" in `/auction`) — vedi §5 per la
    correzione sul non usare `valueScore` come proxy di "qualità/prezzo".
15. ~~Undo per l'asta live~~ — fatto (non in spec, richiesto esplicitamente dall'utente, scope
    limitato all'asta su sua indicazione): pulsante "Annulla ultima azione", soft-delete su
    `AuctionEntry.revokedAt` (vedi §5).
16. ~~Autenticazione~~ — fatto (non in spec, richiesto esplicitamente dall'utente): più utenti,
    stessa lega condivisa (non multi-tenancy). Verificato dal vivo dall'utente (primo account
    registrato in produzione dopo aver impostato `SIGNUP_CODE`).
17. ~~Commento AI live in asta~~ — fatto (non in spec, richiesto esplicitamente dall'utente):
    chiamata diretta browser→Anthropic con la chiave dell'utente, mai sul nostro server (vedi
    §5). **Non ancora testato dal vivo con una chiave reale** in questa sessione.
18. ~~Logo~~ — fatto: l'utente ha caricato `sedinho.jpg` direttamente su GitHub (branch `main`,
    commit `79b89e8`, upload via interfaccia web — non un allegato in chat, che nella sessione
    precedente non era arrivato in un percorso salvabile). Spostato in
    `apps/web/public/logo.jpg` (rimosso il vecchio `logo.png`), riferimenti aggiornati in
    `Layout.tsx`, `LoginPage.tsx` e `index.html` (favicon, `type="image/jpeg"`).
19. ~~L'utente ha offerto di fornire i dati delle scorse edizioni della propria lega~~ — **offerta
    ritirata esplicitamente**: l'utente ha confermato di non avere lo storico ("non ho lo storico
    purtroppo"). Il Transfer Engine (sez. 6) resta ⬜ per questo motivo, non per mancanza di
    tempo — nessuna fonte di dati storici reali della sua lega è disponibile. Al suo posto,
    l'utente ha chiesto tratti manuali sugli avversari (vedi punto 23, fatto).
20. ~~Sistema grafico, primo blocco~~ — fatto: `/confronti`, 4 grafici sovrapponibili (fantamedia
    storica, gol/assist, minuti, prezzo) fino a 4 giocatori. Restano ⬜: radar, scatter,
    istogrammi, box plot, heatmap, distribuzioni, timeline; confronto giocatore vs media
    ruolo/squadra; confronto tra due squadre o due ruoli; andamento mercato vs previsioni;
    esportazione grafici — tutti richiesti dalla spec sez. 10, non ancora affrontati.
22. ~~Dati storici della lega personale dell'utente~~ — **non arriveranno**: vedi punto 19,
    l'utente ha confermato di non averli. Non aspettarsi più questo dato in futuro salvo che
    l'utente lo menzioni di nuovo esplicitamente.
23. ~~Tratti avversari manuali (sliders)~~ — fatto: `Participant.preferredTeam/bidTendency/
    spendingStyle/scoutingStyle`, `PATCH /participants/:id`, `OpponentTraitsPanel` in `/auction`.
    ~~Filtri/ordinamento in `/shortlist`~~ — fatto, stesso pattern di `PlayersPage`. ~~Obiettivi e
    Commento AI come pannelli laterali apribili in `/auction`~~ — fatto (drawer a destra, due
    pulsanti in testata). Non ancora fatto: collegare i tratti manuali al prompt del Commento AI
    (`buildAuctionCommentaryPrompt.ts` li ignora ancora) — candidato naturale per il prossimo
    giro, non richiesto esplicitamente finora.
24. ~~Decision Engine, le altre 6 domande~~ — fatto: vedi riga sez. 14 e §5 sopra, tutte e 8 le
    domande della spec ora risposte. ~~Priorità sugli obiettivi (prima/seconda/terza scelta)~~ —
    fatto: vedi riga Shortlist sez. 4 e §5 sopra.
25. ~~Simulatore, primo blocco (sez. 15)~~ — fatto: Monte Carlo per singolo giocatore, tab
    dedicata `/simulatore`, vedi riga sez. 4 e §5 sopra. Resta ⬜: simulazione dell'intera asta
    (scope esplicitamente non scelto ora), calibrazione su dati storici reali (nessuno
    disponibile).
26. **Verifica asta live end-to-end (punti 7/10 sopra)** — **tentata, non riuscita**: da questa
    sessione remota ne' Neon (porta 5432, connessione TCP rifiutata) ne' `sedinho.vercel.app`
    (bloccato dal proxy di rete, `EGRESS_BLOCKED`) sono raggiungibili — stessa identica
    limitazione gia' documentata per le sessioni precedenti (§5, "il sandbox di sviluppo... non
    ha accesso a internet generico"), confermata di nuovo qui con un tentativo diretto (server
    locale avviato con `npm run dev:api` usando le vere credenziali Neon da `apps/api/.env`:
    parte, ma la query fallisce con "Can't reach database server"). **Fatto al posto della
    verifica dal vivo**: una rilettura attenta (non solo type-check) di tutto il codice del
    Decision Engine/Simulatore/tratti/priorità aggiunto in questa sessione — ha trovato e
    corretto 2 bug logici reali (vedi §5, "2 bug trovati e corretti..."), entrambi invisibili
    alla compilazione. Resta comunque non verificato con un'asta vera: **prossimo passo per
    l'utente**, non per una sessione futura — solo lui puo' testare dal vivo contro Vercel/Neon
    reali (o chiedere a una sessione locale con accesso a internet vero). Consigliato: nomina
    2-3 partecipanti fittizi, fai qualche inserimento per ruoli diversi, controlla Market
    Engine/Profilo avversari/Decision Engine/Simulatore/drawer Occasioni, poi `POST
    /auctions/reset` per ripulire prima dell'asta vera.
