import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AiProvider = "openai" | "ollama";

export const aiProvider: AiProvider = process.env.OPENAI_API_KEY ? "openai" : "ollama";

const baseURL =
  aiProvider === "openai"
    ? (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1")
    : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1");

const client = createOpenAICompatible({
  name: aiProvider,
  baseURL,
  apiKey: aiProvider === "openai" ? process.env.OPENAI_API_KEY : undefined,
  supportsStructuredOutputs: true,
});

export const defaultModel =
  aiProvider === "openai"
    ? (process.env.OPENAI_MODEL ?? "gpt-5.4-mini")
    : (process.env.OLLAMA_MODEL ?? "qwen2.5:14b");

export const providerLabel = aiProvider === "openai" ? "OpenAI" : "Ollama";

export function languageModel(id: string) {
  return client(id);
}

/** OpenAI's GPT-5 reasoning models reject any temperature other than the default. */
export function temperature(value: number) {
  return aiProvider === "openai" ? undefined : value;
}

/** Lists models the configured provider can serve, or returns an error message. */
export async function aiStatus(): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  try {
    if (aiProvider === "openai") {
      const res = await fetch(`${baseURL}/models`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, error: `OpenAI responded ${res.status}` };
      const json = (await res.json()) as { data?: { id: string }[] };
      return {
        ok: true,
        models: (json.data ?? [])
          .map((m) => m.id)
          .filter((id) => /^gpt-[45]/.test(id) && !/\d{4}-\d{2}-\d{2}$/.test(id))
          .sort(),
      };
    }
    const res = await fetch(baseURL.replace(/\/v1\/?$/, "") + "/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `Ollama responded ${res.status}` };
    const json = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (json.models ?? []).map((m) => m.name) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
