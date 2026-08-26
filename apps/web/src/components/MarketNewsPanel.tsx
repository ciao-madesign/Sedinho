import { useState } from "react";
import type { ShortlistEntryView } from "@sedinho/shared";
import {
  AnthropicApiError,
  SESSION_KEYS,
  searchMarketNews,
  listModels,
  type AnthropicModel,
  type MarketNewsResult,
} from "../lib/anthropicClient.js";
import { buildMarketNewsPrompt } from "../lib/buildMarketNewsPrompt.js";

/** Notizie di mercato dell'ultima ora (non in spec, richiesto esplicitamente dall'utente prima
 * del go-live — vedi CLAUDE.md §5/§10 punto 29): stesso pattern BYOK del Commento AI (chiave
 * dell'utente in sessionStorage, chiamata diretta browser→Anthropic, mai dal nostro server) ma
 * con ricerca web assistita da AI (`web_search` tool) invece di un connettore di scraping — il
 * sandbox di sviluppo non riesce a raggiungere nessun sito di news calcio per verificarne il
 * markup, quindi costruire un connettore sarebbe stato "alla cieca" (rischio già materializzato
 * una volta con l'incidente `canCreatePlayers`, vedi §5). **Pulsante dedicato** (drawer separato
 * in `/auction`, non integrato nel pannello Commento AI): richiesto esplicitamente dall'utente,
 * per non consumare crediti extra ad ogni "Genera commento". **Sempre e solo Anthropic**, anche
 * se nel Commento AI l'utente ha scelto Gemini come provider (vedi geminiClient.ts): usa lo
 * strumento server-side `web_search`, disponibile solo lato Anthropic qui — chiave/modello
 * Anthropic dedicati (`SESSION_KEYS.anthropicApiKey`/`anthropicModel`), indipendenti da quale
 * provider è attivo nell'altro pannello. */
export function MarketNewsPanel({ shortlistEntries }: { shortlistEntries: ShortlistEntryView[] }) {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEYS.anthropicApiKey),
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [models, setModels] = useState<AnthropicModel[]>([]);
  const [model, setModel] = useState<string>(() => sessionStorage.getItem(SESSION_KEYS.anthropicModel) ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const [result, setResult] = useState<MarketNewsResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ensureModels() {
    if (!apiKey || models.length > 0 || loadingModels) return;
    setLoadingModels(true);
    listModels(apiKey)
      .then((list) => {
        setModels(list);
        if (!model && list.length > 0) {
          const preferred = list.find((m) => m.id.includes("sonnet")) ?? list[0];
          setModel(preferred!.id);
          sessionStorage.setItem(SESSION_KEYS.anthropicModel, preferred!.id);
        }
      })
      .catch((err) => {
        setError(err instanceof AnthropicApiError ? err.message : "Impossibile caricare i modelli.");
      })
      .finally(() => setLoadingModels(false));
  }

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    sessionStorage.setItem(SESSION_KEYS.anthropicApiKey, apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setApiKeyInput("");
  }

  async function handleSearch() {
    if (!apiKey || !model) return;
    setSearching(true);
    setError(null);
    try {
      const notSold = shortlistEntries.filter((e) => !e.sold);
      const { system, user } = buildMarketNewsPrompt(notSold);
      setResult(await searchMarketNews(apiKey, model, system, user));
    } catch (err) {
      setError(err instanceof AnthropicApiError ? err.message : "Errore imprevisto.");
    } finally {
      setSearching(false);
    }
  }

  if (apiKey) ensureModels();

  return (
    <div className="space-y-3">
      {!apiKey ? (
        <form onSubmit={handleSaveKey} className="space-y-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full rounded border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
          >
            Salva per questa sessione
          </button>
          <p className="text-xs text-slate-500">
            Serve una chiave Anthropic (questa funzione usa lo strumento di ricerca web di
            Anthropic, indipendente dal provider scelto nel Commento AI): resta solo in questo
            browser, sparisce chiudendo la scheda. Ogni ricerca consuma crediti sulla tua chiave.
          </p>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                sessionStorage.setItem(SESSION_KEYS.anthropicModel, e.target.value);
              }}
              disabled={loadingModels || models.length === 0}
              className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
            >
              {models.length === 0 && <option>{loadingModels ? "Carico modelli…" : "Nessun modello"}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !model}
              className="whitespace-nowrap rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-40"
            >
              {searching ? "Cerco…" : "Cerca notizie"}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {result && (
            <div className="space-y-2">
              <p className="whitespace-pre-line rounded-md border border-amber-500/20 bg-slate-950/40 p-3 text-sm text-slate-200">
                {result.text || "Nessuna notizia rilevante trovata."}
              </p>
              {result.sources.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-slate-600">Fonti</p>
                  <ul className="space-y-1">
                    {result.sources.map((s) => (
                      <li key={s.url} className="truncate text-xs">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 hover:underline"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-600">
            Ricerca web assistita da AI (non un connettore Sedinho): il modello cerca sul web con
            la tua chiave e può commettere errori o trovare fonti non affidabili — verifica prima
            di agire in asta. Generazione solo su richiesta (pulsante), mai automatica.
          </p>
        </>
      )}
    </div>
  );
}
