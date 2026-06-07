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

        const result = streamText({
          model: provider(model),
          system: systemPrompt(body.context),
          messages: await convertToModelMessages(body.messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});
