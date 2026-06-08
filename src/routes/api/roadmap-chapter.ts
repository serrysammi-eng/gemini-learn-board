import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { getProvider, resolveModelId } from "@/lib/ai-gateway.server";

interface Body {
  title: string;
  summary?: string;
  topic?: string;
  language?: "english" | "hindi" | "both";
}

export const Route = createFileRoute("/api/roadmap-chapter")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!body?.title) return new Response("Bad request", { status: 400 });

        const provider = getProvider();
        const model = resolveModelId("google/gemini-3-flash-preview");
        const lang = body.language || "english";

        const system = `You are Shiksha, a friendly tutor writing a single chapter of a learning roadmap.
LANGUAGE: respond strictly in ${lang}. Hindi → Devanagari. English → English. Both → Hinglish in Roman.

OUTPUT FORMAT — these exact headers, each on its own line, no markdown, no emojis, no code fences:

TITLE: <chapter title verbatim from user>

INTRO:
<one short paragraph (2-3 sentences) introducing the chapter and why it matters to a beginner>

STEPS:
1. <first concrete step the student should learn — one sentence>
2. <next step>
3. <next>
4. <next>
5. <final step>
(exactly 5 steps, each a single clear sentence the student can actually act on)

EXAMPLE:
<a single real-life, everyday example (cricket, food, train, mobile phone, school) that makes the chapter concrete — 2 sentences>

END`;

        const result = streamText({
          model: provider(model),
          system,
          prompt: `Roadmap context: ${body.topic ? `topic = ${body.topic}` : ""}
Chapter title: ${body.title}
Chapter summary hint: ${body.summary || "—"}

Write the chapter now using the exact format above.`,
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
