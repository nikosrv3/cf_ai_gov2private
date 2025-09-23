# cf_ai_gov2private

## TODO MVP

## Day 1 – Project & Platform Foundations

- [x] **Repo & Frontend scaffold**
  - [x] Create repo `cf_ai_gov2private`
  - [x] Clone react-vite-hono template from CloudFlare
  - [x] Test basic hono usage

- [ ] **Anonymous identity cookie**
  - [ ] Generate signed `uid` cookie (use Web Crypto for HMAC) and attach per request
  - [ ] Workers Web Crypto API  
        ↪ https://developers.cloudflare.com/workers/runtime-apis/web-crypto/  <!-- :contentReference[oaicite:3]{index=3} -->
  - [ ] Cookie parse/set examples  
        ↪ https://developers.cloudflare.com/workers/examples/extract-cookie-value/  <!-- :contentReference[oaicite:4]{index=4} -->
  - [ ] (If caching around cookies) Set-Cookie behavior ref  
        ↪ https://developers.cloudflare.com/cache/concepts/cache-behavior/  <!-- :contentReference[oaicite:5]{index=5} -->

- [ ] **Durable Object: `UserState`**
  - [ ] Define class with storage schema: runs[], bulletBank, skillScores, lastResume
  - [ ] Methods: `saveRun`, `getHistory`, `getRun`, `getSkillMap`, `upsertBulletBank`
  - [ ] Bind DO in wrangler config and route `env.USER_STATE.idFromName(uid)`
  - [ ] Docs: Durable Objects overview & storage options  
        ↪ https://developers.cloudflare.com/durable-objects/  <!-- :contentReference[oaicite:6]{index=6} -->  
        ↪ https://developers.cloudflare.com/workers/platform/storage-options/  <!-- :contentReference[oaicite:7]{index=7} -->

- [ ] **Design doc & endpoint spec**
  - [ ] `docs/DESIGN.md`: sequence from UI → `/api/ingest` → Workflow → DO
  - [ ] API: `/api/ingest`, `/api/history`, `/api/run/:id`, `/api/skills/map`

- [ ] **Local run**
  - [ ] `npx wrangler dev` and verify `/api/hello`

---

## Day 2 – Workflows + Workers AI + API

- [x] **Workers AI binding & smoke test**
  - [x] Add AI binding in wrangler config (`ai` or `AI` binding)
  - [x] Test call to Llama 3.3 in a dummy route
  - [x] Docs: Workers AI bindings + quickstart  
        ↪ https://developers.cloudflare.com/workers-ai/configuration/bindings/  <!-- :contentReference[oaicite:8]{index=8} -->  
        ↪ https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/  <!-- :contentReference[oaicite:9]{index=9} -->
  - [x] Model catalog / Llama 3.3 pages  
        ↪ https://developers.cloudflare.com/workers-ai/models/  <!-- :contentReference[oaicite:10]{index=10} -->  
        ↪ https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/  <!-- :contentReference[oaicite:11]{index=11} -->
  - [x] (Optional) Try the AI Playground  
        ↪ https://playground.ai.cloudflare.com/  <!-- :contentReference[oaicite:12]{index=12} -->

- [ ] **Define `resume_transform` Workflow**
  - [ ] Steps:
        1) Normalize + structure resume → JSON  
        2) Extract role key requirements  
        3) Map transferable skills  
        4) Rewrite bullets per role  
        5) Score skill trees  
        6) Assemble resume drafts
  - [ ] Each step = deterministic input/output schema; persist intermediate results to DO
  - [ ] Docs: Workflows overview & learning path  
        ↪ https://developers.cloudflare.com/workflows/  <!-- :contentReference[oaicite:13]{index=13} -->  
        ↪ https://developers.cloudflare.com/learning-paths/workflows-course/series/workflows-1/  <!-- :contentReference[oaicite:14]{index=14} -->

- [ ] **Wire Worker ⇄ Workflow ⇄ DO**
  - [ ] `/api/ingest`: enqueue/launch workflow with `{ uid, resumeText, targetRole }`
  - [ ] On each step completion: update DO (`saveRun` partial updates)
  - [ ] `/api/history`, `/api/run/:id`, `/api/skills/map`: read from DO

- [ ] **Prompt & schema files**
  - [ ] Create `prompts/` with step prompts (JSON schema in comments)
  - [ ] Create `types/workflow.ts` with Zod or TS types for step I/O

- [ ] **Error handling & retries**
  - [ ] Use Workflows retries/backoff for flaky AI calls
  - [ ] Log step timings and token usage to DO

---

## Day 3 – React UI & UX polish

- [ ] **SPA layout**
  - [ ] Sidebar: past runs (from `/api/history`)
  - [ ] Main tabs:
        - [ ] **Draft Resume** (assembled text, export .md/.txt)
        - [ ] **Bullet Bank** (copy, multi-select export)
        - [ ] **Skills Map** (tree with scores; simple list first)
  - [ ] Hono fetch helpers in `/lib/api.ts`

- [ ] **Ingestion form**
  - [ ] Paste resume textarea + role selector
  - [ ] POST `/api/ingest` → show “processing” state (poll `/api/run/:id`)
  - [ ] Graceful empty/error states

- [ ] **Run details**
  - [ ] Clicking a run loads data into tabs via `/api/run/:id`

- [ ] **Finalize & docs**
  - [ ] `README.md`: run/dev/deploy notes; cost notes for AI usage
  - [ ] Add architecture diagram (optional)

---

## Reference Links (at a glance)

- Workers AI – models & bindings  
  ↪ https://developers.cloudflare.com/workers-ai/models/  <!-- :contentReference[oaicite:15]{index=15} -->  
  ↪ https://developers.cloudflare.com/workers-ai/configuration/bindings/  <!-- :contentReference[oaicite:16]{index=16} -->
- Workflows – docs & course  
  ↪ https://developers.cloudflare.com/workflows/  <!-- :contentReference[oaicite:17]{index=17} -->  
  ↪ https://developers.cloudflare.com/learning-paths/workflows-course/series/workflows-1/  <!-- :contentReference[oaicite:18]{index=18} -->
- Durable Objects  
  ↪ https://developers.cloudflare.com/durable-objects/  <!-- :contentReference[oaicite:19]{index=19} -->
- Hono on Workers  
  ↪ https://hono.dev/docs/getting-started/cloudflare-workers  <!-- :contentReference[oaicite:20]{index=20} -->
- Wrangler configuration  
  ↪ https://developers.cloudflare.com/workers/wrangler/configuration/  <!-- :contentReference[oaicite:21]{index=21} -->
- Web Crypto (for cookie signing)  
  ↪ https://developers.cloudflare.com/workers/runtime-apis/web-crypto/  <!-- :contentReference[oaicite:22]{index=22} -->