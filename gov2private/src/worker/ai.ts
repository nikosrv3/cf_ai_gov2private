// src/worker/ai.ts
// Single source of truth for the model + a thin aiRun helper.

export const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type AIMsg = { role: "system" | "user" | "assistant"; content: string };

export function getModel(env: { AI_MODEL?: string }): string {
  return env.AI_MODEL ?? DEFAULT_MODEL;
}

export function assertAI(ai: any) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error('Workers AI binding missing. Check wrangler.json { "ai": { "binding": "AI" } }.');
  }
}

export async function aiRun(ai: any, model: string, messages: AIMsg[]) {
  assertAI(ai);
  return ai.run(model, { messages });
}
