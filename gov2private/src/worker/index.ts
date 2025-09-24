// Hono Worker entry: role discovery + selection + tailoring demo routes.
// Uses env.MODEL (wrangler.json "vars") for all AI calls.
// Signed anonymous uid via APP_SECRET (HMAC) with cookie middleware.

import { Hono } from "hono";
import { UserState } from "./UserState";
import type { RoleCandidate, RunData } from "../types/run";
import { ensureUidFromCookieHeader } from "./cookies";

/* -------------------- Bindings -------------------- */
type Env = {
  AI: any;                                         // Workers AI binding
  USER_STATE: DurableObjectNamespace<UserState>;   // Durable Object namespace
  MODEL: string;                                   // e.g., "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
  APP_SECRET: string;                               // HMAC secret (wrangler secret)
};

// Note: include Variables typing so c.set("uid", ...) and c.get("uid") are type-safe.
const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

/* -------------------- UID Cookie Middleware -------------------- */
/**
 * - Verifies or issues (uid, uid_sig) using HMAC(APP_SECRET).
 * - Attaches uid to the context via c.set('uid', uid).
 * - Appends Set-Cookie headers when issuing/refreshing.
 */
app.use("*", async (c, next) => {
  const secret = c.env.APP_SECRET;
  if (!secret) {
    // Fail fast—misconfigured secret means no tenancy guarantees.
    return c.json({ ok: false, error: "server_misconfigured: missing APP_SECRET" }, 500);
  }

  const cookieHeader = c.req.header("Cookie");
  const { uid, setCookies } = await ensureUidFromCookieHeader(secret, cookieHeader);

  // Append Set-Cookie(s) if needed
  for (const sc of setCookies) c.header("Set-Cookie", sc, { append: true });

  c.set("uid", uid);
  await next();
});

/* -------------------- Health -------------------- */
// /api/health: quick readiness probe.
app.get("/api/health", (c) => c.text("ok"));

/* -------------------- Role Discovery -------------------- */
/**
 * /api/discover-jobs
 * - Normalize resume (demo stub)
 * - Propose roles (LLM) and generate short JDs per role
 * - Persist to Durable Object
 */
app.post("/api/discover-jobs", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    background?: string; resumeText?: string; runId?: string;
  };

  const uid = c.get("uid");
  const stub = c.env.USER_STATE.getByName(uid);

  const runId = body.runId ?? randomId();
  await stub.createRun(runId, { background: body.background, status: "queued" });

  const resumeJson = await normalizeResume(body.resumeText ?? "");

  // Propose roles (safe JSON, centralized model)
  const { candidates, raw } = await proposeRoles(c.env.AI, c.env.MODEL, body.background ?? "", resumeJson);
  await stub.saveRunPart(runId, { phases: { roleDiscovery: { candidates, debugRaw: raw } } });

  // Enrich roles with short AI JDs (best-effort)
  const enriched: RoleCandidate[] = [];
  for (const r of candidates) {
    const jd = await generateShortJD(c.env.AI, c.env.MODEL, r.title).catch(() => undefined);
    enriched.push({ ...r, aiJobDescription: jd });
  }

  await stub.setRoleCandidates(runId, enriched);

  const run = (await stub.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run });
});

/* -------------------- Read endpoints -------------------- */
app.get("/api/run/:id", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const stub = c.env.USER_STATE.getByName(uid);
  const run = await stub.getRun(runId);
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, run });
});

app.get("/api/history", async (c) => {
  const uid = c.get("uid");
  const stub = c.env.USER_STATE.getByName(uid);
  const items = await stub.getHistory(20);
  return c.json({ ok: true, items });
});

/**
 * /api/run/:id/roles: fetch current role candidates for a run.
 */
app.get("/api/run/:id/roles", async (c) => {
  const uid = c.get("uid");
  const stub = c.env.USER_STATE.getByName(uid);
  const run = (await stub.getRun(c.req.param("id"))) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  const candidates = run.phases?.roleDiscovery?.candidates ?? [];
  return c.json({ ok: true, candidates, status: run.status });
});

/**
 * /api/run/:id/select-role: store selected role/JD and run tailoring steps.
 */
