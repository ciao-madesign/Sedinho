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
│   │       ├── import/       # pipeline "Aggiorna Database": types, upsert, runImport, connectors/
│   │       │   └── connectors/   # fantacalcioIt (reale, verificato in produzione), fstats + fantacalciopedia (stub, vedi §5)
│   │       └── routes/       # health, leagues (GET/POST/PUT), players, import (POST /import/run)
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
| Database centrale giocatori (sez. 4) | 🚧 | Schema pronto (incl. `initialQuotation`), API di lettura (`GET /players`, `GET /players/:id`); **popolato con dati reali** (663 giocatori) tramite il connettore Fantacalcio.it in produzione; nessuna UI di dettaglio giocatore |
| Sistema di aggiornamento / scraping (sez. 5) | 🚧 | Pipeline completa: `POST /import/run` (pulsante "Aggiorna Database" in Dashboard) orchestra connettori modulari (`ImportConnector`) e fa upsert con source/reliability. **Connettore Fantacalcio.it (quotazioni) verificato in produzione: 663/663 giocatori importati correttamente.** FSTATS e Fantacalciopedia sono ancora stub che riportano "skipped" (vedi §8) |
| Transfer Engine (sez. 6) | ⬜ | Modello dati presente (`Transfer`), motore di calcolo impatto non implementato |
| Rotation Engine (sez. 7) | ⬜ | Modello dati presente (`TeamRotationProfile`), coefficienti non calcolati |
| Player Evaluation Engine (sez. 8) | ⬜ | Struttura `PlayerEvaluation` definita, algoritmi degli indici da scrivere |
| Dashboard (sez. 9) | 🚧 | Header collegato alla League reale (nome, partecipanti, budget, rosa) con CTA a `/setup` se non configurata; sezioni ancora placeholder, nessun filtro |
| Sistema grafico (sez. 10) | ⬜ | Recharts installato, nessun grafico ancora implementato |
| Live Auction Engine (sez. 11) | ⬜ | Modelli `Auction`/`AuctionEntry` presenti, nessuna UI/logica |
| Profilazione avversari (sez. 12) | ⬜ | Modello `OpponentProfile` presente, calcolo non implementato |
| Market Engine (sez. 13) | ⬜ | Tipo `MarketState` definito, non calcolato |
| Decision Engine (sez. 14) | ⬜ | Tipo `DecisionRecommendation` definito, nessuna logica |
| Simulatore (sez. 15) | ⬜ | Non iniziato |
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
- **Matching giocatore per (name, team) esatto** in fase di upsert (`import/upsert.ts`): non
  esiste ancora un id esterno persistito per fonte. Fonti che usano una grafia diversa per lo
  stesso giocatore (es. accenti, abbreviazioni) creeranno record duplicati. Limite noto e
  accettato per ora; da risolvere con una tabella di mapping dedicata (`PlayerExternalRef` o
  simile) se/quando diventa un problema pratico con dati reali.
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
- **Deploy su Vercel via GitHub, non via upload manuale**: il progetto Vercel `sedinho` è
  collegato al repo GitHub con branch di produzione `main` (vedi sez. 8). Un `git push` su
  `main` innesca da solo un deploy automatico in produzione — **non serve invocare deploy
  manuali** (il tool di upload diretto dei file è stato usato solo per il primissimo deploy,
  prima che il progetto Vercel esistesse, ed è anche la causa del bug di routing su
  `api/[...path].ts` descritto in sez. 8: quel percorso di deploy non passa dalla build da
  git e ha trattato il nome file con parentesi in modo diverso).

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
  con `?pgbouncer=true&connection_limit=1`) e `DIRECT_URL` (connection string Neon
  *non-pooled*, usata da `prisma migrate deploy` in fase di build). Non gestibili via tool:
  vanno impostate manualmente da Vercel → Project Settings → Environment Variables.
- Progetto Neon `sedinho` isolato dagli altri progetti dell'account (`easydoc`, `Adapta`).

**Verificato in produzione**: `GET /api/health`, CRUD `League` via Postgres reale, e il
connettore Fantacalcio.it (663 giocatori importati con successo dal listone reale — i
selettori CSS erano sbagliati al primo tentativo, corretti ispezionando il markup reale
tramite una rotta di debug temporanea deployata apposta, dato che nemmeno questa sessione
può raggiungere fantacalcio.it direttamente).

## 9. Prossimi passi consigliati

1. Completare i connettori stub FSTATS (`import/connectors/fstats.ts`, richiede Playwright
   per il rendering client-side) e Fantacalciopedia (`import/connectors/fantacalciopedia.ts`,
   probabilmente Cheerio basta). Stessa tecnica usata per Fantacalcio.it: se serve vedere il
   markup reale, aggiungere una rotta di debug temporanea, deployare, ispezionare, rimuovere.
2. Implementare il Player Evaluation Engine (sez. 8 della spec) come modulo puro/testabile in
   `apps/api/src/lib/` (o pacchetto dedicato `packages/engine` se cresce), separato
   dalle rotte HTTP, così da restare sostituibile (principio "Modularità"). Ora che l'import
   ha popolato `Player` con dati reali, questo motore ha dati su cui lavorare (mancano ancora
   `SeasonStats`/statistiche, che verranno da FSTATS).
3. Collegare la Dashboard a dati reali con i filtri richiesti (sez. 9 della spec) prima di
   investire nel sistema grafico (sez. 10).
4. Aggiungere una vista di dettaglio giocatore in `apps/web`, collegata a
   `GET /players/:id` (già pronta lato API, e ora popolata con dati reali).
5. Valutare se/quando introdurre il parsing assistito da AI del regolamento (BYOK,
   vedi §5): non urgente, il form strutturato manuale del Setup Wizard copre già il
   caso d'uso attuale.
6. Impostare `main` come default branch su GitHub (Settings → Branches) se non già fatto:
   coerente con l'essere anche il branch di produzione Vercel.
