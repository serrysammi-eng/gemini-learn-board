import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  clearChat,
  clearPrefs,
  getAISettings,
  getPrefs,
  getProgress,
  getTheme,
  setAISettings,
  setPrefs,
  setProgress,
  setTheme,
} from "@/lib/storage";
import {
  AVAILABLE_MODELS,
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  SUBJECT_LABELS,
  type Language,
  type Level,
  type Subject,
} from "@/lib/types";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — StudyMate AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const initialPrefs = getPrefs();
  const initialAI = getAISettings();
  const [name, setName] = useState(initialPrefs?.name || "");
  const [language, setLanguage] = useState<Language>(initialPrefs?.language || "english");
  const [subject, setSubject] = useState<Subject>(initialPrefs?.subject || "math");
  const [level, setLevel] = useState<Level>(initialPrefs?.level || "high_school");
  const [topic, setTopic] = useState(initialPrefs?.topic || "Everything");
  const [model, setModel] = useState(initialAI.model);
  const [geminiKey, setGeminiKey] = useState(initialAI.geminiApiKey || "");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(getTheme() === "dark");
  }, []);

  const progress = getProgress();

  const save = () => {
    setPrefs({
      name: name.trim() || "friend",
      language,
      subject,
      level,
      topic: topic.trim() || "Everything",
      onboardedAt: initialPrefs?.onboardedAt || Date.now(),
    });
    setAISettings({ model, geminiApiKey: geminiKey.trim() || undefined });
    toast.success("Settings saved!");
  };

  const toggleTheme = (next: boolean) => {
    setIsDark(next);
    setTheme(next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const resetEverything = () => {
    if (!confirm("Reset all your data? This clears progress, chat and preferences.")) return;
    clearPrefs();
    clearChat();
    setProgress({
      xp: 0,
      streak: 0,
      badges: [],
      lessonsRead: [],
      quizzesPassed: 0,
      quizzesTaken: 0,
      gamesWon: 0,
    });
    navigate({ to: "/onboarding", replace: true });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-100">Settings</h1>

      {/* Progress card */}
      <div
        className="opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards] rounded-2xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-5 text-white shadow-[0_0_30px_rgba(139,92,246,0.15)]"
        style={{ animationDelay: "0ms" }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-purple-400/70">
          Your progress
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold text-amber-400">{progress.xp}</div>
            <div className="text-xs text-slate-400">XP</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">🔥 {progress.streak}</div>
            <div className="text-xs text-slate-400">Day streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-400">{progress.badges.length}</div>
            <div className="text-xs text-slate-400">Badges</div>
          </div>
        </div>
        {progress.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {progress.badges.slice(-8).map((b) => (
              <span
                key={b}
                className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs text-amber-400"
              >
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-xl bg-white/[0.04] border border-purple-500/15 p-3 text-xs text-slate-300">
          🏆 Leaderboard <span className="text-slate-500">— coming soon</span>
        </div>
      </div>

      {/* AI Model */}
      <section
        className="opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards] rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_0_30px_rgba(139,92,246,0.08)]"
        style={{ animationDelay: "80ms" }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-400/70">
          AI Model
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <Label className="text-xs text-slate-400">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Your Gemini API key (optional)</Label>
            <Input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Leave empty to use Lovable AI"
              className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200 placeholder:text-slate-500 focus:border-purple-500/40"
            />
            <p className="mt-1 text-xs text-slate-500">
              Provide your own Google AI Studio key to override Lovable AI. Stored locally in your
              browser only.
            </p>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section
        className="opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards] rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_0_30px_rgba(139,92,246,0.08)]"
        style={{ animationDelay: "160ms" }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-400/70">
          Learning preferences
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <Label className="text-xs text-slate-400">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200 placeholder:text-slate-500 focus:border-purple-500/40"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                  <SelectItem key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Subject</Label>
            <Select value={subject} onValueChange={(v) => setSubject(v as Subject)}>
              <SelectTrigger className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SUBJECT_LABELS) as Subject[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUBJECT_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
              <SelectTrigger className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Topic</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 rounded-xl border border-purple-500/15 bg-white/[0.04] text-slate-200 placeholder:text-slate-500 focus:border-purple-500/40"
            />
          </div>
        </div>
        <Button
          onClick={save}
          className="mt-4 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] transition-all duration-300"
        >
          Save changes
        </Button>
      </section>

      {/* Danger */}
      <section
        className="opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards] rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400/70">
          Danger zone
        </h2>
        <div className="mt-3 space-y-2">
          <Button
            variant="outline"
            onClick={() => {
              clearChat();
              toast.success("Chat history cleared");
            }}
            className="w-full rounded-full border border-red-500/30 bg-red-500/[0.06] text-red-400 hover:bg-red-500/[0.12] transition-all duration-300"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Clear AI Tutor chat
          </Button>
          <Button
            variant="outline"
            onClick={resetEverything}
            className="w-full rounded-full border border-red-500/30 bg-red-500/[0.06] text-red-400 hover:bg-red-500/[0.12] transition-all duration-300"
          >
            <LogOut className="mr-1 h-4 w-4" /> Reset all data
          </Button>
        </div>
      </section>

      <div className="pb-4 text-center text-xs text-slate-500">Made with 💜 by StudyMate AI</div>
    </div>
  );
}
