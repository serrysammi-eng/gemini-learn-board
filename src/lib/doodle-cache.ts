import { pollinationsUrl } from "./pollinations";

/**
 * Shared module-level cache for AI-generated doodle images.
 * Keyed by line.toLowerCase().trim(). Values are data URLs (base64 PNG)
 * from the Lovable AI gateway, OR Pollinations URLs as a fast fallback,
 * OR Wikipedia thumbnail URLs.
 *
 * URLs are mirrored into localStorage (best-effort, quota-safe) under
 * `studymate.doodle:<key>` so images survive page reloads.
 */
export const doodleCache = new Map<string, string>();
export const doodleInflight = new Map<string, Promise<string>>();

const LS_PREFIX = "studymate.doodle:";
let hydrated = false;

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (v) doodleCache.set(k.slice(LS_PREFIX.length), v);
    }
  } catch {
    /* noop */
  }
}
hydrateFromStorage();

function persistToStorage(key: string, url: string) {
  if (typeof window === "undefined") return;
  try {
    // Skip absurdly large base64 payloads to avoid blowing the 5MB quota
    // on a single image. Pollinations / Wikimedia URLs persist freely.
    if (url.startsWith("data:") && url.length > 350_000) return;
    localStorage.setItem(LS_PREFIX + key, url);
  } catch {
    /* quota — silently skip */
  }
}

export function doodleKey(line: string): string {
  return (line || "").trim().toLowerCase();
}

export function getCachedDoodle(line: string): string | null {
  return doodleCache.get(doodleKey(line)) ?? null;
}

/**
 * Stream a doodle from /api/doodle-image. Caches the final frame.
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
    if (finalUrl) {
      doodleCache.set(key, finalUrl);
      persistToStorage(key, finalUrl);
    }
    return finalUrl;
  })();

  doodleInflight.set(key, promise);
  promise.catch(() => {}).finally(() => doodleInflight.delete(key));
  return promise;
}

/**
 * Pollinations fallback — instant placeholder, no fetch.
 */
export function instantDoodle(line: string, topic?: string): string {
  return pollinationsUrl(line, topic);
}

/**
 * Wikipedia thumbnail — instant real-photo background for roadmap tiles.
 * Returns the cached value (or null) on subsequent calls so callers can
 * cheaply read the result without re-fetching.
 */
const wikiCache = new Map<string, string | null>();
const wikiInflight = new Map<string, Promise<string | null>>();

export function getCachedWikimedia(topic: string): string | null | undefined {
  return wikiCache.get(doodleKey(topic));
}

export async function fetchWikimediaImage(topic: string): Promise<string | null> {
  const key = doodleKey(topic);
  if (!key) return null;
  if (wikiCache.has(key)) return wikiCache.get(key) ?? null;
  const existing = wikiInflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const slug = encodeURIComponent(topic.trim().replace(/\s+/g, "_"));
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as {
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
      };
      return j.thumbnail?.source ?? j.originalimage?.source ?? null;
    } catch {
      return null;
    }
  })();
  wikiInflight.set(key, p);
  const url = await p.finally(() => wikiInflight.delete(key));
  wikiCache.set(key, url);
  return url;
}

/**
 * Fire-and-forget background pre-generation.
 *
 * - Hard concurrency cap of 2 to avoid flooding the AI gateway.
 * - If more than 20 items are queued, only the first 6 are pre-generated;
 *   the rest are lazy-loaded on demand by the on-screen tiles themselves.
 */
export async function preGenerateDoodles(
  lines: { line: string; topic?: string }[],
  _concurrency = 2,
): Promise<void> {
  const concurrency = Math.min(2, Math.max(1, _concurrency));
  const queue = lines.length > 20 ? lines.slice(0, 6) : [...lines];
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
            /* on-demand request will retry */
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
}
