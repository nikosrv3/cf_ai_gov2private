// Durable Object focusing on per-user state: runs, bullet bank, skills.
// Simplicity: key naming is flat; index array + per-run keys.

import { DurableObject } from "cloudflare:workers";
import type { RunData, RunIndexItem, SkillScore, Bullet, RunStatus } from "../types/run";

const INDEX_KEY = "index"; // Array<RunIndexItem>
const SKILLS_LATEST_KEY = "skills:latest"; // Array<SkillScore>
const BULLET_BANK_KEY = "bullets:bank"; // Array<Bullet>
const LATEST_RESUME_KEY = "resume:latest"; // string
const MAX_RUNS = 20;

export class UserState extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /** Create a new run shell and update the index (idempotent for same id). */
  public async createRun(id: string, targetRole?: string): Promise<RunData> {
    const now = new Date().toISOString();
    const key = runKey(id);
    const existing = (await this.ctx.storage.get<RunData>(key)) ?? null;

    const run: RunData = existing ?? {
      id,
      createdAt: now,
      updatedAt: now,
      targetRole,
      status: "queued",
      phases: {}
    };

    await this.ctx.storage.put(key, run);
    await this.#upsertIndex({ id, createdAt: run.createdAt, targetRole, status: run.status });
    return run;
  }

  /** Patch any part of a run (status, phases.* fields, targetRole). */
  public async saveRunPart(id: string, patch: Partial<RunData>): Promise<RunData> {
    const key = runKey(id);
    const existing = (await this.ctx.storage.get<RunData>(key)) ?? null;
    const now = new Date().toISOString();

    const updated: RunData = {
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      targetRole: patch.targetRole ?? existing?.targetRole,
      status: (patch.status ?? existing?.status ?? "running") as RunStatus,
      phases: deepMerge(existing?.phases ?? {}, (patch as RunData).phases ?? {})
    };

    await this.ctx.storage.put(key, updated);
    await this.#upsertIndex({ id, createdAt: updated.createdAt, targetRole: updated.targetRole, status: updated.status });
    return updated;
  }

  public async getRun(id: string): Promise<RunData | null> {
    return (await this.ctx.storage.get<RunData>(runKey(id))) ?? null;
  }

  public async getHistory(limit = MAX_RUNS): Promise<RunIndexItem[]> {
    const idx = (await this.ctx.storage.get<RunIndexItem[]>(INDEX_KEY)) ?? [];
    return idx.slice(0, limit);
  }

  public async setLatestResume(text: string): Promise<void> {
    await this.ctx.storage.put(LATEST_RESUME_KEY, text);
  }

  public async upsertBullets(bullets: Bullet[]): Promise<Bullet[]> {
    const existing = (await this.ctx.storage.get<Bullet[]>(BULLET_BANK_KEY)) ?? [];
    // naive upsert by id
    const byId = new Map(existing.map(b => [b.id, b]));
    for (const b of bullets) byId.set(b.id, { ...byId.get(b.id), ...b });
    const next = Array.from(byId.values());
    await this.ctx.storage.put(BULLET_BANK_KEY, next);
    return next;
  }

  public async getSkillMap(): Promise<SkillScore[]> {
    return (await this.ctx.storage.get<SkillScore[]>(SKILLS_LATEST_KEY)) ?? [];
  }

  public async setSkillMap(scores: SkillScore[]): Promise<void> {
    await this.ctx.storage.put(SKILLS_LATEST_KEY, scores);
  }

  // ---- helpers ----

  async #upsertIndex(item: RunIndexItem): Promise<void> {
    let idx = (await this.ctx.storage.get<RunIndexItem[]>(INDEX_KEY)) ?? [];
    const i = idx.findIndex(r => r.id === item.id);
    if (i === -1) idx.unshift(item);
    else idx[i] = { ...idx[i], ...item };

    if (idx.length > MAX_RUNS) idx = idx.slice(0, MAX_RUNS);
    await this.ctx.storage.put(INDEX_KEY, idx);
  }
}

function runKey(id: string) {
  return `run:${id}`;
}

function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  // simple deep merge for plain objects (phases)
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge((a as any)[k] ?? {}, v as any);
    } else {
      out[k] = v;
    }
  }
  return out;
}
