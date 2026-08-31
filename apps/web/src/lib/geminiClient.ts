import type { ChatMessage } from "./anthropicClient.js";

/** Client minimale per l'API pubblica di Google Gemini (Generative Language API), chiamata
 * DIRETTAMENTE dal browser con la chiave dell'utente — stesso pattern BYOK di
 * anthropicClient.ts, aggiunto su richiesta esplicita dell'utente come provider alternativo
 * (non tutti hanno una chiave Anthropic; alcuni hanno già chiavi Gemini). **Non verificato dal
 * vivo**: il sandbox di sviluppo non raggiunge generativelanguage.googleapis.com, quindi la
 * forma esatta della richiesta/risposta e soprattutto il supporto CORS per chiamate dirette da
 * browser (necessario per questo pattern) restano da confermare al primo uso reale — stesso
 * limite già documentato quando fu aggiunta l'integrazione Anthropic. **Copre solo la chat**
 * (`listModels` + `sendChatMessage`): "Notizie di mercato" (ricerca web) resta Anthropic-only,
 * la ricerca assistita di Gemini non è stata implementata qui (forma meno certa da questo
 * sandbox, rischio di scrivere qualcosa di sbagliato senza poterlo verificare). */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiApiError extends Error {
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
    "x-goog-api-key": apiKey,
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

export interface GeminiModel {
  id: string;
  displayName: string;
}

/** Elenca i modelli disponibili per questa chiave che supportano `generateContent` (chat) —
 * stesso motivo di listModels in anthropicClient.ts: i model id cambiano nel tempo, meglio un
 * menu popolato dal vivo che un valore hardcoded nel codice. */
export async function listModels(apiKey: string): Promise<GeminiModel[]> {
  const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=100`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new GeminiApiError(res.status, await parseErrorMessage(res));
  const body = await res.json();
  const models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> =
    body.models ?? [];
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({
      id: m.name, // es. "models/gemini-2.5-flash" — usato cosi' com'e' nell'URL della chiamata
      displayName: m.displayName ?? m.name,
    }));
}

/** Stesso ruolo di sendChatMessage in anthropicClient.ts (intera cronologia, l'API è stateless),
 * ma con la forma di richiesta di Gemini: `systemInstruction`/`contents`, ruoli "user"/"model"
 * invece di "user"/"assistant" — mappati qui cosi' il resto dell'app (AiCommentaryPanel) può
 * restare sullo stesso tipo `ChatMessage` per entrambi i provider senza saperne la differenza. */
export async function sendChatMessage(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      // 600 tagliava a metà frase le risposte più lunghe (segnalato esplicitamente
      // dall'utente: "le risposte sono sempre troncate") — stesso tetto largo di
      // anthropicClient.ts, la brevità resta guidata dal SYSTEM_PROMPT, non da un taglio qui.
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw new GeminiApiError(res.status, await parseErrorMessage(res));
  const body = await res.json();
  const parts: Array<{ text?: string }> = body.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
}
