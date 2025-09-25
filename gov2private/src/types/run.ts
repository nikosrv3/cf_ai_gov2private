/**
 * Centralized types shared between Worker routes and the Durable Object.
 */

export type RunStatus = "queued" | "awaiting_role" | "running" | "done" | "error";
export type JobDescSource = "user_pasted" | "llm_generated";
export type ChatTurn = { role: "user" | "assistant"; content: string };

export function toChatTurns(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .map((t: any) => ({ role: t.role as "user" | "assistant", content: String(t.content) }));
}

export interface RoleCandidate {
  id: string;
  title: string;             
  level?: string;        
  rationale: string; 
  confidence: number;  
  aiJobDescription?: string;
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
    normalize?: unknown;
    roleDiscovery?: {
      candidates: RoleCandidate[];
      debugRaw?: string; 
    };
    bullets_history?: string[][];
    requirements?: { must_have: string[]; nice_to_have: string[] };
    mapping?: unknown;
    bullets?: string[];
    scoring?: { skill: string; score: number; depth?: number }[];
    draft?: string;

    chat?: ChatTurn[];
    coaching?: Record<string, string[]>;
  };
}
