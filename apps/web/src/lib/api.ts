import type {
  ActiveAuctionState,
  AuctionUndoResult,
  DecisionPoolResult,
  DecisionRecommendation,
  FinalReport,
  HierarchyChange,
  HierarchyLevel,
  ImportRunSummary,
  LeagueConfig,
  LeagueDraft,
  Participant,
  PlayerAvailability,
  PlayerEvaluation,
  PlayerListItem,
  PlayerRole,
  SetPieceType,
  ShortlistEntryView,
  ShortlistPriority,
  SimulationResult,
  RosterSeasonSimulationResult,
  Transfer,
} from "@sedinho/shared";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    // Solo se c'e' un body: un Content-Type: application/json senza body (es. DELETE) fa
    // fallire il parser JSON di default di Fastify su una stringa vuota.
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export const leaguesApi = {
  list: () => api.get<LeagueConfig[]>("/leagues"),
  get: (id: string) => api.get<LeagueConfig>(`/leagues/${id}`),
  create: (draft: LeagueDraft) => api.post<LeagueConfig>("/leagues", draft),
  update: (id: string, draft: LeagueDraft) => api.put<LeagueConfig>(`/leagues/${id}`, draft),
};

export const importApi = {
  run: () => api.post<ImportRunSummary>("/import/run", {}),
};

export interface PlayersFilter {
  role?: PlayerRole;
  team?: string;
  search?: string;
}

/** Le collezioni annidate su GET /players/:id sono le righe Prisma cosi' come sono (source/
 * updatedAt/reliability come campi piatti), non i tipi condivisi con `meta: DataSourceMeta`:
 * quel mapping non e' ancora stato scritto lato API (solo le evaluations lo attraversano, via
 * evaluation-mapper.ts). Tipi qui rispecchiano la risposta reale, non lo schema "ideale". */
export interface PlayerSeasonStatsRow {
  id: string;
  season: string;
  competition: string;
  appearances: number;
  minutes: number;
  fantasyAvg: number;
  averageRating: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  shots: number;
  shotsOnTarget: number;
  yellowCards: number;
  redCards: number;
  penaltiesScored: number;
  penaltiesTaken: number;
  cleanSheets: number;
  expectedBonus: number;
  injuryAbsenceRate: number | null;
  source: string;
  reliability: number;
}

export interface PlayerHierarchyRow {
  id: string;
  level: HierarchyLevel;
  reliability: number;
  source: string;
}

export interface PlayerSetPieceRow {
  id: string;
  type: SetPieceType;
  probability: number;
  source: string;
}

/** Riga grezza `Transfer` (sez. 6, Transfer Engine) cosi' come restituita da GET /players/:id —
 * stesso pattern delle altre collezioni annidate qui sopra (righe Prisma cosi' come sono, nessun
 * mapper verso il tipo condiviso con `meta: DataSourceMeta`). */
export interface PlayerTransferRow {
  id: string;
  fromTeam: string;
  toTeam: string;
  date: string;
  startingRoleImpact: number;
  minutesImpact: number;
  bonusImpact: number;
  riskDelta: number;
  fantasyValueDelta: number;
  newStarterProbability: number;
  isHighlighted: boolean;
  source: string;
}

export interface PlayerDetail {
  id: string;
  name: string;
  team: string;
  role: PlayerRole;
  birthDate: string | null;
  nationality: string | null;
  foot: "left" | "right" | "both" | null;
  availability: PlayerAvailability;
  estimatedRecoveryDate: string | null;
  initialQuotation: number | null;
  source: string;
  reliability: number;
  delistedAt: string | null;
  seasonStats: PlayerSeasonStatsRow[];
  hierarchies: PlayerHierarchyRow[];
  setPieceRoles: PlayerSetPieceRow[];
  transfers: PlayerTransferRow[];
  evaluations: PlayerEvaluation[];
}

