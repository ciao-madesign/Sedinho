# Sedinho

Applicazione web personale per assistere un fantallenatore in tutte le fasi della
stagione: configurazione lega, database giocatori, aggiornamento manuale dei dati,
supporto decisionale durante l'asta live e report finale.

La specifica funzionale completa è in [`docs/specs/funzionale-v1.md`](docs/specs/funzionale-v1.md).
Il contesto architetturale e lo stato di avanzamento sono tracciati in [`CLAUDE.md`](CLAUDE.md).

## Struttura

Monorepo npm workspaces:

- `apps/api` — backend Node.js + TypeScript + Fastify + Prisma (SQLite)
- `apps/web` — frontend React + TypeScript + Vite + Tailwind + Recharts
- `packages/shared` — tipi TypeScript condivisi tra frontend e backend

## Avvio rapido

```bash
npm install

cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate

npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```
