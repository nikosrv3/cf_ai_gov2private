// AI helper functions - moved these out of index.ts to keep things organized
// TODO: maybe split this into smaller files if it gets too big

import type { NormalizedData, JobRole } from "../types/run";
import {
  NormalizedResumeJsonSchema,
  RoleCandidatesJsonSchema,
  RequirementsJsonSchema,
  TransferableMappingJsonSchema,
  BulletBatchJsonSchema
} from "./schema";

// Environment type for AI functions
type Env = {
  AI: any; // Workers AI binding
  MODEL: string; // AI model to use
};

// Parse resume text into structured data that we can work with
export async function normalizeResume(
  ai: Env["AI"],
  model: string,
  resumeText: string,
  background?: string
): Promise<NormalizedData> {
  // Limit input size to avoid hitting AI limits
  const input = String(resumeText || "").slice(0, 12000);
  const bg = String(background || "").slice(0, 4000);

  if (!input && !bg) {
    // Return empty structure if no input
    return {
      name: null,
      contact: { email: null, phone: null, location: null, links: [] },
      education: [],
      skills: [],
      experience: [],
      certifications: []
    };
  }

  // Example to help the AI understand the format we want
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
    summary: "Experienced researcher with expertise in data analysis and program evaluation",
    education: [
      { degree: "Ph.D.", field: "Behavioral Science", institution: "University", year: "2016" },
      { degree: "B.S.", field: "Marketing", institution: "University", year: "1989" }
    ],
    skills: ["sql", "data analysis", "program evaluation", "dashboards"],
    certifications: ["AWS Cloud Practitioner"],
    experience: [
      { title: "Senior Researcher", org: "Public Health Agency", location: "Atlanta, GA", start: "2022", end: null,
        bullets: ["led adolescent health research and evaluation projects", "delivered insights to inform policy"],
        skills: ["public health", "evaluation", "data analysis"]},
      { title: "Policy Analyst", org: "Education Nonprofit", location: "Atlanta, GA", start: "2017", end: "2018",
        bullets: ["managed policy initiatives and multi-sector partnerships"], skills: ["partnerships", "policy analysis"]}
    ]
  });

  const userPayload = [
    "BACKGROUND:",
    bg || "(none)",
    "",
    "RESUME:",
    input
  ].join("\n");

  try {
    const res = await ai.run(model, {
      messages: [
        { role: "system", content: "Output ONLY JSON that strictly matches the schema. Keep arrays within limits; do not invent data." },
        { role: "user", content: fewShotUser1 },
        { role: "assistant", content: fewShotAssistant1 },
        { role: "user", content: userPayload }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: NormalizedResumeJsonSchema.name,
          schema: NormalizedResumeJsonSchema.schema,
          strict: true
        }
      },
      max_tokens: 4096,
      temperature: 0
    });

    const parsed = ensureObj(res);
    if (!parsed) throw new Error("normalizeResume: unable to parse AI response");
    return shapeReturn(parsed);
  } catch (e: any) {
    console.warn("[normalizeResume] schema parse failed:", e?.message || e);
    // Return minimal fallback
    return {
      name: null,
      contact: { email: null, phone: null, location: null, links: [] },
      education: [],
      skills: [],
      experience: [],
      certifications: []
    };
  }
}

/**
 * Propose job roles based on background and resume
 */
export async function proposeRoles(
  ai: Env["AI"],
  model: string,
  background: string,
  resumeJson: NormalizedData
): Promise<{ candidates: JobRole[]; raw: string }> {
  const sys = `Propose realistic private-sector next-step roles for a government background.
Return ONLY JSON matching the schema. Keep descriptions concise (100-200 words).`;
  const usr = `BACKGROUND:
${background}

RESUME_JSON:
${JSON.stringify(resumeJson).slice(0, 4000)}`;

  const parsed = await runSchema(ai, model, [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], RoleCandidatesJsonSchema, 1200).catch(() => null);

  let out: JobRole[] = [];
  if (parsed && Array.isArray((parsed as any).candidates)) {
    out = (parsed as any).candidates.slice(0, 10).map((c: any, i: number) => ({
      id: String(c?.id ?? `role-${i + 1}`).slice(0, 64),
      title: String(c?.title ?? "").slice(0, 80),
      company: c?.company ? String(c.company).slice(0, 120) : undefined,
      description: String(c?.description ?? "").slice(0, 500),
      requirements: Array.isArray(c?.requirements) ? c.requirements.slice(0, 20).map((r: any) => String(r).slice(0, 100)) : undefined,
      score: c?.score ? Math.max(0, Math.min(100, Number(c.score))) : undefined,
      source: "ai" as const
    }));
  }

  if (out.length === 0) {
    console.warn("[proposeRoles] empty list -> fallback candidates used");
    out = [
      { id: "fallback-1", title: "Data Analyst", description: "Analyze data to help organizations make informed decisions. Use SQL, Python, and visualization tools.", source: "ai" },
      { id: "fallback-2", title: "Business Intelligence Analyst", description: "Create dashboards and reports to support business decision-making.", source: "ai" },
      { id: "fallback-3", title: "Software Developer", description: "Build and maintain software applications using modern development practices.", source: "ai" }
    ];
  }

  return { candidates: out, raw: JSON.stringify(parsed ?? {}) };
}

