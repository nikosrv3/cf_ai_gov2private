// Durable Object focusing on per-user state: runs, role discovery, bullets/skills.

import { DurableObject } from "cloudflare:workers";
import type { RunData, RunIndexItem, RoleCandidate, RunStatus } from "../types/run";

const INDEX_KEY = "index";        // Array<RunIndexItem>
const MAX_RUNS = 20;

// Durable Object: stores per-user runs and role-discovery/tailoring state.
export class UserState extends DurableObject<Env> {
  // Constructor: initialize base DurableObject with ctx/env.
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  // createRun: create or upsert a new run shell and index entry.
  public async createRun(id: string, init?: Partial<RunData>): Promise<RunData> {
    const now = new Date().toISOString();
    const key = runKey(id);
    const existing = (await this.ctx.storage.get<RunData>(key)) ?? null;

    const run: RunData = existing ?? {
      id,
      createdAt: now,
      updatedAt: now,
      status: "queued",
      phases: {},
    };
    const merged = { ...run, ...init, updatedAt: now } satisfies RunData;

    await this.ctx.storage.put(key, merged);
    await this.#upsertIndex({
      id,
      createdAt: merged.createdAt,
      status: merged.status,
      targetRole: merged.targetRole
    });
    return merged;
  }

  // saveRunPart: patch run fields/phases and keep index in sync.
  public async saveRunPart(id: string, patch: Partial<RunData>): Promise<RunData> {
    const key = runKey(id);
    const now = new Date().toISOString();
    const existing = (await this.ctx.storage.get<RunData>(key)) ?? null;

    const updated: RunData = {
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status: (patch.status ?? existing?.status ?? "running") as RunStatus,
      background: patch.background ?? existing?.background,
      targetRole: patch.targetRole ?? existing?.targetRole,
      selectedRoleId: patch.selectedRoleId ?? existing?.selectedRoleId,
      jobDescription: patch.jobDescription ?? existing?.jobDescription,
      jobDescriptionSource: patch.jobDescriptionSource ?? existing?.jobDescriptionSource,
      phases: deepMerge(existing?.phases ?? {}, patch.phases ?? {})
    };

    await this.ctx.storage.put(key, updated);
    await this.#upsertIndex({
      id,
      createdAt: updated.createdAt,
      status: updated.status,
      targetRole: updated.targetRole
    });
    return updated;
  }

  // getRun: fetch a single run by id or null if not found.
  public async getRun(id: string): Promise<RunData | null> {
    return (await this.ctx.storage.get<RunData>(runKey(id))) ?? null;
  }

  // getHistory: return the most recent N runs (index).
  public async getHistory(limit = MAX_RUNS): Promise<RunIndexItem[]> {
    const idx = (await this.ctx.storage.get<RunIndexItem[]>(INDEX_KEY)) ?? [];
    return idx.slice(0, limit);
  }

  // setRoleCandidates: store role candidates and mark run as awaiting selection.
  public async setRoleCandidates(id: string, candidates: RoleCandidate[]): Promise<void> {
    const run = await this.getRunOrThrow(id);
    run.phases ??= {};
    run.phases.roleDiscovery = { candidates };
    run.status = "awaiting_role";
    run.updatedAt = new Date().toISOString();
    await this.ctx.storage.put(runKey(id), run);
    await this.#upsertIndex({ id: run.id, createdAt: run.createdAt, status: run.status, targetRole: run.targetRole });
  }

  // setSelectedRole: record the chosen role and optional JD, resume processing.
  public async setSelectedRole(id: string, roleId: string, opts: { jobDescription?: string; source?: "user_pasted" | "llm_generated" }): Promise<RunData> {
    const run = await this.getRunOrThrow(id);
    run.selectedRoleId = roleId;
    if (opts.jobDescription) {
      run.jobDescription = opts.jobDescription;
      run.jobDescriptionSource = opts.source ?? "user_pasted";
    }
    run.status = "running";
    run.updatedAt = new Date().toISOString();
    await this.ctx.storage.put(runKey(id), run);
    await this.#upsertIndex({ id: run.id, createdAt: run.createdAt, status: run.status, targetRole: run.targetRole });
    return run;
  }

  // getRunOrThrow: helper to fetch a run or throw if missing.
  private async getRunOrThrow(id: string): Promise<RunData> {
    const run = await this.getRun(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    return run;
  }

  // #upsertIndex: insert/update the run index and enforce max size.
  async #upsertIndex(item: RunIndexItem): Promise<void> {
    let idx = (await this.ctx.storage.get<RunIndexItem[]>(INDEX_KEY)) ?? [];
    const i = idx.findIndex(r => r.id === item.id);
    if (i === -1) idx.unshift(item); else idx[i] = { ...idx[i], ...item };
    if (idx.length > MAX_RUNS) idx = idx.slice(0, MAX_RUNS);
    await this.ctx.storage.put(INDEX_KEY, idx);
  }
}

// runKey: generate the storage key for a run id.
function runKey(id: string) { return `run:${id}`; }

// deepMerge: shallow/deep merge helper for simple nested objects.
function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = deepMerge((a as any)[k] ?? {}, v as any);
    else out[k] = v;
  }
  return out;
}
