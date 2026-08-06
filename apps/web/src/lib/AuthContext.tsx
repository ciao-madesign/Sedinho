import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "./api.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  /** `undefined` = ancora in caricamento, `null` = non autenticato. */
  user: AuthUser | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Autenticazione (richiesta esplicitamente dall'utente, non in spec): più utenti possono
 * avere un account, tutti condividono gli stessi dati (una sola League, sez. 5) — serve solo a
 * impedire che chiunque trovi l'URL pubblico possa vedere/modificare la lega. Sessione via
 * cookie httpOnly (mai letto/gestito da JS): il client sa solo "sono loggato o no" chiamando
 * GET /auth/me, mai leggendo direttamente il cookie. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const refresh = useCallback(() => {
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(email: string, password: string) {
    setUser(await api.post<AuthUser>("/auth/login", { email, password }));
  }

  async function register(email: string, password: string, name: string, inviteCode: string) {
    setUser(await api.post<AuthUser>("/auth/register", { email, password, name, inviteCode }));
  }

  async function logout() {
    await api.post("/auth/logout", {}).catch(() => undefined);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth va usato dentro <AuthProvider>");
  return ctx;
}

export { ApiError };