/**
 * Generate a short job description for a role title
 */
export async function generateShortJD(ai: Env["AI"], model: string, title: string): Promise<string> {
  const sys = `Write a concise job description (60-120 words) for the given role. No preamble, plain text.`;
  const usr = `ROLE TITLE: ${title}`;
  const r = await ai.run(model, {
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr }
    ],
    temperature: 0,
    max_tokens: 400
  });
  return toText(r).trim();
}

/**
 * Extract requirements from job description
 */
export async function extractRequirements(
  ai: Env["AI"],
  model: string,
  title: string,
  jd: string
): Promise<{ must_have: string[]; nice_to_have: string[] }> {
  const sys = `Extract requirements {must_have[], nice_to_have[]} from the job description.
Return ONLY JSON matching the schema with concise skill/tech phrases.`;
  const usr = `TITLE: ${title}

JOB DESCRIPTION:
${jd}`;

  const parsed = await runSchema(ai, model, [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], RequirementsJsonSchema, 1200).catch(() => null);

  if (parsed && Array.isArray((parsed as any).must_have) && Array.isArray((parsed as any).nice_to_have)) {
    return parsed as any;
  }
  console.warn("[extractRequirements] bad JSON, returning empty lists.");
  return { must_have: [], nice_to_have: [] };
}

/**
 * Map transferable skills from resume to job requirements
 */
export async function mapTransferable(
  ai: Env["AI"],
  model: string,
  resumeJson: NormalizedData,
  reqs: { must_have: string[]; nice_to_have: string[] }
): Promise<unknown> {
  const sys = `Map each requirement to matched skills and evidence from the resume.
Return ONLY JSON matching the schema. Evidence are short bullet snippets (<= 220 chars).`;
  const usr = `RESUME_JSON:
${JSON.stringify(resumeJson).slice(0, 4000)}

REQUIREMENTS:
${JSON.stringify(reqs).slice(0, 2000)}`;

  const parsed = await runSchema(ai, model, [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], TransferableMappingJsonSchema, 1800).catch(() => null);

  return parsed ?? {
    mapping: (reqs.must_have ?? []).map((m: string) => ({
      requirement: m,
      matched_skills: [],
      evidence: []
    }))
  };
}

/**
 * Rewrite resume bullets tailored to the role
 */
export async function rewriteBullets(
  ai: Env["AI"],
  model: string,
  mapping: unknown,
  title: string
): Promise<string[]> {
  const sys = `Rewrite resume bullets tailored to the role. 3-6 bullets. Strong verbs, quantification, industry phrasing. Return each bullet as a line prefixed with "- ".`;
  const usr = `ROLE: ${title}
MAPPING:
${JSON.stringify(mapping).slice(0, 4000)}`;
  const r = await ai.run(model, { messages: [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], temperature: 0, max_tokens: 600 });
  const text = toText(r);
  return String(text)
    .split(/\r?\n/)
    .map((s: string) => s.replace(/^\s*-\s*/, "").trim())
    .filter((s: string) => s.length > 0)
    .slice(0, 8);
}

/**
 * Rewrite experience section bullets to be tailored for a specific role
 */
