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

/** Pull the chapter outline from the AI. */
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

let ensureInflight: Promise<Roadmap> | null = null;

/**
 * Return the existing roadmap if it matches the user's onboarding choices,
 * otherwise generate a fresh one and kick off background image pre-generation
 * for every chapter so the Roadmap tab feels instant when opened.
 */
export function ensureRoadmap(prefs: UserPrefs): Promise<Roadmap> {
  const existing = getRoadmap();
  if (matchesPrefs(existing, prefs)) {
    // Still kick off pre-gen in case the in-memory cache is empty (e.g. page reload)
    void preGenerateDoodles(
      existing!.chapters.map((c) => ({ line: c.title, topic: prefs.topic })),
      4,
    );
    return Promise.resolve(existing!);
  }
  if (ensureInflight) return ensureInflight;
  ensureInflight = (async () => {
    try {
      const r = await generateRoadmap(prefs);
      setRoadmap(r);
      // Higher concurrency = entire roadmap's images warm in the background
      // as fast as the gateway allows. User clicks any chapter and the image
      // is already cached.
      void preGenerateDoodles(
        r.chapters.map((c) => ({ line: c.title, topic: prefs.topic })),
        4,
      );
      return r;
    } finally {
      ensureInflight = null;
    }
  })();
  return ensureInflight;
}
