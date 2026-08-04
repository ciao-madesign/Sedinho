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
| Backend | Node.js + TypeScript + Fastify | API REST, `tsx` per il dev loop |
| ORM / DB | Prisma + SQLite (`apps/api/prisma/dev.db`) | Migrabile a PostgreSQL cambiando solo `datasource` in `schema.prisma` (sez. 17) |
| Routing frontend | react-router-dom | |
| Tipi condivisi | `packages/shared` (workspace npm) | Unica fonte di verità per i tipi di dominio, usata sia da `apps/api` che da `apps/web` |
| Package manager | npm workspaces (monorepo) | root `package.json` con `workspaces: ["apps/*", "packages/*"]` |
| Scraping (futuro) | Playwright + Cheerio | Non ancora implementato: verrà invocato solo dal pulsante "Aggiorna Database", mai in automatico |

## 3. Struttura del repository

```
Sedinho/
├── apps/
│   ├── api/                  # Backend Fastify + Prisma
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── index.ts      # entrypoint, registra le rotte
│   │       ├── db/prisma.ts  # client Prisma condiviso
│   │       └── routes/       # health, leagues, players (altre da aggiungere)
│   └── web/                  # Frontend Vite + React
│       └── src/
│           ├── App.tsx       # routing
│           ├── components/   # Layout, componenti UI condivisi
│           ├── pages/        # DashboardPage, SetupWizardPage, ...
│           └── lib/api.ts    # client fetch verso /api (proxy Vite → :3001)
├── packages/
│   └── shared/                # Tipi TS condivisi (League, Player, Evaluation, Auction, ...)
├── docs/
│   └── specs/funzionale-v1.md # Specifica funzionale originale (fonte di verità del dominio)
└── CLAUDE.md                  # questo file
```

## 4. Stato di avanzamento

Legenda: ✅ implementato · 🚧 scaffolding presente, logica da costruire · ⬜ non iniziato.

| Area (sez. spec) | Stato | Note |
|---|---|---|
| Monorepo, tooling, CLAUDE.md | ✅ | Fondamenta poste in questa sessione |
| Tipi di dominio condivisi (`packages/shared`) | ✅ | League, Player, SeasonStats, Hierarchy, SetPieces, TeamRotation, Transfer, PlayerEvaluation, Auction/Market/Decision |
| Schema DB (Prisma/SQLite) | ✅ | Rispecchia i tipi condivisi; migrazioni non ancora generate (richiede `npm run prisma:migrate`) |
| Setup Wizard (sez. 3) | 🚧 | UI a step placeholder (`SetupWizardPage`), API `POST /leagues` pronta, ma: nessun parsing automatico del regolamento testuale, nessuna persistenza da UI |
| Database centrale giocatori (sez. 4) | 🚧 | Schema pronto, API di lettura (`GET /players`, `GET /players/:id`); nessun dato reale, nessuna UI di dettaglio giocatore |
| Sistema di aggiornamento / scraping (sez. 5) | ⬜ | Da progettare: pulsante "Aggiorna Database", job di import con fonte/data/affidabilità |
| Transfer Engine (sez. 6) | ⬜ | Modello dati presente (`Transfer`), motore di calcolo impatto non implementato |
| Rotation Engine (sez. 7) | ⬜ | Modello dati presente (`TeamRotationProfile`), coefficienti non calcolati |
| Player Evaluation Engine (sez. 8) | ⬜ | Struttura `PlayerEvaluation` definita, algoritmi degli indici da scrivere |
| Dashboard (sez. 9) | 🚧 | Layout con sezioni placeholder, nessun collegamento a dati reali/filtri |
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
npm install                       # installa tutte le workspace

# Backend
cp apps/api/.env.example apps/api/.env
npm run prisma:generate           # genera il client Prisma
npm run prisma:migrate            # crea/applica le migrazioni su SQLite
npm run dev:api                   # avvia Fastify su :3001

# Frontend (in un altro terminale)
npm run dev:web                   # avvia Vite su :5173 (proxy /api → :3001)
```

## 8. Prossimi passi consigliati

1. Generare la prima migrazione Prisma e verificare il ciclo CRUD di `League`.
2. Costruire il Setup Wizard reale: form multi-step collegato a `POST /leagues`,
   inclusa una prima versione (anche semplice/manuale) del parsing del regolamento
   in `ParsedRule[]`.
3. Definire il formato di import dati per il pulsante "Aggiorna Database" (sez. 5),
   anche solo da file CSV/JSON caricati manualmente, prima di introdurre scraping.
4. Implementare il Player Evaluation Engine (sez. 8) come modulo puro/testabile in
   `apps/api/src/lib/` (o pacchetto dedicato `packages/engine` se cresce), separato
   dalle rotte HTTP, così da restare sostituibile (principio "Modularità").
5. Collegare la Dashboard a dati reali con i filtri richiesti (sez. 9) prima di
   investire nel sistema grafico (sez. 10).
