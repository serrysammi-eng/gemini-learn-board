import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { getProvider, resolveModelId } from "@/lib/ai-gateway.server";

interface Body {
  title: string;
  summary?: string;
  topic?: string;
  language?: "english" | "hindi" | "both";
  level?: string;
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
        const level = (body.level || "high_school").toLowerCase();
        const levelGuide =
          level === "school"
            ? "The student is a young child age 6-10. Use very simple short words, playful tone, and fun examples (toys, cartoons, animals, snacks). No technical jargon."
            : level === "college"
              ? "The student is a college learner. Use proper terminology and assume basic background; go a level deeper with precise definitions."
              : level === "adult"
                ? "The student is a busy adult learner. Be concise, practical, real-world focused. Skip kiddie analogies."
                : "The student is a high-school learner age 11-17. Use clear relatable language and examples from school, sports, and daily life.";

        const system = `You are Shiksha, a friendly tutor writing a single chapter of a learning roadmap.
LANGUAGE: respond strictly in ${lang}. Hindi → Devanagari. English → English. Both → Hinglish in Roman.
AUDIENCE: ${levelGuide}

OUTPUT FORMAT — these exact headers, each on its own line, no markdown, no emojis, no code fences:

TITLE: <chapter title verbatim from user>

INTRO:
<one short paragraph (2-3 sentences) introducing the chapter and why it matters to the student>

STEPS:
1. <first concrete step the student should learn — one sentence>
2. <next step>
3. <next>
4. <next>
5. <final step>
(exactly 5 steps, each a single clear sentence the student can actually act on)

EXAMPLE:
<a single real-life, everyday example tailored to the audience that makes the chapter concrete — 2 sentences>

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
