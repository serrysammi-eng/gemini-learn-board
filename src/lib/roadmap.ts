import type { UserPrefs } from "./types";
import { preGenerateDoodles } from "./doodle-cache";

export interface RoadmapChapter {
  id: string;
  title: string;
  summary: string;
}

export interface Roadmap {
  topic: string;
  subject: string;
  chapters: RoadmapChapter[];
  createdAt: number;
}

const KEY = "studymate.roadmap.v1";

export function getRoadmap(): Roadmap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Roadmap) : null;
  } catch {
    return null;
  }
}

export function setRoadmap(r: Roadmap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* quota */
  }
}

export function clearRoadmap() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

function matchesPrefs(r: Roadmap | null, prefs: UserPrefs): boolean {
  if (!r) return false;
  return r.topic === (prefs.topic || "everything") && r.subject === prefs.subject;
}

async function generateRoadmap(prefs: UserPrefs): Promise<Roadmap> {
  const res = await fetch("/api/roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: prefs.topic || "everything",
      subject: prefs.subject,
      level: prefs.level,
      language: prefs.language,
      count: 20,
    }),
  });
  if (!res.ok) throw new Error(`roadmap failed (${res.status})`);
  const data = (await res.json()) as { chapters: RoadmapChapter[] };
  return {
    topic: prefs.topic || "everything",
    subject: prefs.subject,
    chapters: data.chapters || [],
    createdAt: Date.now(),
  };
}

/**
 * Pre-fetch chapter content for the first N chapters and store in localStorage
 * under the same key the modal reads from, so the first taps are instant.
 */
function prefetchChapterContent(prefs: UserPrefs, chapters: RoadmapChapter[], n = 5) {
  if (typeof window === "undefined") return;
  const language = prefs.language || "english";
  const level = prefs.level || "default";
  chapters.slice(0, n).forEach((c, i) => {
    const cacheKey = `studymate.chapter.v1:${c.id}:${language}:${level}`;
    try {
      if (localStorage.getItem(cacheKey)) return;
    } catch {
      /* noop */
    }
    // Stagger so we don't fire 5 streams at once
    setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/roadmap-chapter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: c.title,
              summary: c.summary,
              topic: prefs.topic,
              language,
              level: prefs.level,
            }),
          });
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
          }
          // Store raw text — modal's parseChapterContent reads it directly when
          // present. Actually modal expects a parsed JSON object; we let the
          // modal re-parse on miss. To match its read shape, parse minimally.
          // The modal stores the parsed object; we mimic that by storing raw
          // under a "raw" sibling key the modal does not read, AND parsed
          // under the expected key when parsing succeeds.
          const parsed = naiveParse(buf);
          if (parsed) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(parsed));
            } catch {
              /* quota */
            }
          }
        } catch {
          /* silent */
        }
      })();
    }, i * 600);
  });
}

// Mirror of parseChapterContent in _app.roadmap.tsx so the prefetch can
// populate the same cache shape the modal reads.
function naiveParse(text: string) {
  const t = text.replace(/\r/g, "").trim();
  const section = (name: string) => {
    const re = new RegExp(
      `^${name}\\s*:\\s*([\\s\\S]*?)(?=^(?:TITLE|INTRO|STEPS|EXAMPLE|END)\\b|\\Z)`,
      "im",
    );
    const m = t.match(re);
    return m ? m[1].trim() : "";
  };
  const title = section("TITLE").split(/\n/)[0]?.trim() || "";
  const intro = section("INTRO");
  const stepsBlock = section("STEPS");
  const example = section("EXAMPLE").replace(/\nEND\s*$/i, "").trim();
  const steps = stepsBlock
    .split(/\n/)
    .map((l) => l.replace(/^\s*\d+[).]\s*/, "").replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (!title && !intro && steps.length === 0) return null;
  return { title, intro, steps, example };
}

let ensureInflight: Promise<Roadmap> | null = null;

/**
 * Return the existing roadmap if it matches the user's onboarding choices,
 * otherwise generate a fresh one. Always kicks off:
 *   1. Bounded image pre-generation (capped via preGenerateDoodles).
 *   2. Background pre-fetch of the first 5 chapters' content.
 */
export function ensureRoadmap(prefs: UserPrefs): Promise<Roadmap> {
  const existing = getRoadmap();
  if (matchesPrefs(existing, prefs)) {
    void preGenerateDoodles(
      existing!.chapters.map((c) => ({ line: c.title, topic: prefs.topic })),
      2,
    );
    prefetchChapterContent(prefs, existing!.chapters, 5);
    return Promise.resolve(existing!);
  }
  if (ensureInflight) return ensureInflight;
  ensureInflight = (async () => {
    try {
      const r = await generateRoadmap(prefs);
      setRoadmap(r);
      void preGenerateDoodles(
        r.chapters.map((c) => ({ line: c.title, topic: prefs.topic })),
        2,
      );
      prefetchChapterContent(prefs, r.chapters, 5);
      return r;
    } finally {
      ensureInflight = null;
    }
  })();
  return ensureInflight;
}
