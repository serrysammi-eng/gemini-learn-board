import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  MessageSquareCode,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { openTutor } from "@/components/AITutor";
import { generateLesson } from "@/lib/ai.functions";
import { ScenePlayer } from "@/components/ScenePlayer";
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
import { SUBJECT_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { LessonScene } from "@/lib/animation.types";

export const Route = createFileRoute("/_app/learn")({
  head: () => ({ meta: [{ title: "Learn — StudyMate AI" }] }),
  component: LearnPage,
});

interface Lesson {
  title: string;
  intro: string;
  sections: { heading: string; body: string; type?: string }[];
  keyTakeaways: string[];
  funFact: string;
  scene?: LessonScene;
}

function LearnPage() {
  const prefs = getPrefs();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [completed, setCompleted] = useState(false);

  const cacheKey = prefs
    ? `lesson:${prefs.subject}:${prefs.topic}:${prefs.language}:${prefs.level}`
    : "";

  const load = async (force = false) => {
    if (!prefs) return;
    setError(null);
    setCurrentSlide(0);
    setCompleted(false);
    if (!force) {
      const cached = getCached<Lesson>(cacheKey);
      if (cached) {
        setLesson(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const settings = getAISettings();
      const res = (await generateLesson({
        data: {
          model: settings.model,
          userApiKey: settings.geminiApiKey,
          name: prefs.name,
          language: prefs.language,
          subject: prefs.subject,
          level: prefs.level,
          topic: prefs.topic,
        },
      })) as Lesson;
      setLesson(res);
      setCached(cacheKey, res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load lesson");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSlides = useMemo(() => {
    if (!lesson) return 0;
    // Slide 0: Intro
    // Slide 1..N: Sections
    // Slide N+1: Takeaways & Completion
    return 1 + lesson.sections.length + 1;
  }, [lesson]);

  if (!prefs) return null;

  const progressPct = totalSlides > 0 ? Math.round((currentSlide / (totalSlides - 1)) * 100) : 0;

  const nextSlide = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((s) => s + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide((s) => s - 1);
    }
  };

  const finish = () => {
    if (completed) return;
    setCompleted(true);
    celebrate(); // trigger confetti!
    const p = addXP(20);
    if (!p.lessonsRead.includes(cacheKey)) {
      p.lessonsRead.push(cacheKey);
      setProgress(p);
    }
    awardBadge(`📖 Read: ${prefs.topic}`);
    window.dispatchEvent(new Event("studymate:progress"));
  };

  return (
    <div className="space-y-5">
      {/* Header Badge */}
      <div className="rounded-3xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-5 text-white shadow-[0_0_30px_rgba(139,92,246,0.15)]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
          {SUBJECT_LABELS[prefs.subject]}
        </div>
        <h1 className="mt-1 text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
          {prefs.topic}
        </h1>
        <div className="mt-4 flex items-center gap-2">
          <Progress
            value={progressPct}
            className="h-2 bg-white/[0.06] [&>div]:bg-gradient-to-r [&>div]:from-purple-600 [&>div]:to-purple-400"
          />
          <span className="text-xs font-semibold text-slate-300">{progressPct}%</span>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-8 text-slate-300 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          <span>Generating your lesson…</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-5 text-sm text-red-400">
          <p className="font-semibold mb-2">Error: {error}</p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.1] text-red-300"
            onClick={() => load(true)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {lesson && !loading && (
        <div className="space-y-4 animate-[fadeSlideUp_0.4s_ease-out_forwards]">
          {/* Scene player under the header */}
          <ScenePlayer
            key={lesson.title + lesson.intro}
            scene={lesson.scene}
            lang={prefs.language}
            className="shadow-lg border border-purple-500/15"
            onComplete={finish}
          />

          {/* Progress dots at top of card */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  currentSlide === idx
                    ? "w-6 bg-gradient-to-r from-purple-500 to-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                    : "w-1.5 bg-white/[0.15] hover:bg-white/[0.3]",
                )}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Slide container */}
          <div className="relative overflow-hidden min-h-[220px]">
            {/* Slide 0: Intro */}
            {currentSlide === 0 && (
              <div className="rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_4px_24px_rgba(139,92,246,0.1)] transition-all animate-[fadeSlideUp_0.3s_ease-out_forwards]">
                <h2 className="text-xl font-bold text-slate-100">{lesson.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-slate-300">{lesson.intro}</p>
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={nextSlide}
                    className="rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                  >
                    Start Learning <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Slides 1 to N: Sections */}
            {currentSlide > 0 &&
              currentSlide <= lesson.sections.length &&
              (() => {
                const secIdx = currentSlide - 1;
                const section = lesson.sections[secIdx];
                return (
                  <div className="rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_4px_24px_rgba(139,92,246,0.1)] transition-all animate-[fadeSlideUp_0.3s_ease-out_forwards]">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-bold text-slate-100">{section.heading}</h3>
                      <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs text-purple-400 font-medium">
                        Slide {currentSlide} of {totalSlides}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                      {section.body}
                    </p>

                    {/* Ask Shiksha button on each section slide */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-purple-500/10 pt-4">
                      <button
                        onClick={() =>
                          openTutor(
                            `Please explain "${section.heading}" from "${lesson.title}" in more detail with another everyday example.`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 transition-all hover:bg-purple-500/20"
                      >
                        <MessageSquareCode className="h-3.5 w-3.5 text-purple-400" />
                        Ask Shiksha 🦉
                      </button>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={prevSlide}
                          className="rounded-full border-purple-500/20 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" /> Back
                        </Button>
                        <Button
                          size="sm"
                          onClick={nextSlide}
                          className="rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                        >
                          Next <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Slide N+1: Takeaways & Completion */}
            {currentSlide === totalSlides - 1 && (
              <div className="space-y-4 transition-all animate-[fadeSlideUp_0.3s_ease-out_forwards]">
                {/* Fun Fact Card */}
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 shadow-[0_4px_20px_rgba(245,158,11,0.08)]">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    💡 Fun fact
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{lesson.funFact}</p>
                </div>

                {/* Key Takeaways Card */}
                <div className="rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_4px_24px_rgba(139,92,246,0.1)]">
                  <h3 className="text-base font-bold text-slate-100">🎯 Key takeaways</h3>
                  <ul className="mt-3 space-y-2.5">
                    {lesson.keyTakeaways.map((k, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <span className="text-amber-400 font-bold">✓</span>
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <Button
                      variant="outline"
                      onClick={prevSlide}
                      className="rounded-full border-purple-500/20 bg-white/[0.04] text-slate-200"
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <Button
                      onClick={finish}
                      className={cn(
                        "rounded-full font-bold transition-all duration-300",
                        completed
                          ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 cursor-default"
                          : "bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]",
                      )}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      {completed ? "Lesson Completed! ✓" : "Complete Lesson (+20 XP)"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => load(true)}
                      className="rounded-full border-purple-500/20 bg-white/[0.04] text-slate-200"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> New lesson
                    </Button>
                  </div>

                  {completed && (
                    <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm font-medium text-emerald-400 animate-pulse">
                      ✨ Awesome work! +20 XP has been added to your profile. Try a quiz or game
                      next!
                    </div>
                  )}

                  <div className="mt-4 text-xs text-slate-400 border-t border-purple-500/10 pt-4">
                    Total XP: <strong className="text-amber-400">{getProgress().xp}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