app.post("/api/run/:id/select-role", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const stub = c.env.USER_STATE.getByName(uid);

  const body = (await c.req.json().catch(() => ({}))) as {
    roleId: string;
    jobDescription?: string;
    useAiGenerated?: boolean;
  };

  const run = (await stub.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  const candidates = run.phases?.roleDiscovery?.candidates ?? [];
  const chosen = candidates.find((r) => r.id === body.roleId);
  if (!chosen) return c.json({ ok: false, error: "invalid_role" }, 400);

  let jd = body.jobDescription?.trim();
  let source: "user_pasted" | "llm_generated" = "user_pasted";
  if (!jd && body.useAiGenerated) { jd = chosen.aiJobDescription ?? ""; source = "llm_generated"; }
  if (!jd) return c.json({ ok: false, error: "missing_job_description" }, 400);

  await stub.setSelectedRole(runId, chosen.id, { jobDescription: jd, source });

  const requirements = await extractRequirements(c.env.AI, c.env.MODEL, chosen.title, jd);
  await stub.saveRunPart(runId, { phases: { requirements } });

  const mapping = await mapTransferable(run.phases?.normalize ?? {}, requirements);
  await stub.saveRunPart(runId, { phases: { mapping } });

  const bullets = await rewriteBullets(c.env.AI, c.env.MODEL, mapping, chosen.title);
  await stub.saveRunPart(runId, { phases: { bullets } });

  const scoring = await scoreSkills(mapping);
  await stub.saveRunPart(runId, { phases: { scoring } });

  const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
    bullets, requirements, mapping, background: run.background, title: chosen.title
  });
  await stub.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: chosen.title });

  const finalRun = (await stub.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run: finalRun });
});

/* -------------------- AI smoke test -------------------- */
app.get("/api/ai-test", async (c) => {
  const model = c.env.MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const messages = [
    { role: 'system', content: 'You are a philosopher, that only responds in two sentence riddles.' },
    { role: 'user', content: 'What is this application?' }
  ];
  try {
    const resp = await c.env.AI.run(model, { messages });
    const text = normalizeAiString(resp);
    return c.json({ ok: true, model, text });
  } catch (e: any) {
    console.error("[/api/ai-test] error:", e?.message || e);
    return c.json({ ok: false, error: 'issue with model' }, 500);
  }
});

export default app;
export { UserState };

/* -------------------- Step Helpers -------------------- */
function assertAI(ai: Env["AI"]) {
  if (!ai || typeof (ai as any).run !== "function") {
    throw new Error(
      'Workers AI binding missing. Ensure wrangler.json has { "ai": { "binding": "AI" } } and call helpers with c.env.AI.'
    );
  }
}

function randomId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

async function normalizeResume(resumeText: string): Promise<unknown> {
  if (!resumeText) return { jobs: [], skills: [], education: [] };
  return { jobs: [{ text: resumeText }], skills: [], education: [] };
}

/** Safe string extraction from Workers AI responses */
function normalizeAiString(resp: any): string {
  const rawAny = resp?.response ?? resp?.output_text ?? resp?.result ?? resp;
  if (typeof rawAny === "string") return rawAny.trim();
  try { return JSON.stringify(rawAny ?? ""); } catch { return ""; }
}

/** Strip Markdown fences if the model wrapped JSON in ```json ... ``` */
function stripFences(s: string) { return s.replace(/```json|```/g, "").trim(); }

/** Parse JSON with guard */
function tryParseJson(s: string): any {
  try { return JSON.parse(stripFences(s)); } catch { return null; }
}

/** Best-effort JSON parse with one retry using a system hint */
async function aiJsonWithRetry(ai: Env["AI"], model: string, messages: any[], parseHint?: string): Promise<{text: string, json: any}> {
  const t0 = Date.now();
  let resp = await ai.run(model, { messages });
  let text = normalizeAiString(resp);
  let json = tryParseJson(text);

  if (!json && parseHint) {
    const retryMsgs = [
      messages[0],
      { role: "system", content: parseHint },
      ...messages.slice(1),
    ];
    resp = await ai.run(model, { messages: retryMsgs });
    text = normalizeAiString(resp);
    json = tryParseJson(text);
  }

  console.log("[aiJsonWithRetry] ms=", Date.now() - t0, "len=", text.length);
  return { text, json };
}

/* -------------------- AI Steps -------------------- */

