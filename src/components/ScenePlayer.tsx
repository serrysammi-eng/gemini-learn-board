import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/confetti";
import { pickVoice, useVoices } from "@/lib/voice";
import type { LessonScene, SceneStep } from "@/lib/animation.types";

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */
interface ScenePlayerProps {
  scene: LessonScene | null | undefined;
  /** Language pref from UserPrefs — controls TTS voice selection */
  lang?: "english" | "hindi" | "both";
  className?: string;
  /** Called when the interactive question is answered (pass/fail) */
  onComplete?: () => void;
}

type QuizState = "idle" | "showing" | "answered_correct" | "answered_wrong" | "retried";

/* ─────────────────────────────────────────────────────────────────
   ChalkText — fallback when svg_doodle is null/empty/broken
   Words fly in one-by-one with a chalk-style animation
───────────────────────────────────────────────────────────────── */
function ChalkText({ text }: { text: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <p
        className="text-center font-caveat text-4xl font-bold leading-snug text-slate-100"
        style={{ textShadow: "0 0 20px rgba(167,139,250,0.6)" }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            className="chalk-word inline-block opacity-0"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {w}&nbsp;
          </span>
        ))}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SVGCanvas — renders the svg_doodle with sequential stroke-dashoffset
   Each shape draws itself left-to-right in sequence
