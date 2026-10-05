import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Project = { title: string; pitch: string; variation: string; steps: string[]; interest?: string; branch?: string };

export type Ticket = {
  name: string;
  college: string;
  branch: string;
  year: string;
  interest: string;
  seat_code: string;
  project: Project;
  referred_by: string | null;
  is_demo: boolean;
  created_at: string;
  referral_count: number;
  share_url: string;
  ref_link: string;
  story_url: string;
  og_url: string;
};

export type Workshop = {
  title: string;
  datetime_label: string;
  start_iso: string;
  duration_label: string;
  duration_minutes: number;
  mode: string;
  audience: string;
  campus_goal: number;
  unlock_label: string;
  footer: string;
};

export type AppConfig = { workshop: Workshop; branches: string[]; years: string[]; interests: string[] };

export type BoardItem = {
  rank: number;
  college_key: string;
  college: string;
  count: number;
  demo_count: number;
  goal: number;
  pct: number;
  unlocked: boolean;
};

export type Board = {
  items: BoardItem[];
  goal: number;
  unlock_label: string;
  demo_hidden: boolean;
  total: number;
  demo_total: number;
  has_demo: boolean;
  top_referrers: TopReferrer[];
  updated_at: string;
};

export type TopReferrer = { seat_code: string; first_name: string; college: string; count: number; is_demo: boolean };

export type ReferralItem = { first_name: string; college: string; created_at: string };

export type Referrals = {
  seat_code: string;
  count: number;
  college: string;
  college_count: number;
  goal: number;
  referrals: ReferralItem[];
};

export type RegisterPayload = {
  name: string;
  email: string;
  college: string;
  branch: string;
  year: string;
  interest: string;
  ref?: string | null;
  rep?: string | null;
  via?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

export type DayPoint = { date: string; label: string; real: number; demo: number; total: number };

export type RepDashboard = {
  rep_code: string;
  name: string;
  college: string;
  is_demo: boolean;
  total: number;
  direct: number;
  via_chain: number;
  rank: number;
  rep_count: number;
  trend: DayPoint[];
  link: string;
  recent: { name: string; college: string; seat_code: string; created_at: string; is_demo: boolean }[];
};

export type ToneRow = { tone: string; label: string; shares: number; copies: number; total: number; pct: number };

export type PlatformRow = {
  channel: string;
  label: string;
  real_shares: number;
  real_regs: number;
  demo_shares: number;
  demo_regs: number;
};

export type AdminStats = {
  totals: { real: number; demo: number; all: number };
  include_demo: boolean;
  sources: { source: string; count: number }[];
  per_day: DayPoint[];
  top_colleges: { college: string; count: number; demo_count: number }[];
  top_reps: { rep_code: string; name: string; college: string; is_demo: boolean; total: number; direct: number; via_chain: number }[];
  funnel: { step: string; key: string; count: number }[];
  funnel_window_days: number;
  shares_by_tone: {
    real: ToneRow[];
    real_total: number;
    real_untagged: number;
    demo: ToneRow[];
    demo_total: number;
    note: string;
  };
  by_platform: {
    platforms: PlatformRow[];
    note: string;
  };
  referrals: { total: number; referred: number; referrers: number; k: number; avg_per_referrer: number; longest_chain: { length: number; path: string[] } };
  demo_hidden: boolean;
  demo_only: boolean;
  generated_at: string;
};

export type EventType = "page_view" | "form_started" | "share_clicked" | "message_copied";

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : detail?.message || "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let detail: any = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const ADMIN_TOKEN_KEY = "hallticket.admin_token";

export async function getAdminToken(): Promise<string | null> {
  const t = await storage.secureGet(ADMIN_TOKEN_KEY, null);
  return typeof t === "string" && t ? t : null;
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminToken();
  try {
    return await request<T>(path, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ""}` } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await storage.secureRemove(ADMIN_TOKEN_KEY);
    throw e;
  }
}

export const api = {
  config: () => request<AppConfig>("/config"),
  colleges: () => request<{ colleges: string[] }>("/colleges"),
  projects: () => request<{ projects: Project[] }>("/projects"),
  ticket: (code: string) => request<Ticket>(`/tickets/${encodeURIComponent(code)}`),
  referrals: (code: string) => request<Referrals>(`/tickets/${encodeURIComponent(code)}/referrals`),
  board: () => request<Board>("/board"),
  register: (payload: RegisterPayload) => request<Ticket>("/register", { method: "POST", body: JSON.stringify(payload) }),
  verifyPin: (pin: string) => request<{ ok: boolean; demo_hidden: boolean }>("/admin/verify", { method: "POST", body: JSON.stringify({ pin, hidden: false }) }),
  setDemoHidden: (pin: string, hidden: boolean) =>
    request<{ demo_hidden: boolean }>("/admin/demo-visibility", { method: "POST", body: JSON.stringify({ pin, hidden }) }),
  event: (body: { type: EventType; session_id: string; path?: string; seat_code?: string; tone?: string; channel?: string }) =>
    request<void>("/events", { method: "POST", body: JSON.stringify(body) }),
  rep: (code: string) => request<RepDashboard>(`/reps/${encodeURIComponent(code)}`),
  adminLogin: async (password: string) => {
    const res = await request<{ access_token: string }>("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    await storage.secureSet(ADMIN_TOKEN_KEY, res.access_token);
    return res;
  },
  adminLogout: () => storage.secureRemove(ADMIN_TOKEN_KEY),
  adminMe: () => adminRequest<{ ok: boolean }>("/admin/me"),
  adminStats: (includeDemo: boolean) => adminRequest<AdminStats>(`/admin/stats?include_demo=${includeDemo}`),
  adminDemoStats: () => request<AdminStats>("/admin-demo/stats"),
  adminExportUrl: async (includeDemo: boolean) => `${BASE}/admin/export.csv?include_demo=${includeDemo}&token=${encodeURIComponent((await getAdminToken()) ?? "")}`,
};
