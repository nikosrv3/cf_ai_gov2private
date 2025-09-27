/**
 * Centralized types shared between Worker routes and the Durable Object.
 */

export type RunStatus = "queued" | "pending" | "generating" | "role_selection" | "done" | "error";
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

export interface JobRole {
  id: string;
  title: string;
  company?: string;
  description: string;
  requirements?: string[];
  score?: number;  // 0..100
  source?: "ai" | "user";
}

export interface NormalizedData {
  name: string | null;
  contact: {
    email: string | null;
    phone: string | null;
    location: string | null;
    links: string[];
  };
  summary?: string | null;
  skills: string[];
  certifications?: string[];
  education: Array<{
    degree: string;
    field?: string | null;
    institution: string;
    year?: string | null;
  }>;
  experience: Array<{
    title: string;
    org: string;
    location?: string | null;
    start?: string | null;
    end?: string | null;
    bullets: string[];
    skills?: string[];
  }>;
}

export interface RunData {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: RunStatus;
  targetRole?: string;
  background?: string;
  selectedRoleId?: string;
  phases?: {
    normalize?: NormalizedData;
    roleDiscovery?: JobRole[];                 // REQUIRED for RoleSelection page
    selectedRole?: JobRole;                    // REQUIRED after role chosen
    requirements?: { must_have: string[]; nice_to_have: string[] };
    mapping?: any;
    bullets?: string[];
    bullets_history?: string[][];
    scoring?: Array<{ skill: string; score: number; depth?: number }>;
    draft?: string;
    chat?: Array<{ role: "user" | "assistant"; content: string; timestamp?: string }>;
  };
  // For tailoring context:
  jobDescription?: string;
  jobDescriptionSource?: "user_pasted" | "llm_generated";
}
