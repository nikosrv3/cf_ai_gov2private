// Hono Worker entry: routes call DO methods via RPC using getByName(uid).
// Consistency: follows current Hono + Workers DO style.

import { Hono } from "hono";
import { UserState } from "./UserState";
import { getOrSetUid } from "./cookies";
import type { RunData } from "../types/run";

type Env = {
  AI: any;
  USER_STATE: DurableObjectNamespace<UserState>;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.text("ok"));

// Create a run shell and return it (simulates /api/ingest kick-off)
app.post("/api/ingest", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);

  const body = (await c.req.json().catch(() => ({}))) as { runId?: string; targetRole?: string; resumeText?: string };
  const runId = body.runId ?? cryptoRandomId();
  if (body.resumeText) await stub.setLatestResume(body.resumeText);

  const run = await stub.createRun(runId, body.targetRole);
  return c.json({ ok: true, run });
});

// Read last N runs
app.get("/api/history", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);
  const items = await stub.getHistory(20);
  return c.json({ ok: true, items });
});

// Read a specific run
app.get("/api/run/:id", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);
  const run = (await stub.getRun(c.req.param("id"))) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, run });
});

// Patch a run (use this from Workflow callbacks or the UI while testing)
app.post("/api/run/:id/save", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);
  const patch = (await c.req.json().catch(() => ({}))) as Partial<RunData>;
  const updated = await stub.saveRunPart(c.req.param("id"), patch);
  return c.json({ ok: true, run: updated });
});

// Bullets + Skills (simple demo endpoints)
app.post("/api/bullets/upsert", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);
  const bullets = await c.req.json();
  const next = await stub.upsertBullets(bullets);
  return c.json({ ok: true, bullets: next });
});

app.get("/api/skills/map", async (c) => {
  const uid = getOrSetUid(c);
  const stub = c.env.USER_STATE.getByName(uid);
  const skills = await stub.getSkillMap();
  return c.json({ ok: true, skills });
});

export default app;
export { UserState };

// ---- utils ----
function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
