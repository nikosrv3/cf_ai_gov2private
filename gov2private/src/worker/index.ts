// Main worker file - handles all the API routes
// TODO: maybe split this into separate route files later if it gets too big
export { UserStateSql } from "./UserStateSql";

import { Hono } from "hono";
import type { UserStateSql } from "./UserStateSql";
import { getUserStateClient } from "./userStateClient";
import { toChatTurns, type ChatTurn, type JobRole, type RunData, type NormalizedData } from "../types/run";
import { ensureUidFromCookieHeader } from "./cookies";

// AI functions - moved these to separate file to keep things organized
import {
  normalizeResume,
  proposeRoles,
  generateShortJD,
  extractRequirements,
  mapTransferable,
  rewriteExperienceBullets,
  transformBulletsBatch,
  scoreSkills,
  assembleDraft
} from "./ai";

// Environment bindings - these come from wrangler.toml
type Env = {
  AI: any; // Workers AI binding
  USER_STATE_SQL: DurableObjectNamespace<UserStateSql>;
  MODEL: string; // AI model to use
  APP_SECRET: string; // for signing cookies
};

const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

// Middleware to handle user identification via cookies
// This creates anonymous users so we don't need login
app.use("*", async (c, next) => {
  const secret = c.env.APP_SECRET;
  if (!secret) {
    console.error("Missing APP_SECRET in environment");
    return c.json({ ok: false, error: "server_misconfigured: missing APP_SECRET" }, 500);
  }

  const cookieHeader = c.req.header("Cookie");
  const { uid, setCookies } = await ensureUidFromCookieHeader(secret, cookieHeader);

  // Set any new cookies that need to be created
  for (const sc of setCookies) {
    c.header("Set-Cookie", sc, { append: true });
  }

  c.set("uid", uid);
  await next();
});

// Simple health check endpoint
app.get("/api/health", (c) => c.text("ok"));

// Main endpoint for discovering job roles based on resume
app.post("/api/discover-jobs", async (c) => {
  try {
  const body = (await c.req.json().catch(() => ({}))) as {
      background?: string; 
      resumeText?: string;
  };

  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

    // Create a new run for this user
    const runId = randomId();
    await user.createRun(runId, { status: "queued" });

    // Parse and normalize the resume using AI
    const resumeJson = await normalizeResume(
      c.env.AI, 
      c.env.MODEL, 
      body.resumeText ?? "", 
      body.background ?? ""
    );
  await user.saveRunPart(runId, { phases: { normalize: resumeJson } });

    // Get AI to suggest relevant job roles
    const { candidates } = await proposeRoles(
      c.env.AI, 
      c.env.MODEL, 
      body.background ?? "", 
      resumeJson
    );
    await user.setRoleCandidates(runId, candidates);

  const run = (await user.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run });
  } catch (error) {
    console.error("Error in discover-jobs:", error);
    return c.json({ ok: false, error: "discovery_failed" }, 500);
  }
});

// Get a specific run by ID
app.get("/api/run/:id", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);
  
  const run = await user.getRun(runId);
  if (!run) {
    return c.json({ ok: false, error: "not_found" }, 404);
  }
  
  return c.json({ ok: true, run });
});

// Get user's run history
app.get("/api/history", async (c) => {
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);
  
  // Limit to last 20 runs to keep response size reasonable
  const items = await user.getHistory(20);
  return c.json({ ok: true, items });
});

// Role selection and tailoring endpoints

app.post("/api/run/:id/select-role", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const body = (await c.req.json().catch(() => ({}))) as {
    roleId?: string;
    customRole?: JobRole;
    jobDescription?: string;
    useAiGenerated?: boolean;
  };

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) {
    return c.json({ ok: false, error: "not_found" }, 404);
  }

  let chosenRole: JobRole;
  
  if (body.customRole) {
    // User provided their own custom role
    chosenRole = body.customRole;
  } else if (body.roleId) {
    // Find the selected role from our candidates
    const candidates = run.phases?.roleDiscovery ?? [];
    const chosen = candidates.find((r) => String(r.id) === String(body.roleId));
    
    if (!chosen) {
      return c.json({ ok: false, error: "invalid_role" }, 400);
    }
    chosenRole = chosen;
  } else {
    return c.json({ ok: false, error: "missing_role" }, 400);
  }

  // Handle job description - either user provided or we generate one
  let jd = body.jobDescription?.trim();
  let source: "user_pasted" | "llm_generated" = "user_pasted";
  
  if (!jd) {
    if (body.useAiGenerated) {
      // Generate a job description using AI
      jd = await generateShortJD(c.env.AI, c.env.MODEL, chosenRole.title).catch(() => "");
      source = "llm_generated";
    } else {
      // Use the description from the role candidate
      jd = chosenRole.description;
      source = "llm_generated";
    }
  }

  await user.setSelectedRole(runId, chosenRole, { jobDescription: jd, source });

  // Now run the full tailoring pipeline
  const requirements = await extractRequirements(c.env.AI, c.env.MODEL, chosenRole.title, jd);
  await user.saveRunPart(runId, { phases: { requirements } });

  // Map transferable skills from resume to job requirements
  const mapping = await mapTransferable(
    c.env.AI, 
    c.env.MODEL, 
    run.phases?.normalize as NormalizedData ?? {
      name: null,
      contact: { email: null, phone: null, location: null, links: [] },
      skills: [],
      education: [],
      experience: [],
      certifications: []
    }, 
    requirements
  );
  await user.saveRunPart(runId, { phases: { mapping } });

  // Rewrite the experience bullets to be more relevant to the target role
  const updatedExperience = await rewriteExperienceBullets(
    c.env.AI, 
    c.env.MODEL, 
    run.phases?.normalize?.experience || [], 
    mapping, 
    chosenRole.title
  );
  
  // Update the normalized data with the new experience bullets
  const currentNormalize = run.phases?.normalize || {
    name: null,
    contact: { email: null, phone: null, location: null, links: [] },
    skills: [],
    education: [],
    experience: [],
    certifications: []
  };
  await user.saveRunPart(runId, { 
    phases: { 
      normalize: { 
        ...currentNormalize, 
        experience: updatedExperience 
      } 
    } 
  });

  const scoring = await scoreSkills(mapping);
  await user.saveRunPart(runId, { phases: { scoring } });

  const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
    bullets: [], // No longer using separate bullets, experience bullets are in the normalize section
    requirements, mapping, background: run.background, title: chosenRole.title
  });
  await user.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: chosenRole.title });

  const finalRun = (await user.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run: finalRun });
});

/* -------------------- Change Role -------------------- */
app.post("/api/run/:id/change-role", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const body = (await c.req.json().catch(() => ({}))) as {
    roleId?: string;
    customRole?: JobRole;
  };

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  let chosenRole: JobRole;
  
  if (body.customRole) {
    chosenRole = body.customRole;
  } else if (body.roleId) {
    const candidates = run.phases?.roleDiscovery ?? [];
    const chosen = candidates.find((r) => String(r.id) === String(body.roleId));
    if (!chosen) return c.json({ ok: false, error: "invalid_role" }, 400);
    chosenRole = chosen;
  } else {
    return c.json({ ok: false, error: "missing_role" }, 400);
  }

  // Generate job description if not provided
  const jd = await generateShortJD(c.env.AI, c.env.MODEL, chosenRole.title).catch(() => chosenRole.description);
  
  await user.setSelectedRole(runId, chosenRole, { jobDescription: jd, source: "llm_generated" });
  await user.saveRunPart(runId, { status: "generating" });

  return c.json({ ok: true });
});

