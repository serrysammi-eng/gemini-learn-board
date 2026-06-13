/**
 * RAG sources — Wikipedia, OpenStax, Khan Academy.
 * All functions silently return null on any failure. Never throw to callers.
 */

const TIMEOUT_MS = 4000;

async function safeFetch(url: string): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "StudyMateAI/1.0" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export interface WikiResult {
  text: string;
  imageUrl: string | null;
}

export async function fetchWikipedia(topic: string): Promise<WikiResult | null> {
  if (!topic) return null;
  const slug = encodeURIComponent(topic.trim().replace(/\s+/g, "_"));
  const res = await safeFetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
  );
  if (!res) return null;
  try {
    const json = (await res.json()) as {
      extract?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    const text = json.extract?.trim();
    if (!text) return null;
    return {
      text,
      imageUrl: json.thumbnail?.source ?? json.originalimage?.source ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchOpenStax(topic: string): Promise<string | null> {
  if (!topic) return null;
  const q = encodeURIComponent(topic.trim());
  const res = await safeFetch(
    `https://openstax.org/api/v2/pages/?search=${q}&limit=2`,
  );
  if (!res) return null;
  try {
    const json = (await res.json()) as {
      items?: { title?: string; description?: string; meta?: { search_description?: string } }[];
    };
    const items = json.items || [];
    const parts = items
      .map((it) => {
        const t = it.title?.trim();
        const d = (it.description || it.meta?.search_description || "").trim();
        return [t, d].filter(Boolean).join(" — ");
      })
      .filter(Boolean);
    return parts.length ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

export async function fetchKhanAcademy(topic: string): Promise<string | null> {
  if (!topic) return null;
  const slug = encodeURIComponent(topic.trim().toLowerCase().replace(/\s+/g, "-"));
  const res = await safeFetch(`https://www.khanacademy.org/api/v1/topic/${slug}`);
  if (!res) return null;
  try {
    const json = (await res.json()) as { description?: string };
    const text = json.description?.trim();
    return text || null;
  } catch {
    return null;
  }
}
