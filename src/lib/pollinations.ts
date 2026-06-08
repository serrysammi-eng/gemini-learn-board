/**
 * Pollinations.ai — completely free, no key, no signup image generation.
 * Returns a direct image URL we can drop into <img src=…>.
 * The image is generated server-side by pollinations.ai on first request
 * and cached on their CDN for repeats with the same prompt+seed.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

export function pollinationsUrl(
  line: string,
  topic?: string,
  opts: { width?: number; height?: number } = {},
): string {
  const w = opts.width ?? 512;
  const h = opts.height ?? 512;
  const concept = (line || "").trim().slice(0, 200);
  const ctx = topic ? `, in the context of ${topic}` : "";
  const prompt = `minimalist hand-drawn white chalk doodle on dark navy chalkboard background, single clear visual metaphor for: ${concept}${ctx}. sketchy educational illustration, no text, no words, no labels, centered composition`;
  const seed = hashString(concept.toLowerCase());
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    nologo: "true",
    model: "flux",
    seed: String(seed),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}