/* -------------------- Generate -------------------- */
app.post("/api/run/:id/generate", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  const selectedRole = run.phases?.selectedRole;
  if (!selectedRole) return c.json({ ok: false, error: "no_selected_role" }, 400);

  const jd = run.jobDescription || selectedRole.description;

  // Run the full tailoring pipeline
  const requirements = await extractRequirements(c.env.AI, c.env.MODEL, selectedRole.title, jd);
  await user.saveRunPart(runId, { phases: { requirements } });

  const mapping = await mapTransferable(c.env.AI, c.env.MODEL, run.phases?.normalize as NormalizedData ?? {
    name: null,
    contact: { email: null, phone: null, location: null, links: [] },
    skills: [],
    education: [],
    experience: [],
    certifications: []
  }, requirements);
  await user.saveRunPart(runId, { phases: { mapping } });

  // Update experience bullets instead of creating separate Key Achievements
  const updatedExperience = await rewriteExperienceBullets(c.env.AI, c.env.MODEL, run.phases?.normalize?.experience || [], mapping, selectedRole.title);
  const currentNormalize = run.phases?.normalize || {
    name: null,
    contact: { email: null, phone: null, location: null, links: [] },
    skills: [],
    education: [],
    experience: [],
    certifications: []
  };
  await user.saveRunPart(runId, { phases: { normalize: { ...currentNormalize, experience: updatedExperience } } });

  const scoring = await scoreSkills(mapping);
  await user.saveRunPart(runId, { phases: { scoring } });

  const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
    bullets: [], // No longer using separate bullets, experience bullets are in the normalize section
    requirements, mapping, background: run.background, title: selectedRole.title
  });
  await user.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: selectedRole.title });

  const finalRun = (await user.getRun(runId)) as RunData | null;
  return c.json({ ok: true, run: finalRun });
});

/* -------------------- Chatbot endpoints -------------------- */

type BulletStyle = "quant" | "short" | "lead" | "ats" | "dejargon";



const BULLET_STYLE_INSTRUCTIONS: Record<BulletStyle, string> = {
  quant:
    "Rewrite as a single resume bullet. Lead with a strong verb, add realistic quantification (use '~' for estimates), keep meaning, no fluff.",
  short:
    "Rewrite as a single concise bullet (<22 words), strong verb, preserve impact, remove filler, no trailing period.",
  lead:
    "Rewrite to emphasize leadership/ownership and cross-functional impact. Single bullet, outcome first, then how.",
  ats:
    "Rewrite to naturally include relevant industry keywords (no stuffing). Single bullet, scannable.",
  dejargon:
    "Rewrite in plain industry terms (remove government jargon). Single bullet, keep technical accuracy."
};

// LinkedIn search URL generator
function generateLinkedInSearchUrl(jobTitle: string, location?: string): string {
  // Encode spaces but keep quotes visible in the URL
  const encodedKeywords = jobTitle.replace(/ /g, '%20');
  const encodedLocation = location ? encodeURIComponent(location) : "";
  
  // LinkedIn job search with boolean operators - build URL manually
  const baseUrl = "https://www.linkedin.com/jobs/search/";
  const params = [
    `keywords=${encodedKeywords}`, // Keep quotes visible, encode spaces
    `location=${encodedLocation}`,
    `f_TPR=r604800`, // Past week
    `f_JT=F`, // Full-time
    `f_WT=2`, // Remote
    `f_E=2%2C3%2C4%2C5`, // Mid to senior level (manually encoded comma)
    `sortBy=DD` // Date posted
  ].filter(p => !p.includes('location=') || encodedLocation).join('&');
  
  return `${baseUrl}?${params}`;
}

// Generate multiple LinkedIn search variations
function generateLinkedInSearchLinks(jobTitle: string, location?: string): Array<{title: string, url: string}> {
  const links = [];
  
  // Main search - just the job title without quotes for simple search
  links.push({
    title: `${jobTitle} Jobs`,
    url: generateLinkedInSearchUrl(jobTitle, location)
  });
  
  // Alternative searches with boolean operators
  const titleWords = jobTitle.toLowerCase().split(/\s+/);
  if (titleWords.length > 1) {
    // Search with AND operator - each word gets its own quotes
    const andSearch = titleWords.map(word => `"${word}"`).join(" AND ");
    links.push({
      title: `${andSearch} (Exact Match)`,
      url: generateLinkedInSearchUrl(andSearch, location)
    });
    
    // Search with OR operator for related terms - each word gets its own quotes
    const orSearch = titleWords.map(word => `"${word}"`).join(" OR ");
    links.push({
      title: `${orSearch} (Related Roles)`,
      url: generateLinkedInSearchUrl(orSearch, location)
    });
  }
  
  // Senior level search
  links.push({
    title: `Senior ${jobTitle}`,
    url: generateLinkedInSearchUrl(`Senior ${jobTitle}`, location)
  });
  
  return links;
}

// Humanized response messages
const HUMANIZED_RESPONSES = {
  bulletTransform: {
    quant: "I've added more numbers and metrics to make your bullets more impactful!",
    short: "I've made your bullets more concise and punchy!",
    lead: "I've enhanced your bullets with stronger leadership language!",
    ats: "I've optimized your bullets with ATS-friendly keywords!",
    dejargon: "I've simplified your bullets to be clearer and more accessible!"
  },
  summaryTransform: {
    quant: "I've made your professional summary more data-driven with specific metrics!",
    short: "I've condensed your summary to be more impactful and concise!",
    lead: "I've strengthened your summary with executive-level language!",
    ats: "I've optimized your summary with relevant keywords for better visibility!",
    dejargon: "I've simplified your summary to be more accessible and clear!"
  }
};


