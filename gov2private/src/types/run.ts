/**
 * Centralized types shared between Worker routes and the Durable Object.
 * Keep minimal but expressive; expand as feature needs grow.
 */

export type RunStatus = "queued" | "awaiting_role" | "running" | "done" | "error";
export type JobDescSource = "user_pasted" | "llm_generated";

export interface RoleCandidate {
  id: string;                   // stable id for selection
  title: string;                // e.g., "Data Analyst"
  level?: string;               // e.g., "IC2", "Senior"
  rationale: string;            // <= 40 words: why this fits
  confidence: number;           // 0..1
  aiJobDescription?: string;    // optional short JD (60–120 words)
}

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
  status: RunStatus;

  background?: string;
  targetRole?: string;

  selectedRoleId?: string;
  jobDescription?: string;
  jobDescriptionSource?: JobDescSource;

  phases?: {
    // A) Discovery
    normalize?: unknown;
    roleDiscovery?: {
      candidates: RoleCandidate[];
      debugRaw?: string; // raw LLM output for debugging (optional)
    };

    // B) Tailoring
    requirements?: { must_have: string[]; nice_to_have: string[] };
    mapping?: unknown;
    bullets?: string[];
    scoring?: { skill: string; score: number; depth?: number }[];
    draft?: string;
  };
}
