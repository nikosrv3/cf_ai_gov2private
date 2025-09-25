// src/worker/index.ts
// Hono Worker entry: role discovery + selection + tailoring demo routes.
// Uses env.MODEL (wrangler.json "vars") for all AI calls.
// Signed anonymous uid via APP_SECRET (HMAC) with cookie middleware.
export { UserStateSql } from "./UserStateSql";
import { Hono } from "hono";
import type { UserStateSql } from "./UserStateSql";
import { getUserStateClient } from "./userStateClient";
import { toChatTurns, type ChatTurn, type RoleCandidate, type RunData } from "../types/run";
import { ensureUidFromCookieHeader } from "./cookies";

/* -------------------- Bindings -------------------- */
type Env = {
  AI: any;
  USER_STATE_SQL: DurableObjectNamespace<UserStateSql>;
  MODEL: string;
  APP_SECRET: string;
};

const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

/* -------------------- UID Cookie Middleware -------------------- */
app.use("*", async (c, next) => {
  const secret = c.env.APP_SECRET;
  if (!secret) {
    return c.json({ ok: false, error: "server_misconfigured: missing APP_SECRET" }, 500);
  }

  const cookieHeader = c.req.header("Cookie");
  const { uid, setCookies } = await ensureUidFromCookieHeader(secret, cookieHeader);

  for (const sc of setCookies) c.header("Set-Cookie", sc, { append: true });

  c.set("uid", uid);
  await next();
});

/* -------------------- Health -------------------- */
app.get("/api/health", (c) => c.text("ok"));

/* -------------------- Role Discovery -------------------- */
app.post("/api/discover-jobs", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    background?: string; resumeText?: string; runId?: string;
  };

  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const runId = body.runId ?? randomId();
  await user.createRun(runId, { background: body.background, status: "queued" });

  // NEW: AI-backed normalization (de-identified few-shot), persisted to phases.normalize
  const resumeJson = await normalizeResume(c.env.AI, c.env.MODEL, body.resumeText ?? "", body.background ?? "");
  await user.saveRunPart(runId, { phases: { normalize: resumeJson } });

  // Propose roles (safe JSON, centralized model)
  const { candidates, raw } = await proposeRoles(c.env.AI, c.env.MODEL, body.background ?? "", resumeJson);
  await user.saveRunPart(runId, { phases: { roleDiscovery: { candidates, debugRaw: raw } } });

  // Enrich roles with short AI JDs (best-effort)
  const enriched: RoleCandidate[] = [];
  for (const r of candidates) {
    const jd = await generateShortJD(c.env.AI, c.env.MODEL, r.title).catch(() => undefined);
    enriched.push({ ...r, id: String(r.id), aiJobDescription: jd });
  }

  await user.setRoleCandidates(runId, enriched);

  const run = (await user.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run });
});

/* -------------------- Read endpoints -------------------- */
app.get("/api/run/:id", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);
  const run = await user.getRun(runId);
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, run });
});

app.get("/api/history", async (c) => {
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);
  const items = await user.getHistory(20);
  return c.json({ ok: true, items });
});

/* -------------------- Roles & Tailoring -------------------- */
app.get("/api/run/:id/roles", async (c) => {
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);
  const run = (await user.getRun(c.req.param("id"))) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  const candidates = run.phases?.roleDiscovery?.candidates ?? [];
  return c.json({ ok: true, candidates, status: run.status });
});

app.post("/api/run/:id/select-role", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const body = (await c.req.json().catch(() => ({}))) as {
    roleId: string;
    jobDescription?: string;
    useAiGenerated?: boolean;
  };

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  const candidates = run.phases?.roleDiscovery?.candidates ?? [];
  const chosen = candidates.find((r) => String(r.id) === String(body.roleId)); // <— compare as strings
  if (!chosen) return c.json({ ok: false, error: "invalid_role" }, 400);

  let jd = body.jobDescription?.trim();
  let source: "user_pasted" | "llm_generated" = "user_pasted";
  if (!jd && body.useAiGenerated) { jd = chosen.aiJobDescription ?? ""; source = "llm_generated"; }
  if (!jd) return c.json({ ok: false, error: "missing_job_description" }, 400);

  await user.setSelectedRole(runId, chosen.id, { jobDescription: jd, source });

  const requirements = await extractRequirements(c.env.AI, c.env.MODEL, chosen.title, jd);
  await user.saveRunPart(runId, { phases: { requirements } });

  const mapping = await mapTransferable(run.phases?.normalize ?? {}, requirements);
  await user.saveRunPart(runId, { phases: { mapping } });

  const bullets = await rewriteBullets(c.env.AI, c.env.MODEL, mapping, chosen.title);
  await user.saveRunPart(runId, { phases: { bullets } });

  const scoring = await scoreSkills(mapping);
  await user.saveRunPart(runId, { phases: { scoring } });

  const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
    bullets, requirements, mapping, background: run.background, title: chosen.title
  });
  await user.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: chosen.title });

  const finalRun = (await user.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run: finalRun });
});

