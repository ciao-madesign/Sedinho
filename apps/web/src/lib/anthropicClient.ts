/** Client minimale per l'API pubblica di Anthropic, chiamata DIRETTAMENTE dal browser (mai dal
 * nostro server): la chiave inserita dall'utente resta nella sessione del suo browser
 * (sessionStorage, sparisce alla chiusura della scheda/finestra) e non tocca mai il nostro
 * database — richiesto esplicitamente dall'utente ("no sul server"). L'header
 * `anthropic-dangerous-direct-browser-access` è quello che Anthropic richiede apposta per
 * permettere chiamate dirette da browser (normalmente bloccate per non esporre la chiave a
 * chiunque ispezioni le richieste di rete: qui è una scelta esplicita dell'utente, con la SUA
 * chiave, non una terza parte). */
const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

/** Chiavi sessionStorage condivise tra i pannelli AI (Commento AI, Notizie di mercato). Una
 * chiave/modello per provider (Anthropic/Gemini, vedi geminiClient.ts): non sono
 * intercambiabili, l'utente può averne una sola delle due o entrambe. `aiProvider` ricorda
 * quale dei due è attivo nel Commento AI — Notizie di mercato resta sempre su Anthropic (usa lo
 * strumento server-side `web_search`, non implementato per Gemini qui, vedi geminiClient.ts). */
export const SESSION_KEYS = {
  anthropicApiKey: "sedinho.anthropicApiKey",
  anthropicModel: "sedinho.anthropicModel",
  geminiApiKey: "sedinho.geminiApiKey",
  geminiModel: "sedinho.geminiModel",
  aiProvider: "sedinho.aiProvider",
  /** Timestamp dell'ultimo inserimento osservato dall'ultimo commento generato (richiesto
   * esplicitamente dall'utente: "l'AI osserva cosa è cambiato dall'ultima osservazione") —
   * in sessionStorage cosi' un refresh della pagina non fa perdere il riferimento e far
   * ripartire il commento da zero come se fosse la prima osservazione. Condiviso tra i due
   * provider: è lo stato dell'asta osservato, non qualcosa legato a un provider specifico. */
  lastObservedTimestamp: "sedinho.anthropicLastObservedTimestamp",
} as const;

export class AnthropicApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export interface AnthropicModel {
  id: string;
  displayName: string;
}

/** Elenca i modelli disponibili per questa chiave, cosi' l'utente sceglie da un menu invece di
 * doversi ricordare/scrivere un model id esatto (che cambia nel tempo). */
export async function listModels(apiKey: string): Promise<AnthropicModel[]> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/models?limit=50`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new AnthropicApiError(res.status, await parseErrorMessage(res));
  const body = await res.json();
  return (body.data ?? []).map((m: { id: string; display_name?: string }) => ({
    id: m.id,
    displayName: m.display_name ?? m.id,
  }));
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Invia l'intera cronologia della conversazione (l'API è stateless: va sempre reinviata per
 * intero, non solo l'ultimo messaggio) e restituisce la risposta testuale di Claude. Usata sia
 * per il primo "Genera commento" (una cronologia di un solo messaggio) sia per i turni di
 * follow-up della chat vera e propria (richiesta esplicitamente dall'utente, non solo un
 * pulsante "genera" one-shot) — stessa chiamata, la differenza è solo quanti messaggi contiene
 * `messages`. */
export async function sendChatMessage(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      // 600 tagliava a metà frase le risposte più lunghe (segnalato esplicitamente
      // dall'utente: "le risposte sono sempre troncate") — alzato a un tetto largo,
      // la brevità resta comunque guidata dal SYSTEM_PROMPT, non da un taglio secco qui.
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) throw new AnthropicApiError(res.status, await parseErrorMessage(res));
  const body = await res.json();
  return (body.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("\n")
    .trim();
}

export interface MarketNewsSource {
  url: string;
  title: string;
}

export interface MarketNewsResult {
  text: string;
  sources: MarketNewsSource[];
}

/** Notizie di mercato dell'ultima ora (non in spec, richiesto esplicitamente dall'utente, vedi
 * CLAUDE.md §5): stesso pattern BYOK del Commento AI, ma con il tool server-side `web_search`
 * abilitato — è Anthropic (coi crediti della chiave dell'utente) a fare la ricerca, non un
 * connettore di scraping nostro (bloccato dalla rete di sviluppo, mai verificabile qui). Versione
 * "basic" del tool (`web_search_20250305`, non quella con dynamic filtering): l'utente può
 * scegliere qualunque modello dal menu, non solo quelli più recenti che supporterebbero la
 * versione più nuova. Una sola chiamata, senza loop di continuazione: per un riepilogo breve di
 * notizie un'unica ricerca è sufficiente, non serve gestire `pause_turn`. */
export async function searchMarketNews(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<MarketNewsResult> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      // Stesso motivo del tetto alzato in sendChatMessage sopra: un limite basso tagliava le
      // risposte a metà, specialmente con più fonti citate dal tool di ricerca.
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    }),
  });
  if (!res.ok) throw new AnthropicApiError(res.status, await parseErrorMessage(res));
  const body = await res.json();
  const blocks: Array<Record<string, unknown>> = body.content ?? [];

  const text = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text as string)
    .join("\n")
    .trim();

  const sources: MarketNewsSource[] = [];
  const seenUrls = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content;
    if (!Array.isArray(content)) continue;
    for (const item of content as Array<Record<string, unknown>>) {
      if (item.type !== "web_search_result") continue;
      const url = item.url as string | undefined;
      const title = (item.title as string | undefined) ?? url;
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      sources.push({ url, title: title ?? url });
    }
  }

  return { text, sources };
}
