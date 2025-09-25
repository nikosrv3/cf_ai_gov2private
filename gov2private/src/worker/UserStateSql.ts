// src/worker/UserStateSql.ts
// SQLite-backed Durable Object drop-in for your previous UserState (free plan compliant)

/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import type { RunData, RunIndexItem, RoleCandidate, RunStatus } from "../types/run";

const MAX_RUNS = 20;
type Env = unknown;

export class UserStateSql extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  /* -------------------------- Schema -------------------------- */
  private async ensureSchema(): Promise<void> {
    const sql = this.ctx.storage.sql;
    await sql.exec(`
      -- Do NOT set journal_mode/WAL; restricted in DO SQLite -> SQLITE_AUTH.

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        background TEXT,
        target_role TEXT,
        selected_role_id TEXT,
        job_description TEXT,
        job_description_source TEXT,
        phases_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS runs_updated_at_idx ON runs (updated_at DESC);
    `);
  }

  /* ---------------------- Helpers ---------------------- */
  private rowToRun(row: any): RunData {
    const phases = row?.phases_json ? JSON.parse(row.phases_json) : {};
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status as RunStatus,
      background: row.background ?? undefined,
      targetRole: row.target_role ?? undefined,
      selectedRoleId: row.selected_role_id ?? undefined,
      jobDescription: row.job_description ?? undefined,
      jobDescriptionSource: row.job_description_source ?? undefined,
      phases
    };
  }

  private runToCols(r: RunData) {
    return {
      id: r.id,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      status: r.status,
      background: r.background ?? null,
      target_role: r.targetRole ?? null,
      selected_role_id: r.selectedRoleId ?? null,
      job_description: r.jobDescription ?? null,
      job_description_source: r.jobDescriptionSource ?? null,
      phases_json: JSON.stringify(r.phases ?? {})
    };
  }

  private async getRunRow(id: string): Promise<any | null> {
    const sql = this.ctx.storage.sql;
    // .one() throws when there are 0 rows; we want 0-or-1 semantics:
    const cursor = sql.exec(`SELECT * FROM runs WHERE id = ?;`, id);
    for await (const row of cursor) return row;
    return null;
  }

  /* --------------------- Public API (same names as before) --------------------- */
  public async createRun(id: string, init?: Partial<RunData>): Promise<RunData> {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const existing = await this.getRun(id);

    const base: RunData = existing ?? {
      id, createdAt: now, updatedAt: now, status: "queued", phases: {}
    };

    const merged: RunData = {
      ...base,
      ...init,
      createdAt: base.createdAt,
      updatedAt: now,
      status: (init?.status ?? base.status) as RunStatus,
      phases: deepMerge(base.phases ?? {}, init?.phases ?? {})
    };

    const sql = this.ctx.storage.sql;
    const cols = this.runToCols(merged);
    await sql.exec(
      `INSERT INTO runs (id, created_at, updated_at, status, background, target_role, selected_role_id, job_description, job_description_source, phases_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at=excluded.updated_at,
         status=excluded.status,
         background=excluded.background,
         target_role=excluded.target_role,
         selected_role_id=excluded.selected_role_id,
         job_description=excluded.job_description,
         job_description_source=excluded.job_description_source,
         phases_json=excluded.phases_json;`,
      cols.id, cols.created_at, cols.updated_at, cols.status, cols.background,
      cols.target_role, cols.selected_role_id, cols.job_description,
      cols.job_description_source, cols.phases_json
    );

    return merged;
  }

  public async saveRunPart(id: string, patch: Partial<RunData>): Promise<RunData> {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const current = await this.getRun(id);

    const updated: RunData = {
      id,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      status: (patch.status ?? current?.status ?? "running") as RunStatus,
      background: patch.background ?? current?.background,
      targetRole: patch.targetRole ?? current?.targetRole,
      selectedRoleId: patch.selectedRoleId ?? current?.selectedRoleId,
      jobDescription: patch.jobDescription ?? current?.jobDescription,
      jobDescriptionSource: patch.jobDescriptionSource ?? current?.jobDescriptionSource,
      phases: deepMerge(current?.phases ?? {}, patch.phases ?? {})
    };

    const sql = this.ctx.storage.sql;
    const cols = this.runToCols(updated);
    await sql.exec(
      `INSERT INTO runs (id, created_at, updated_at, status, background, target_role, selected_role_id, job_description, job_description_source, phases_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at=excluded.updated_at,
         status=excluded.status,
         background=excluded.background,
         target_role=excluded.target_role,
         selected_role_id=excluded.selected_role_id,
         job_description=excluded.job_description,
         job_description_source=excluded.job_description_source,
         phases_json=excluded.phases_json;`,
      cols.id, cols.created_at, cols.updated_at, cols.status, cols.background,
      cols.target_role, cols.selected_role_id, cols.job_description,
      cols.job_description_source, cols.phases_json
    );

    return updated;
  }

  public async getRun(id: string): Promise<RunData | null> {
    await this.ensureSchema();
    const row = await this.getRunRow(id);
    return row ? this.rowToRun(row) : null;
  }

  public async getHistory(limit = MAX_RUNS): Promise<RunIndexItem[]> {
    await this.ensureSchema();
    const cursor = this.ctx.storage.sql
      .exec(
        `SELECT id, created_at, status, target_role
         FROM runs
         ORDER BY updated_at DESC
         LIMIT ?;`,
        limit
      );
    const rows: any[] = [];
    for await (const row of cursor) rows.push(row)
    return rows.map((r: any) => ({
      id: r.id,
      createdAt: r.created_at,
      status: r.status as RunStatus,
      targetRole: r.target_role ?? undefined
    }));
  }

  public async setRoleCandidates(id: string, candidates: RoleCandidate[]): Promise<void> {
    const run = await this.getRunOrThrow(id);
    run.phases ??= {};
    run.phases.roleDiscovery = { candidates };
    run.status = "awaiting_role";
    run.updatedAt = new Date().toISOString();
    await this.saveRunPart(id, run);
  }

  public async setSelectedRole(
    id: string,
    roleId: string,
    opts: { jobDescription?: string; source?: "user_pasted" | "llm_generated" }
  ): Promise<RunData> {
    const run = await this.getRunOrThrow(id);
    run.selectedRoleId = roleId;
    if (opts.jobDescription) {
      run.jobDescription = opts.jobDescription;
      run.jobDescriptionSource = opts.source ?? "user_pasted";
    }
    run.status = "running";
    run.updatedAt = new Date().toISOString();
    return await this.saveRunPart(id, run);
  }

  private async getRunOrThrow(id: string): Promise<RunData> {
    const r = await this.getRun(id);
    if (!r) throw new Error(`Run not found: ${id}`);
    return r;
  }

  /* -------------------- fetch RPC (for client wrapper) -------------------- */
  async fetch(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/do/history") {
        const limit = parseInt(url.searchParams.get("limit") ?? `${MAX_RUNS}`, 10);
        const history = await this.getHistory(Number.isFinite(limit) ? limit : MAX_RUNS);
        return Response.json({ ok: true, history });
      }
      if (req.method === "GET" && url.pathname.startsWith("/do/run/")) {
        const id = url.pathname.split("/").pop()!;
        const run = await this.getRun(id);
        return Response.json({ ok: true, run });
      }
      if (req.method === "POST" && url.pathname === "/do/create-run") {
        const body = (await req.json()) as { id: string; init?: Partial<RunData> };
        const run = await this.createRun(body.id, body.init);
        return Response.json({ ok: true, run });
      }
      if (req.method === "PATCH" && url.pathname === "/do/save-run-part") {
        const body = (await req.json()) as { id: string; patch: Partial<RunData> };
        const run = await this.saveRunPart(body.id, body.patch);
        return Response.json({ ok: true, run });
      }
      if (req.method === "POST" && url.pathname === "/do/role-candidates") {
        const body = (await req.json()) as { id: string; candidates: RoleCandidate[] };
        await this.setRoleCandidates(body.id, body.candidates);
        return Response.json({ ok: true });
      }
      if (req.method === "POST" && url.pathname === "/do/select-role") {
        const body = (await req.json()) as {
          id: string;
          roleId: string;
          opts?: { jobDescription?: string; source?: "user_pasted" | "llm_generated" };
        };
        const run = await this.setSelectedRole(body.id, body.roleId, body.opts ?? {});
        return Response.json({ ok: true, run });
      }

      return new Response("Not Found", { status: 404 });
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }
}

/* -------------------------- small helpers -------------------------- */
function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = deepMerge((a as any)[k] ?? {}, v as any);
    else out[k] = v;
  }
  return out;
}
