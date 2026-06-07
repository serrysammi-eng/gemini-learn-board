import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { openTutor } from "@/components/AITutor";
import { generateQuiz } from "@/lib/ai.functions";
import { celebrate } from "@/lib/confetti";
import {
  addXP,
  awardBadge,
  getAISettings,
  getCached,
  getPrefs,
  getProgress,
  setCached,
  setProgress,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/quiz")({
  head: () => ({ meta: [{ title: "Quiz — StudyMate AI" }] }),
  component: QuizPage,
});

interface Question {
  q: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

function QuizPage() {
  const navigate = useNavigate();
  const prefs = getPrefs();
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const cacheKey = prefs
    ? `quiz:${prefs.subject}:${prefs.topic}:${prefs.language}:${prefs.level}`
    : "";

  const load = async (force = false) => {
    if (!prefs) return;
    setError(null);
    setIdx(0);
    setPicked(null);
    setShowExplain(false);
    setCorrect(0);
    setDone(false);
    if (!force) {
      const cached = getCached<{ questions: Question[] }>(cacheKey, 1000 * 60 * 30);
      if (cached) {
        setQuiz(cached.questions);
        return;
      }
    }
    setLoading(true);
    try {
      const settings = getAISettings();
      const res = (await generateQuiz({
        data: {
          model: settings.model,
          userApiKey: settings.geminiApiKey,
          name: prefs.name,
          language: prefs.language,
          subject: prefs.subject,
          level: prefs.level,
          topic: prefs.topic,
        },
      })) as { questions: Question[] };
      setQuiz(res.questions);
      setCached(cacheKey, res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load quiz");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!prefs) return null;

  const current = quiz[idx];
  const isCorrect = picked !== null && current && picked === current.answerIndex;

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === current.answerIndex) {
      setCorrect((c) => c + 1);
    }
  };

  const goNext = () => {
    setPicked(null);
    setShowExplain(false);
    if (idx + 1 >= quiz.length) {
      finish();
    } else {
      setIdx(idx + 1);
    }
  };

  const finish = () => {
    setDone(true);
    const passed = correct >= Math.ceil(quiz.length * 0.6);
    const p = getProgress();
    p.quizzesTaken += 1;
    if (passed) p.quizzesPassed += 1;
    setProgress(p);
    addXP(passed ? 50 : 15);
    if (passed) {
      awardBadge(`🎯 Quiz win: ${prefs.topic}`);
      celebrate();
    }
    window.dispatchEvent(new Event("studymate:progress"));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-12 text-slate-400 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" /> Building your quiz…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-400">
        {error}
        <button
          onClick={() => load(true)}
          className="ml-2 rounded-full border border-purple-500/20 bg-white/[0.04] px-3 py-1 text-xs text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (done) {
    const passed = correct >= Math.ceil(quiz.length * 0.6);
    return (
      <div className="space-y-4 animate-pop">
        <div
          className={cn(
            "rounded-3xl p-6 text-center text-white",
            passed
              ? "bg-gradient-to-br from-amber-900/60 via-purple-900/40 to-[#0a1628] border border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.2)]"
              : "bg-gradient-to-br from-purple-900/80 to-[#0a1628] border border-purple-500/20 shadow-[0_0_30px_rgba(139,92,246,0.15)]",
          )}
        >
          <div className={cn("text-6xl", passed && "drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]")}>
            {passed ? "🏆" : "💪"}
          </div>
          <h2
            className={cn("mt-3 text-2xl font-bold", passed ? "text-amber-400" : "text-slate-100")}
          >
            {passed ? "Amazing work!" : "Good try!"}
          </h2>
          <p className="mt-1 text-lg text-slate-200">
            You got{" "}
            <strong>
              {correct}/{quiz.length}
            </strong>{" "}
            correct
          </p>
          <p className="mt-2 text-sm text-slate-400">
            +{passed ? 50 : 15} XP earned {passed && "· 🎯 Badge unlocked"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {passed ? (
            <button
              onClick={() => load(true)}
              className="rounded-full bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
            >
              New quiz
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/flashcards" })}
              className="rounded-full bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
            >
              Practice flashcards →
            </button>
          )}
          <button
            onClick={() => load(true)}
            className="flex items-center justify-center gap-1 rounded-full border border-purple-500/20 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-4 w-4" /> Retry quiz
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Question {idx + 1} of {quiz.length}
        </div>
        <div className="text-sm font-semibold text-emerald-400">{correct} ✓</div>
      </div>

      {/* Custom progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-all duration-500"
          style={{ width: `${((idx + (picked !== null ? 1 : 0)) / quiz.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
        <h2 className="text-lg font-semibold leading-snug text-slate-100">{current.q}</h2>
        <div className="mt-4 space-y-2">
          {current.choices.map((c, i) => {
            const isAnswer = i === current.answerIndex;
            const isPicked = picked === i;
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={picked !== null}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left text-sm font-medium transition-all duration-300 opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards]",
                  picked === null &&
                    "border-purple-500/15 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]",
                  picked !== null &&
                    isAnswer &&
                    "border-emerald-500/60 bg-emerald-500/10 text-emerald-400",
                  picked !== null &&
                    isPicked &&
                    !isAnswer &&
                    "border-red-500/60 bg-red-500/10 text-red-400",
                  picked !== null &&
                    !isAnswer &&
                    !isPicked &&
                    "border-white/5 bg-white/[0.01] text-slate-500 opacity-60",
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>
                {c}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div className="mt-4 animate-fade-in">
            <div
              className={cn(
                "rounded-xl p-3 text-sm font-semibold",
                isCorrect
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20",
              )}
            >
              {isCorrect ? "✅ Correct!" : "❌ Not quite."}
            </div>

            {!isCorrect && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setShowExplain((v) => !v)}
                  className="rounded-full border border-purple-500/20 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
                >
                  {showExplain ? "Hide" : "Show"} Explanation
                </button>
                <button
                  onClick={() =>
                    openTutor(
                      `Help me understand this question:\n"${current.q}"\nThe correct answer is "${current.choices[current.answerIndex]}". Why?`,
                    )
                  }
                  className="rounded-full border border-purple-500/20 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
                >
                  Ask AI Tutor 🦉
                </button>
              </div>
            )}

            {showExplain && (
              <div className="mt-3 rounded-xl border border-purple-500/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                {current.explanation}
              </div>
            )}

            <button
              onClick={goNext}
              className="mt-4 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
            >
              {idx + 1 >= quiz.length ? "Finish quiz" : "Next question →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