// chatbot endpoints --------------------------------------------------

const BULLET_STYLE_INSTRUCTIONS: Record<
  "quant" | "short" | "lead" | "ats" | "dejargon",
  string
> = {
  quant:
    "Rewrite as a single resume bullet. Lead with a strong verb, add realistic quantification (use '~' for estimates), keep meaning, no fluff.",
  short:
    "Rewrite as a single concise bullet (<22 words), strong verb, preserve impact, remove filler, no trailing period.",
  lead:
    "Rewrite to emphasize leadership/ownership and cross-functional impact. Single bullet, outcome first, then how.",
  ats:
    "Rewrite to naturally include relevant industry keywords (no stuffing). Single bullet, scannable.",
  dejargon:
    "Rewrite in plain industry terms (remove government jargon). Single bullet, keep technical accuracy."
};

// Batch-transform bullets: give model a numbered list; expect a JSON array back.
async function transformBulletsBatch(
  ai: Env["AI"],
  model: string,
  bullets: string[],
  instruction: string,
  indexes: number[]
): Promise<string[]> {
  const list = indexes.map((i, k) => `${k + 1}. ${bullets[i].slice(0, 400)}`).join("\n");
  const sys = `You rewrite resume bullets according to an instruction.
Return ONLY strict JSON: {"bullets":["rewritten bullet 1","rewritten bullet 2",...]} with the same count as input. No markdown.`;
  const usr = `INSTRUCTION: ${instruction}
INPUT BULLETS (${indexes.length}):
${list}`;

  const { text, json } = await aiJsonWithRetry(ai, model, [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], `If your prior reply wasn't valid JSON, respond now ONLY with: {"bullets":["..."]}`);

  const out = (json?.bullets ?? []) as string[];
  if (!Array.isArray(out) || out.length !== indexes.length) {
    // Fallback: naive line split
    const lines = String(text).split(/\r?\n/).map(s => s.replace(/^[-–•\d.]+\s*/, "").trim()).filter(Boolean);
    return indexes.map((_, k) => (lines[k] ?? bullets[indexes[k]])).map(s =>
      s.replace(/^[-–•]\s*/, "").replace(/^["“”']|["“”']$/g, "").trim().slice(0, 300)
    );
  }
  return out.map(s => String(s).replace(/^[-–•]\s*/, "").replace(/^["“”']|["“”']$/g, "").trim().slice(0, 300));
}

app.post("/api/chat", async (c) => {
  const uid = c.get("uid"); // from cookie middleware
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  type ChatBody = { runId?: string; message?: string };
  const body = (await c.req.json().catch(() => ({}))) as ChatBody;

  const runId = body.runId?.trim();
  const userMsg = (body.message ?? "").trim();
  if (!userMsg) return c.json({ ok: false, error: "empty_message" }, 400);

  const run = runId ? await user.getRun(runId) : null;
  // Build a compact run context (avoid token bloat)
  const ctx: string[] = [];
  if (run) {
    ctx.push(
      `RUN STATUS: ${run.status}`,
      run.targetRole ? `TARGET ROLE: ${run.targetRole}` : "",
      run.phases?.requirements ? `REQS: ${JSON.stringify(run.phases.requirements).slice(0, 600)}` : "",
      run.phases?.bullets ? `BULLETS: ${JSON.stringify(run.phases.bullets).slice(0, 600)}` : "",
      run.phases?.draft ? `DRAFT: ${String(run.phases.draft).slice(0, 600)}` : ""
    );
  } else {
    ctx.push("RUN: none");
  }

  // Lightweight intent handling (optional; keep simple)
  const lower = userMsg.toLowerCase();
  const mExplain = lower.match(/\bexplain role (\d+)\b/);
  const mSelect = lower.match(/\bselect role (\d+)\b/);

  // Helper to reply and persist chat
  async function reply(text: string) {
    if (runId) {
      const rawHistory = (run?.phases as any)?.chat as unknown;
      const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
      const newChat: ChatTurn[] = [
        ...prior,
        { role: "user" as const, content: userMsg },
        { role: "assistant" as const, content: text }
      ];
      await user.saveRunPart(runId, { phases: { chat: newChat } });
    }
    return c.json({ ok: true, reply: text });
  }

  // Intent: explain role N
  if (mExplain && run?.phases?.roleDiscovery?.candidates) {
    const idx = Number(mExplain[1]) - 1;
    const cand = run.phases.roleDiscovery.candidates[idx];
    if (!cand) return reply(`I can't find role ${mExplain[1]}.`);
    const expl = [
      `**${cand.title}** — why it fits:`,
      `• ${cand.rationale}`,
      `• Confidence: ${(cand.confidence * 100).toFixed(0)}%`,
      cand.aiJobDescription ? `• What you'd do: ${cand.aiJobDescription.slice(0, 240)}…` : ""
    ].filter(Boolean).join("\n");
    return reply(expl);
  }

  // Intent: select role N
  if (mSelect && runId && run?.phases?.roleDiscovery?.candidates) {
    const idx = Number(mSelect[1]) - 1;
    const cand = run.phases.roleDiscovery.candidates[idx];
    if (!cand) return reply(`I can't find role ${mSelect[1]}.`);

    try {
      await user.setSelectedRole(runId, String(cand.id), {
        jobDescription: cand.aiJobDescription ?? undefined,
        source: cand.aiJobDescription ? "llm_generated" : "user_pasted"
      });

      const jd = cand.aiJobDescription ?? (run?.jobDescription ?? "");
      const requirements = await extractRequirements(c.env.AI, c.env.MODEL, cand.title, jd);
      await user.saveRunPart(runId, { phases: { requirements } });

      const mapping = await mapTransferable(run?.phases?.normalize ?? {}, requirements);
      await user.saveRunPart(runId, { phases: { mapping } });

      const bullets = await rewriteBullets(c.env.AI, c.env.MODEL, mapping, cand.title);
      await user.saveRunPart(runId, { phases: { bullets } });

      const scoring = await scoreSkills(mapping);
      await user.saveRunPart(runId, { phases: { scoring } });

      const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
        bullets, requirements, mapping, background: run?.background, title: cand.title
      });
      await user.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: cand.title });

      return reply(`Selected **${cand.title}** and tailored your resume. Check the Draft tab.`);
    } catch (err: any) {
      console.error("[chat select-role] error:", err?.stack || err?.message || err);
      return reply(`I hit an error while tailoring: ${String(err?.message ?? err)}.`);
    }
  }

  if (run && Array.isArray(run.phases?.bullets) && run.phases!.bullets!.length > 0) {
    const bullets = run.phases!.bullets as string[];
    const msgLower = userMsg.toLowerCase();
    const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

    // 1) Try LLM intent parser first
    let intent: BulletEditIntent | null = null;
    if (USE_LLM_PARSER) {
      try {
        const trimmedBullets = bullets.slice(0, 12).map(b => b.slice(0, 160));
        intent = await parseBulletEditIntentLLM(c.env.AI, model, trimmedBullets, userMsg);
      } catch (e: any) {
        console.error("[chat bullet-intent LLM] error:", e?.message || e);
      }
    }

    // 2) Fallback heuristics
    let style: BulletStyle | null = null;
    let targetIdx: number[] | null = null;
    let applyAll = false;

    if (intent && intent.intent === "bullet_transform") {
      style = intent.style ?? detectStyleNL(msgLower);
      targetIdx = (intent.apply === "all" || (intent.indexes.length === 0)) ? null : intent.indexes;
      applyAll = intent.apply === "all";
    } else {
      style = detectStyleNL(msgLower);
      targetIdx = parseBulletIndexesNL(msgLower, bullets.length);
      if (!targetIdx) {
        const snip = parseQuotedSnippet(userMsg);
        if (snip) targetIdx = findBulletBySnippetFuzzy(bullets, snip, { threshold: 0.64, maxMatches: 2, minFloor: 0.52 });
      }
      applyAll = !targetIdx;
    }

    if (!style) {
      // fall through to default Q&A
    } else {
      const instruction = BULLET_STYLE_INSTRUCTIONS[style];
      const indices = applyAll ? bullets.map((_, i) => i) : (targetIdx ?? []);
      if (indices.length === 0) {
        return reply(`Tell me which bullet(s) to edit (e.g., "shorten bullet 2" or "ATS all bullets").`);
      }

      const hist = ((run.phases as any)?.bullets_history ?? []) as string[][];
      const bullets_history = [...hist.slice(-2), bullets];

      let rewritten: string[] = [];
      try {
        rewritten = await transformBulletsBatch(c.env.AI, model, bullets, instruction, indices);
      } catch (e: any) {
        console.error("[chat bullet-transform] batch fail:", e?.message || e);
        return reply(`I couldn't rewrite those bullets just now. Please try again.`);
      }

      const out = bullets.slice();
      indices.forEach((i, k) => { out[i] = rewritten[k] || bullets[i]; });
      await user.saveRunPart(run.id, { phases: { bullets: out, bullets_history } });

      const where = applyAll ? "all bullets" : `bullet${indices.length>1?"s":""} ${indices.map(i=>i+1).join(", ")}`;
      return reply(`Applied **${style}** to ${where}.`);
    }
  }

  // Default: LLM Q&A grounded to run
  const system = [
    `You are a resume-transformation copilot for government-to-private-sector transitions.`,
    `Be concise and actionable; suggest bullet rewrites when helpful.`,
    `Context:`,
    ctx.filter(Boolean).join("\n")
  ].join("\n");

  const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  try {
    const resp = await c.env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg }
      ]
    });
    const text = (resp?.response ?? resp?.output_text ?? "").toString().trim();
    return reply(text || "I didn’t generate a response.");
  } catch (e: any) {
    console.error("[/api/chat] error:", e?.message || e);
    return c.json({ ok: false, error: "ai_error" }, 500);
  }
});