app.post("/api/chat", async (c) => {
  const uid = c.get("uid"); // from cookie middleware
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  type ChatBody = { runId?: string; message?: string; context?: string };
  const body = (await c.req.json().catch(() => ({}))) as ChatBody;

  const runId = body.runId?.trim();
  const userMsg = (body.message ?? "").trim();
  const context = body.context || "general";
  if (!userMsg) return c.json({ ok: false, error: "empty_message" }, 400);

  const run = runId ? await user.getRun(runId) : null;
  // Build a compact run context (avoid token bloat)
  const ctx: string[] = [];
  if (run) {
    ctx.push(
      `RUN STATUS: ${run.status}`,
      run.targetRole ? `TARGET ROLE: ${run.targetRole}` : "",
      run.phases?.requirements ? `REQS: ${JSON.stringify(run.phases.requirements).slice(0, 600)}` : "",
      run.phases?.bullets ? `BULLETS: ${JSON.stringify(run.phases.bullets).slice(0, 600)}` : "",
      run.phases?.draft ? `DRAFT: ${String(run.phases.draft).slice(0, 600)}` : ""
    );
  } else {
    ctx.push("RUN: none");
  }

  // Lightweight intent handling
  const lower = userMsg.toLowerCase();
  const mExplain = lower.match(/\bexplain role (\d+)\b/);
  const mSelect = lower.match(/\bselect role (\d+)\b/);

  // Helper to reply and persist chat
  async function reply(text: string) {
    if (runId) {
      const rawHistory = (run?.phases as any)?.chat as unknown;
      const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
      const newChat: ChatTurn[] = [
        ...prior,
        { role: "user" as const, content: userMsg },
        { role: "assistant" as const, content: text }
      ];
      await user.saveRunPart(runId, { phases: { chat: newChat } });
    }
    return c.json({ ok: true, reply: text });
  }

  // Intent: explain role N
  if (mExplain && run?.phases?.roleDiscovery) {
    const idx = Number(mExplain[1]) - 1;
    const cand = run.phases.roleDiscovery[idx];
    if (!cand) return reply(`I can't find role ${mExplain[1]}.`);
    const expl = [
      `**${cand.title}** — why it fits:`,
      `• ${cand.description}`,
      cand.score ? `• Match score: ${cand.score}%` : ""
    ].filter(Boolean).join("\n");
    return reply(expl);
  }

  // Intent: select role N
  if (mSelect && runId && run?.phases?.roleDiscovery) {
    const idx = Number(mSelect[1]) - 1;
    const cand = run.phases.roleDiscovery[idx];
    if (!cand) return reply(`I can't find role ${mSelect[1]}.`);

    try {
      await user.setSelectedRole(runId, cand, {
        jobDescription: cand.description,
        source: "llm_generated"
      });

      const jd = cand.description;
      const requirements = await extractRequirements(c.env.AI, c.env.MODEL, cand.title, jd);
      await user.saveRunPart(runId, { phases: { requirements } });

      const mapping = await mapTransferable(c.env.AI, c.env.MODEL, run?.phases?.normalize as NormalizedData ?? {
        name: null,
        contact: { email: null, phone: null, location: null, links: [] },
        skills: [],
        education: [],
        experience: [],
        certifications: []
      }, requirements);
      await user.saveRunPart(runId, { phases: { mapping } });

      // Update experience bullets instead of creating separate Key Achievements
      const updatedExperience = await rewriteExperienceBullets(c.env.AI, c.env.MODEL, run?.phases?.normalize?.experience || [], mapping, cand.title);
      const currentNormalize = run?.phases?.normalize || {
        name: null,
        contact: { email: null, phone: null, location: null, links: [] },
        skills: [],
        education: [],
        experience: [],
        certifications: []
      };
      await user.saveRunPart(runId, { phases: { normalize: { ...currentNormalize, experience: updatedExperience } } });

      const scoring = await scoreSkills(mapping);
      await user.saveRunPart(runId, { phases: { scoring } });

      const draft = await assembleDraft(c.env.AI, c.env.MODEL, {
        bullets: [], // No longer using separate bullets, experience bullets are in the normalize section
        requirements, mapping, background: run?.background, title: cand.title
      });
      await user.saveRunPart(runId, { phases: { draft }, status: "done", targetRole: cand.title });

      return reply(`Selected **${cand.title}** and tailored your resume. Check the Draft tab.`);
    } catch (err: any) {
      console.error("[chat select-role] error:", err?.stack || err?.message || err);
      return reply(`I hit an error while tailoring: ${String(err?.message ?? err)}.`);
    }
  }

  // Bullet edit intent path - handle different contexts
  if (run && run.phases) {
    const msgLower = userMsg.toLowerCase();
    const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const style = detectStyleNL(msgLower);

    // Handle general bullet transformation requests (now applies to experience bullets)
    if ((context === "bullets" || context === "general") && run.phases?.normalize?.experience) {
      const experience = run.phases.normalize.experience;
      
      // Only try AI-based intent extraction if context is "bullets" or user is clearly talking about bullets
      const isBulletContext = context === "bullets" || /\b(bullet|bullets|job|jobs|experience|work history)\b/i.test(userMsg);
      
      let intent = null;
      if (isBulletContext) {
        intent = await extractBulletTransformIntent(c.env.AI, model, experience, userMsg);
      }
      
      if (intent && intent.style && intent.targets.length > 0) {
        const instruction = BULLET_STYLE_INSTRUCTIONS[intent.style];
        const newExperience = [...experience];
        let totalBulletsTransformed = 0;
        const jobDescriptions: string[] = [];
        
        try {
          // Transform bullets for each target
          for (const target of intent.targets) {
            const { jobIdx, bulletIndices } = target;
            const job = experience[jobIdx];
            
            if (job.bullets && job.bullets.length > 0) {
              const bulletsToTransform = bulletIndices.map(i => job.bullets[i]);
              const rewritten = await transformBulletsBatch(c.env.AI, model, bulletsToTransform, instruction, bulletIndices.map((_, i) => i));
              
              const newJob = { ...job, bullets: [...job.bullets] };
              bulletIndices.forEach((originalIdx: number, newIdx: number) => {
                newJob.bullets[originalIdx] = rewritten[newIdx] || job.bullets[originalIdx];
              });
              
              newExperience[jobIdx] = newJob;
              totalBulletsTransformed += bulletIndices.length;
              
              // Create job description
              const jobDesc = jobIdx === 0 ? "first job" : jobIdx === experience.length - 1 ? "last job" : `job ${jobIdx + 1}`;
              const bulletDesc = bulletIndices.length === 1 
                ? `bullet ${bulletIndices[0] + 1}` 
                : bulletIndices.length === job.bullets.length
                ? "all bullets"
                : `bullets ${bulletIndices.map(i => i + 1).join(", ")}`;
              
              jobDescriptions.push(`${jobDesc} (${bulletDesc})`);
            }
          }
          
          await user.saveRunPart(run.id, { phases: { normalize: { ...run.phases.normalize, experience: newExperience } } });
          
           const description = intent.targets.length === 1 
             ? jobDescriptions[0]
             : `all ${experience.length} jobs`;
           
           const baseMessage = HUMANIZED_RESPONSES.bulletTransform[intent.style];
           return reply(`${baseMessage} Updated ${description} (${totalBulletsTransformed} bullets total).`);
        } catch (e: any) {
          console.error("[chat bullet-transform] AI intent fail:", e?.message || e);
          return reply(`I couldn't rewrite those bullets just now. Please try again.`);
        }
      }
      
      // Fallback to heuristic-based approach
      const style = detectStyleNL(msgLower);
      if (style) {
        // Check for "across all jobs" requests
        if (/\bacross\s+all\s+jobs?\b/.test(msgLower) || /\ball\s+jobs?\b/.test(msgLower)) {
      const instruction = BULLET_STYLE_INSTRUCTIONS[style];
          const newExperience = [...experience];
          let totalBulletsTransformed = 0;
          
          try {
            // Transform bullets for each job
            for (let jobIdx = 0; jobIdx < experience.length; jobIdx++) {
              const job = experience[jobIdx];
              if (job.bullets && job.bullets.length > 0) {
                const bulletsToTransform = job.bullets;
                const rewritten = await transformBulletsBatch(c.env.AI, model, bulletsToTransform, instruction, bulletsToTransform.map((_, i) => i));
                
                const newJob = { ...job, bullets: [...job.bullets] };
                rewritten.forEach((newBullet, idx) => {
                  newJob.bullets[idx] = newBullet;
                });
                
                newExperience[jobIdx] = newJob;
                totalBulletsTransformed += job.bullets.length;
              }
            }
            
             await user.saveRunPart(run.id, { phases: { normalize: { ...run.phases.normalize, experience: newExperience } } });
             const baseMessage = HUMANIZED_RESPONSES.bulletTransform[style];
             return reply(`${baseMessage} Updated all bullets across all ${experience.length} jobs (${totalBulletsTransformed} bullets total).`);
          } catch (e: any) {
            console.error("[chat bullet-transform] all jobs fail:", e?.message || e);
            return reply(`I couldn't rewrite all the bullets just now. Please try again.`);
          }
        } else {
          // Try to find a specific job and bullet to transform
          const targeting = parseJobAndBulletTargeting(msgLower, experience);
          
          if (targeting) {
            const { jobIdx, bulletIndices } = targeting;
            const job = experience[jobIdx];
            
            const instruction = BULLET_STYLE_INSTRUCTIONS[style];
            const bulletsToTransform = bulletIndices.map(i => job.bullets[i]);
            
            try {
              const rewritten = await transformBulletsBatch(c.env.AI, model, bulletsToTransform, instruction, bulletIndices.map((_, i) => i));
              
              const newExperience = [...experience];
              const newJob = { ...job, bullets: [...job.bullets] };
              
              bulletIndices.forEach((originalIdx: number, newIdx: number) => {
                newJob.bullets[originalIdx] = rewritten[newIdx] || job.bullets[originalIdx];
              });
              
              newExperience[jobIdx] = newJob;
              
              // Create a more natural description
              const jobDesc = jobIdx === 0 ? "first job" : jobIdx === experience.length - 1 ? "last job" : `job ${jobIdx + 1}`;
              const bulletDesc = bulletIndices.length === 1 
                ? `bullet ${bulletIndices[0] + 1}` 
                : bulletIndices.length === job.bullets.length
                ? "all bullets"
                : `bullets ${bulletIndices.map(i => i + 1).join(", ")}`;
              
               await user.saveRunPart(run.id, { phases: { normalize: { ...run.phases.normalize, experience: newExperience } } });
               const baseMessage = HUMANIZED_RESPONSES.bulletTransform[style];
               return reply(`${baseMessage} Updated ${jobDesc}, ${bulletDesc}.`);
      } catch (e: any) {
        console.error("[chat bullet-transform] batch fail:", e?.message || e);
        return reply(`I couldn't rewrite those bullets just now. Please try again.`);
            }
          }
        }
      }
    }

    // Handle Experience section bullets
    if ((context === "experience" || context === "general") && run.phases?.normalize?.experience) {
      const experience = run.phases.normalize.experience;
      
      // Try enhanced natural language parsing first
      let result = await handleExperienceBulletTransform(c.env.AI, model, experience, userMsg, msgLower, style);
      
      // If that fails and we have a style, try LLM-based intent parsing
      if (!result && style) {
        result = await handleExperienceBulletTransformLLM(c.env.AI, model, experience, userMsg, style);
      }
      
      if (result) {
        await user.saveRunPart(run.id, { phases: { normalize: { ...run.phases.normalize, experience: result.experience } } });
        return reply(result.message);
      }
    }

    // Handle Professional Summary
    if ((context === "summary" || context === "general") && run.phases?.normalize?.summary) {
      const result = await handleSummaryTransform(c.env.AI, model, run.phases.normalize.summary, userMsg, msgLower, style);
      if (result) {
        await user.saveRunPart(run.id, { phases: { normalize: { ...run.phases.normalize, summary: result.summary } } });
        return reply(result.message);
      }
    }
  }

  // ---- Section edit intents (skills/summary/certs/experience bullets) -----------
  if (run && run.phases) {
    const r = run as RunData;
    const lowerMsg = userMsg.toLowerCase();

    // Helper: fully-initialized NormalizedData to avoid undefineds
    const cur = (r.phases as any)?.normalize as Partial<NormalizedData> | undefined;
    const norm: NormalizedData = {
      name: cur?.name ?? null,
      contact: {
        email: cur?.contact?.email ?? null,
        phone: cur?.contact?.phone ?? null,
        location: cur?.contact?.location ?? null,
        links: Array.isArray(cur?.contact?.links) ? [...cur!.contact!.links].slice(0, 10) : [],
      },
      summary: cur?.summary ?? null,
      education: Array.isArray(cur?.education) ? [...cur!.education] : [],
      skills: Array.isArray(cur?.skills) ? [...cur!.skills] : [],
      certifications: Array.isArray(cur?.certifications) ? [...cur!.certifications] : [],
      experience: Array.isArray(cur?.experience)
        ? cur!.experience!.map((e: any) => ({
            title: String(e?.title ?? "").slice(0, 120) || "Role",
            org: String(e?.org ?? "").slice(0, 160) || "Organization",
            location: e?.location ? String(e.location).slice(0, 120) : null,
            start: e?.start ? String(e.start).slice(0, 40) : null,
            end: e?.end ? String(e.end).slice(0, 40) : null,
            bullets: Array.isArray(e?.bullets) ? [...e.bullets] : [],
            skills: Array.isArray(e?.skills) ? [...e.skills] : [],
          }))
        : [],
    };

    // Add skill: "add X to skills"
    const addSkill = lowerMsg.match(/add\s+["']?(.+?)["']?\s+to\s+skills/);
    if (addSkill) {
      const skill = addSkill[1].trim().slice(0, 40);
      const curSet = new Set(norm.skills.map((s: string) => s.toLowerCase()));
      if (!curSet.has(skill.toLowerCase())) norm.skills.push(skill);
      await user.saveRunPart(runId!, { phases: { normalize: norm } });
      return reply(`Added **${skill}** to Skills.`);
    }

    // Remove skill: "remove X from skills"
    const remSkill = lowerMsg.match(/remove\s+["']?(.+?)["']?\s+from\s+skills/);
    if (remSkill) {
      const skill = remSkill[1].trim().toLowerCase();
      norm.skills = norm.skills.filter((s: string) => s.toLowerCase() !== skill);
      await user.saveRunPart(runId!, { phases: { normalize: norm } });
      return reply(`Removed **${remSkill[1]}** from Skills.`);
    }

    // Replace summary: `summary: <new text>` or "update summary to ..."
    const mSummary = userMsg.match(/(?:^|\b)(?:summary\s*:\s*|update\s+summary\s+to\s+)([\s\S]+)$/i);
    if (mSummary) {
      const text = mSummary[1].trim().slice(0, 1200);
      (norm as any).summary = text;
      await user.saveRunPart(runId!, { phases: { normalize: norm } });
      return reply(`Updated **Summary**.`);
    }

    // Add certification: `add cert: AWS Cloud Practitioner (2023)`
    const mCert = userMsg.match(/add\s+cert(?:ification)?:\s*([\s\S]+)$/i);
    if (mCert) {
      const item = mCert[1].trim().slice(0, 120);
      (norm as any).certifications = Array.isArray((norm as any).certifications)
        ? (norm as any).certifications
        : [];
      (norm as any).certifications.push(item);
      await user.saveRunPart(runId!, { phases: { normalize: norm } });
      return reply(`Added certification: **${item}**.`);
    }

    // Edit experience bullet: "replace job 1 bullet 2: <new bullet>"
    const mExp = userMsg.match(/(?:replace|update)\s+job\s+(\d+)\s+bullet\s+(\d+)\s*:\s*([\s\S]+)$/i);
    if (mExp) {
      const jobIdx = Math.max(0, parseInt(mExp[1], 10) - 1);
      const bullIdx = Math.max(0, parseInt(mExp[2], 10) - 1);
      const newBullet = mExp[3].trim().slice(0, 300);

      if (norm.experience[jobIdx]) {
        const bulletsArr = Array.isArray(norm.experience[jobIdx].bullets)
          ? [...norm.experience[jobIdx].bullets]
          : [];
        if (bullIdx >= 0 && bullIdx < bulletsArr.length) {
          bulletsArr[bullIdx] = newBullet;
          norm.experience[jobIdx].bullets = bulletsArr;
          await user.saveRunPart(runId!, { phases: { normalize: norm } });
          return reply(`Updated Job ${jobIdx + 1}, bullet ${bullIdx + 1}.`);
        }
      }
    }
  }

  // Default: LLM Q&A grounded to run
  const system = [
    `You are a resume-transformation copilot for government-to-private-sector transitions.`,
    `Be concise and actionable; suggest bullet rewrites when helpful.`,
    `Context:`,
    ctx.filter(Boolean).join("\n")
  ].join("\n");

  const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  try {
    const resp = await c.env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg }
      ],
      temperature: 0,
      max_tokens: 2000
    });
    const text = toText(resp).trim();
    return reply(text || "I didn’t generate a response.");
  } catch (e: any) {
    console.error("[/api/chat] error:", e?.message || e);
    return c.json({ ok: false, error: "ai_error" }, 500);
  }
});

