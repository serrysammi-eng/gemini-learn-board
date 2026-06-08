import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

import { getProvider, resolveModelId } from "@/lib/ai-gateway.server";

interface Body {
  topic: string;
  subject: string;
  level?: string;
  language?: string;
  count?: number;
}

export const Route = createFileRoute("/api/roadmap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!body?.topic || !body?.subject) {
          return new Response("Bad request", { status: 400 });
        }
        const count = Math.min(Math.max(body.count ?? 20, 5), 25);
        const language = body.language || "english";

        const provider = getProvider();
        const model = resolveModelId("google/gemini-3-flash-preview");

        const prompt = `You are a curriculum designer. Build a step-by-step learning roadmap for a student.

STUDENT CONTEXT
- Subject area: ${body.subject}
- Specific topic the student picked: ${body.topic === "everything" ? `the whole subject of ${body.subject}` : body.topic}
- Level: ${body.level || "high_school"}
- Language for chapter titles and summaries: ${language}

TASK
Produce EXACTLY ${count} chapters, ordered from absolute beginner to advanced.
Every chapter must build on the previous one. Cover fundamentals, common
mistakes, real-world applications, and at least one chapter on practice/exercises.

STRICT OUTPUT FORMAT
Return ONLY a JSON array (no markdown, no code fences, no commentary) of objects:
[{"title":"...","summary":"..."}]
- title: 3-7 words, clear and concrete (e.g. "What is Python?", "Variables and Data Types")
- summary: ONE sentence (max 18 words) explaining what the student will learn in that chapter
- Match the requested language. Hindi → Devanagari. English → English. Both → Hinglish in Roman.
- No numbering in the title (no "Chapter 1:", no "1.").

START NOW.`;

        try {
          const { text } = await generateText({
            model: provider(model),
            prompt,
          });
          // Extract JSON array from the response (defensive against markdown fences)
          const match = text.match(/\[[\s\S]*\]/);
          const raw = match ? match[0] : text;
          const parsed = JSON.parse(raw) as { title: string; summary: string }[];
          const chapters = parsed
            .filter((c) => c?.title)
            .slice(0, count)
            .map((c, i) => ({
              id: `ch-${i + 1}`,
              title: String(c.title).trim(),
              summary: String(c.summary || "").trim(),
            }));
          return Response.json({ chapters });
        } catch (err) {
          console.error("roadmap generation failed", err);
          return new Response(
            JSON.stringify({ error: "Could not generate roadmap. Try again." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
