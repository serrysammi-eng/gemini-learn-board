import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams an AI-generated chalk-style doodle illustration for the current
 * teaching line. Uses Lovable AI Gateway image generation.
 */
export const Route = createFileRoute("/api/doodle-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { line, topic } = (await request.json()) as {
          line: string;
          topic?: string;
        };
        if (!line || typeof line !== "string") {
          return new Response("Bad request", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const prompt = `A clean minimalist hand-drawn chalk doodle illustration on a deep navy chalkboard background. Concept: "${line}". ${topic ? `Topic context: ${topic}. ` : ""}Single clear visual metaphor of the concept above. Soft white and pastel purple chalk strokes, a few warm amber accents. Sketchy educational style, like a tutor drawing on a smart board. NO text, NO words, NO letters, NO labels. Square composition, centered, plenty of empty space around the subject.`;

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-image-2",
              prompt,
              size: "1024x1024",
              quality: "low",
              n: 1,
              stream: true,
              partial_images: 1,
            }),
          },
        );
        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