async function proposeRoles(ai: Env["AI"], model: string, background: string, resumeJson: unknown):
  Promise<{ candidates: RoleCandidate[]; raw: string }> {
  assertAI(ai);

  const sys = `You propose realistic next-step private-sector roles for a person coming from government work.
Only output JSON: {"candidates":[{id,title,level?,rationale,confidence}]} with confidence 0..1 and rationale <= 40 words.`;
  const usr = `BACKGROUND:
${background}

RESUME_JSON:
${JSON.stringify(resumeJson).slice(0, 4000)}`;

  const parseHint = `IF your last response was not strict JSON, now respond ONLY strict JSON matching:
{"candidates":[{"id":"string","title":"string","level?":"string","rationale":"string","confidence":0.0}]}
No prose.`;

  const { text, json } = await aiJsonWithRetry(ai, model, [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ], parseHint);

  let out: RoleCandidate[] = [];
  const parsed = json || {};
  if (Array.isArray(parsed?.candidates)) {
    out = parsed.candidates.slice(0, 10).map((c: any, i: number) => ({
      id: c?.id ?? `role-${i + 1}`,
      title: String(c?.title ?? "").slice(0, 80),
      level: c?.level ? String(c.level).slice(0, 20) : undefined,
      rationale: String(c?.rationale ?? "").slice(0, 240),
      confidence: Math.max(0, Math.min(1, Number(c?.confidence ?? 0.6))),
    }));
  }

  if (out.length === 0) {
    console.warn("[proposeRoles] empty list -> fallback candidates used");
    out = [
      { id: "fallback-1", title: "Data Analyst", level: "IC2", rationale: "SQL/Python analysis aligns with background.", confidence: 0.65 },
      { id: "fallback-2", title: "Business Intelligence Analyst", rationale: "Dashboarding/KPI work fits.", confidence: 0.6 },
      { id: "fallback-3", title: "Data Engineer", rationale: "ETL/data pipeline experience.", confidence: 0.55 },
    ];
  }

  return { candidates: out, raw: text };
}

// concise AI JD
async function generateShortJD(ai: Env["AI"], model: string, title: string): Promise<string> {
  assertAI(ai);
  const sys = `Write a concise job description (60-120 words) for the given role. No preamble, plain text.`;
  const usr = `ROLE TITLE: ${title}`;
  const r = await ai.run(model, { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  return normalizeAiString(r);
}

// requirements extraction
async function extractRequirements(ai: Env["AI"], model: string, title: string, jd: string):
  Promise<{ must_have: string[]; nice_to_have: string[] }> {
  assertAI(ai);
  const sys = `Extract requirements {must_have[], nice_to_have[]} from the job description.
Return strict JSON with concise skill/tech phrases.`;
  const usr = `TITLE: ${title}

JOB DESCRIPTION:
${jd}`;

  const { text, json } = await aiJsonWithRetry(ai, model, [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ], `If prior response wasn't valid JSON, now output ONLY strict JSON {"must_have":[],"nice_to_have":[]}.`);

  if (json && Array.isArray(json.must_have) && Array.isArray(json.nice_to_have)) return json;
  console.warn("[extractRequirements] bad JSON, returning empty lists. Raw:", (text || "").slice(0, 160));
  return { must_have: [], nice_to_have: [] };
}

// simple demo mapping
async function mapTransferable(_resumeJson: unknown, reqs: { must_have: string[]; nice_to_have: string[] }): Promise<unknown> {
  return {
    mapping: (reqs.must_have ?? []).map((m: string) => ({
      requirement: m,
      matched_skills: [],
      evidence: []
    })),
  };
}

// bullet rewriting
async function rewriteBullets(ai: Env["AI"], model: string, mapping: unknown, title: string): Promise<string[]> {
  assertAI(ai);
  const sys = `Rewrite resume bullets tailored to the role. 3-6 bullets. Strong verbs, quantification, industry phrasing. Return each bullet as a line prefixed with "- ".`;
  const usr = `ROLE: ${title}
MAPPING:
${JSON.stringify(mapping).slice(0, 4000)}`;
  const r = await ai.run(model, { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  const text = normalizeAiString(r);
  return String(text)
    .split(/\r?\n/)
    .map((s: string) => s.replace(/^\s*-\s*/, "").trim())
    .filter((s: string) => s.length > 0)
    .slice(0, 8);
}

async function scoreSkills(_mapping: unknown): Promise<{ skill: string; score: number }[]> {
  return [{ skill: "Data Analysis", score: 72 }, { skill: "SQL", score: 68 }];
}

async function assembleDraft(ai: Env["AI"], model: string, input: {
  bullets: string[]; requirements: any; mapping: any; background?: string; title: string
}): Promise<string> {
  assertAI(ai);
  const sys = `Assemble a role-tailored resume as plain text sections: Summary, Skills, Experience (use provided bullets), Education (placeholder).`;
  const usr = `TITLE: ${input.title}
BACKGROUND: ${input.background ?? ""}
BULLETS: ${JSON.stringify(input.bullets)}
REQUIREMENTS: ${JSON.stringify(input.requirements)}
MAPPING: ${JSON.stringify(input.mapping).slice(0, 2000)}
`;
  const r = await ai.run(model, { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  return normalizeAiString(r);
}
