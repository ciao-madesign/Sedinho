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

export const SESSION_KEYS = {
  apiKey: "sedinho.anthropicApiKey",
  model: "sedinho.anthropicModel",
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

export async function generateCommentary(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 350,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
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