export async function rewriteExperienceBullets(
  ai: Env["AI"],
  model: string,
  experience: any[],
  mapping: unknown,
  title: string
): Promise<any[]> {
  if (!experience || experience.length === 0) return experience;

  const sys = `You are a resume expert. Rewrite experience section bullets to be tailored for a specific role. 
For each job, rewrite the bullets to highlight relevant skills and achievements for the target role.
Keep the same number of bullets per job, but make them more relevant and impactful.
Return the experience array with updated bullets.`;

  const experienceContext = experience.map((job, idx) => {
    const bullets = job.bullets || [];
    return `Job ${idx + 1}: ${job.title} at ${job.org}
Current bullets:
${bullets.map((bullet: string, i: number) => `  ${i + 1}. ${bullet}`).join('\n')}`;
  }).join('\n\n');

  const usr = `TARGET ROLE: ${title}

CURRENT EXPERIENCE:
${experienceContext}

MAPPING (skills/requirements for this role):
${JSON.stringify(mapping).slice(0, 3000)}

Rewrite the bullets for each job to be more relevant to the target role. Keep the same structure but make the content more tailored.`;

  try {
    const r = await ai.run(model, { 
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr }
      ], 
      temperature: 0, 
      max_tokens: 2000 
    });
    
    const text = toText(r);
    
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length === experience.length) {
        return parsed;
      }
    } catch {
      // Fall back to text parsing
    }
    
    // Fallback: parse the text response and update bullets
    const lines = text.split(/\r?\n/);
    const updatedExperience = [...experience];
    let currentJobIndex = -1;
    
    for (const line of lines) {
      const jobMatch = line.match(/Job (\d+):/);
      if (jobMatch) {
        currentJobIndex = parseInt(jobMatch[1], 10) - 1;
        continue;
      }
      
      const bulletMatch = line.match(/^\s*(\d+)\.\s*(.+)$/);
      if (bulletMatch && currentJobIndex >= 0 && currentJobIndex < experience.length) {
        const bulletIndex = parseInt(bulletMatch[1], 10) - 1;
        const newBullet = bulletMatch[2].trim();
        
        if (bulletIndex >= 0 && bulletIndex < (updatedExperience[currentJobIndex].bullets?.length || 0)) {
          updatedExperience[currentJobIndex].bullets[bulletIndex] = newBullet;
        }
      }
    }
    
    return updatedExperience;
  } catch (e: any) {
    console.error("[rewriteExperienceBullets] error:", e?.message || e);
    return experience; // Return original if error
  }
}

/**
 * Transform bullets in batch according to style instruction
 */