// chatbot endpoints --------------------------------------------------
// bullet edit endpoints --------------------------------------------------

app.post("/api/run/:id/bullets/transform", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  type Body = { style?: keyof typeof BULLET_STYLE_INSTRUCTIONS; indexes?: number[] };
  const body = (await c.req.json().catch(() => ({}))) as Body;

  const style = body.style;
  if (!style || !BULLET_STYLE_INSTRUCTIONS[style]) {
    return c.json({ ok: false, error: "invalid_style" }, 400);
  }

  const run= (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 400);

  const bullets = (run.phases?.bullets ?? []) as string[];
  if (!Array.isArray(bullets) || bullets.length === 0) {
    return c.json({ ok: false, error: "no_bullets" }, 400);
  }

  const allIndex = bullets.map((_, i) => i);
  const targetIndex = Array.isArray(body.indexes) && body.indexes.length
    ? [...new Set(body.indexes.filter(i => Number.isInteger(i) && i >= 0 && i < bullets.length))]
    : allIndex;

  if (targetIndex.length === 0) return c.json({ ok: false, error: "no_valid_indices" }, 400);

  const history = ((run.phases as any)?.bullets_history ?? []) as string[][];
  const bullets_history = [...history.slice(-2), bullets];

  const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const instruction = BULLET_STYLE_INSTRUCTIONS[style];

  let rewritten: string[] = [];
  try {
    rewritten = await transformBulletsBatch(c.env.AI, model, bullets, instruction, targetIndex);
  } catch (e: any) {
    console.error("[/bullets/transform] batch failed:", e?.message || e);
    return c.json({ ok: false, error: "ai_error" }, 500);
  }
  const out = bullets.slice();
  targetIndex.forEach((i, k) => { out[i] = rewritten[k] || bullets[i]; });

  await user.saveRunPart(runId, { phases: { bullets: out, bullets_history } });

  return c.json({
    ok: true,
    runId,
    style,
    updated: targetIndex.length,
    indexes: targetIndex,
    bullets: out
  });
});

