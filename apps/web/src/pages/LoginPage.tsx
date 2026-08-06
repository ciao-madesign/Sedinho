import { useState } from "react";
import { ApiError, useAuth } from "../lib/AuthContext.js";

/** Login/registrazione (richiesta esplicitamente dall'utente, non in spec): la registrazione
 * richiede un codice di invito condiviso (env var `SIGNUP_CODE` sul progetto Vercel), non è
 * aperta a chiunque trovi l'URL — vedi CLAUDE.md sez. 5. */
export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name, inviteCode);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src="/logo.png" alt="Sedinho" className="h-12 w-12 rounded-full ring-1 ring-slate-700" />
          <h1 className="text-xl font-semibold">Sedinho</h1>
        </div>

        <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "login" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Accedi
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "register" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Registrati
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-500">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-slate-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Codice di invito
              </label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
          >
            {submitting ? "…" : mode === "login" ? "Accedi" : "Crea account"}
          </button>
        </form>
      </div>
    </div>
  );
}
