import { useEffect, useState } from "react";
import type { ActiveAuctionState, PlayerListItem } from "@sedinho/shared";
import { SESSION_KEYS, sendChatMessage as sendAnthropicMessage, listModels as listAnthropicModels, type ChatMessage } from "../lib/anthropicClient.js";
import {
  sendChatMessage as sendGeminiMessage,
  listModels as listGeminiModels,
} from "../lib/geminiClient.js";
import { SYSTEM_PROMPT, buildAuctionCommentaryPrompt } from "../lib/buildAuctionCommentaryPrompt.js";

type Provider = "anthropic" | "gemini";

interface AiModel {
  id: string;
  displayName: string;
}

/** Un turno mostrato in chat. Distinto da `ChatMessage` (lib/*Client.ts): quello è l'esatto
 * payload inviato all'API (deve contenere il JSON completo dello stato asta per dare contesto
 * al modello), questo è solo cosa l'utente vede — segnalato esplicitamente dall'utente ("non mi
 * serve vedere il json di tutto lo stato, mi basta solo il commento"). Un turno "generated" (da
 * "Genera commento") non mostra il prompt utente automatico, solo la risposta del modello. */
interface DisplayTurn {
  role: "user" | "assistant";
  content: string;
  kind: "generated" | "typed";
}

/** Un solo client "attivo" alla volta, scelto dal provider corrente — entrambi espongono la
 * stessa forma (listModels/sendChatMessage), il resto del componente non deve sapere quale dei
 * due sta usando. */
function clientFor(provider: Provider) {
  return provider === "anthropic"
    ? { listModels: listAnthropicModels, sendChatMessage: sendAnthropicMessage }
    : { listModels: listGeminiModels, sendChatMessage: sendGeminiMessage };
}

function keysFor(provider: Provider) {
  return provider === "anthropic"
    ? { apiKey: SESSION_KEYS.anthropicApiKey, model: SESSION_KEYS.anthropicModel }
    : { apiKey: SESSION_KEYS.geminiApiKey, model: SESSION_KEYS.geminiModel };
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
};

/** Commenti AI live sull'asta (richiesto esplicitamente dall'utente, non in spec): usa la
 * chiave **dell'utente** per uno dei due provider supportati (Anthropic o Gemini, scelta con un
 * toggle — richiesto esplicitamente dall'utente: "ho delle chiavi di Gemini"), chiamata
 * direttamente dal browser (mai dal nostro server — vedi lib/anthropicClient.ts/geminiClient.ts).
 * Ogni provider ha la propria chiave/modello in `sessionStorage` (indipendenti: passare da uno
 * all'altro non fa perdere la chiave dell'altro), sparisce alla chiusura della scheda, non è mai
 * salvata nel nostro database, non è condivisa con altri utenti anche se loggati sulla stessa
 * lega. Pannello **sempre visibile** in `/auction` (non più un drawer, richiesto esplicitamente
 * dall'utente). **Vera chat conversazionale** (richiesta esplicitamente dall'utente, non solo un
 * pulsante "genera" one-shot): "Genera commento" aggiunge un nuovo turno alla conversazione con
 * lo stato attuale dell'asta (JSON), confrontato con l'ultima volta che è stato generato un
 * commento (`lastObservedTimestamp`, condiviso tra i due provider) così il modello vede TUTTI i
 * movimenti successi nel frattempo, non solo l'ultimo — e dopo, si può continuare a fargli
 * domande libere di follow-up: l'intera cronologia resta nel contesto (l'API è stateless, va
 * reinviata per intero ad ogni turno). Cambiare provider a metà conversazione azzera la
 * cronologia (i due modelli non condividono contesto). Generazione solo su richiesta esplicita
 * (pulsante/invio), mai automatica: ogni turno consuma crediti sulla chiave personale
 * dell'utente. **Gemini non verificato dal vivo** (vedi geminiClient.ts): il sandbox di sviluppo
 * non raggiunge le API di Google, la forma della richiesta/risposta e il supporto CORS restano
 * da confermare al primo uso reale. */
