import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { getProvider, resolveModelId, isGeminiDirect } from "@/lib/ai-gateway.server";

interface ChatBody {
  messages: UIMessage[];
  model?: string;
  userApiKey?: string;
  context?: {
    name?: string;
    language?: string;
    level?: string;
    subject?: string;
    topic?: string;
  };
}

function systemPrompt(_ctx: ChatBody["context"]) {
  return `You are Shiksha, a warm and patient AI tutor like a real tuition teacher. Never dump all information at once. Teach step by step. After every 2 to 3 sentences pause and ask the student if they understood. If the student says they do not understand, explain the same concept in a completely different simpler way with a new example. Use real life relatable examples from cricket, food, or daily life. Celebrate small wins with words like bilkul sahi or perfect. Always check understanding before moving to the next point. End every explanation with a simple question to test understanding. Keep responses short — maximum 3 to 4 sentences per chunk then wait for student response.`;
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = (m as unknown as { parts?: { type: string; text?: string }[] }).parts;
    if (parts) {
      const txt = parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join(" ");
      if (txt) return txt;
    }
  }
  return "";
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) {
          return new Response("Bad request", { status: 400 });
        }
        const usingGeminiDirect = isGeminiDirect(body.userApiKey);
        const provider = getProvider(body.userApiKey);
        const model = resolveModelId(
          body.model || "google/gemini-3-flash-preview",
          usingGeminiDirect,
        );

        // RAG: pull factual reference material in parallel. Best-effort —
        // if every source fails we just fall back to the model's own knowledge.
        let ragSuffix = "";
        try {
          const topic =
            body.context?.topic ||
            body.context?.subject ||
            lastUserText(body.messages).slice(0, 80);
          if (topic) {
            const { buildRagContext, ragSystemSuffix } = await import(
              "@/lib/rag.server"
            );
            const { context } = await buildRagContext({
              topic,
              subject: body.context?.subject,
              level: body.context?.level,
              language: body.context?.language,
            });
            ragSuffix = ragSystemSuffix(
              context,
              body.context?.level || "high_school",
              body.context?.language || "english",
            );
          }
        } catch {
          /* RAG is non-critical */
        }

        const result = streamText({
          model: provider(model),
          system: systemPrompt(body.context) + ragSuffix,
          messages: await convertToModelMessages(body.messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});