// bullet edit endpoints --------------------------------------------------

// ----------------------------------------
// ---- NL parsing for bullet transforms via chat ------------------------------

// =============================================================================
// LLM-based intent parsing for bullet edits (chat → style + targets)
// =============================================================================

// Feature flag (leave true for MVP; you can gate with an env var later)
const USE_LLM_PARSER = true as const;

// Style options must match your transform route keys
type BulletStyle = "short" | "quant" | "lead" | "ats" | "dejargon";

type BulletEditIntent =
  | { intent: "bullet_transform"; style: BulletStyle | null; indexes: number[]; apply: "all" | "some"; note?: string | null }
  | { intent: "none" };

function clampIndexes(indexes: unknown, n: number): number[] {
  const list = Array.isArray(indexes) ? indexes : [];
  const out = new Set<number>();
  for (const v of list) {
    const i = Number(v);
    if (Number.isInteger(i) && i >= 0 && i < n) out.add(i);
  }
  return [...out].sort((a,b)=>a-b);
}

/**
 * Ask the LLM to parse the user's message into a JSON intent.
 * - bullets: the current bullets for context (numbered), trimmed & capped to reduce tokens
 * - message: the raw user text
 * Returns a BulletEditIntent or null if parsing failed.
 */
async function parseBulletEditIntentLLM(
  ai: Env["AI"],
  model: string,
  bullets: string[],
  message: string
): Promise<BulletEditIntent | null> {
  // Cap bullets & length to control tokens
  const maxBullets = 12;
  const maxLen = 160;
  const trimmed = bullets.slice(0, maxBullets).map((b, i) => `${i+1}. ${String(b).slice(0, maxLen)}`);

  const system = `You are an intent parser for a resume-bullet editor.
Return ONLY strict JSON with no prose and no markdown fences.
Schema:
{"intent":"bullet_transform"|"none","style":"short"|"quant"|"lead"|"ats"|"dejargon"|null,"indexes":[0..] (0-based),"apply":"all"|"some","note":string|null}
Rules:
- If user asks to edit bullets, intent="bullet_transform".
- Derive "style" from wording, or null if unclear.
- If the user specifies exact bullets (numbers, ordinals, ranges, or quoted snippets), "indexes" should reflect those (0-based).
- If the user says "all" or provides no clear indices, set apply="all" and indexes=[].
- Never return invalid indexes (must be 0..N-1).
- If not about bullets, return {"intent":"none"} only.`;

  const user = `CURRENT BULLETS (0-based in output):
${trimmed.join("\n")}

USER MESSAGE:
${message}

Return ONLY JSON. Example valid replies:
{"intent":"bullet_transform","style":"short","indexes":[0,2],"apply":"some","note":null}
{"intent":"bullet_transform","style":"ats","indexes":[],"apply":"all","note":"user said 'all bullets'"}
{"intent":"none"}`;

  const { json } = await aiJsonWithRetry(ai, model, [
    { role: "system", content: system },
    { role: "user", content: user }
  ], `If your prior reply wasn't valid JSON, now output ONLY strict JSON matching the schema.`);

  // Basic structural guard
  const intent = json as BulletEditIntent | null;
  if (!intent || typeof intent !== "object" || typeof (intent as any).intent !== "string") return null;

  // Normalize / clamp
  if (intent.intent === "bullet_transform") {
    const n = bullets.length;
    const clamped = clampIndexes((intent as any).indexes, n);
    const styleRaw = (intent as any).style;
    const style = (styleRaw === "short" || styleRaw === "quant" || styleRaw === "lead" || styleRaw === "ats" || styleRaw === "dejargon")
      ? styleRaw
      : null;
    const apply = (intent as any).apply === "all" ? "all" : (clamped.length > 0 ? "some" : "all");
    return { intent: "bullet_transform", style, indexes: clamped, apply, note: (intent as any).note ?? null };
  }

  return { intent: "none" };
}


