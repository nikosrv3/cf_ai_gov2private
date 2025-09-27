# AI Prompts Used in cf_ai_gov2private Development

This document collects the prompts that guided the **Government-to-Private Sector Resume Transformation** app. The timeline was: backend implementation first, then the frontend, and finally a backend refactor to satisfy the frontend implementation. Prompts are grouped by phase and by the AI/tool that helped. Shorter bug explanation prompts were omitted including "Explain" feature.

---

## Phase 1: Backend First — Scoping & Initial Implementation (ChatGPT 5)

### 1. Initial Project Scoping (Backend-first)
```
I’m building a Cloudflare Workers app called cf_ai_gov2private.

Setup:
- Cloudflare Worker (not pages functions)
- Hono API, Workers AI (Llama 3.3), Durable Object for user memory, optional Workflows later
- Users paste a government resume then the app transforms it into private-sector versions tailored to roles, plus a skill tree like Duolingo

Approach:
- Start with backend endpoints that call AI steps directly in sequence
- User identity: signed cookie `uid` mapped to a DO instance
- DO stores last N runs, normalized resume JSON, bullet bank, skill scores, chat history
- Worker routes provide: discover jobs, select role, transform bullets, skills map, history, export

Your job: help me design, build, and debug the backend end-to-end (prompts, DO methods, routes). Always ground solutions in Workers/AI/DOs.
```

### 2. API Endpoint Design
```
Sketch the initial API.

Must have routes for:
- Resume ingestion/normalization
- Role discovery + selection
- Bullet rewriting
- Skills map/scoring
- Chat with AI
- History
- Exports (txt, pdf)

Each route should:
- Accept signed cookie auth
- Return a consistent JSON envelope
- Use clear error codes/messages
- Support idempotency where it makes sense

Deliverable: routes, example requests/responses, error cases.
```

### 3. Data Models & Schemas
```
Lay out JSON schemas and TypeScript types for:

Core objects:
- RunData
- NormalizedData
- JobRole
- UserState

AI step payloads/results:
- Resume normalization
- Role discovery
- Requirements extraction
- Skills mapping
- Bullet transformation

API envelopes:
- {ok: true, data}
- {ok: false, error}

Keep it TypeScript friendly with field limits and enums etc.
```

### 4. AI Processing Pipeline
```
Design the AI steps.

Steps:
1. Normalize resume into JSON
2. Find relevant private-sector roles
3. Extract role requirements
4. Map transferable skills
5. Rewrite bullets for chosen roles
6. Score skills + suggest learning paths
7. Build draft resumes

For each:
- Give a prompt for Llama 3.3
- Show expected JSON structure
- Note error handling and retries
- Keep token use reasonable
- Add logging/debug notes

Durable Object will persist data between steps.
```

### 5. Durable Object Architecture
```
Plan a DO to manage user state:

It should:
- Store runs + normalized resume data
- Track bullet bank versions
- Save skill scores + suggestions
- Keep chat turns tied to runs
- Handle concurrent requests

Deliverables:
- Class layout + methods
- SQLite schema plan
- Concurrency/locking notes
- Performance considerations
```

---

## Phase 2: Frontend Development (Claude)

### 6. React App Structure
```
Build the React app (Vite + TS + Tailwind) to consume backend.

Pages:
- Onboarding
- RoleSelection
- RunDetail

Core components:
- ResumeCanvas
- ChatPanel
- HistorySidebar

Utils:
- Loading, ErrorAlert, EmptyState

Constraints:
- Typed API data
- Clean loading/error states
- Responsive, accessible design
```
### 7. ResumeCanvas Component
```
Show transformed resume data.

Sections:
- Summary, Skills, Experience, Education, Certs
- Display selected role + tailoring status
- Collapsible sections with smooth transitions
- Edit hints to connect to ChatPanel
- Switch roles from UI

Style:
- Clean resume look
- Responsive, accessible
```
### 8. Chat Interface Component
```
Chat UI for AI interactions.

Needs:
- Natural language input
- Bullet edit commands
- Context-aware suggestions
- Message history
- Loading/error states
- Keyboard shortcuts

Constraint: Don’t assume endpoints exist. If unsure, ask for the exact backend route.
```
### 9. Role Selection Interface
```
Role selection screen.

Features:
- Show discovered roles w/ description + match scores
- Compare roles side by side
- Select via UI or chat
- Add custom roles
- Show role requirements

UI:
- Card layout
- Score visualization
- Responsive grid
```
### 10. History & Navigation
```
History sidebar.

- List past runs
- Show run status
- Quick actions (view, delete, duplicate)
- Collapsible
- Optional search/filter
```

---

## Phase 3: Backend Refactor to Match Frontend (Cursor)

### 11. Gap Analysis
```
Compare frontend API calls to backend routes.

Rules:
- Don’t assume a frontend call = backend route
- For each, confirm method + schema
- Flag mismatches (route missing, wrong verb, schema drift)

Deliverable: checklist of backend fixes needed to satisfy frontend without changing its contracts.
```
### 11.1 Gap fixes:



### 12. Architecture Decision
```
Workflows vs direct Worker calls:

Should I change to using workflows or is a cloudflare worker fine for the mvp?
```

### 13. Backend Adjustments
```
Refactor backend to align with frontend based on gap analysis from earlier.

Actions:
- Add/rename routes to match frontend imports
- Fix schemas (names, nesting)
- Ensure role discovery and selection works so RolePicker shows data
- Bullet transformations return what ResumeCanvas/Chat expect
- Add switch role if frontend needs it
- Guarantee run updates show up when frontend polls getRun
```

### 14. API Integration Layer
```
Write typed API client.

Functions:
- discoverJobs
- selectRole / changeRole
- generateResume
- transformBullets
- chatWithAI
- exportResume
- getHistory
- getRun

Handle cookies, retries, narrow errors, optional polling.
```

### 15. State Management Integration
```
Wire frontend state to backend.

Patterns:
- Custom hooks
- Global context for runs
- Optimistic UI for small edits
- Centralized error/loading
- Cache invalidation
- Offline fallback
```

### 16. Chat System Integration
```
Make chat flow reliable.

- Route intents (bullet edits, summaries, skills)
- Include run IDs everywhere
- Stream responses when possible
- Undo/redo for rejected edits
- Show helpful error messages
```

### 17. Export Functionality
```
Support PDF export

- Add backend route
- PDF via @react-pdf/renderer
- Keep consistent formatting across formats
- Handle large docs gracefully
```

### 18. Sample Resume Creation
ChatGPT
```
Create three sample government resumes.

- Base them off of this general structure: <redacted for privacy>
- Make sure they don't contain any fake contact information or home addresses
- Deliverables: 1 CDC, 1 NOAA, 1 DOD
```


## Summary

**Timeline:** Backend first, Frontend, Backend refactor to match frontend.  
**Decision:** Direct Worker calls for AI pipeline (simpler, MVP-friendly).  
**Result:** Aligned routes/schemas, responsive UI, and a backend that fully supports the shipped frontend.
