import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw, Timer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { openTutor } from "@/components/AITutor";
import { generateGameQuestions } from "@/lib/ai.functions";
import { celebrate } from "@/lib/confetti";
import { addXP, awardBadge, getAISettings, getPrefs } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/game")({
  head: () => ({ meta: [{ title: "Game — StudyMate AI" }] }),
  component: GamePage,
});

interface GQ {
  q: string;
  choices: string[];
  answerIndex: number;
}

type GameType = "coding" | "math" | "science";

function gameTypeFor(subject: string): GameType {
  if (subject === "technology") return "coding";
  if (subject === "math") return "math";
  return "science";
}

function GamePage() {
  const prefs = getPrefs();
  const [qs, setQs] = useState<GQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [carPos, setCarPos] = useState(5); // %
  const [energy, setEnergy] = useState(100); // opponent energy
  const [myEnergy, setMyEnergy] = useState(100);
  const [timeLeft, setTimeLeft] = useState(60);
  const [outcome, setOutcome] = useState<"win" | "lose" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameType: GameType = prefs ? gameTypeFor(prefs.subject) : "science";

  const load = async () => {
    if (!prefs) return;
    setError(null);
    setIdx(0);
    setCarPos(5);
    setEnergy(100);
    setMyEnergy(100);
    setTimeLeft(60);
    setOutcome(null);
    setPicked(null);
    setLoading(true);
    try {
      const settings = getAISettings();
      const res = (await generateGameQuestions({
        data: {
          model: settings.model,
          userApiKey: settings.geminiApiKey,
          name: prefs.name,
          language: prefs.language,
          subject: prefs.subject,
          level: prefs.level,
          topic: prefs.topic,
          gameType,
        },
      })) as { questions: GQ[] };
      setQs(res.questions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load game");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Math game timer
  useEffect(() => {
    if (gameType !== "math" || loading || outcome || qs.length === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setOutcome("lose");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameType, loading, outcome, qs.length]);

  const finish = (win: boolean) => {
    setOutcome(win ? "win" : "lose");
    if (timerRef.current) clearInterval(timerRef.current);
    if (win) {
      addXP(75);
      awardBadge(
        `🏆 ${gameType === "coding" ? "Coder" : gameType === "math" ? "Math Racer" : "Quiz Champ"}`,
      );
      celebrate();
    } else {
      addXP(10);
    }
    window.dispatchEvent(new Event("studymate:progress"));
  };

  const answer = (i: number) => {
    if (picked !== null || outcome) return;
    setPicked(i);
    const correct = i === qs[idx].answerIndex;

    if (gameType === "coding") {
      if (correct) {
        setCarPos((p) => {
          const np = Math.min(100, p + 12);
          if (np >= 95) setTimeout(() => finish(true), 400);
          return np;
        });
      } else {
        setCarPos((p) => Math.max(5, p - 4));
      }
    } else if (gameType === "math") {
      if (correct) {
        setCarPos((p) => {
          const np = Math.min(100, p + 10);
          if (np >= 95) setTimeout(() => finish(true), 400);
          return np;
        });
      } else {
        setTimeLeft((t) => Math.max(0, t - 5));
      }
    } else {
      // science quiz battle
      if (correct) {
        setEnergy((e) => {
          const ne = Math.max(0, e - 20);
          if (ne <= 0) setTimeout(() => finish(true), 400);
          return ne;
        });
      } else {
        setMyEnergy((e) => {
          const ne = Math.max(0, e - 25);
          if (ne <= 0) setTimeout(() => finish(false), 400);
          return ne;
        });
      }
    }

    setTimeout(() => {
      setPicked(null);
      setIdx((i) => (i + 1) % Math.max(1, qs.length));
    }, 700);
  };

  if (!prefs) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-12 text-slate-400 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" /> Loading game…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-400">
        {error}
        <button
          onClick={load}
          className="ml-2 rounded-full border border-purple-500/20 bg-white/[0.04] px-3 py-1 text-xs text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (outcome) {
    const win = outcome === "win";
    return (
      <div className="space-y-4 animate-pop">
        <div
          className={cn(
            "rounded-3xl p-6 text-center text-white",
            win
              ? "bg-gradient-to-br from-amber-900/60 via-purple-900/40 to-[#0a1628] border border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.2)]"
              : "bg-gradient-to-br from-purple-900/80 to-[#0a1628] border border-purple-500/20 shadow-[0_0_30px_rgba(139,92,246,0.15)]",
          )}
        >
          <div className={cn("text-6xl", win && "drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]")}>
            {win ? "🏆" : "😅"}
          </div>
          <h2 className={cn("mt-3 text-2xl font-bold", win ? "text-amber-400" : "text-slate-100")}>
            {win ? "You won!" : "So close!"}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {win ? "+75 XP & badge unlocked" : "+10 XP for trying — don't give up!"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={load}
            className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
          >
            <RefreshCw className="h-4 w-4" /> Play again
          </button>
          {!win && (
            <button
              onClick={() =>
                openTutor(
                  `I lost a ${gameType} game on ${prefs.topic}. Can you teach me the basics?`,
                )
              }
              className="rounded-full border border-purple-500/20 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
            >
              Ask Tutor 🦉
            </button>
          )}
          {win && (
            <button
              onClick={load}
              className="rounded-full border border-purple-500/20 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
            >
              New game
            </button>
          )}
        </div>
      </div>
    );
  }

  const current = qs[idx];
  if (!current) return null;

  return (
    <div className="space-y-4">
      {/* Game HUD */}
      {gameType === "coding" && (
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-4 text-white shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-purple-300">
              🏎️ Code Racer
            </span>
            <span className="text-amber-400 font-semibold">{Math.round(carPos)}%</span>
          </div>
          <div className="relative mt-3 h-12 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              {[25, 50, 75].map((p) => (
                <div
                  key={p}
                  className="absolute h-full w-px bg-purple-500/30"
                  style={{ left: `${p}%` }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-purple-400/60" />
                </div>
              ))}
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 text-3xl transition-all duration-500 drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]"
              style={{ left: `${carPos}%` }}
            >
              🏎️
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-2xl">🏁</div>
          </div>
        </div>
      )}

      {gameType === "math" && (
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-4 text-white shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-purple-300">🧮 Math Race</span>
            <span
              className={cn(
                "flex items-center gap-1 font-semibold transition-all duration-300",
                timeLeft < 10
                  ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                  : "text-slate-300",
              )}
            >
              <Timer className="h-3 w-3" /> {timeLeft}s
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-all duration-500"
              style={{ width: `${carPos}%` }}
            />
          </div>
          {/* Timer bar */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                timeLeft < 10
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                  : "bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.4)]",
              )}
              style={{ width: `${(timeLeft / 60) * 100}%` }}
            />
          </div>
        </div>
      )}

      {gameType === "science" && (
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-4 text-white shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-purple-300">
            ⚡ Quiz Battle
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <div className="flex justify-between text-slate-300">
                <span>🤖 Opponent</span>
                <span className="text-amber-400 font-semibold">{energy}%</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)] transition-all duration-500"
                  style={{ width: `${energy}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-300">
                <span>👤 You</span>
                <span className="text-purple-400 font-semibold">{myEnergy}%</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 shadow-[0_0_8px_rgba(139,92,246,0.3)] transition-all duration-500"
                  style={{ width: `${myEnergy}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question */}
      <div className="rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Zap className="h-3.5 w-3.5 text-purple-400" /> Question {idx + 1}
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-100">{current.q}</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {current.choices.map((c, i) => {
            const isAnswer = i === current.answerIndex;
            const isPicked = picked === i;
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={picked !== null}
                className={cn(
                  "rounded-2xl border p-3 text-left text-sm font-medium transition-all duration-300 opacity-0 animate-[fadeSlideUp_0.5s_ease-out_forwards]",
                  picked === null &&
                    "border-purple-500/15 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]",
                  picked !== null &&
                    isAnswer &&
                    "border-emerald-500/60 bg-emerald-500/10 text-emerald-400",
                  picked !== null &&
                    isPicked &&
                    !isAnswer &&
                    "border-red-500/60 bg-red-500/10 text-red-400",
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