// ----------- fallback
const STYLE_ALIASES: Record<string, "short"|"quant"|"lead"|"ats"|"dejargon"> = {
  short: "short", shorten: "short", brief: "short", concise: "short", punchier: "short", tighter: "short",
  quant: "quant", quantify: "quant", numbers: "quant", metrics: "quant",
  lead: "lead", leadership: "lead", owner: "lead", ownership: "lead", executive: "lead",
  ats: "ats", keyword: "ats", keywords: "ats",
  dejargon: "dejargon", "de-jargon": "dejargon", "de-jargonify": "dejargon", simplify: "dejargon", "plain english": "dejargon"
};

function detectStyleNL(msgLower: string): ("short"|"quant"|"lead"|"ats"|"dejargon") | null {
  for (const [k, v] of Object.entries(STYLE_ALIASES)) if (msgLower.includes(k)) return v;
  if (/\b(short|concise|tight|punchy)\b/.test(msgLower)) return "short";
  if (/\b(quant|metric|number|percent|kpi)\b/.test(msgLower)) return "quant";
  if (/\b(leader|leadership|own|executive)\b/.test(msgLower)) return "lead";
  if (/\b(ats|keyword)\b/.test(msgLower)) return "ats";
  if (/\b(jargon|plain|simplif(y|ied))\b/.test(msgLower)) return "dejargon";
  return null;
}