/* -------------------- Alternative chat route -------------------- */
app.post("/api/run/:id/chat", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  type ChatBody = { message?: string; context?: string };
  const body = (await c.req.json().catch(() => ({}))) as ChatBody;

  const userMsg = (body.message ?? "").trim();
  if (!userMsg) return c.json({ ok: false, error: "empty_message" }, 400);

  const run = await user.getRun(runId);
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  // Build context
  const ctx: string[] = [];
  ctx.push(
    `RUN STATUS: ${run.status}`,
    run.targetRole ? `TARGET ROLE: ${run.targetRole}` : "",
    run.phases?.requirements ? `REQS: ${JSON.stringify(run.phases.requirements).slice(0, 600)}` : "",
    run.phases?.draft ? `DRAFT: ${String(run.phases.draft).slice(0, 600)}` : ""
  );

  // Handle experience bullet edit intents
  if (run.phases?.normalize?.experience) {
    const experience = run.phases.normalize.experience;
    const msgLower = userMsg.toLowerCase();
    const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

    // Detect style and apply transform
    const style = detectStyleNL(msgLower);
    if (style) {
      // Check for "across all jobs" requests
      if (/\bacross\s+all\s+jobs?\b/.test(msgLower) || /\ball\s+jobs?\b/.test(msgLower)) {
        const instruction = BULLET_STYLE_INSTRUCTIONS[style];
        const newExperience = [...experience];
        let totalBulletsTransformed = 0;
        
        try {
          // Transform bullets for each job
          for (let jobIdx = 0; jobIdx < experience.length; jobIdx++) {
            const job = experience[jobIdx];
            if (job.bullets && job.bullets.length > 0) {
              const bulletsToTransform = job.bullets;
              const rewritten = await transformBulletsBatch(c.env.AI, model, bulletsToTransform, instruction, bulletsToTransform.map((_, i) => i));
              
              const newJob = { ...job, bullets: [...job.bullets] };
              rewritten.forEach((newBullet, idx) => {
                newJob.bullets[idx] = newBullet;
              });
              
              newExperience[jobIdx] = newJob;
              totalBulletsTransformed += job.bullets.length;
            }
          }
          
          await user.saveRunPart(runId, { phases: { normalize: { ...run.phases.normalize, experience: newExperience } } });

           const baseMessage = HUMANIZED_RESPONSES.bulletTransform[style];
           const reply = `${baseMessage} Updated all bullets across all ${experience.length} jobs (${totalBulletsTransformed} bullets total).`;

          // Add to chat history
          const rawHistory = (run?.phases as any)?.chat as unknown;
          const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
          const newChat: ChatTurn[] = [
            ...prior,
            { role: "user" as const, content: userMsg },
            { role: "assistant" as const, content: reply }
          ];
          await user.saveRunPart(runId, { phases: { chat: newChat } });

          return c.json({ ok: true, reply });
        } catch (e: any) {
          console.error("[chat bullet-transform] all jobs fail:", e?.message || e);
          return c.json({ ok: false, error: "ai_error" }, 500);
        }
      } else {
        const targeting = parseJobAndBulletTargeting(msgLower, experience);
        if (targeting) {
          const { jobIdx, bulletIndices } = targeting;
          const job = experience[jobIdx];
          
          const instruction = BULLET_STYLE_INSTRUCTIONS[style];
          const bulletsToTransform = bulletIndices.map(i => job.bullets[i]);
          
          let rewritten: string[] = [];
          try {
            rewritten = await transformBulletsBatch(c.env.AI, model, bulletsToTransform, instruction, bulletIndices.map((_, i) => i));
          } catch (e: any) {
            console.error("[chat bullet-transform] batch fail:", e?.message || e);
            return c.json({ ok: false, error: "ai_error" }, 500);
          }

          const newExperience = [...experience];
          const newJob = { ...job, bullets: [...job.bullets] };
          
          bulletIndices.forEach((originalIdx: number, newIdx: number) => {
            newJob.bullets[originalIdx] = rewritten[newIdx] || job.bullets[originalIdx];
          });
          
          newExperience[jobIdx] = newJob;
          
          // Create a more natural description
          const jobDesc = jobIdx === 0 ? "first job" : jobIdx === experience.length - 1 ? "last job" : `job ${jobIdx + 1}`;
          const bulletDesc = bulletIndices.length === 1 
            ? `bullet ${bulletIndices[0] + 1}` 
            : bulletIndices.length === job.bullets.length
            ? "all bullets"
            : `bullets ${bulletIndices.map(i => i + 1).join(", ")}`;
          
          await user.saveRunPart(runId, { phases: { normalize: { ...run.phases.normalize, experience: newExperience } } });

           const baseMessage = HUMANIZED_RESPONSES.bulletTransform[style];
           const reply = `${baseMessage} Updated ${jobDesc}, ${bulletDesc}.`;

          // Add to chat history
          const rawHistory = (run?.phases as any)?.chat as unknown;
          const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
          const newChat: ChatTurn[] = [
            ...prior,
            { role: "user" as const, content: userMsg },
            { role: "assistant" as const, content: reply }
          ];
          await user.saveRunPart(runId, { phases: { chat: newChat } });

          return c.json({ ok: true, reply });
        }
      }
    }
  }

  // Handle Professional Summary transformations
  if (run.phases?.normalize?.summary) {
    const msgLower = userMsg.toLowerCase();
    const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const style = detectStyleNL(msgLower);
    
    const result = await handleSummaryTransform(c.env.AI, model, run.phases.normalize.summary, userMsg, msgLower, style);
    if (result) {
      await user.saveRunPart(runId, { phases: { normalize: { ...run.phases.normalize, summary: result.summary } } });
      
      // Add to chat history
      const rawHistory = (run?.phases as any)?.chat as unknown;
      const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
      const newChat: ChatTurn[] = [
        ...prior,
        { role: "user" as const, content: userMsg },
        { role: "assistant" as const, content: result.message }
      ];
      await user.saveRunPart(runId, { phases: { chat: newChat } });

      return c.json({ ok: true, reply: result.message });
    }
  }

  // Default: LLM Q&A
  const system = [
    `You are a resume-transformation copilot for government-to-private-sector transitions.`,
    `Be concise and actionable; suggest bullet rewrites when helpful.`,
    `Context:`,
    ctx.filter(Boolean).join("\n")
  ].join("\n");

  const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  try {
    const resp = await c.env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg }
      ],
      temperature: 0,
      max_tokens: 2000
    });
    const text = toText(resp).trim();
    const reply = text || "I didn't generate a response.";

    // Add to chat history
    const rawHistory = (run?.phases as any)?.chat as unknown;
    const prior: ChatTurn[] = toChatTurns(rawHistory).slice(-12);
    const newChat: ChatTurn[] = [
      ...prior,
      { role: "user" as const, content: userMsg },
      { role: "assistant" as const, content: reply }
    ];
    await user.saveRunPart(runId, { phases: { chat: newChat } });

    return c.json({ ok: true, reply });
  } catch (e: any) {
    console.error("[/api/run/:id/chat] error:", e?.message || e);
    return c.json({ ok: false, error: "ai_error" }, 500);
  }
});

