// Referral / channel attribution: capture once on first visit, persist, reuse at registration.
import { storage } from "@/src/utils/storage";

export type Attribution = {
  ref: string | null;
  rep: string | null;
  via: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

const KEY = "hallticket.attribution";
export const MY_SEAT_KEY = "hallticket.my_seat";

const empty: Attribution = { ref: null, rep: null, via: null, utm_source: null, utm_medium: null, utm_campaign: null };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 40);
  return /^[A-Za-z0-9_\-]+$/.test(s) ? s : null;
}

/** Call with the current route params. First touch wins; later visits don't overwrite. */
export async function captureAttribution(params: Record<string, unknown>): Promise<Attribution> {
  const incoming: Attribution = {
    ref: clean(params.ref),
    rep: clean(params.rep),
    via: clean(params.via),
    utm_source: clean(params.utm_source),
    utm_medium: clean(params.utm_medium),
    utm_campaign: clean(params.utm_campaign),
  };
  const hasIncoming = Object.values(incoming).some(Boolean);
  const storedRaw = await storage.getItem(KEY, null);
  const stored: Attribution | null = storedRaw ? safeParse(storedRaw) : null;
  if (stored && Object.values(stored).some(Boolean)) return stored;
  if (hasIncoming) {
    await storage.setItem(KEY, JSON.stringify(incoming));
    return incoming;
  }
  return empty;
}

export async function getAttribution(): Promise<Attribution> {
  const raw = await storage.getItem(KEY, null);
  return (raw && safeParse(raw)) || empty;
}

function safeParse(raw: string): Attribution | null {
  try {
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}