export function AiCommentaryPanel({
  auction,
  players,
}: {
  auction: ActiveAuctionState;
  players: PlayerListItem[];
}) {
  const [provider, setProvider] = useState<Provider>(
    () => (sessionStorage.getItem(SESSION_KEYS.aiProvider) as Provider | null) ?? "anthropic",
  );
  const [apiKey, setApiKey] = useState<string | null>(() =>
    sessionStorage.getItem(keysFor(provider).apiKey),
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [models, setModels] = useState<AiModel[]>([]);
  const [model, setModel] = useState<string>(() => sessionStorage.getItem(keysFor(provider).model) ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // Cosa viene effettivamente mostrato in UI (vedi DisplayTurn sopra) — separato da
  // `chatHistory`, che resta l'esatta cronologia inviata all'API ad ogni turno.
  const [displayLog, setDisplayLog] = useState<DisplayTurn[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastObservedTimestamp, setLastObservedTimestamp] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEYS.lastObservedTimestamp),
  );

  function handleSwitchProvider(next: Provider) {
    if (next === provider) return;
    sessionStorage.setItem(SESSION_KEYS.aiProvider, next);
    setProvider(next);
    setApiKey(sessionStorage.getItem(keysFor(next).apiKey));
    setModel(sessionStorage.getItem(keysFor(next).model) ?? "");
    setModels([]);
    setChatHistory([]); // i due provider non condividono contesto/cronologia
    setDisplayLog([]);
    setError(null);
  }

  useEffect(() => {
    if (!apiKey) return;
    setLoadingModels(true);
    clientFor(provider)
      .listModels(apiKey)
      .then((list) => {
        setModels(list);
        if (!model && list.length > 0) {
          // Preferisce un modello "sonnet"/"flash" (buon compromesso costo/qualità per un
          // commento breve), altrimenti il primo disponibile.
          const preferred =
            list.find((m) => m.id.includes(provider === "anthropic" ? "sonnet" : "flash")) ?? list[0];
          setModel(preferred!.id);
          sessionStorage.setItem(keysFor(provider).model, preferred!.id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Impossibile caricare i modelli.");
      })
      .finally(() => setLoadingModels(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, provider]);

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    sessionStorage.setItem(keysFor(provider).apiKey, apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setApiKeyInput("");
  }

  function handleForgetKey() {
    sessionStorage.removeItem(keysFor(provider).apiKey);
    sessionStorage.removeItem(keysFor(provider).model);
    sessionStorage.removeItem(SESSION_KEYS.lastObservedTimestamp);
    setApiKey(null);
    setModels([]);
    setModel("");
    setChatHistory([]);
    setDisplayLog([]);
    setLastObservedTimestamp(null);
  }

  function handleNewConversation() {
    setChatHistory([]);
    setDisplayLog([]);
    setError(null);
  }

  async function handleGenerate() {
    if (!apiKey || !model) return;
    setGenerating(true);
    setError(null);
    try {
      const { system, user } = buildAuctionCommentaryPrompt(auction, players, lastObservedTimestamp);
      const nextHistory: ChatMessage[] = [...chatHistory, { role: "user", content: user }];
      const reply = await clientFor(provider).sendChatMessage(apiKey, model, system, nextHistory);
      setChatHistory([...nextHistory, { role: "assistant", content: reply }]);
      // In UI non mostriamo il prompt automatico (contiene il JSON completo dello stato asta,
      // richiesto dal modello per il contesto ma non utile da leggere per l'utente — vedi
      // DisplayTurn) — solo la risposta, con l'etichetta "generated" per uno stile distinto.
      setDisplayLog((prev) => [...prev, { role: "assistant", content: reply, kind: "generated" }]);
      // Segna come "osservato" il momento di questa generazione: il prossimo commento
      // partirà da qui per calcolare cosa è cambiato nel frattempo.
      const newest = auction.entries[0]?.timestamp ?? new Date().toISOString();
      sessionStorage.setItem(SESSION_KEYS.lastObservedTimestamp, newest);
      setLastObservedTimestamp(newest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || !model || !followUp.trim()) return;
    setGenerating(true);
    setError(null);
    const question = followUp.trim();
    setFollowUp("");
    try {
      const nextHistory: ChatMessage[] = [...chatHistory, { role: "user", content: question }];
      setChatHistory(nextHistory);
      // Un follow-up è testo scritto a mano dall'utente (mai un JSON generato): va mostrato
      // per intero, a differenza del turno automatico di "Genera commento" sopra.
      setDisplayLog((prev) => [...prev, { role: "user", content: question, kind: "typed" }]);
      const reply = await clientFor(provider).sendChatMessage(apiKey, model, SYSTEM_PROMPT, nextHistory);
      setChatHistory([...nextHistory, { role: "assistant", content: reply }]);
      setDisplayLog((prev) => [...prev, { role: "assistant", content: reply, kind: "typed" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto.");
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

      <div className="mb-3 flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1 w-fit">
        {(["anthropic", "gemini"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleSwitchProvider(p)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              provider === p ? "bg-violet-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      {!apiKey ? (
        <form onSubmit={handleSaveKey} className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={provider === "anthropic" ? "sk-ant-…" : "AIza…"}
            className="min-w-[240px] flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="submit"
            className="whitespace-nowrap rounded border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10"
          >
            Salva per questa sessione
          </button>
          <p className="w-full text-xs text-slate-500">
            La chiave {PROVIDER_LABELS[provider]} resta solo nel tuo browser (sessionStorage),
            sparisce chiudendo la scheda: non viene mai inviata o salvata sul server di Sedinho.
          </p>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                sessionStorage.setItem(keysFor(provider).model, e.target.value);
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
            {chatHistory.length > 0 && (
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={generating}
                className="whitespace-nowrap rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40"
              >
                Nuova conversazione
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {lastObservedTimestamp && (
            <p className="text-[11px] text-slate-600">
              Ultima osservazione: {new Date(lastObservedTimestamp).toLocaleTimeString("it-IT")}. Il
              prossimo commento partirà da qui.
            </p>
          )}

          {displayLog.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-violet-500/20 bg-slate-950/40 p-3">
              {displayLog.map((msg, i) => (
                <p
                  key={i}
                  className={`whitespace-pre-line text-sm ${
                    msg.role === "user"
                      ? "text-slate-500"
                      : "rounded-md bg-violet-500/[0.06] p-2 text-slate-200"
                  }`}
                >
                  {msg.role === "user" ? "Tu: " : msg.kind === "generated" ? "Commento: " : ""}
                  {msg.content}
                </p>
              ))}
            </div>
          )}

          {chatHistory.length > 0 && (
            <form onSubmit={handleSendFollowUp} className="flex gap-2">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Fai una domanda di follow-up…"
                disabled={generating}
                className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-violet-500 focus:outline-none disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={generating || !followUp.trim()}
                className="whitespace-nowrap rounded border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-40"
              >
                Invia
              </button>
            </form>
          )}

          <p className="text-xs text-slate-600">
            Parere generativo aggiuntivo, non un motore deterministico dell'app: usa gli stessi
            dati di mercato/avversari/valutazioni già mostrati sopra al primo turno, ma il testo
            può contenere interpretazioni non verificabili. Le domande di follow-up rispondono
            sulla base della conversazione già avuta, non su dati aggiornati (rigenera un nuovo
            commento per quelli). Ogni turno consuma crediti sulla tua chiave.
          </p>
        </div>
      )}
    </div>
  );
}