───────────────────────────────────────────────────────────────── */
function SVGCanvas({ svg, stepKey }: { svg: string; stepKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    setRenderError(false);
  }, [svg]);

  // Inject sequential stroke-dashoffset styles into the SVG DOM after mount
  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    // Small delay so DOM is painted
    const t = setTimeout(() => {
      try {
        const svgEl = container.querySelector("svg");
        if (!svgEl) return;
        // Target all drawable elements
        const drawables = svgEl.querySelectorAll(
          "path, line, polyline, polygon, rect, circle, ellipse",
        );
        drawables.forEach((el, idx) => {
          const elem = el as SVGGeometryElement;
          let len = 400;
          try {
            len = elem.getTotalLength?.() ?? 400;
          } catch {
            // getTotalLength not available on all elements
          }
          const delay = idx * 0.45; // stagger each shape
          const dur = 0.9;
          (el as unknown as HTMLElement).style.cssText += `
            stroke-dasharray: ${len};
            stroke-dashoffset: ${len};
            animation: svg-draw ${dur}s ease-out ${delay}s forwards;
          `;
        });
        // Fade in text elements after shapes
        const texts = svgEl.querySelectorAll("text");
        const shapesDelay = drawables.length * 0.45 + 0.2;
        texts.forEach((el, idx) => {
          (el as unknown as HTMLElement).style.cssText += `
            opacity: 0;
            animation: svg-fade ${0.4}s ease-out ${shapesDelay + idx * 0.2}s forwards;
          `;
        });
      } catch (err) {
        console.warn("SVGCanvas animation error:", err);
        setRenderError(true);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [svg, stepKey]);

  if (renderError) return null; // parent falls back to ChalkText

  return (
    <div
      ref={ref}
      key={stepKey}
      className="flex h-full w-full items-center justify-center p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={
        {
          // Ensure SVG fills the canvas nicely
        }
      }
      onError={() => setRenderError(true)}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────
   WordHighlight — on_screen_text displayed word-by-word synced to voice
───────────────────────────────────────────────────────────────── */
function WordHighlight({ text, revealedCount }: { text: string; revealedCount: number }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  return (
    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 px-3 py-2">
      {words.map((w, i) => (
        <span
          key={i}
          className={cn(
            "font-caveat text-2xl font-bold transition-all duration-150",
            i < revealedCount
              ? "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
              : "text-slate-600",
          )}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   InteractiveQuiz — shown after last step
───────────────────────────────────────────────────────────────── */
function InteractiveQuiz({
  question,
  choices,
  answerIndex,
  hint,
  onDone,
}: {
  question: string;
  choices: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
  hint: string;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [retried, setRetried] = useState(false);

  const isCorrect = picked === answerIndex;

  const choose = (i: number) => {
    if (picked !== null && !retried) return;
    setPicked(i);
    if (i === answerIndex) {
      celebrate();
      setTimeout(onDone, 1800);
    } else {
      setShowHint(true);
      if (retried) {
        // Second wrong — auto-advance after showing correct answer
        setTimeout(onDone, 2200);
      }
    }
  };

  const retry = () => {
    setPicked(null);
    setShowHint(false);
    setRetried(true);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-5 py-4 animate-[fadeSlideUp_0.4s_ease-out_forwards]">
      <div className="text-xs font-bold uppercase tracking-wider text-purple-400">
        Quick check ✦
      </div>
      <p className="text-center text-base font-semibold text-slate-100 leading-snug">{question}</p>
      <div className="grid w-full grid-cols-2 gap-2">
        {choices.map((c, i) => {
          const wasChosen = picked === i;
          const isAns = i === answerIndex;
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={picked !== null && !retried}
              className={cn(
                "rounded-2xl border p-2.5 text-left text-sm font-medium transition-all duration-300",
                picked === null || retried
                  ? "border-purple-500/20 bg-white/[0.04] text-slate-200 hover:border-purple-400/50 hover:bg-white/[0.08]"
                  : wasChosen && isCorrect
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                    : wasChosen && !isCorrect
                      ? "border-red-500/60 bg-red-500/10 text-red-400"
                      : isAns && picked !== null
                        ? "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-300"
                        : "border-white/5 bg-white/[0.01] text-slate-500 opacity-50",
              )}
            >
              <span className="mr-1.5 font-bold">{String.fromCharCode(65 + i)}.</span>
              {c}
            </button>
          );
        })}
      </div>

      {showHint && !isCorrect && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-2 text-sm text-amber-300 text-center animate-[fadeSlideUp_0.3s_ease-out]">
          💡 {hint}
        </div>
      )}

      {picked !== null && !isCorrect && !retried && (
        <button
          onClick={retry}
          className="rounded-full border border-purple-500/20 bg-white/[0.04] px-4 py-1.5 text-sm font-medium text-purple-300 transition-all hover:bg-white/[0.08]"
        >
          Try again
        </button>
      )}

      {isCorrect && (
        <div className="text-center text-sm font-semibold text-emerald-400 animate-pulse">
          ✅ Correct! Well done!
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main ScenePlayer
───────────────────────────────────────────────────────────────── */
export function ScenePlayer({ scene, lang = "english", className, onComplete }: ScenePlayerProps) {
  const voices = useVoices();
  const [stepIdx, setStepIdx] = useState(0);
  const [revealedWords, setRevealedWords] = useState(0);
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [playKey, setPlayKey] = useState(0); // bumped to replay
  const [voiceDone, setVoiceDone] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const voiceLang: "en" | "hi" = lang === "hindi" || lang === "both" ? "hi" : "en";

  const steps: SceneStep[] = useMemo(() => scene?.steps ?? [], [scene]);

  const currentStep = steps[stepIdx] ?? null;
  const isLastStep = stepIdx === steps.length - 1;

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fallbackRef.current) clearInterval(fallbackRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const advanceStep = useCallback(() => {
    if (isLastStep) {
      setQuizState("showing");
    } else {
      setStepIdx((s) => s + 1);
      setRevealedWords(0);
    }
  }, [isLastStep]);

  // Run TTS + word reveal + auto-advance for current step
  useEffect(() => {
    if (!currentStep || quizState === "showing") return;

    clearTimers();
    setRevealedWords(0);
    setVoiceDone(false);

    const script = currentStep.voiceover_script;
    const scriptWords = script.split(/\s+/).filter(Boolean);
    const stepDurationMs = Math.max(currentStep.duration * 1000, 2500);

    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) {
      // Muted — set timer to enable Next button (no auto-advance!)
      timerRef.current = setTimeout(() => {
        setVoiceDone(true);
      }, stepDurationMs);
      setRevealedWords(scriptWords.length);
      return;
    }

    const u = new SpeechSynthesisUtterance(script);
    const v = pickVoice(voices, voiceLang);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = voiceLang === "hi" ? "hi-IN" : "en-US";
    u.rate = 0.88;
    u.pitch = 1.05;
    u.volume = 1;
    utterRef.current = u;

    // Word-boundary reveal
    let boundaryFired = false;

    // Build char index → word index map
    const wordStarts: number[] = [];
    {
      let cursor = 0;
      for (const w of scriptWords) {
        const idx = script.indexOf(w, cursor);
        wordStarts.push(idx);
        cursor = idx + w.length;
      }
    }

    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name && e.name !== "word") return;
      boundaryFired = true;
      const ci = e.charIndex ?? 0;
      let n = 0;
      for (let k = 0; k < wordStarts.length; k++) {
        if (wordStarts[k] <= ci) n = k + 1;
        else break;
      }
      setRevealedWords((prev) => Math.max(prev, n));
    };

    u.onend = () => {
      if (fallbackRef.current) clearInterval(fallbackRef.current);
      setRevealedWords(scriptWords.length);
      // Wait remaining duration then set voiceDone to true
      const remaining = Math.max(200, stepDurationMs - scriptWords.length * 300);
      timerRef.current = setTimeout(() => {
        setVoiceDone(true);
      }, remaining);
    };
    u.onerror = () => {
      setRevealedWords(scriptWords.length);
      // On onerror, set voiceDone = true silently — do not show any error UI,
      // just enable the Next button so the student is never blocked.
      setVoiceDone(true);
    };

    // Fallback timer if onboundary never fires
    const startFallback = setTimeout(() => {
      if (!boundaryFired) {
        const totalMs = Math.max(2000, scriptWords.length * 290);
        const t0 = Date.now();
        fallbackRef.current = setInterval(() => {
          const elapsed = Date.now() - t0;
          const expected = Math.min(
            scriptWords.length,
            Math.floor((elapsed / totalMs) * scriptWords.length),
          );
          setRevealedWords((prev) => Math.max(prev, expected));
          if (elapsed >= totalMs) {
            if (fallbackRef.current) clearInterval(fallbackRef.current);
          }
        }, 180);
      }
    }, 1200);

    const speak = setTimeout(() => {
      try {
        window.speechSynthesis.speak(u);
      } catch {
        /* noop */
      }
    }, 80);

    return () => {
      clearTimeout(startFallback);
      clearTimeout(speak);
      clearTimers();
      setVoiceDone(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, playKey, voiceOn, voices.length, voiceLang]);

  const replay = () => {
    clearTimers();
    setStepIdx(0);
    setRevealedWords(0);
    setQuizState("idle");
    setVoiceDone(false);
    setPlayKey((k) => k + 1);
  };

  /* ── on_screen_text word reveal (synced to voice reveal count) ── */
  const screenWords = useMemo(
    () => (currentStep?.on_screen_text ?? "").split(/\s+/).filter(Boolean),
    [currentStep],
  );
  // Map voice word ratio → screen word ratio for alignment
  const scriptWordCount = useMemo(
    () => (currentStep?.voiceover_script ?? "").split(/\s+/).filter(Boolean).length,
    [currentStep],
  );

  if (!scene || steps.length === 0) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-purple-500/15 bg-[#060d1a]",
          className,
        )}
      >
        <div className="flex h-52 items-center justify-center text-sm text-slate-500">
          Scene not available
        </div>
      </div>
    );
  }

  const hasSvg = !!(currentStep?.svg_doodle && currentStep.svg_doodle.trim().length > 10);
  const screenRevealed =
    scriptWordCount > 0
      ? Math.ceil((revealedWords / scriptWordCount) * screenWords.length)
      : screenWords.length;

  return (
    <>
      {/* Inject keyframe animations as a global style once */}
      <style>{`
        @keyframes svg-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes svg-fade {
          to { opacity: 1; }
        }
        @keyframes chalk-fly {
          0%   { opacity: 0; transform: translateY(14px) scale(0.85); filter: blur(3px); }
          60%  { opacity: 1; transform: translateY(-2px) scale(1.04); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chalk-word {
          animation: chalk-fly 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-purple-500/15 bg-[#060d1a]",
          className,
        )}
      >
        {/* ── Progress dots ── */}
        {quizState === "idle" && (
          <div className="absolute left-0 right-0 top-2 z-10 flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === stepIdx
                    ? "w-5 bg-gradient-to-r from-purple-400 to-purple-300 shadow-[0_0_6px_rgba(168,85,247,0.6)]"
                    : i < stepIdx
                      ? "w-1.5 bg-purple-500/60"
                      : "w-1.5 bg-white/10",
                )}
              />
            ))}
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/30" title="Quiz" />
          </div>
        )}

        {/* ── Main canvas area ── */}
        <div className="relative" style={{ aspectRatio: "16 / 7" }}>
          {quizState === "showing" ? (
            <InteractiveQuiz
              question={scene.interactive_question.question}
              choices={scene.interactive_question.choices}
              answerIndex={scene.interactive_question.answerIndex}
              hint={scene.interactive_question.hint}
              onDone={() => {
                setQuizState("idle");
                onComplete?.();
              }}
            />
          ) : currentStep ? (
            <div
              key={`${stepIdx}-${playKey}`}
              className="flex h-full w-full animate-[fadeSlideUp_0.3s_ease-out_forwards]"
            >
              {/* SVG Canvas (left 60%) */}
              <div className="relative h-full" style={{ width: "60%" }}>
                <div
                  className="absolute inset-0 rounded-tl-2xl"
                  style={{
                    background:
                      "radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.07), transparent 65%)",
                  }}
                />
                {hasSvg ? (
                  <SVGCanvas svg={currentStep.svg_doodle!} stepKey={`${stepIdx}-${playKey}`} />
                ) : (
                  <ChalkText text={currentStep.on_screen_text} />
                )}
              </div>

              {/* Right panel (40%) — word highlight + voice */}
              <div
                className="flex h-full flex-col items-center justify-center border-l border-purple-500/10 px-4 py-3"
                style={{ width: "40%" }}
              >
                {/* Analogy label on first step */}
                {stepIdx === 0 && (
                  <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-purple-400/70">
                    {scene.analogy_context}
                  </div>
                )}

                <WordHighlight text={currentStep.on_screen_text} revealedCount={screenRevealed} />

                {/* Speaking indicator */}
                <div className="mt-auto flex items-center gap-1 pt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-gradient-to-t from-purple-500 to-amber-400 transition-all"
                      style={{
                        height: revealedWords > 0 ? `${6 + ((i * 5) % 14)}px` : "3px",
                        opacity: revealedWords > 0 ? 1 : 0.3,
                        animation:
                          revealedWords > 0
                            ? `viz-bar 0.${5 + (i % 3)}s ease-in-out ${i * 80}ms infinite alternate`
                            : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Controls bar ── */}
        <div className="flex items-center justify-between border-t border-purple-500/10 px-3 py-1.5">
          <div className="text-[10px] text-slate-500">
            {quizState === "showing" ? "Quick check" : `Step ${stepIdx + 1} / ${steps.length}`}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVoiceOn((v) => !v)}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-purple-400"
              title={voiceOn ? "Mute voice" : "Unmute voice"}
            >
              {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={replay}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-purple-400"
              title="Replay scene"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {quizState === "idle" && (
              <button
                disabled={!voiceDone}
                onClick={advanceStep}
                className={cn(
                  "ml-2 rounded-full px-3 py-1 text-xs font-bold text-white transition-all duration-300",
                  voiceDone
                    ? "bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_15px_rgba(139,92,246,0.55)] hover:scale-105 active:scale-95 cursor-pointer"
                    : "bg-purple-900/40 text-purple-300/60 border border-purple-500/10 opacity-50 cursor-not-allowed",
                  voiceDone && "animate-purple-pulse",
                )}
              >
                {isLastStep ? "Finish ✓" : "Next →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
