// src/worker/userStateClient.ts
// Typed client wrapper for calling the SQLite-backed UserState Durable Object via stub.fetch()

import type { RunData, RunIndexItem, RoleCandidate } from "../types/run";
import type { UserStateSql } from "./UserStateSql";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error?: string };

type RunResp = Ok<{ run: RunData }> | Err;
type GetRunResp = Ok<{ run: RunData | null }> | Err;
type HistoryResp = Ok<{ history: RunIndexItem[] }> | Err;
type EmptyOk = Ok<{}> | Err;

function mustOk<T extends { ok: boolean; error?: string }>(j: T): asserts j is T & { ok: true } {
  if (!j.ok) throw new Error(j.error || "request failed");
}

export type UserStateClient = {
  createRun(id: string, init?: Partial<RunData>): Promise<RunData>;
  saveRunPart(id: string, patch: Partial<RunData>): Promise<RunData>;
  getRun(id: string): Promise<RunData | null>;
  getHistory(limit?: number): Promise<RunIndexItem[]>;
  setRoleCandidates(id: string, candidates: RoleCandidate[]): Promise<void>;
  setSelectedRole(
    id: string,
    roleId: string,
    opts: { jobDescription?: string; source?: "user_pasted" | "llm_generated" }
  ): Promise<RunData>;
};

export function getUserStateClient(
  ns: DurableObjectNamespace<UserStateSql>,
  uid: string
): UserStateClient {
  const id = ns.idFromName(uid);
  const stub = ns.get(id);

  return {
    async createRun(runId, init) {
      const r = await stub.fetch("http://do/do/create-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: runId, init })
      });
      const j = (await r.json()) as RunResp;
      mustOk(j);
      return j.run;
    },

    async saveRunPart(runId, patch) {
      const r = await stub.fetch("http://do/do/save-run-part", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: runId, patch })
      });
      const j = (await r.json()) as RunResp;
      mustOk(j);
      return j.run;
    },

    async getRun(runId) {
      const r = await stub.fetch(`http://do/do/run/${encodeURIComponent(runId)}`);
      const j = (await r.json()) as GetRunResp;
      mustOk(j);
      return j.run ?? null;
    },

    async getHistory(limit = 20) {
      const r = await stub.fetch(`http://do/do/history?limit=${encodeURIComponent(String(limit))}`);
      const j = (await r.json()) as HistoryResp;
      mustOk(j);
      return j.history;
    },

    async setRoleCandidates(runId, candidates) {
      const r = await stub.fetch("http://do/do/role-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: runId, candidates })
      });
      const j = (await r.json()) as EmptyOk;
      mustOk(j);
    },

    async setSelectedRole(runId, roleId, opts) {
      const r = await stub.fetch("http://do/do/select-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: runId, roleId, opts })
      });
      const j = (await r.json()) as RunResp;
      mustOk(j);
      return j.run;
    }
  };
}
