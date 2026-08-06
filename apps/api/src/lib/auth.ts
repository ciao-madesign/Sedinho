import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** Hash password con scrypt (built-in Node, nessuna dipendenza esterna — bcryptjs valutato e
 * scartato: nessun vantaggio reale su scrypt per questa scala, un pacchetto in meno da tenere
 * aggiornato). Formato salvato: "salt:hash", entrambi hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuf = Buffer.from(hashHex, "hex");
  if (storedBuf.length !== derivedKey.length) return false;
  // timingSafeEqual invece di === per non far trapelare via timing quanti byte combaciano.
  return timingSafeEqual(derivedKey, storedBuf);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export const SESSION_COOKIE_NAME = "sedinho_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
