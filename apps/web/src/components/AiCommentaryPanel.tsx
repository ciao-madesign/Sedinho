import { useEffect, useState } from "react";
import type { ActiveAuctionState, PlayerListItem } from "@sedinho/shared";
import {
  AnthropicApiError,
  SESSION_KEYS,
  generateCommentary,
  listModels,
  type AnthropicModel,
} from "../lib/anthropicClient.js";
import { buildAuctionCommentaryPrompt } from "../lib/buildAuctionCommentaryPrompt.js";

/** Commenti AI live sull'asta (richiesto esplicitamente dall'utente, non in spec): usa la
 * chiave Anthropic dell'utente, chiamata direttamente dal browser (mai dal nostro server — vedi
 * lib/anthropicClient.ts). La chiave vive solo in `sessionStorage` di questo browser: sparisce
 * alla chiusura della scheda, non è mai salvata nel nostro database, non è condivisa con altri
 * utenti anche se loggati sulla stessa lega. Generazione solo su richiesta esplicita (pulsante),
 * mai automatica: ogni commento consuma crediti sulla chiave personale dell'utente. */
export function AiCommentaryPanel({
  auction,
  players,
}: {
  auction: ActiveAuctionState;
  players: PlayerListItem[];
}) {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEYS.apiKey),
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [models, setModels] = useState<AnthropicModel[]>([]);
  const [model, setModel] = useState<string>(() => sessionStorage.getItem(SESSION_KEYS.model) ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    setLoadingModels(true);
    listModels(apiKey)
      .then((list) => {
        setModels(list);
        if (!model && list.length > 0) {
          // Preferisce un modello con "sonnet" nel nome (buon compromesso costo/qualità per un
          // commento breve), altrimenti il primo disponibile.
          const preferred = list.find((m) => m.id.includes("sonnet")) ?? list[0];
          setModel(preferred!.id);
          sessionStorage.setItem(SESSION_KEYS.model, preferred!.id);
        }
      })
      .catch((err) => {
        setError(err instanceof AnthropicApiError ? err.message : "Impossibile caricare i modelli.");
      })
      .finally(() => setLoadingModels(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    sessionStorage.setItem(SESSION_KEYS.apiKey, apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setApiKeyInput("");
  }

  function handleForgetKey() {
    sessionStorage.removeItem(SESSION_KEYS.apiKey);
    sessionStorage.removeItem(SESSION_KEYS.model);
    setApiKey(null);
    setModels([]);
    setModel("");
    setCommentary(null);
  }

  async function handleGenerate() {
    if (!apiKey || !model) return;
    setGenerating(true);
    setError(null);
    try {
      const { system, user } = buildAuctionCommentaryPrompt(auction, players);
      setCommentary(await generateCommentary(apiKey, model, system, user));
    } catch (err) {
      setError(err instanceof AnthropicApiError ? err.message : "Errore imprevisto.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-violet-200">Commento AI (con la tua API key)</h2>
        {apiKey && (
          <button
            type="button"
            onClick={handleForgetKey}
            className="text-xs text-slate-500 hover:text-red-400"
          >
            Dimentica chiave
          </button>
        )}
      </div>

      {!apiKey ? (
        <form onSubmit={handleSaveKey} className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            className="min-w-[240px] flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="submit"
            className="whitespace-nowrap rounded border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10"
          >
            Salva per questa sessione
          </button>
          <p className="w-full text-xs text-slate-500">
            La chiave resta solo nel tuo browser (sessionStorage), sparisce chiudendo la scheda:
            non viene mai inviata o salvata sul server di Sedinho.
          </p>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                sessionStorage.setItem(SESSION_KEYS.model, e.target.value);
              }}
              disabled={loadingModels || models.length === 0}
              className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs focus:border-violet-500 focus:outline-none"
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
              onClick={handleGenerate}
              disabled={generating || !model}
              className="whitespace-nowrap rounded bg-violet-500 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-40"
            >
              {generating ? "Genero…" : "Genera commento"}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {commentary && (
            <p className="whitespace-pre-line rounded-md border border-violet-500/20 bg-slate-950/40 p-3 text-sm text-slate-200">
              {commentary}
            </p>
          )}

          <p className="text-xs text-slate-600">
            Parere generativo aggiuntivo, non un motore deterministico dell'app: usa gli stessi
            dati di mercato/avversari/valutazioni già mostrati sopra, ma il testo può contenere
            interpretazioni non verificabili. Ogni generazione consuma crediti sulla tua chiave.
          </p>
        </div>
      )}
    </div>
  );
}
