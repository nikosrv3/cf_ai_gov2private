// src/lib/api.ts
// Enhanced typed API client for cf_ai_gov2private

export type RunStatus = "queued" | "pending" | "done" | "error" | "role_selection" | "generating";

export type HistoryItem = {
  id: string;
  createdAt: string;
  role?: string;
  status: RunStatus;
};

export type HistoryResponse = { items: HistoryItem[] };

export type BulletVersion = { text: string; editedAt: string };

export type Bullet = {
  id: string;
  text: string;
  tags?: string[];
  editedAt?: string;
  history?: BulletVersion[];
};

export type JobRole = {
  id: string;
  title: string;
  company?: string;
  description: string;
  requirements?: string[];
  score?: number;
  source?: "ai" | "user";
};

export type Education = {
  degree?: string;
  field?: string;
  institution?: string;
  year?: string;
  location?: string;
};

export type Experience = {
  title: string;
  org: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: string[];
};

export type Contact = {
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
};

export type NormalizedData = {
  name?: string;
  contact?: Contact;
  summary?: string;
  skills?: string[];
  certifications?: string[];
  education?: Education[];
  experience?: Experience[];
};

export type RunPhases = {
  normalize?: NormalizedData;
  roleDiscovery?: JobRole[];
  selectedRole?: JobRole;
  requirements?: any;
  bullets?: string[];
  draft?: any;
  chat?: Turn[];
};

export type Turn = { 
  role: "user" | "assistant"; 
  content: string;
  timestamp?: string;
};

export type RunData = {
  id: string;
  status: RunStatus;
  targetRole?: string;
  targetRoleId?: string;
  role?: string;
  background?: string;
  phases?: RunPhases;
  createdAt?: string;
  updatedAt?: string;
};

export type DiscoverJobsPayload = {
  background?: string;
  resumeText?: string;
  runId?: string;
};

export type DiscoverJobsResponse = { ok: true; run: RunData };

export type SelectRolePayload = {
  roleId?: string;
  customRole?: JobRole;
};

export type SelectRoleResponse = { 
  ok: true; 
  runId: string;
  status: RunStatus;
};

export type ChangeRolePayload = {
  roleId?: string;
  customRole?: JobRole;
};

export type ChangeRoleResponse = {
  ok: true;
  run: RunData;
};

export type TransformPayload = {
  ids?: string[];
  style?: "short" | "quant" | "lead" | "ats" | "dejargon";
  prompt?: string;
  indexes?: number[];
};

export type TransformResponse = { 
  ok: true; 
  runId?: string; 
  style?: string; 
  updated?: number; 
  indexes?: number[]; 
  bullets?: string[] 
};

export type ChatPayload = { 
  message: string; 
  runId?: string;
  context?: "summary" | "skills" | "experience" | "education" | "bullets" | "general";
};

export type ChatResponse = { 
  ok: true; 
  reply: string;
  updates?: Partial<RunPhases>;
};

export type ExportFormat = "pdf" | "docx" | "txt";

export type LinkedInSearchLink = {
  title: string;
  url: string;
};

export type LinkedInSearchResponse = {
  ok: true;
  links: LinkedInSearchLink[];
};

export type ApiError = {
  status: number;
  code?: string;
  message: string;
};

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * fetchJson with tiny retry (max 2) for 429/5xx. Throws ApiError on failure.
 */
async function fetchJson<T>(
  url: string,
  { method = "GET", body, signal, headers }: FetchOptions = {},
  retry = 2
): Promise<T> {
  const opts: RequestInit = {
    method,
    signal,
    headers: { ...(body ? JSON_HEADERS : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  };

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const res = await fetch(url, opts);
      // Retry on 429 or 5xx
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt < retry) {
          await sleep(jitterDelay(attempt));
          continue;
        }
      }

      const text = await res.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (!res.ok) {
            throw asApiError(res.status, `HTTP ${res.status}: ${truncate(text, 200)}`);
          } else {
            throw asApiError(0, "Invalid JSON received from server.");
          }
        }
      }

      if (!res.ok) {
        const message =
          (data && (data.message || data.error)) ||
          `HTTP ${res.status}: ${res.statusText || "Request failed"}`;
        const code = data && (data.code || data.errorCode);
        throw asApiError(res.status, message, code);
      }

      return data as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retry && isRetriableNetworkError(err)) {
        await sleep(jitterDelay(attempt));
        continue;
      }
      if (isApiError(err)) throw err;
      throw asApiError(0, getErrorMessage(err));
    }
  }

  throw asApiError(0, getErrorMessage(lastErr));
}

