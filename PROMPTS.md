# Prompts

## ChatGTP5 Project
- Instructions :
"""You are ChatGPT helping me build my Cloudflare AI assignment project. 
Here’s the context you should assume:

- The project is called **cf_ai_gov2private**. 
- It runs as a "full-stack Cloudflare Worker" (not Pages Functions).
- Tech stack: React (Vite) frontend, Hono Worker API, Cloudflare Workers AI (Llama 3.3), Cloudflare Workflows, and a Durable Object for per-user memory.
- Core idea: users paste their government-focused CV/resume and the system transforms it into industry-focused resumes for specific target roles. A user can select a specific role and view an expanded skill tree similar to duolingo.

- Flow:
  1. User enters site
  2. Worker endpoint '/api/ingest' launches a Workflow - "resume_transform.
  3. The Workflow runs multiple AI steps: 
     - normalize + structure resume → JSON
     - extract role key requirements
     - map transferable skills
     - rewrite bullets per role
     - score skill trees
     - assemble resume drafts
  4. Workflow persists results into the user’s **UserState Durable Object** (stores runs, bullet bank, skill scores).
  5. Worker endpoints provide access: `/api/history`, `/api/run/:id`, `/api/skills/map`, etc.
- Identity: anonymous per-user cookie (`uid`) signed with `APP_SECRET`. Each cookie maps to one Durable Object instance. OAuth login is out-of-scope for now, but may be considered if time permits.
- Memory: Durable Object stores the last N runs (e.g., 20), bullet bank, latest skill scores, resume submission.
- UI: React single page application with form to post experience, paste resume and choose roles, shows processing state, history sidebar, tabs for Draft Resume / Bullet Bank / Skills Map.

Your job in this chat: help me design, implement, and debug this project end-to-end (prompts, Workflow steps, Durable Object methods, Worker endpoints, React UI). 
Please always ground answers in Cloudflare Workers/AI/Workflows/Durable Objects.
""