/* -------------------- Bullet edit API -------------------- */

app.post("/api/run/:id/bullets/transform", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  type Body = { 
    style?: keyof typeof BULLET_STYLE_INSTRUCTIONS; 
    jobIndex?: number;
    bulletIndexes?: number[] 
  };
  const body = (await c.req.json().catch(() => ({}))) as Body;

  const style = body.style;
  if (!style || !BULLET_STYLE_INSTRUCTIONS[style]) {
    return c.json({ ok: false, error: "invalid_style" }, 400);
  }

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 400);

  const experience = run.phases?.normalize?.experience;
  if (!Array.isArray(experience) || experience.length === 0) {
    return c.json({ ok: false, error: "no_experience" }, 400);
  }

  const jobIndex = body.jobIndex ?? 0;
  if (jobIndex < 0 || jobIndex >= experience.length) {
    return c.json({ ok: false, error: "invalid_job_index" }, 400);
  }

  const job = experience[jobIndex];
  const bullets = job.bullets || [];
  if (bullets.length === 0) {
    return c.json({ ok: false, error: "no_bullets" }, 400);
  }

  const allIndex = bullets.map((_, i) => i);
  const targetIndex = Array.isArray(body.bulletIndexes) && body.bulletIndexes.length
    ? [...new Set(body.bulletIndexes.filter(i => Number.isInteger(i) && i >= 0 && i < bullets.length))]
    : allIndex;

  if (targetIndex.length === 0) return c.json({ ok: false, error: "no_valid_indices" }, 400);

  const model = c.env.MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const instruction = BULLET_STYLE_INSTRUCTIONS[style];

  let rewritten: string[] = [];
  try {
    rewritten = await transformBulletsBatch(c.env.AI, model, bullets, instruction, targetIndex);
  } catch (e: any) {
    console.error("[/bullets/transform] batch failed:", e?.message || e);
    return c.json({ ok: false, error: "ai_error" }, 500);
  }

  const newExperience = [...experience];
  const newJob = { ...job, bullets: [...bullets] };
  targetIndex.forEach((i, k) => { newJob.bullets[i] = rewritten[k] || bullets[i]; });
  newExperience[jobIndex] = newJob;

  const currentNormalize = run.phases?.normalize || {
    name: null,
    contact: { email: null, phone: null, location: null, links: [] },
    skills: [],
    education: [],
    experience: [],
    certifications: []
  };
  await user.saveRunPart(runId, { phases: { normalize: { ...currentNormalize, experience: newExperience } } });

  return c.json({
    ok: true,
    runId,
    style,
    jobIndex,
    updated: targetIndex.length,
    bulletIndexes: targetIndex,
    bullets: newJob.bullets
  });
});

