// Hono Worker entry: role discovery + selection + tailoring demo routes.

import { Hono } from "hono";
import { UserState } from "./UserState";
import type { RoleCandidate, RunData } from "../types/run";

type Env = {
  AI: any;
  USER_STATE: DurableObjectNamespace<UserState>;
};

const app = new Hono<{ Bindings: Env }>();

// /api/health: quick readiness probe.
app.get("/api/health", (c) => c.text("ok"));

/**
 * /api/discover-jobs: run role discovery (normalize → propose roles → short JDs),
 * persist candidates to DO, and return a run ready for selection.
 */
app.post("/api/discover-jobs", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    background?: string; resumeText?: string; runId?: string;
  };

  const uid = "demo-user";
  const stub = c.env.USER_STATE.getByName(uid);

  const runId = body.runId ?? randomId();
  await stub.createRun(runId, { background: body.background, status: "queued" });

  const resumeJson = await normalizeResume(body.resumeText ?? "");
  const { candidates, raw } = await proposeRoles(c.env.AI, body.background ?? "", resumeJson);
  await stub.saveRunPart(runId, { phases: { roleDiscovery: { candidates, debugRaw: raw } } });

//   const { candidates } = await proposeRoles(c.env.AI, body.background ?? "", resumeJson);

  const enriched: RoleCandidate[] = [];
    for (const r of candidates) {
    const jd = await generateShortJD(c.env.AI, r.title).catch(() => undefined);
    enriched.push({ ...r, aiJobDescription: jd });
    }

  await stub.setRoleCandidates(runId, enriched);

  const run = (await stub.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run });
});

app.get("/api/run/:id", async (c) => {
  const runId = c.req.param("id");
  const stub = c.env.USER_STATE.getByName("demo-user"); // TODO: replace with signed uid cookie
  const run = await stub.getRun(runId);
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, run });
});

// /api/history: list recent runs (ids + status)
app.get("/api/history", async (c) => {
  const stub = c.env.USER_STATE.getByName("demo-user");
  const items = await stub.getHistory(20);
  return c.json({ ok: true, items });
});

/**
 * /api/run/:id/roles: fetch the current candidate roles for a run.
 */
app.get("/api/run/:id/roles", async (c) => {
  const stub = c.env.USER_STATE.getByName("demo-user");
  const run = (await stub.getRun(c.req.param("id"))) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  const candidates = run.phases?.roleDiscovery?.candidates ?? [];
  return c.json({ ok: true, candidates, status: run.status });
});

/**
 * /api/run/:id/select-role: store the selected role/JD and run tailoring steps.
 */
app.post("/api/run/:id/select-role", async (c) => {
  const runId = c.req.param("id");
  const stub = c.env.USER_STATE.getByName("demo-user");

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

  const requirements = await extractRequirements(c.env.AI, chosen.title, jd);
  await stub.saveRunPart(runId, { phases: { requirements } });

  const mapping = await mapTransferable(run.phases?.normalize ?? {}, requirements);
  await stub.saveRunPart(runId, { phases: { mapping } });

  const bullets = await rewriteBullets(c.env.AI, mapping, chosen.title);
  await stub.saveRunPart(runId, { phases: { bullets } });

  const scoring = await scoreSkills(mapping);
  await stub.saveRunPart(runId, { phases: { scoring } });

  const draft = await assembleDraft(c.env, { bullets, requirements, mapping, background: run.background, title: chosen.title });
  await stub.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: chosen.title });

  const finalRun = (await stub.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run: finalRun });
});

// /api/ai-test: quick model smoke test route.
app.get("/api/ai-test", async (c) => {
  const model ='@cf/meta/llama-3.1-8b-instruct';
  const messages = [
    { role: 'system', content: 'You are a philosopher, that only responds in two sentence riddles.' },
    { role: 'user', content: 'What is this application?' }
  ];
  try {
    const resp = await c.env.AI.run(model, { messages });
    const text = resp?.response ?? resp?.output_text ?? String(resp ?? '');
    return c.json({ ok: true, model, text });
  } catch {
    return c.json({ ok: false, error: 'issue with model' }, 500);
  }
});