function parseBulletIndexesNL(msgLower: string, n: number): number[] | null {
  const out = new Set<number>();

  // 1-3 / 2–4 ranges
  for (const m of msgLower.matchAll(/\bbullets?\s*(\d+)\s*[-–]\s*(\d+)\b/g)) {
    const a = Math.max(1, parseInt(m[1], 10)), b = Math.min(n, parseInt(m[2], 10));
    for (let x = Math.min(a,b); x <= Math.max(a,b); x++) out.add(x-1);
  }
  // bullet 2 / #3
  for (const m of msgLower.matchAll(/\bbullet(?:\s*#)?\s*(\d+)\b/g)) {
    const v = parseInt(m[1], 10); if (v>=1 && v<=n) out.add(v-1);
  }
  // first/second/third/last
  if (/\bfirst\b/.test(msgLower) && n>0) out.add(0);
  if (/\bsecond\b/.test(msgLower) && n>1) out.add(1);
  if (/\bthird\b/.test(msgLower) && n>2) out.add(2);
  if (/\blast\b/.test(msgLower) && n>0) out.add(n-1);

  // first two/three
  const firstN = msgLower.match(/\bfirst\s+(two|three|four|five|2|3|4|5)\b/);
  if (firstN) {
    const map: Record<string, number> = { two:2, three:3, four:4, five:5 };
    const v = Number.isFinite(Number(firstN[1])) ? Number(firstN[1]) : (map[firstN[1]] ?? 0);
    for (let i=0; i<Math.min(v,n); i++) out.add(i);
  }
  // last two/three
  const lastN = msgLower.match(/\blast\s+(two|three|four|five|2|3|4|5)\b/);
  if (lastN) {
    const map: Record<string, number> = { two:2, three:3, four:4, five:5 };
    const v = Number.isFinite(Number(lastN[1])) ? Number(lastN[1]) : (map[lastN[1]] ?? 0);
    for (let i=Math.max(0,n-v); i<n; i++) out.add(i);
  }

  const arr = [...out].filter(i=>i>=0 && i<n).sort((a,b)=>a-b);
  return arr.length ? arr : null;
}

// Small fuzzy matcher (Levenshtein-based) for quoted snippet targeting
function normText(s: string) { return s.toLowerCase().replace(/\s+/g, " ").trim(); }
function lev(a: string, b: string): number {
  const m=a.length, n=b.length; if (!m) return n; if (!n) return m;
  const prev = new Array(n+1); for (let j=0;j<=n;j++) prev[j]=j;
  for (let i=1;i<=m;i++){ const cur=[i]; for(let j=1;j<=n;j++){
    const cost = a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;
    cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
  } for(let j=0;j<=n;j++) prev[j]=cur[j]; }
  return prev[n];
}
function sim(a: string,b:string){ a=normText(a); b=normText(b); if(!a||!b) return 0; const d=lev(a,b); const L=Math.max(a.length,b.length); return L?1-d/L:0; }

function parseQuotedSnippet(msg: string): string | null {
  const m = msg.match(/["“](.+?)["”]/);
  return m ? m[1].slice(0, 160) : null;
}

function findBulletBySnippetFuzzy(
  bullets: string[],
  snippet: string,
  opts?: { threshold?: number; maxMatches?: number; minFloor?: number }
): number[] | null {
  const th = opts?.threshold ?? 0.64, cap = opts?.maxMatches ?? 2, floor = opts?.minFloor ?? 0.52;
  const scores = bullets.map((b,i)=>({i,s:sim(snippet,b)})).sort((a,b)=>b.s-a.s);
  const above = scores.filter(x=>x.s>=th).slice(0,cap).map(x=>x.i);
  if (above.length) return above;
  return scores[0]?.s >= floor ? [scores[0].i] : null;
}

// ---------------------------------------

// AI smoke test
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

/**
 * AI-backed resume/CV normalizer (de-identified few-shot).
 * Returns a superset for forward use AND a `jobs` mirror for back-compat.
 */
async function normalizeResume(
  ai: Env["AI"],
  model: string,
  resumeText: string,
  backgroundText?: string
): Promise<{
  name: string | null;
  contact: { email: string | null; phone: string | null; location: string | null; links: string[] };
  education: Array<{ degree: string; field: string | null; institution: string; year: string | null }>;
  skills: string[];
  experience: Array<{
    title: string; org: string; location: string | null; start: string | null; end: string | null;
    bullets: string[]; skills: string[]
  }>;
  jobs: Array<{ title?: string; org?: string; start?: string | null; end?: string | null; location?: string | null; bullets?: string[]; text?: string }>;
}> {
  const input = String(resumeText || "").slice(0, 12000);
  const bg    = String(backgroundText || "").slice(0, 4000);

  if (!input && !bg) {
    return {
      name: null, contact: { email: null, phone: null, location: null, links: [] },
      education: [], skills: [], experience: [], jobs: []
    };
  }

  const system = [
    "You extract resume/CV information into STRICT JSON. Output ONLY JSON (no prose, no markdown).",
    "Schema:",
    '{"name":"string|null","contact":{"email":"string|null","phone":"string|null","location":"string|null","links":["string"]},"education":[{"degree":"string","field":"string|null","institution":"string","year":"string|null"}],"skills":["string"],"experience":[{"title":"string","org":"string","location":"string|null","start":"string|null","end":"string|null","bullets":["string"],"skills":["string"]}]}',
    "Rules:",
    "- Always include all keys shown above.",
    "- Use concise bullets (<= 30 words each).",
    "- Normalize skills to lowercase single terms/short phrases; dedupe.",
    "- If data is missing, use null or empty arrays; do not invent data.",
    "- Prefer ISO-like ranges (e.g., '2019-06') or year-only; if unclear, return null.",
    "- Contact links: include URLs (LinkedIn/portfolio) if present; else empty array."
  ].join("\n");

  // De-identified few-shot (no real names or orgs)
  const fewShotUser1 = [
    "BACKGROUND:",
    "Public-sector researcher transitioning to industry data roles; focus on analytics and evaluation.",
    "RESUME:",
    "Education: Ph.D. in Behavioral Science (2016); B.S. in Marketing (1989).",
    "Experience: Senior Researcher (2022–present) – led adolescent health projects; Policy Analyst (2017–2018).",
    "Skills: sql, data analysis, program evaluation, dashboards."
  ].join("\n");

  const fewShotAssistant1 = JSON.stringify({
    name: "Candidate Name",
    contact: { email: null, phone: null, location: "Atlanta, GA", links: [] },
    education: [
      { degree: "Ph.D.", field: "Behavioral Science", institution: "University", year: "2016" },
      { degree: "B.S.", field: "Marketing", institution: "University", year: "1989" }
    ],
    skills: ["sql","data analysis","program evaluation","dashboards"],
    experience: [
      { title: "Senior Researcher", org: "Public Health Agency", location: "Atlanta, GA", start: "2022", end: null,
        bullets: ["led adolescent health research and evaluation projects","delivered insights to inform policy"],
        skills: ["public health","evaluation","data analysis"]},
      { title: "Policy Analyst", org: "Education Nonprofit", location: "Atlanta, GA", start: "2017", end: "2018",
        bullets: ["managed policy initiatives and multi-sector partnerships"], skills: ["partnerships","policy analysis"]}
    ]
  }, null, 0);

  const user = [
    "BACKGROUND:",
    bg || "(none)",
    "",
    "RESUME:",
    input
  ].join("\n");

  const { json, text } = await aiJsonWithRetry(ai, model, [
    { role: "system",    content: system },
    { role: "user",      content: fewShotUser1 },
    { role: "assistant", content: fewShotAssistant1 },
    { role: "user",      content: user }
  ], 'If your prior reply was not valid JSON, respond now with ONLY the strict JSON schema filled (no markdown).');

  if (!json) {
    console.warn("[normalizeResume] AI parse returned no JSON. AI text preview:", String(text ?? "").slice(0, ));
  }
  // Defensive shaping with back-compat mirror
  const j = json && typeof json === "object" ? json : {};
  const name: string | null = (j?.name ?? null) as (string | null);

  const contact = {
    email: j?.contact?.email ?? null,
    phone: j?.contact?.phone ?? null,
    location: j?.contact?.location ?? null,
    links: Array.isArray(j?.contact?.links) ? (j.contact.links as any[]).slice(0, 10).map((x) => String(x).slice(0, 200)) : []
  };

  const education = Array.isArray(j?.education) ? (j.education as any[]).slice(0, 20).map((e) => ({
    degree: String(e?.degree ?? "").slice(0, 120) || "Degree",
    field: e?.field ? String(e.field).slice(0, 160) : null,
    institution: String(e?.institution ?? "").slice(0, 200) || "Institution",
    year: e?.year ? String(e.year).slice(0, 10) : null
  })) : [];

  const skills = Array.isArray(j?.skills)
    ? [...new Set((j.skills as any[]).map((s) => String(s).toLowerCase().trim()).filter(Boolean))].slice(0, 200)
    : [];

  const experience = Array.isArray(j?.experience) ? (j.experience as any[]).slice(0, 40).map((r) => ({
    title: String(r?.title ?? "").slice(0, 120) || "Role",
    org: String(r?.org ?? "").slice(0, 160) || "Organization",
    location: r?.location ? String(r.location).slice(0, 120) : null,
    start: r?.start ? String(r.start).slice(0, 40) : null,
    end: r?.end ? String(r.end).slice(0, 40) : null,
    bullets: Array.isArray(r?.bullets) ? (r.bullets as any[]).slice(0, 12).map((b) => String(b).slice(0, 260)) : [],
    skills: Array.isArray(r?.skills)
      ? [...new Set((r.skills as any[]).map((s) => String(s).toLowerCase().trim()).filter(Boolean))].slice(0, 40)
      : []
  })) : [];

  // Back-compat mirror for any code still expecting "jobs"
  const jobs = experience.map((r) => ({
    title: r.title, org: r.org, start: r.start, end: r.end, location: r.location, bullets: r.bullets
  }));

  return { name, contact, education, skills, experience, jobs };
}

function normalizeAiString(resp: any): string {
  const rawAny = resp?.response ?? resp?.output_text ?? resp?.result ?? resp;
  if (typeof rawAny === "string") return rawAny.trim();
  try { return JSON.stringify(rawAny ?? ""); } catch { return ""; }
}

function stripFences(s: string) { return s.replace(/```json|```/g, "").trim(); }
function tryParseJson(s: string): any { try { return JSON.parse(stripFences(s)); } catch { return null; } }

async function aiJsonWithRetry(ai: Env["AI"], model: string, messages: any[], parseHint?: string): Promise<{text: string, json: any}> {
  const t0 = Date.now();
  // request deterministic output and allow a larger reply
  const run = async (msgs: any[]) => ai.run(model, { messages: msgs, temperature: 0, max_output_tokens: 10000 });
  let resp = await run(messages);
  let text = normalizeAiString(resp);
  let json = tryParseJson(text);

  if (!json && parseHint) {
    const retryMsgs = [ messages[0], { role: "system", content: parseHint }, ...messages.slice(1) ];
    resp = await run(retryMsgs);
    text = normalizeAiString(resp);
    json = tryParseJson(text);
  }

  // salvage attempt: if top-level parse failed, try to extract the first {...} JSON substring
  if (!json && typeof text === "string") {
    try {
      const start = text.indexOf("{");
      const endCandidates = [];
      for (let i = start; i < Math.min(text.length, start + 4000); i++) {
        if (text[i] === "}") endCandidates.push(i);
      }
      for (const end of endCandidates.reverse()) {
        const sub = text.slice(start, end + 1);
        const p = tryParseJson(sub);
        if (p) { json = p; text = sub; break; }
      }
    } catch { /* ignore salvage errors */ }
  }

  console.log("[aiJsonWithRetry] ms=", Date.now() - t0, "len=", String(text ?? "").length);
  return { text, json };
}

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
      id: String(c?.id ?? `role-${i + 1}`),         // force string IDs
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
      { id: "fallback-3", title: "Data Engineer", rationale: "ETL/data pipeline experience.", confidence: 0.55 }
    ];
  }

  return { candidates: out, raw: text };
}

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

async function mapTransferable(_resumeJson: unknown, reqs: { must_have: string[]; nice_to_have: string[] }): Promise<unknown> {
  return {
    mapping: (reqs.must_have ?? []).map((m: string) => ({
      requirement: m,
      matched_skills: [],
      evidence: []
    }))
  };
}

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
  return ((): string => {
    const raw = r?.response ?? r?.output_text ?? r?.result ?? r;
    return typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? "");
  })();
}