export async function transformBulletsBatch(
  ai: Env["AI"],
  model: string,
  bullets: string[],
  instruction: string,
  indexes: number[]
): Promise<string[]> {
  const list = indexes.map((i, k) => `${k + 1}. ${bullets[i].slice(0, 400)}`).join("\n");
  const sys = `You rewrite resume bullets according to an instruction.
Return ONLY JSON that matches the schema (no prose).
You must return EXACTLY ${indexes.length} bullets in the array.`;
  const usr = `INSTRUCTION: ${instruction}
INPUT BULLETS (${indexes.length}):
${list}

Return a JSON object with a "bullets" array containing exactly ${indexes.length} rewritten bullets.`;

  let out: string[] = [];
  try {
    const parsed = await runSchema(ai, model, [
      { role: "system", content: sys },
      { role: "user", content: usr }
    ], BulletBatchJsonSchema, 1200);

    if (Array.isArray((parsed as any)?.bullets) && (parsed as any).bullets.length === indexes.length) {
      out = (parsed as any).bullets as string[];
    }
  } catch (e: any) {
    console.error("[transformBulletsBatch] schema parsing failed:", e?.message || e);
  }

  if (!out.length) {
    // Fallback: line split with explicit instruction
    const fallbackSys = `You are rewriting resume bullets. Return EXACTLY ${indexes.length} bullets, one per line. No introduction, no explanation, just the rewritten bullets.`;
    const r = await ai.run(model, {
      messages: [
        { role: "system", content: fallbackSys },
        { role: "user", content: usr }
      ],
      temperature: 0,
      max_tokens: 900
    });
    const text = toText(r);
    
    const lines = text.split(/\r?\n/)
      .map(s => s.replace(/^\s*[-–•\d.]+\s*/, "").replace(/^["""']|["""']$/g, "").trim())
      .filter(Boolean);
    
    // If we don't have enough lines, pad with originals
    while (lines.length < indexes.length) {
      lines.push(""); // Will be replaced with original below
    }
    
    // Ensure we have the right number of results
    out = indexes.map((originalIdx, k) => {
      // Use rewritten version if available and not empty, otherwise keep original
      const rewritten = (lines[k] && lines[k].trim()) ? lines[k] : bullets[originalIdx];
      return rewritten;
    });
  }

  const result = out.map(s =>
    String(s).replace(/^\s*[-–•]\s*/, "").replace(/^["""']|["""']$/g, "").trim().slice(0, 300)
  );
  
  return result;
}

/**
 * Score skills based on mapping
 */
export async function scoreSkills(mapping: unknown): Promise<{ skill: string; score: number; depth?: number }[]> {
  // Simple scoring based on mapping evidence
  const scores: { skill: string; score: number; depth?: number }[] = [];
  
  if (mapping && typeof mapping === "object" && "mapping" in mapping) {
    const mappingData = (mapping as any).mapping;
    if (Array.isArray(mappingData)) {
      for (const item of mappingData) {
        if (item.requirement && item.matched_skills) {
          for (const skill of item.matched_skills) {
            const evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;
            const score = Math.min(100, 50 + (evidenceCount * 15));
            scores.push({ skill, score, depth: evidenceCount });
          }
        }
      }
    }
  }
  
  // Remove duplicates and return top scores
  const unique = new Map<string, { skill: string; score: number; depth?: number }>();
  for (const score of scores) {
    const existing = unique.get(score.skill);
    if (!existing || score.score > existing.score) {
      unique.set(score.skill, score);
    }
  }
  
  return Array.from(unique.values()).sort((a, b) => b.score - a.score).slice(0, 10);
}

/**
 * Assemble a draft resume
 */
export async function assembleDraft(
  ai: Env["AI"],
  model: string,
  input: {
    bullets: string[];
    requirements: any;
    mapping: any;
    background?: string;
    title: string;
  }
): Promise<string> {
  const sys = `Assemble a role-tailored resume as plain text sections: Summary, Skills, Experience (use provided bullets), Education (placeholder).`;
  const usr = `TITLE: ${input.title}
BACKGROUND: ${input.background ?? ""}
BULLETS: ${JSON.stringify(input.bullets)}
REQUIREMENTS: ${JSON.stringify(input.requirements)}
MAPPING: ${JSON.stringify(input.mapping).slice(0, 2000)}
`;
  const r = await ai.run(model, { messages: [
    { role: "system", content: sys },
    { role: "user", content: usr }
  ], temperature: 0, max_tokens: 1200 });
  const raw = toText(r);
  return typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? "");
}

/* -------------------- Utility functions -------------------- */

function toText(r: any): string {
  return (r?.response ?? r?.output_text ?? r?.result ?? r ?? "").toString();
}

function ensureObj(res: any): any | null {
  const raw = (res as any)?.response ?? (res as any)?.output_text ?? (res as any)?.result ?? res;
  if (typeof raw === "object" && raw !== null) return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}

function shapeReturn(j: any): NormalizedData {
  const name: string | null = (j?.name ?? null);
  const contact = {
    email: j?.contact?.email ?? null,
    phone: j?.contact?.phone ?? null,
    location: j?.contact?.location ?? null,
    links: Array.isArray(j?.contact?.links) ? (j.contact.links as any[]).slice(0, 10).map((x: any) => String(x).slice(0, 200)) : []
  };
  const education = Array.isArray(j?.education) ? (j.education as any[]).slice(0, 10).map((e) => ({
    degree: String(e?.degree ?? "").slice(0, 120) || "Degree",
    field: e?.field ? String(e.field).slice(0, 160) : null,
    institution: String(e?.institution ?? "").slice(0, 200) || "Institution",
    year: e?.year ? String(e.year).slice(0, 10) : null
  })) : [];

  const skills = uniqLowerTrim(j?.skills ?? [], 100);
  const certifications = uniqLowerTrim(j?.certifications ?? [], 20);

  const experience = Array.isArray(j?.experience) ? (j.experience as any[]).slice(0, 8).map((r) => ({
    title: String(r?.title ?? "").slice(0, 120) || "Role",
    org: String(r?.org ?? "").slice(0, 160) || "Organization",
    location: r?.location ? String(r.location).slice(0, 120) : null,
    start: r?.start ? String(r.start).slice(0, 40) : null,
    end: r?.end ? String(r.end).slice(0, 40) : null,
    bullets: Array.isArray(r?.bullets) ? (r.bullets as any[]).slice(0, 4).map((b) => String(b).slice(0, 220)) : [],
    skills: uniqLowerTrim(r?.skills ?? [], 20)
  })) : [];

  return { name, contact, summary: j?.summary ?? null, education, skills, certifications, experience };
}

function uniqLowerTrim(a: unknown[], cap: number): string[] {
  const out = new Set<string>();
  for (const x of Array.isArray(a) ? a : []) {
    const s = String(x).toLowerCase().trim();
    if (s) { out.add(s); if (out.size >= cap) break; }
  }
  return [...out];
}

async function runSchema(ai: any, model: string, messages: any[], json_schema: any, max_tokens = 2000) {
  const resp = await ai.run(model, {
    messages,
    response_format: { type: "json_schema", json_schema },
    temperature: 0,
    max_tokens
  });
  const parsed = ensureObj(resp);
  if (!parsed) throw new Error("Schema response parse failed");
  return parsed;
}