export default app;
export { UserState };

/* -------------------- Step Helpers (one-liners above each) -------------------- */
// assertAI: ensure the Workers AI binding is present and callable.
function assertAI(ai: Env["AI"]) {
  if (!ai || typeof (ai as any).run !== "function") {
    throw new Error(
      'Workers AI binding missing. Ensure wrangler.json has { "ai": { "binding": "AI" } } and call helpers with c.env.AI.'
    );
  }
}

// randomId: generate a compact hex id.
function randomId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

// normalizeResume: convert raw resume text into a minimal JSON structure (demo).
async function normalizeResume(resumeText: string): Promise<unknown> {
  if (!resumeText) return { jobs: [], skills: [], education: [] };
  return { jobs: [{ text: resumeText }], skills: [], education: [] };
}

// proposeRoles: ask the LLM for role candidates; returns normalized list.
// async function proposeRoles(ai: Env["AI"], background: string, resumeJson: unknown): Promise<RoleCandidate[]> {
//   assertAI(ai);
//   const sys = `You propose realistic next-step private-sector roles for a person coming from government work.
// Return 6-10 candidates with {id,title,level?,rationale,confidence}.
// Respond as strict JSON: {"candidates":[...]} with confidence in 0..1 and concise rationales (<=40 words).`;
//   const usr = `BACKGROUND:
// ${background}

// RESUME_JSON:
// ${JSON.stringify(resumeJson).slice(0, 4000)}`;

//   const r = await ai.run("@cf/meta/llama-3.1-8b-instruct", { messages: [
//     { role: "system", content: sys },
//     { role: "user",  content: usr }
//   ]});

//   const txt = r?.response ?? r?.output_text ?? "{}";
//   let parsed: any;
//   try { parsed = JSON.parse(safeJson(txt)); } catch { parsed = { candidates: [] }; }

//   return (parsed.candidates ?? []).slice(0, 10).map((c: any, i: number) => ({
//     id: c?.id ?? `role-${i + 1}`,
//     title: String(c?.title ?? "").slice(0, 80),
//     level: c?.level ? String(c.level).slice(0, 20) : undefined,
//     rationale: String(c?.rationale ?? "").slice(0, 240),
//     confidence: Math.max(0, Math.min(1, Number(c?.confidence ?? 0.6))),
//   }));
// }

async function proposeRoles(ai: Env["AI"], background: string, resumeJson: unknown): Promise<{ candidates: RoleCandidate[]; raw: string }> {
  assertAI(ai);
  const sys = `You propose realistic next-step private-sector roles for a person coming from government work.
Only output JSON: {"candidates":[{id,title,level?,rationale,confidence}]} with confidence 0..1 and rationale <= 40 words.`;
  const usr = `BACKGROUND:
${background}

RESUME_JSON:
${JSON.stringify(resumeJson).slice(0, 4000)}`;

  const t0 = Date.now();
  const r = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  const raw = (r?.response ?? r?.output_text ?? "").trim();
  console.log("[proposeRoles] raw len:", raw.length, "timeMs:", Date.now() - t0);

  let parsed: any;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { parsed = { candidates: [] }; }

  let out: RoleCandidate[] = (parsed.candidates ?? []).slice(0, 10).map((c: any, i: number) => ({
    id: c?.id ?? `role-${i + 1}`,
    title: String(c?.title ?? "").slice(0, 80),
    level: c?.level ? String(c.level).slice(0, 20) : undefined,
    rationale: String(c?.rationale ?? "").slice(0, 240),
    confidence: Math.max(0, Math.min(1, Number(c?.confidence ?? 0.6))),
  }));
  console.log("[proposeRoles] parsed candidates:", out.length);

  // Fallback if empty
  if (out.length === 0) {
    console.warn("[proposeRoles] empty list -> fallback candidates used");
    out = [
      { id: "fallback-1", title: "Data Analyst", level: "IC2", rationale: "SQL/Python analysis aligns with background.", confidence: 0.65 },
      { id: "fallback-2", title: "Business Intelligence Analyst", rationale: "Dashboarding/KPI work fits.", confidence: 0.6 },
      { id: "fallback-3", title: "Data Engineer", rationale: "ETL/data pipeline experience.", confidence: 0.55 },
    ];
  }
  return { candidates: out, raw };
}

