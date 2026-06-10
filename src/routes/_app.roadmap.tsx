import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Map as MapIcon,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  doodleCache,
  doodleKey,
  fetchDoodleImage,
  instantDoodle,
} from "@/lib/doodle-cache";
import { ensureRoadmap, type Roadmap, type RoadmapChapter } from "@/lib/roadmap";
import { getPrefs } from "@/lib/storage";

export const Route = createFileRoute("/_app/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — StudyMate AI" },
      {
        name: "description",
        content:
          "A step-by-step learning roadmap built for your chosen topic. Pre-rendered visuals, voice narration, walk through each chapter at your own pace.",
      },
    ],
  }),
  component: RoadmapPage,
});

interface ChapterContent {
  title: string;
  intro: string;
  steps: string[];
  example: string;
}

function parseChapterContent(text: string): ChapterContent | null {
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

function pickVoice(lang: "english" | "hindi" | "both") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return undefined;
  const wantLang = lang === "hindi" ? "hi" : "en";
  const sameLang = all.filter((v) => v.lang.toLowerCase().startsWith(wantLang));
  const pool = sameLang.length ? sameLang : all;
  return [...pool].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      let s = 0;
      if (n.includes("google")) s += 100;
      else if (n.includes("microsoft")) s += 80;
      if (n.includes("natural") || n.includes("neural")) s += 50;
      return s;
    };
    return score(b) - score(a);
  })[0];
}

