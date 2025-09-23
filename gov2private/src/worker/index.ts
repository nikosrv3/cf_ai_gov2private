import { Hono } from "hono";
type Env = { AI: any }
const app = new Hono<{ Bindings: Env }>();

app.get("/api/ai-test", async(c) => {
    // c.json({ name: "Cloudflare" })
    const model ='@cf/meta/llama-3.1-8b-instruct'
    const messages = [
        {role: 'system', content: 'You are a philosopher, that only responds in two sentence riddles.'},
        {role: 'user', content: 'What is this application?'}
    ]

    try {
        const resp = await c.env.AI.run(model, { messages})
        const text = resp?.response ?? resp?.output_text ?? String(resp ?? '')
        return c.json({ ok: true, model, text })
    } catch (e: any) {
        return c.json({ ok: false, error: 'issue with model' }, 500)
    }
});

app.get('/api/health', (c) => c.text('ok'))

export default app;
