import type { AISettings, ChatMessage, ProgressState, UserPrefs } from "./types";

const KEYS = {
  prefs: "studymate.prefs",
  ai: "studymate.ai",
  progress: "studymate.progress",
  theme: "studymate.theme",
  chat: "studymate.chat",
  cache: "studymate.cache",
} as const;

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

// User prefs
export const getPrefs = (): UserPrefs | null => read<UserPrefs | null>(KEYS.prefs, null);
export const setPrefs = (p: UserPrefs) => write(KEYS.prefs, p);
export const clearPrefs = () => isBrowser() && localStorage.removeItem(KEYS.prefs);

// AI settings
export const getAISettings = (): AISettings =>
  read<AISettings>(KEYS.ai, { model: "google/gemini-3-flash-preview" });
export const setAISettings = (s: AISettings) => write(KEYS.ai, s);

// Theme
export const getTheme = (): "light" | "dark" => read<"light" | "dark">(KEYS.theme, "light");
export const setTheme = (t: "light" | "dark") => write(KEYS.theme, t);

// Chat history
export const getChat = (): ChatMessage[] => read<ChatMessage[]>(KEYS.chat, []);
export const setChat = (m: ChatMessage[]) => write(KEYS.chat, m);
export const clearChat = () => isBrowser() && localStorage.removeItem(KEYS.chat);

// Progress / gamification
const defaultProgress: ProgressState = {
  xp: 0,
  streak: 0,
  badges: [],
  lessonsRead: [],
  quizzesPassed: 0,
  quizzesTaken: 0,
  gamesWon: 0,
};

export const getProgress = (): ProgressState => read<ProgressState>(KEYS.progress, defaultProgress);
export const setProgress = (p: ProgressState) => write(KEYS.progress, p);

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function addXP(amount: number) {
  const p = getProgress();
  p.xp += amount;
  // streak
  const today = todayKey();
  if (p.lastStudyDate !== today) {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yKey = `${yest.getFullYear()}-${yest.getMonth() + 1}-${yest.getDate()}`;
    p.streak = p.lastStudyDate === yKey ? p.streak + 1 : 1;
    p.lastStudyDate = today;
  }
  setProgress(p);
  return p;
}

export function awardBadge(badge: string) {
  const p = getProgress();
  if (!p.badges.includes(badge)) {
    p.badges.push(badge);
    setProgress(p);
  }
  return p;
}

// Generic cache for AI generations (lessons, quizzes, flashcards)
type CacheEntry = { ts: number; value: unknown };
export function getCached<T>(key: string, maxAgeMs = 1000 * 60 * 60 * 24 * 7): T | null {
  const all = read<Record<string, CacheEntry>>(KEYS.cache, {});
  const hit = all[key];
  if (!hit) return null;
  if (Date.now() - hit.ts > maxAgeMs) return null;
  return hit.value as T;
}
export function setCached<T>(key: string, value: T) {
  const all = read<Record<string, CacheEntry>>(KEYS.cache, {});
  all[key] = { ts: Date.now(), value };
  write(KEYS.cache, all);
}
