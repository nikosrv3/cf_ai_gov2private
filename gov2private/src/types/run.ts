// Clarity: centralized types for Worker <-> DO RPC
// Keep fields minimal; expand later as needed.

export type RunStatus = "queued" | "running" | "done" | "error";

export interface RunIndexItem {
  id: string;
  createdAt: string;
  targetRole?: string;
  status: RunStatus;
}

export interface RunData {
  id: string;
  createdAt: string;
  updatedAt: string;
  targetRole?: string;
  status: RunStatus;
  phases?: {
    normalize?: unknown;
    requirements?: unknown;
    mapping?: unknown;
    bullets?: unknown;
    scoring?: unknown;
    draft?: unknown;
  };
}

export interface SkillScore {
  skill: string;
  score: number; // 0..100
  depth?: number; // optional tree depth
}

export interface Bullet {
  id: string;
  text: string;
  role?: string;
  tags?: string[];
}