function RoadmapPage() {
  const navigate = useNavigate();
  const prefs = getPrefs();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!prefs) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    ensureRoadmap(prefs)
      .then((r) => {
        setRoadmap(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || "Could not load roadmap.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load completion state
  useEffect(() => {
    try {
      const raw = localStorage.getItem("studymate.roadmap.done");
      if (raw) setCompleted(new Set(JSON.parse(raw)));
    } catch {
      /* noop */
    }
  }, []);

  const markDone = useCallback((id: string) => {
    setCompleted((cur) => {
      const next = new Set(cur);
      next.add(id);
      try {
        localStorage.setItem("studymate.roadmap.done", JSON.stringify([...next]));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const chapters = roadmap?.chapters ?? [];
  const active = chapters[activeIdx];

  const goNext = useCallback(() => {
    if (!active) return;
    markDone(active.id);
    if (activeIdx < chapters.length - 1) setActiveIdx(activeIdx + 1);
  }, [active, activeIdx, chapters.length, markDone]);

  const goPrev = useCallback(() => {
    if (activeIdx > 0) setActiveIdx(activeIdx - 1);
  }, [activeIdx]);

  if (!prefs) return null;

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <div className="hand text-2xl text-purple-200">Building your roadmap…</div>
        <p className="text-xs text-slate-500">
          Designing 20 chapters on{" "}
          <span className="text-purple-300">{prefs.topic || prefs.subject}</span>
        </p>
      </div>
    );
  }

  if (error || !roadmap) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-300">
        <div className="text-lg text-red-300">{error || "No roadmap"}</div>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Hero header */}
      <div className="rounded-3xl border border-purple-500/15 bg-gradient-to-br from-purple-500/[0.08] to-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
          <MapIcon className="h-3.5 w-3.5" /> Your roadmap
        </div>
        <h1 className="hand mt-1 text-3xl text-slate-100 sm:text-4xl">
          {prefs.topic === "everything" || !prefs.topic ? prefs.subject : prefs.topic}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {chapters.length} chapters · {completed.size} completed
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-400 transition-all"
            style={{ width: `${(completed.size / Math.max(1, chapters.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Active chapter card with top visual + step content */}
      {active && (
        <ChapterCard
          key={active.id}
          chapter={active}
          chapterIndex={activeIdx}
          total={chapters.length}
          topic={prefs.topic}
          language={prefs.language}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onPrev={activeIdx > 0 ? goPrev : undefined}
          onNext={goNext}
        />
      )}

      {/* Chapter list */}
      <div className="rounded-3xl border border-purple-500/15 bg-white/[0.02] p-3">
        <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-purple-400">
          All chapters
        </div>
        <div className="grid gap-1.5">
          {chapters.map((c, i) => {
            const isActive = i === activeIdx;
            const isDone = completed.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-purple-400/40 bg-purple-500/[0.10] shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                    : "border-white/[0.04] bg-white/[0.02] hover:border-purple-500/20 hover:bg-white/[0.04]",
                )}
              >
                <div
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    isDone
                      ? "bg-emerald-500/20 text-emerald-300"
                      : isActive
                        ? "bg-purple-500/30 text-purple-100"
                        : "bg-white/[0.05] text-slate-400",
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate text-sm font-semibold",
                      isActive ? "text-slate-100" : "text-slate-300",
                    )}
                  >
                    {c.title}
                  </div>
                  {c.summary && (
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                      {c.summary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Chapter card ──────────────── */
function ChapterCard({
  chapter,
  chapterIndex,
  total,
  topic,
  language,
  level,
  muted,
  onToggleMute,
  onPrev,
  onNext,
}: {
  chapter: RoadmapChapter;
  chapterIndex: number;
  total: number;
  topic?: string;
  language: "english" | "hindi" | "both";
  level?: string;
  muted: boolean;
  onToggleMute: () => void;
  onPrev?: () => void;
  onNext: () => void;
}) {
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const cacheKey = `studymate.chapter.v1:${chapter.id}:${language}:${level || "default"}`;
    // Instant load from cache if available
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ChapterContent;
        setContent(parsed);
        setLoading(false);
        return () => ctrl.abort();
      }
    } catch {
      /* noop */
    }
    setContent(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/roadmap-chapter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            title: chapter.title,
            summary: chapter.summary,
            topic,
            language,
            level,
          }),
        });
        if (!res.ok || !res.body) throw new Error("chapter failed");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
        }
        if (ctrl.signal.aborted) return;
        const parsed = parseChapterContent(buf);
        setContent(parsed);
        if (parsed) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(parsed));
          } catch {
            /* quota */
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error(e);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [chapter.id, chapter.title, chapter.summary, topic, language, level]);

  return (
    <div className="overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-b from-[#0a1628] to-[#060d1a] shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      {/* Visual on top — pre-cached AI image, Pollinations fallback for instant load */}
      <ChapterVisual line={chapter.title} topic={topic} />

      <div className="p-5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
          <Sparkles className="h-3 w-3" /> Chapter {chapterIndex + 1} / {total}
        </div>
        <h2
          className="hand mt-1 text-3xl text-amber-400"
          style={{ textShadow: "0 0 10px rgba(245,158,11,0.4)" }}
        >
          {chapter.title}
        </h2>
        {chapter.summary && (
          <p className="mt-1 text-sm text-slate-400">{chapter.summary}</p>
        )}

        <div className="mt-4 min-h-[180px]">
          {loading || !content ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Writing your chapter…
            </div>
          ) : (
            <ChapterBody content={content} muted={muted} language={language} />
          )}
        </div>

        {/* Nav controls */}
        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMute}
            className="text-slate-300 hover:bg-white/5"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!onPrev}
              onClick={onPrev}
              className="border-purple-500/30 bg-white/[0.04] text-slate-200 hover:bg-white/10"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </Button>
            <Button
              size="sm"
              onClick={onNext}
              className="bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:opacity-95"
            >
              {chapterIndex === total - 1 ? "Finish" : "Next"}{" "}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Visual (top box) ──────────────── */
function ChapterVisual({ line, topic }: { line: string; topic?: string }) {
  // Step 1: Pollinations URL = INSTANT preview (no wait)
  const fallback = useMemo(() => instantDoodle(line, topic), [line, topic]);

  // Step 2: Lovable AI image (better quality, cached) replaces it when ready
  const cached = doodleCache.get(doodleKey(line));
  const [aiSrc, setAiSrc] = useState<string | null>(cached || null);

  useEffect(() => {
    if (cached) {
      setAiSrc(cached);
      return;
    }
    const ctrl = new AbortController();
    fetchDoodleImage(line, topic, ctrl.signal)
      .then((url) => {
        if (!ctrl.signal.aborted && url) setAiSrc(url);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, topic]);

  const finalSrc = aiSrc || fallback;
  return (
    <div className="relative h-48 w-full overflow-hidden bg-[#060d1a] sm:h-56">
      <img
        src={finalSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
        style={{ mixBlendMode: "screen", opacity: 0.95 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a1628] to-transparent" />
    </div>
  );
}

/* ──────────────── Body + voice ──────────────── */
function ChapterBody({
  content,
  muted,
  language,
}: {
  content: ChapterContent;
  muted: boolean;
  language: "english" | "hindi" | "both";
}) {
  // Speak intro + steps + example, with the Chrome 15s pause keep-alive hack.
  useEffect(() => {
    if (muted) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const text = [content.intro, ...content.steps, content.example]
      .filter(Boolean)
      .join(". ");
    if (!text) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(language);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = language === "hindi" ? "hi-IN" : "en-US";
    u.rate = 0.95;
    u.pitch = 1.0;

    // Chrome bug: speechSynthesis silently pauses after ~15s.
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    u.onstart = () => {
      keepAlive = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 8000);
    };
    const cleanup = () => {
      if (keepAlive) clearInterval(keepAlive);
      keepAlive = null;
    };
    u.onend = cleanup;
    u.onerror = cleanup;

    const t = setTimeout(() => {
      try {
        window.speechSynthesis.speak(u);
      } catch {
        /* noop */
      }
    }, 100);

    return () => {
      clearTimeout(t);
      cleanup();
      window.speechSynthesis.cancel();
    };
  }, [content, muted, language]);

  return (
    <div className="space-y-4 text-slate-200">
      {content.intro && (
        <p className="text-base leading-relaxed text-slate-200">{content.intro}</p>
      )}
      {content.steps.length > 0 && (
        <ol className="space-y-2.5">
          {content.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-200">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-slate-200">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {content.example && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Real-life example
          </div>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/90">
            {content.example}
          </p>
        </div>
      )}
    </div>
  );
}
