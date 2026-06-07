export type Language = "english" | "hindi" | "both";
export type Subject = "math" | "science" | "chemistry" | "biology" | "technology";
export type Level = "school" | "high_school" | "college" | "adult";

export interface UserPrefs {
  name: string;
  language: Language;
  subject: Subject;
  level: Level;
  topic: string; // specific topic or "everything"
  onboardedAt: number;
}

export interface AISettings {
  model: string;
  geminiApiKey?: string;
}

export interface ProgressState {
  xp: number;
  streak: number;
  lastStudyDate?: string; // YYYY-MM-DD
  badges: string[];
  lessonsRead: string[]; // lesson ids/titles
  quizzesPassed: number;
  quizzesTaken: number;
  gamesWon: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  videos?: { title: string; url: string }[];
  ts: number;
}

export const SUBJECT_LABELS: Record<Subject, string> = {
  math: "Math 🔢",
  science: "Science 🔬",
  chemistry: "Chemistry ⚗️",
  biology: "Biology 🧬",
  technology: "Technology 💻",
};

export const LEVEL_LABELS: Record<Level, string> = {
  school: "School (6–10)",
  high_school: "High School (11–17)",
  college: "College",
  adult: "Adult Learner",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  english: "English",
  hindi: "हिन्दी (Hindi)",
  both: "Both (Hinglish)",
};

export const AVAILABLE_MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (fast, default)" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (smart)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (cheap)" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { id: "openai/gpt-5", label: "GPT-5 (powerful)" },
];