function toQueryString(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export const playersApi = {
  list: (filter: PlayersFilter = {}) =>
    api.get<PlayerListItem[]>(`/players${toQueryString({ ...filter })}`),
  get: (id: string) => api.get<PlayerDetail>(`/players/${id}`),
  recentTransfers: (limit = 10) => api.get<Transfer[]>(`/transfers/recent?limit=${limit}`),
  recentHierarchyChanges: (limit = 10) =>
    api.get<HierarchyChange[]>(`/hierarchy-changes/recent?limit=${limit}`),
};

export const participantsApi = {
  list: () => api.get<Participant[]>("/participants"),
  create: (names: string[], meIndex?: number) =>
    api.post<Participant[]>("/participants", { names, meIndex }),
  /** Tratti manuali sull'avversario (richiesto esplicitamente dall'utente, non in spec, vedi
   * CLAUDE.md sez. 5): stima soggettiva dell'utente, separata dai campi calcolati di
   * OpponentProfile. */
  updateTraits: (
    id: string,
    traits: Partial<
      Pick<Participant, "preferredTeam" | "bidTendency" | "spendingStyle" | "scoutingStyle">
    >,
  ) => api.patch<Participant>(`/participants/${id}`, traits),
};

export const auctionApi = {
  getActive: () => api.get<ActiveAuctionState>("/auctions/active"),
  start: () => api.post<ActiveAuctionState>("/auctions", {}),
  end: (id: string) => api.post<{ ended: true }>(`/auctions/${id}/end`, {}),
  addEntry: (id: string, entry: { playerId: string; price: number; buyerId: string }) =>
    api.post<ActiveAuctionState>(`/auctions/${id}/entries`, entry),
  removeEntry: (id: string, entryId: string) =>
    api.delete<ActiveAuctionState>(`/auctions/${id}/entries/${entryId}`),
  /** Cancella partecipanti + aste (con relative assegnazioni) della lega: per fare prove
   * prima dell'asta vera senza doversi portare dietro dati di test. */
  reset: () => api.post<{ reset: true }>("/auctions/reset", {}),
  decide: (
    auctionId: string,
    body: { playerId: string; buyerId?: string; candidatePrice?: number },
  ) => api.post<DecisionRecommendation>(`/auctions/${auctionId}/decision`, body),
  /** "Miglior rapporto qualità/prezzo" e "chi dovrei chiamare adesso" (sez. 14): le uniche 2
   * domande del Decision Engine che confrontano l'intero pool invece di un giocatore alla
   * volta. */
  decidePool: (
    auctionId: string,
    body: { mode: "value-for-money" | "next-call"; role?: PlayerRole; buyerId?: string; limit?: number },
  ) => api.post<DecisionPoolResult>(`/auctions/${auctionId}/decision/pool`, body),
  /** "Annulla ultima azione" (sez. 11): un solo livello di undo sull'evento più recente
   * dell'asta (assegnazione o rimozione), non uno storico completo. */
  undo: (auctionId: string) => api.post<AuctionUndoResult>(`/auctions/${auctionId}/undo`, {}),
  /** Asta più recente della lega (attiva o terminata) — usata da `/report` per sapere quale id
   * interrogare senza dover ricordare l'ultima asta lato client. */
  getLatest: () => api.get<{ id: string; endedAt: string | null }>("/auctions/latest"),
  /** Report finale (sez. 16): calcolato on-demand per la rosa del partecipante "io", funziona
   * anche con un'asta ancora in corso (report parziale). */
  getReport: (auctionId: string) => api.get<FinalReport>(`/auctions/${auctionId}/report`),
};

export const shortlistApi = {
  list: () => api.get<ShortlistEntryView[]>("/shortlist"),
  add: (playerId: string, note?: string) =>
    api.post<{ id: string }>("/shortlist", { playerId, note }),
  updateNote: (id: string, note: string) =>
    api.patch<{ id: string }>(`/shortlist/${id}`, { note }),
  /** Fascia di priorità (richiesta esplicitamente, non in spec): 1/2/3 o `null` per rimuoverla. */
  updatePriority: (id: string, priority: ShortlistPriority | null) =>
    api.patch<{ id: string }>(`/shortlist/${id}`, { priority }),
  remove: (id: string) => api.delete<{ removed: true }>(`/shortlist/${id}`),
};

export const simulatorApi = {
  /** Simulatore Monte Carlo per singolo giocatore (sez. 15): usa i dati reali di un'asta in
   * corso se `auctionId` è passato, altrimenti una stima generica pre-asta dalla composizione
   * rosa della lega. */
  simulatePlayer: (body: {
    playerId: string;
    myBudget: number;
    auctionId?: string;
    iterations?: number;
  }) => api.post<SimulationResult>("/simulate/player", body),
  /** Simulatore di rosa (sez. 15, secondo blocco): rendimento stagionale atteso per un insieme
   * di giocatori già scelto (rosa d'asta reale o Obiettivi/shortlist) — non simula l'asta. */
  simulateRoster: (body: { playerIds: string[]; iterations?: number }) =>
    api.post<RosterSeasonSimulationResult>("/simulate/roster", body),
};
