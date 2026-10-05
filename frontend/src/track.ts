// Lightweight funnel events. Fire-and-forget; never block UI.
import { api, EventType } from "@/src/api";
import { storage } from "@/src/utils/storage";

const SESSION_KEY = "hallticket.session";
let sessionId: string | null = null;
const firedOnce = new Set<string>();

async function getSession(): Promise<string> {
  if (sessionId) return sessionId;
  const stored = await storage.getItem(SESSION_KEY, null);
  if (typeof stored === "string" && stored) {
    sessionId = stored;
    return stored;
  }
  const fresh = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  sessionId = fresh;
  await storage.setItem(SESSION_KEY, fresh);
  return fresh;
}

/** `once` dedupes per app session (e.g. one page_view / form_started per visit). */
export async function track(type: EventType, opts: { path?: string; seat_code?: string; tone?: string; channel?: string; once?: boolean } = {}) {
  const key = `${type}:${opts.path ?? ""}`;
  if (opts.once && firedOnce.has(key)) return;
  if (opts.once) firedOnce.add(key);
  try {
    const session_id = await getSession();
    await api.event({ type, session_id, path: opts.path, seat_code: opts.seat_code, tone: opts.tone, channel: opts.channel });
  } catch {
    // analytics must never break the app
  }
}
