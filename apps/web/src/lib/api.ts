import type { ImportRunSummary, LeagueConfig, LeagueDraft } from "@sedinho/shared";

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
    headers: { "Content-Type": "application/json" },
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