/* -------------------- LinkedIn Search -------------------- */

app.get("/api/linkedin-search/:jobTitle", async (c) => {
  const jobTitle = c.req.param("jobTitle");
  const location = c.req.query("location");
  
  if (!jobTitle) {
    return c.json({ ok: false, error: "job_title_required" }, 400);
  }
  
  try {
    const links = generateLinkedInSearchLinks(jobTitle, location);
    return c.json({ ok: true, links });
  } catch (e: any) {
    console.error("[linkedin-search] error:", e?.message || e);
    return c.json({ ok: false, error: "search_failed" }, 500);
  }
});

// Export endpoints - PDF only for now
app.get("/api/run/:id/export.pdf", async (c) => {
  const runId = c.req.param("id");
  const uid = c.get("uid");
  const user = getUserStateClient(c.env.USER_STATE_SQL, uid);

  const run = (await user.getRun(runId)) as RunData | null;
  if (!run) return c.json({ ok: false, error: "not_found" }, 404);

  const targetRole = run.targetRole || "draft";
  const date = new Date().toISOString().split('T')[0];
  const filename = `resume-${targetRole.replace(/[^a-zA-Z0-9]/g, '-')}-${date}.pdf`;

  try {
    // Import the PDF generator
    const { generateResumePDF } = await import("./pdfGenerator");
    
    // Generate the PDF
    const pdfBytes = await generateResumePDF(run);
    
    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString()
      }
    });
  } catch (e: any) {
    console.error("[export.pdf] error:", e?.message || e);
    return c.json({ ok: false, error: "pdf_generation_failed" }, 500);
  }
});


// Natural language parsing for bullet transformations
// TODO: maybe move this to a separate utility file

// Feature flag (leave true for MVP; you can gate with an env var later)



// --- heuristics/fallbacks used in chat bullet edits ---
const STYLE_ALIASES: Record<string, "short"|"quant"|"lead"|"ats"|"dejargon"> = {
  // Short/Concise variations
  short: "short", shorten: "short", brief: "short", concise: "short", punchier: "short", tighter: "short",
  "more concise": "short", "less wordy": "short", "condensed": "short", "compact": "short",
  
  // Quantification variations
  quant: "quant", quantify: "quant", numbers: "quant", metrics: "quant", "more quantifiable": "quant",
  "add numbers": "quant", "add metrics": "quant", "add data": "quant", "add statistics": "quant",
  "with numbers": "quant", "with metrics": "quant", "with data": "quant",
  
  // Leadership variations
  lead: "lead", leadership: "lead", owner: "lead", ownership: "lead", executive: "lead",
  "more leadership": "lead", "leadership focused": "lead", "executive style": "lead",
  "management focused": "lead", "team leadership": "lead", "cross-functional": "lead",
  
  // ATS/Keywords variations
  ats: "ats", keyword: "ats", keywords: "ats", "ats friendly": "ats", "keyword rich": "ats",
  "more keywords": "ats", "industry terms": "ats", "technical terms": "ats",
  
  // De-jargon variations
  dejargon: "dejargon", "de-jargon": "dejargon", "de-jargonify": "dejargon", simplify: "dejargon", "plain english": "dejargon",
  "less jargon": "dejargon", "simpler language": "dejargon", "plain language": "dejargon",
  "more accessible": "dejargon", "easier to understand": "dejargon",
  
  // General style variations
  "more professional": "lead", "more technical": "ats", "more impressive": "quant",
  "sound better": "lead", "sound fancier": "lead", "sound more impressive": "quant",
  "more impactful": "quant", "stronger": "lead", "more compelling": "quant"
};

function detectStyleNL(msgLower: string): ("short"|"quant"|"lead"|"ats"|"dejargon") | null {
  // Check exact matches first (longer phrases)
  for (const [k, v] of Object.entries(STYLE_ALIASES)) {
    if (msgLower.includes(k)) return v;
  }
  
  // Fallback to word-based detection
  if (/\b(short|concise|tight|punchy|brief|condensed|compact)\b/.test(msgLower)) return "short";
  if (/\b(quant|metric|number|percent|kpi|data|statistics|measure|count)\b/.test(msgLower)) return "quant";
  if (/\b(leader|leadership|own|executive|manage|direct|oversee|supervise)\b/.test(msgLower)) return "lead";
  if (/\b(ats|keyword|technical|industry|professional)\b/.test(msgLower)) return "ats";
  if (/\b(jargon|plain|simplif(y|ied)|accessible|understandable)\b/.test(msgLower)) return "dejargon";
  
  // General improvement words
  if (/\b(better|improve|enhance|stronger|impressive|compelling|impactful)\b/.test(msgLower)) {
    // Default to leadership style for general improvements
    return "lead";
  }
  
  return null;
}

