import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Whether we are calling the Lovable AI Gateway directly.
 * Kept for backwards compatibility with callers that still expect this flag.
 */
export function isGeminiDirect(_userApiKey?: string): boolean {
  return true;
}

/**
 * Returns an OpenAI-compatible provider pointed at the Lovable AI Gateway.
 * LOVABLE_API_KEY is auto-provisioned in the Lovable runtime — no setup needed.
 * If the user pasted a key in Settings we still respect that override.
 */
export function getProvider(userApiKey?: string) {
  const apiKey =
    userApiKey && userApiKey.trim().length > 0
      ? userApiKey.trim()
      : process.env.LOVABLE_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "AI service is not configured. LOVABLE_API_KEY is missing from the server environment.",
    );
  }

  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });
}

/** Map any incoming friendly model id to a model available on the Lovable AI Gateway. */
export function resolveModelId(model: string, _usingGeminiDirect?: boolean): string {
  const m = (model || "").toLowerCase().trim();

  // If the caller already passes a Lovable Gateway model id, keep it.
  if (m.startsWith("google/") || m.startsWith("openai/")) {
    return model;
  }

  // Heavy reasoning / "pro" requests → smarter model.
  if (m.includes("pro") || m.includes("gpt-5") || m.includes("gpt-4") || m.includes("70b")) {
    return "google/gemini-2.5-pro";
  }

  // Default: fast, free-tier-friendly Lovable Gateway model.
  return "google/gemini-3-flash-preview";
}
