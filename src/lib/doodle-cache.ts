import { pollinationsUrl } from "./pollinations";

/**
 * Shared module-level cache for AI-generated doodle images.
 * Keyed by line.toLowerCase().trim(). Values are data URLs (base64 PNG)
 * returned by the Lovable AI gateway, OR Pollinations URLs as a fast fallback.
 *
 * Lives in memory only — base64 PNGs are too large for localStorage.
 * Re-populated by Roadmap background pre-generation after onboarding.
 */
export const doodleCache = new Map<string, string>();
export const doodleInflight = new Map<string, Promise<string>>();

export function doodleKey(line: string): string {
  return (line || "").trim().toLowerCase();
}

export function getCachedDoodle(line: string): string | null {
  return doodleCache.get(doodleKey(line)) ?? null;
}

/**
 * Stream a doodle from /api/doodle-image. Caches the final frame.
 * Re-uses an in-flight request for the same key so duplicate callers
 * (e.g. learn page + roadmap pre-gen) don't double-bill.
 */
export async function fetchDoodleImage(
  line: string,
  topic: string | undefined,
  signal: AbortSignal,
  onPartial: (dataUrl: string) => void = () => {},
): Promise<string> {
  const key = doodleKey(line);
  const cached = doodleCache.get(key);
  if (cached) return cached;
  const existing = doodleInflight.get(key);
  if (existing) return existing;

  const { createParser } = await import("eventsource-parser");
  const promise = (async () => {
    const res = await fetch("/api/doodle-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line, topic }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error("doodle failed");

    let finalUrl = "";
    const parser = createParser({
      onEvent(ev) {
        if (
          ev.event !== "image_generation.partial_image" &&
          ev.event !== "image_generation.completed"
        )
          return;
        let p: { b64_json?: string };
        try {
          p = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!p.b64_json) return;
        const url = `data:image/png;base64,${p.b64_json}`;
        if (ev.event === "image_generation.completed") finalUrl = url;
        else onPartial(url);
      },
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
    if (finalUrl) doodleCache.set(key, finalUrl);
    return finalUrl;
  })();

  doodleInflight.set(key, promise);
  // Always attach a catch so fire-and-forget callers (pre-gen) don't leak
  // as "Unhandled promise rejection". Real callers still get the rejection
  // via the returned promise.
  promise.catch(() => {}).finally(() => doodleInflight.delete(key));
  return promise;
}

/**
 * Pollinations fallback — used as an instant placeholder while the slower
 * Lovable AI image is being generated. Returns a direct URL, no fetch.
 */
export function instantDoodle(line: string, topic?: string): string {
  return pollinationsUrl(line, topic);
}

/**
 * Fire-and-forget background pre-generation. Throttled to N concurrent
 * requests so we don't hammer the gateway on onboarding completion.
 */
export async function preGenerateDoodles(
  lines: { line: string; topic?: string }[],
  concurrency = 2,
): Promise<void> {
  const queue = [...lines];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const next = queue.shift();
          if (!next) break;
          if (doodleCache.has(doodleKey(next.line))) continue;
          try {
            const ctrl = new AbortController();
            await fetchDoodleImage(next.line, next.topic, ctrl.signal);
          } catch {
            /* skip failed pre-gen; on-demand request will retry */
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
}
