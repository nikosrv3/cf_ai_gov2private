# cf_ai_gov2private

## TODO MVP
### Planning & Repo Hygiene
- [ ] Create GitHub repo.
- [ ] Add top-level docs: `README.md`, `docs/DESIGN.md` (goal, scope, architecture, definition of done).

### Infrastructure & Config
- [ ] Log in to Cloudflare, confirm account + Workers access.
- [ ] Create KV namespaces (dev + prod) and record IDs.
- [ ] Bind Workers AI (`env.AI`) in `wrangler.toml`.
- [ ] Add GitHub Secrets: `CF_ACCOUNT_ID`, `CF_API_TOKEN`.
- [ ] Set up GitHub Actions workflow to deploy on push to `main` and validate on PRs.

### API Surfaces (Worker)
- [ ] `POST /api/generate` → Calls Workers AI and returns suggestions, bullets, pitch.
- [ ] Save each generation to KV under a session key (retain last 10 per session).
- [ ] `GET /api/history?session=<id>` → Reads last N generations from KV.
- [ ] `POST /api/skills/score` → Scores curated skill list, buckets into bands, saves to KV.
- [ ] `GET /api/skills/map?role=SWE` → Returns skill graph JSON + latest scores.

### Static Assets & Data
- [ ] Add `data/skills_swe.json` with ~12–20 skills and prerequisites.
- [ ] Add a basic HTML/JS page to submit background, display results, and render a skill grid.

### Quality & Guardrails
- [ ] Add input validation (length, required fields).
- [ ] Implement simple rate limiting per session/IP.
- [ ] Add minimal logging for timings and error paths (no PII).
- [ ] Return user-friendly error messages.

### Deploy & Demo
- [ ] Deploy successfully to Workers via GitHub Actions.
- [ ] Update README with “How to run locally” and “How to deploy.”
- [ ] Add `docs/DEMO.md` with demo steps.

---

## TODO: Skill Map v1

### Scoring Quality & UX
- [ ] Tighten AI prompt to strict JSON output; validate on Worker.
- [ ] Apply prerequisite caps (if a prereq is Gap, cap dependent skills).
- [ ] Show legend (Mastered/In-Progress/Gap thresholds).
- [ ] Node click → Show score, evidence bullets, recommendation.

### Next-Skill Logic
- [ ] Compute “next recommended node” (lowest score whose prereqs are not gaps).
- [ ] Display suggestion in UI.

### Persistence & Review
- [ ] Save last 3 scoring snapshots per session (`skills_recent:<session>`).
- [ ] Add compare view between latest two snapshots.

### Polish
- [ ] Export “My plan” (scores + next actions) to Markdown.
- [ ] Add accessibility checks (labels, keyboard navigation).
