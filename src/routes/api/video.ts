import { createFileRoute } from "@tanstack/react-router";

/**
 * "Visual reference" endpoint.
 *
 * The old version used the YouTube Data API and embedded videos via iframe,
 * which often failed (region blocks, embed disabled, missing API key, etc.).
 *
 * New approach: we generate a clean educational illustration of the topic on
 * the fly using Pollinations (https://image.pollinations.ai). It needs no
 * API key, returns instantly, and never fails to "play".
 *
 * Response shape stays backwards compatible: we still return `{ videoId }` so
 * existing callers don't break, plus a richer `{ imageUrl }` field for the new UI.
 */
export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
        if (!query) {
          return new Response(JSON.stringify({ error: "Missing query parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Stable seed per topic so the same lesson keeps the same illustration.
        let seed = 0;
        for (let i = 0; i < query.length; i++) {
          seed = (seed * 31 + query.charCodeAt(i)) | 0;
        }
        seed = Math.abs(seed) % 1_000_000;

        const prompt =
          `A clear, friendly educational illustration explaining "${query}". ` +
          `Clean diagram style, labeled, vibrant chalkboard colors on dark background, ` +
          `no text watermark, classroom-friendly, high detail.`;

        const imageUrl =
          `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
          `?width=1280&height=720&seed=${seed}&nologo=true&model=flux`;

        return new Response(
          JSON.stringify({
            imageUrl,
            // Back-compat: callers that still look for videoId get a synthetic id.
            videoId: `img-${seed}`,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