function parseBulletIndexesNL(msgLower: string, n: number): number[] | null {
  const out = new Set<number>();
  
  // Range patterns: "bullets 1-3", "bullet 2-4"
  for (const m of msgLower.matchAll(/\bbullets?\s*(\d+)\s*[-–]\s*(\d+)\b/g)) {
    const a = Math.max(1, parseInt(m[1], 10)), b = Math.min(n, parseInt(m[2], 10));
    for (let x = Math.min(a,b); x <= Math.max(a,b); x++) out.add(x-1);
  }
  
  // Single bullet patterns: "bullet 2", "bullet #3"
  for (const m of msgLower.matchAll(/\bbullet(?:\s*#)?\s*(\d+)\b/g)) {
    const v = parseInt(m[1], 10); if (v>=1 && v<=n) out.add(v-1);
  }
  
  // Ordinal patterns: "first", "second", "third", "last"
  if (/\bfirst\b/.test(msgLower) && n>0) out.add(0);
  if (/\bsecond\b/.test(msgLower) && n>1) out.add(1);
  if (/\bthird\b/.test(msgLower) && n>2) out.add(2);
  if (/\blast\b/.test(msgLower) && n>0) out.add(n-1);

  // Multiple ordinals: "first two", "last three"
  const firstN = msgLower.match(/\bfirst\s+(two|three|four|five|2|3|4|5)\b/);
  if (firstN) {
    const map: Record<string, number> = { two:2, three:3, four:4, five:5 };
    const v = Number.isFinite(Number(firstN[1])) ? Number(firstN[1]) : (map[firstN[1]] ?? 0);
    for (let i=0; i<Math.min(v,n); i++) out.add(i);
  }
  const lastN = msgLower.match(/\blast\s+(two|three|four|five|2|3|4|5)\b/);
  if (lastN) {
    const map: Record<string, number> = { two:2, three:3, four:4, five:5 };
    const v = Number.isFinite(Number(lastN[1])) ? Number(lastN[1]) : (map[lastN[1]] ?? 0);
    for (let i=Math.max(0,n-v); i<n; i++) out.add(i);
  }

  const arr = [...out].filter(i=>i>=0 && i<n).sort((a,b)=>a-b);
  return arr.length ? arr : null;
}

// Enhanced function to parse job and bullet targeting from natural language
function parseJobAndBulletTargeting(msgLower: string, experience: any[]): { jobIdx: number; bulletIndices: number[] } | null {
  // Check for "across all jobs" requests first
  if (/\bacross\s+all\s+jobs?\b/.test(msgLower) || /\ball\s+jobs?\b/.test(msgLower)) {
    // For now, we'll handle this by targeting the first job and letting the caller handle multiple jobs
    // This is a limitation we'll address by calling the function multiple times
    return { jobIdx: 0, bulletIndices: experience[0]?.bullets?.map((_: any, i: number) => i) || [] };
  }
  
  // Look for job references
  let jobIdx = -1;
  
  // Direct job references: "job 1", "first job", "last job", "job 2"
  const jobMatch = msgLower.match(/job\s+(\d+)/);
  if (jobMatch) {
    jobIdx = parseInt(jobMatch[1], 10) - 1;
  } else if (/\bfirst\s+job\b/.test(msgLower) || /\bjob\s+1\b/.test(msgLower)) {
    jobIdx = 0;
  } else if (/\blast\s+job\b/.test(msgLower)) {
    jobIdx = experience.length - 1;
  } else if (/\bcurrent\s+job\b/.test(msgLower) || /\bmost\s+recent\s+job\b/.test(msgLower)) {
    jobIdx = 0; // Most recent is typically first
  }
  
  // If no specific job mentioned, try to infer from context
  if (jobIdx === -1) {
    // If user mentions "the" job or just talks about bullets, assume first job
    if (/\bthe\s+(job|position|role)\b/.test(msgLower) || /\bbullet/.test(msgLower)) {
      jobIdx = 0;
    } else {
      return null; // Can't determine which job
    }
  }
  
  if (jobIdx < 0 || jobIdx >= experience.length) return null;
  
  const job = experience[jobIdx];
  if (!job.bullets || job.bullets.length === 0) return null;
  
  // Parse bullet targeting
  const bulletIndices = parseBulletIndexesNL(msgLower, job.bullets.length);
  
  // If no specific bullets mentioned, apply to all bullets in the job
  const finalBulletIndices = bulletIndices || job.bullets.map((_: any, i: number) => i);
  
  return { jobIdx, bulletIndices: finalBulletIndices };
}


// Helper function to handle experience bullet transformations
async function handleExperienceBulletTransform(
  ai: Env["AI"],
  model: string,
  experience: any[],
  _userMsg: string,
  msgLower: string,
  style: BulletStyle | null
): Promise<{ experience: any[]; message: string } | null> {
  if (!style) return null;

  // Use enhanced targeting to parse job and bullet indices
  const targeting = parseJobAndBulletTargeting(msgLower, experience);
  if (!targeting) return null;
  
  const { jobIdx, bulletIndices } = targeting;
  const job = experience[jobIdx];
  
  if (bulletIndices.length === 0) return null;
  
  const instruction = BULLET_STYLE_INSTRUCTIONS[style];
  const bulletsToTransform = bulletIndices.map(i => job.bullets[i]);
  
  try {
    const rewritten = await transformBulletsBatch(ai, model, bulletsToTransform, instruction, bulletIndices.map((_, i) => i));
    
    const newExperience = [...experience];
    const newJob = { ...job, bullets: [...job.bullets] };
    
    bulletIndices.forEach((originalIdx: number, newIdx: number) => {
      newJob.bullets[originalIdx] = rewritten[newIdx] || job.bullets[originalIdx];
    });
    
    newExperience[jobIdx] = newJob;
    
    // Create a more natural description
    const jobDesc = jobIdx === 0 ? "first job" : jobIdx === experience.length - 1 ? "last job" : `job ${jobIdx + 1}`;
    const bulletDesc = bulletIndices.length === 1 
      ? `bullet ${bulletIndices[0] + 1}` 
      : bulletIndices.length === job.bullets.length
      ? "all bullets"
      : `bullets ${bulletIndices.map(i => i + 1).join(", ")}`;
    
    return {
       experience: newExperience,
       message: `${HUMANIZED_RESPONSES.bulletTransform[style]} Updated ${jobDesc}, ${bulletDesc}.`
     };
  } catch (e: any) {
    console.error("[experience bullet transform] error:", e?.message || e);
    return null;
  }
}

// Helper function to handle summary transformations
async function handleSummaryTransform(
  ai: Env["AI"],
  model: string,
  summary: string,
  _userMsg: string,
  _msgLower: string,
  style: BulletStyle | null
): Promise<{ summary: string; message: string } | null> {
  if (!style) return null;
  
  const instruction = BULLET_STYLE_INSTRUCTIONS[style];
  
  try {
    const response = await ai.run(model, {
      messages: [
        { role: "system", content: "You rewrite professional summaries according to an instruction. Return only the rewritten summary, no additional text." },
        { role: "user", content: `INSTRUCTION: ${instruction}\n\nCURRENT SUMMARY:\n${summary}` }
      ],
      temperature: 0,
      max_tokens: 800
    });
    
     const rewritten = toText(response).trim();
     if (rewritten && rewritten !== summary) {
       return {
         summary: rewritten,
         message: HUMANIZED_RESPONSES.summaryTransform[style]
       };
     }
  } catch (e: any) {
    console.error("[summary transform] error:", e?.message || e);
  }
  
  return null;
}

// LLM-based intent parser for complex natural language requests
async function handleExperienceBulletTransformLLM(
  ai: Env["AI"],
  model: string,
  experience: any[],
  userMsg: string,
  style: BulletStyle
): Promise<{ experience: any[]; message: string } | null> {
  try {
    // Build context for the LLM
    const experienceContext = experience.map((job, idx) => {
      const bullets = job.bullets || [];
      return `Job ${idx + 1}: ${job.title} at ${job.org}
Bullets:
${bullets.map((bullet: string, i: number) => `  ${i + 1}. ${bullet}`).join('\n')}`;
    }).join('\n\n');

    const systemPrompt = `You are an intent parser for resume bullet editing. Parse the user's request and return ONLY valid JSON.

Schema:
{
  "jobIndex": number (0-based index of the job to edit),
  "bulletIndices": number[] (0-based indices of bullets to edit),
  "confidence": number (0-1, how confident you are in the parsing)
}

Rules:
- If user says "first job" or "current job", use jobIndex: 0
- If user says "last job", use jobIndex: ${experience.length - 1}
- If user says "job 2", use jobIndex: 1
- For bullets: "first bullet" = 0, "second bullet" = 1, "last bullet" = last index
- If user says "all bullets" or doesn't specify, include all bullet indices
- Only return valid indices (jobIndex 0-${experience.length - 1}, bulletIndices 0-${Math.max(...experience.map(j => (j.bullets || []).length - 1))})
- If you can't parse the request clearly, return confidence: 0`;

    const userPrompt = `EXPERIENCE CONTEXT:
${experienceContext}

USER REQUEST: "${userMsg}"

Return ONLY the JSON response.`;

    const response = await ai.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 200
    });

    const text = toText(response).trim();
    const parsed = tryParseJson(text);
    
    if (!parsed || typeof parsed.jobIndex !== 'number' || !Array.isArray(parsed.bulletIndices) || parsed.confidence < 0.5) {
      return null;
    }

    const jobIdx = parsed.jobIndex;
    const bulletIndices = parsed.bulletIndices;
    
    if (jobIdx < 0 || jobIdx >= experience.length) return null;
    
    const job = experience[jobIdx];
    if (!job.bullets || job.bullets.length === 0) return null;
    
    // Validate bullet indices
    const validBulletIndices = bulletIndices.filter((i: number) => i >= 0 && i < job.bullets.length);
    if (validBulletIndices.length === 0) return null;
    
    const instruction = BULLET_STYLE_INSTRUCTIONS[style];
    const bulletsToTransform = validBulletIndices.map((i: number) => job.bullets[i]);
    
    const rewritten = await transformBulletsBatch(ai, model, bulletsToTransform, instruction, validBulletIndices.map((_: number, i: number) => i));
    
    const newExperience = [...experience];
    const newJob = { ...job, bullets: [...job.bullets] };
    
    validBulletIndices.forEach((originalIdx: number, newIdx: number) => {
      newJob.bullets[originalIdx] = rewritten[newIdx] || job.bullets[originalIdx];
    });
    
     newExperience[jobIdx] = newJob;
     
     // Create a more natural description
     const jobDesc = jobIdx === 0 ? "first job" : jobIdx === experience.length - 1 ? "last job" : `job ${jobIdx + 1}`;
     const bulletDesc = validBulletIndices.length === 1 
       ? `bullet ${validBulletIndices[0] + 1}` 
       : validBulletIndices.length === job.bullets.length
       ? "all bullets"
       : `bullets ${validBulletIndices.map((i: number) => i + 1).join(", ")}`;
     
  return {
       experience: newExperience,
       message: `${HUMANIZED_RESPONSES.bulletTransform[style]} Updated ${jobDesc}, ${bulletDesc}.`
     };
  } catch (e: any) {
    console.error("[LLM experience bullet transform] error:", e?.message || e);
    return null;
  }
}

