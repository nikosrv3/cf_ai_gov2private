# cf_ai_gov2private – MVP TODO


## Day 1 – Project & Platform Foundations

- [x] **Repo & Frontend scaffold**
  - [x] Create repo `cf_ai_gov2private`
  - [x] Clone React–Vite–Hono template from Cloudflare
  - [x] Test basic Hono usage

- [x] **Anonymous identity cookie**
  - [x] Generate signed `uid` cookie with Web Crypto (HMAC)
  - [x] Attach cookie per request
  - [x] Tested end to end scripts over HTTPS
- [x] **Durable Object: `UserState`**
  - [x] Define class with storage schema (runs[], bulletBank, skillScores, lastResume)
  - [x] Methods: `createRun`, `saveRunPart`, `getRun`, `getHistory`, `setRoleCandidates`, `setSelectedRole`
  - [x] Bind DO in wrangler config + migrations (switched to new_sqlite_classes)
  - [x] Verify persistence -- seems good

- [ ] **Design doc & endpoint spec**
  - [ ] Create `docs/DESIGN.md`: sequence from UI → Worker → Workflow → DO
  - [ ] Document API routes:  
        `/api/discover-jobs`, `/api/run/:id/roles`, `/api/run/:id/select-role`, `/api/run/:id`, `/api/history`, `/api/skills/map`

- [x] **Local run**
  - [x] `npx wrangler dev --persist-to .wrangler/state`  
  - [x] Verified endpoints respond correctly

---

## Day 2 – Workflows + Workers AI + API

- [x] **Workers AI binding & smoke test**
  - [x] Add AI binding in wrangler config
  - [x] Test call to Llama 3.x in a dummy route
  - [x] Verified response from `/api/ai-test`

- [ ] **Define `resume_transform` Workflow**
  - [ ] Split into phases:  
        1. Normalize resume → JSON  
        2. Propose candidate roles (with rationale, confidence)  
        3. Generate short JD for each role  
        4. Await role selection  
        5. Extract requirements from JD  
        6. Map transferable skills  
        7. Rewrite bullets per role  
        8. Score skill tree  
        9. Assemble draft resume
  - [ ] Persist intermediate results to DO
  - [ ] Reference: [Workflows docs](https://developers.cloudflare.com/workflows/)

- [ ] **Wire Worker ⇄ Workflow ⇄ DO**
  - [ ] Replace inline AI helpers with Workflow steps
  - [ ] Use callbacks or state updates into DO
  - [ ] `/api/discover-jobs` should launch Workflow (Phase A)
  - [ ] `/api/run/:id/select-role` should launch Workflow (Phase B)

- [ ] **Prompts & schema files**
  - [ ] Extract step prompts into `prompts/`
  - [ ] Create `types/workflow.ts` with input/output types

- [ ] **Error handling & retries**
  - [ ] Add retry/backoff for flaky AI JSON
  - [ ] Log step timings and token usage to DO

---

## Day 3 – React UI & UX polish

- [ ] **SPA layout**
  - [ ] Sidebar: past runs (from `/api/history`)
  - [ ] Tabs:  
        - Draft Resume (assembled text)  
        - Bullet Bank (copy/export)  
        - Skills Map (tree/list view)

- [ ] **Ingestion form**
  - [ ] Textarea for resume + background info
  - [ ] POST `/api/discover-jobs`
  - [ ] Show “processing” state, poll `/api/run/:id`
  - [ ] Handle empty/error states gracefully

- [ ] **Run details**
  - [ ] Clicking a run loads run data into tabs

- [ ] **Finalize & docs**
  - [ ] Update `README.md` with dev/deploy notes + cost notes
  - [ ] Add architecture diagram (optional)

---

## Reference Links

- [Workers AI – models & bindings](https://developers.cloudflare.com/workers-ai/models/)
- [Workflows – overview & course](https://developers.cloudflare.com/workflows/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Web Crypto API (cookie signing)](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