// generateShortJD: produce a concise 60–120 word AI job description for a role.
async function generateShortJD(ai: Env["AI"], title: string): Promise<string> {
  assertAI(ai);
  const sys = `Write a concise job description (60-120 words) for the given role. No preamble, plain text.`;
  const usr = `ROLE TITLE: ${title}`;
  const r = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  return (r?.response ?? r?.output_text ?? "").trim();
}

// extractRequirements: parse a JD into must-have / nice-to-have arrays.
async function extractRequirements(ai: Env["AI"], title: string, jd: string): Promise<{ must_have: string[]; nice_to_have: string[] }> {
  assertAI(ai);
  const sys = `Extract requirements {must_have[], nice_to_have[]} from the job description.
Return strict JSON with concise skill/tech phrases.`;
  const usr = `TITLE: ${title}

JOB DESCRIPTION:
${jd}`;
  const r = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  try { return JSON.parse(safeJson(r?.response ?? r?.output_text ?? "{}")); }
  catch { return { must_have: [], nice_to_have: [] }; }
}

// mapTransferable: create requirement-to-evidence mappings from resume JSON (demo).
async function mapTransferable(_resumeJson: unknown, reqs: { must_have: string[]; nice_to_have: string[] }): Promise<unknown> {
  // demo mapping – no AI needed here; underscore removed to avoid unused warnings
  return {
    mapping: (reqs.must_have ?? []).map((m: string) => ({
      requirement: m,
      matched_skills: [],
      evidence: []
    })),
  };
}

// rewriteBullets: rewrite tailored resume bullets using the mapping context.
async function rewriteBullets(ai: Env["AI"], mapping: unknown, title: string): Promise<string[]> {
  assertAI(ai);
  const sys = `Rewrite resume bullets tailored to the role. 3-6 bullets. Strong verbs, quantification, industry phrasing. Return each bullet as a line prefixed with "- ".`;
  const usr = `ROLE: ${title}
MAPPING:
${JSON.stringify(mapping).slice(0, 4000)}`;
  const r = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  const text = (r?.response ?? r?.output_text ?? "").trim();
  return String(text)
    .split(/\r?\n/)
    .map((s: string) => s.replace(/^\s*-\s*/, "").trim())
    .filter((s: string) => s.length > 0)
    .slice(0, 8);
}

// scoreSkills: assign rough numeric scores to core skills (placeholder).
async function scoreSkills(_mapping: unknown): Promise<{ skill: string; score: number }[]> {
  // no AI needed here; keep simple placeholder scoring
  return [{ skill: "Data Analysis", score: 72 }, { skill: "SQL", score: 68 }];
}

// assembleDraft: build a plaintext resume from bullets/requirements/mapping.
async function assembleDraft(ai: Env["AI"], input: { bullets: string[]; requirements: any; mapping: any; background?: string; title: string }): Promise<string> {
  assertAI(ai);
  const sys = `Assemble a role-tailored resume as plain text sections: Summary, Skills, Experience (use provided bullets), Education (placeholder).`;
  const usr = `TITLE: ${input.title}
BACKGROUND: ${input.background ?? ""}
BULLETS: ${JSON.stringify(input.bullets)}
REQUIREMENTS: ${JSON.stringify(input.requirements)}
MAPPING: ${JSON.stringify(input.mapping).slice(0, 2000)}
`;
  const r = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [
    { role: "system", content: sys },
    { role: "user",  content: usr }
  ]});
  return (r?.response ?? r?.output_text ?? "").trim();
}

// safeJson: strip markdown fences from a JSON-ish string before parsing.
function safeJson(s: string) { return s.replace(/```json|```/g, "").trim(); }