// AI-based intent extraction for bullet transformation requests
async function extractBulletTransformIntent(
  ai: Env["AI"],
  model: string,
  experience: any[],
  userMsg: string
): Promise<{
  style: BulletStyle | null;
  targets: Array<{ jobIdx: number; bulletIndices: number[] }>;
  confidence: number;
} | null> {
  try {
    // Build context for the LLM
    const experienceContext = experience.map((job, idx) => {
      const bullets = job.bullets || [];
      return `Job ${idx + 1}: ${job.title} at ${job.org}
Bullets:
${bullets.map((bullet: string, i: number) => `  ${i + 1}. ${bullet}`).join('\n')}`;
    }).join('\n\n');

    const systemPrompt = `You are an expert intent parser for resume bullet editing. Analyze the user's request and extract the transformation intent.

Available transformation styles:
- "quant": Make bullets more quantifiable with numbers, percentages, metrics
- "short": Make bullets more concise and punchy
- "lead": Make bullets more leadership-focused with strong action verbs
- "ats": Make bullets more ATS-friendly with keywords
- "dejargon": Remove jargon and make bullets clearer

Return ONLY valid JSON with this schema:
{
  "style": "quant" | "short" | "lead" | "ats" | "dejargon" | null,
  "targets": [
    {
      "jobIdx": number (0-based job index),
      "bulletIndices": number[] (0-based bullet indices)
    }
  ],
  "confidence": number (0-1, how confident you are)
}

Rules:
- If user says "across all jobs" or "all jobs", create targets for ALL jobs
- If user says "first job", use jobIdx: 0
- If user says "last job", use jobIdx: ${experience.length - 1}
- If user says "job 2", use jobIdx: 1
- For bullets: "first bullet" = 0, "second bullet" = 1, "last bullet" = last index
- If user says "all bullets" or doesn't specify bullets, include all bullet indices for that job
- If no clear style detected, return style: null
- Only return valid indices (jobIdx 0-${experience.length - 1})
- If confidence < 0.5, the parsing is unreliable`;

    const userPrompt = `EXPERIENCE CONTEXT:
${experienceContext}

USER REQUEST: "${userMsg}"

Analyze the request and return the JSON response.`;

    const response = await ai.run(model, {
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ],
    temperature: 0,
      max_tokens: 300
    });

    const text = toText(response).trim();
    const parsed = tryParseJson(text);
    
    if (parsed && typeof parsed === "object" && 
        typeof parsed.confidence === "number" &&
        parsed.confidence > 0.5 &&
        Array.isArray(parsed.targets)) {
      
      // Validate and clean the targets
      const validTargets = parsed.targets
        .filter((target: any) => 
          typeof target === "object" &&
          typeof target.jobIdx === "number" &&
          Array.isArray(target.bulletIndices)
        )
        .map((target: any) => {
          const jobIdx = Math.max(0, Math.min(target.jobIdx, experience.length - 1));
          const job = experience[jobIdx];
          const maxBulletIdx = (job.bullets || []).length - 1;
          
          const bulletIndices = target.bulletIndices
            .filter((idx: number) => typeof idx === "number" && idx >= 0 && idx <= maxBulletIdx)
            .sort((a: number, b: number) => a - b);
          
          return { jobIdx, bulletIndices };
        })
        .filter((target: any) => target.bulletIndices.length > 0);
      
      if (validTargets.length > 0) {
        return {
          style: parsed.style || null,
          targets: validTargets,
          confidence: parsed.confidence
        };
      }
    }
    
    return null;
  } catch (e: any) {
    console.error("[AI intent extraction] error:", e?.message || e);
    return null;
  }
}

// Helper function to try parsing JSON
function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}



/* -------------------- AI smoke test -------------------- */
app.get("/api/ai-test", async (c) => {
  const model = c.env.MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const messages = [
    { role: 'system', content: 'You are a philosopher, that only responds in two sentence riddles.' },
    { role: 'user', content: 'What is this application?' }
  ];
  try {
    const resp = await c.env.AI.run(model, { messages, temperature: 0, max_tokens: 200 });
    const text = toText(resp);
    return c.json({ ok: true, model, text });
  } catch (e: any) {
    console.error("[/api/ai-test] error:", e?.message || e);
    return c.json({ ok: false, error: 'issue with model' }, 500);
  }
});

export default app;

// Utility functions
function randomId(): string {
  // Generate a random ID for runs
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

function toText(r: any): string {
  return (r?.response ?? r?.output_text ?? r?.result ?? r ?? "").toString();
}
