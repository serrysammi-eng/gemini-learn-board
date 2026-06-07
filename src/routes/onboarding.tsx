import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import mascot from "@/assets/mascot.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setPrefs } from "@/lib/storage";
import {
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  SUBJECT_LABELS,
  type Language,
  type Level,
  type Subject,
} from "@/lib/types";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Welcome to StudyMate AI" }],
  }),
  component: Onboarding,
});

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const TOPICS_BY_SUBJECT: Record<Subject, string[]> = {
  math: ["Algebra", "Geometry", "Fractions", "Trigonometry", "Calculus", "Statistics"],
  science: ["Physics basics", "Energy", "Forces", "Space & Planets", "Light & Sound"],
  chemistry: ["Atoms & Molecules", "Periodic Table", "Acids & Bases", "Chemical Reactions"],
  biology: ["Cells", "Human Body", "Plants", "Genetics", "Ecosystems"],
  technology: [
    "Python basics",
    "Web Development",
    "AI & ML",
    "How Computers Work",
    "Cybersecurity",
  ],
};

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("english");
  const [subject, setSubject] = useState<Subject>("math");
  const [level, setLevel] = useState<Level>("high_school");
  const [topic, setTopic] = useState("");

  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => setStep(1), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  const next = () => setStep((s) => (s + 1) as Step);
  const back = () => setStep((s) => Math.max(1, s - 1) as Step);

  const finish = (chosenTopic: string) => {
    setPrefs({
      name: name.trim() || "friend",
      language,
      subject,
      level,
      topic: chosenTopic,
      onboardedAt: Date.now(),
    });
    navigate({ to: "/learn", replace: true });
  };

  const progress = Math.max(0, ((step - 1) / 5) * 100);

  return (
    <div className="min-h-screen bg-[#060d1a] text-slate-100">
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_20%_20%,rgba(139,92,246,0.12),transparent_60%),radial-gradient(ellipse_at_80%_80%,rgba(245,158,11,0.06),transparent_50%)]">
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
          {step > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Step {step} of 5</span>
                <button
                  onClick={back}
                  className="text-purple-400 underline transition-all duration-300 hover:text-purple-300"
                >
                  Back
                </button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-1 flex-col justify-center">
            {step === 0 && (
              <div className="text-center animate-pop">
                <img
                  src={mascot}
                  alt="StudyMate mascot"
                  width={200}
                  height={200}
                  className="mx-auto h-40 w-40 animate-float drop-shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                />
                <h1 className="mt-6 text-4xl font-bold text-slate-100 bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
                  StudyMate AI
                </h1>
                <p className="mt-2 text-lg text-slate-400">Learn anything, your way ✨</p>
              </div>
            )}

            {step === 1 && (
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-100">What's your name? 👋</h2>
                <p className="mt-1 text-slate-400">So I can make this personal.</p>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav"
                  className="mt-6 h-14 rounded-2xl border border-purple-500/20 bg-white/[0.04] text-lg text-slate-100 placeholder:text-slate-500 focus:border-purple-500/40"
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && next()}
                />
                <Button
                  disabled={!name.trim()}
                  onClick={next}
                  className="mt-6 h-12 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-base font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] disabled:opacity-50 transition-all duration-300"
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-100">Pick your language 🌐</h2>
                <p className="mt-1 text-slate-400">I'll teach you in this language.</p>
                <div className="mt-6 space-y-3">
                  {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l, i) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={cn(
                        "opacity-0 animate-[fadeSlideUp_0.4s_ease-out_forwards] w-full rounded-2xl border-2 p-4 text-left text-lg font-medium transition-all duration-300",
                        language === l
                          ? "border-purple-400 bg-purple-500/15 text-white shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                          : "border-purple-500/15 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]",
                      )}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {LANGUAGE_LABELS[l]}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={next}
                  className="mt-6 h-12 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-base font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] transition-all duration-300"
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-100">What do you want to learn? 🎓</h2>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {(Object.keys(SUBJECT_LABELS) as Subject[]).map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setSubject(s)}
                      className={cn(
                        "opacity-0 animate-[fadeSlideUp_0.4s_ease-out_forwards] rounded-2xl border-2 p-5 text-center text-base font-semibold transition-all duration-300",
                        subject === s
                          ? "border-purple-400 bg-purple-500/15 text-white shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                          : "border-purple-500/15 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]",
                      )}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {SUBJECT_LABELS[s]}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={next}
                  className="mt-6 h-12 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-base font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] transition-all duration-300"
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-100">Your level 📚</h2>
                <div className="mt-6 space-y-3">
                  {(Object.keys(LEVEL_LABELS) as Level[]).map((l, i) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={cn(
                        "opacity-0 animate-[fadeSlideUp_0.4s_ease-out_forwards] w-full rounded-2xl border-2 p-4 text-left text-lg font-medium transition-all duration-300",
                        level === l
                          ? "border-purple-400 bg-purple-500/15 text-white shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                          : "border-purple-500/15 bg-white/[0.03] text-slate-200 hover:border-purple-400/40 hover:bg-white/[0.06]",
                      )}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {LEVEL_LABELS[l]}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={next}
                  className="mt-6 h-12 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-base font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] transition-all duration-300"
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 5 && (
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-100">Pick a topic 🎯</h2>
                <p className="mt-1 text-slate-400">Or learn the whole subject.</p>
                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => finish("Everything")}
                    className="w-full rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-4 text-left text-lg font-bold text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-all duration-300 hover:bg-amber-500/15 hover:shadow-[0_0_25px_rgba(245,158,11,0.3)]"
                  >
                    🌟 Learn Everything
                  </button>
                  <div className="my-2 text-center text-xs text-slate-500">— or pick one —</div>
                  {TOPICS_BY_SUBJECT[subject].map((t, i) => (
                    <button
                      key={t}
                      onClick={() => {
                        setTopic(t);
                        finish(t);
                      }}
                      className="opacity-0 animate-[fadeSlideUp_0.4s_ease-out_forwards] w-full rounded-2xl border-2 border-purple-500/15 bg-white/[0.03] p-4 text-left text-lg font-medium text-slate-200 transition-all duration-300 hover:border-purple-400/40 hover:bg-white/[0.06]"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {t}
                    </button>
                  ))}
                  <div className="pt-2">
                    <Input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Or type your own topic…"
                      className="h-14 rounded-2xl border border-purple-500/20 bg-white/[0.04] text-lg text-slate-100 placeholder:text-slate-500 focus:border-purple-500/40"
                    />
                    <Button
                      disabled={!topic.trim()}
                      onClick={() => finish(topic.trim())}
                      className="mt-3 h-12 w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-base font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] disabled:opacity-50 transition-all duration-300"
                    >
                      Start learning →
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
