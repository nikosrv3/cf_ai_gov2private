# cf_ai_gov2private Design Doc

## 1) Overview
- **Runtime:** Cloudflare Workers (Hono)
- **LLM:** Workers AI (Llama 3.3)
- **State:** Durable Object (SQLite) per anonymous **uid** (HMAC-signed cookie)
- **UI:** React (Vite SPA), minimal tabs + chat
- **Coordination:** Step-by-step writes into DO

## 2) User Flow
1. Paste **Background** + **Resume** → **Discover Roles**
2. Review candidates (+ short JDs); ask **Chat** to explain/compare
3. **Select** a role (button or “select role N” via chat)
4. Tailoring runs → **Draft**, **Bullets**, **Skills** populate
5. Use **Chat** or buttons to transform bullets, rewrite summary, refresh skills
6. (Optional) Ask chat for **job search links** (Boolean + URLs)

## 3) Features in MVP
- Role discovery + explanation (chat)
- Role selection (UI or chat)
- Tailored bullets + draft assembly
- Bullet transforms (global & per-bullet) + Undo (last 3)
- Skills scores list (+ optional learning plan via chat)
- Job search helper (Boolean + Google/LinkedIn/Bing URLs)
- Chat tab grounded to active run (persisted)