function asApiError(status: number, message: string, code?: string): ApiError {
  return { status, message, ...(code ? { code } : {}) };
}

function isApiError(e: unknown): e is ApiError {
  return !!e && typeof e === "object" && "status" in e && "message" in e;
}

function isRetriableNetworkError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  if (msg.includes("abort")) return false;
  return msg.includes("network") || msg.includes("failed to fetch") || msg.includes("timed out");
}

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterDelay(attempt: number): number {
  const base = 400 * (attempt + 1);
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/* ---------------- API surface ---------------- */

export async function getHistory(signal?: AbortSignal): Promise<HistoryResponse> {
  const raw = await fetchJson<any>("/api/history", { method: "GET", signal });
  if (raw && raw.ok === true && Array.isArray(raw.items)) {
    return { items: raw.items as HistoryItem[] };
  }
  if (raw && Array.isArray(raw.runs)) return { items: raw.runs as HistoryItem[] };
  return { items: [] };
}

export async function getRun(id: string, signal?: AbortSignal): Promise<RunData> {
  const raw = await fetchJson<any>(`/api/run/${encodeURIComponent(id)}`, { method: "GET", signal });
  if (raw && raw.ok === true && raw.run) return raw.run as RunData;
  return raw as RunData;
}

export async function discoverJobs(payload: DiscoverJobsPayload, signal?: AbortSignal): Promise<DiscoverJobsResponse> {
  return fetchJson<DiscoverJobsResponse>("/api/discover-jobs", { method: "POST", body: payload, signal });
}

export async function selectRole(
  runId: string,
  payload: SelectRolePayload,
  signal?: AbortSignal
): Promise<SelectRoleResponse> {
  return fetchJson<SelectRoleResponse>(
    `/api/run/${encodeURIComponent(runId)}/select-role`,
    { method: "POST", body: payload, signal }
  );
}

export async function changeRole(
  runId: string,
  payload: ChangeRolePayload,
  signal?: AbortSignal
): Promise<ChangeRoleResponse> {
  return fetchJson<ChangeRoleResponse>(
    `/api/run/${encodeURIComponent(runId)}/change-role`,
    { method: "POST", body: payload, signal }
  );
}

export async function transformBullets(
  runId: string,
  payload: TransformPayload,
  signal?: AbortSignal
): Promise<TransformResponse> {
  return fetchJson<TransformResponse>(
    `/api/run/${encodeURIComponent(runId)}/bullets/transform`,
    { method: "POST", body: payload, signal }
  );
}

export async function postChat(body: ChatPayload, signal?: AbortSignal): Promise<ChatResponse> {
  return fetchJson<ChatResponse>("/api/chat", { method: "POST", body, signal });
}

export async function generateResume(
  runId: string,
  signal?: AbortSignal
): Promise<RunData> {
  return fetchJson<RunData>(
    `/api/run/${encodeURIComponent(runId)}/generate`,
    { method: "POST", signal }
  );
}

export async function searchLinkedInJobs(
  jobTitle: string,
  location?: string,
  signal?: AbortSignal
): Promise<LinkedInSearchResponse> {
  const params = new URLSearchParams();
  if (location) params.set("location", location);
  
  const url = `/api/linkedin-search/${encodeURIComponent(jobTitle)}${params.toString() ? `?${params.toString()}` : ""}`;
  return fetchJson<LinkedInSearchResponse>(url, { method: "GET", signal });
}

/* ------------- Convenience guards ------------- */

export function humanizeApiError(err: unknown): string {
  if (isApiError(err)) {
    const base = err.message || "Request failed";
    return err.status ? `${base} (HTTP ${err.status})` : base;
  }
  return getErrorMessage(err);
}

export function isRateLimited(err: unknown): boolean {
  return isApiError(err) && err.status === 429;
}

export function isOfflineError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes("network") || msg.includes("offline") || msg.includes("failed to fetch");
}