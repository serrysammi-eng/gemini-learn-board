import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Lock,
  Map as MapIcon,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchWikimediaImage,
  getCachedWikimedia,
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
          "Snake-and-ladder learning map. Walk chapter by chapter with pre-rendered visuals and voice narration.",
      },
    ],
  }),
  component: RoadmapPage,
});

/* ─────────── Chapter content parser (same shape as before) ─────────── */
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

/* ─────────── Page ─────────── */
function RoadmapPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const prefs = mounted ? getPrefs() : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const p = getPrefs();
    if (!p) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    ensureRoadmap(p)
      .then((r) => {
        setRoadmap(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || "Could not load roadmap.");
        setLoading(false);
      });
  }, [mounted, navigate]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem("studymate.roadmap.done");
      if (raw) setCompleted(new Set(JSON.parse(raw)));
    } catch {
      /* noop */
    }
  }, [mounted]);

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

  if (!mounted) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <div className="hand text-2xl text-purple-200">Building your roadmap…</div>
        <p className="text-xs text-slate-500">
          Designing 20 chapters on{" "}
          <span className="text-purple-300">{prefs?.topic || prefs?.subject}</span>
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
      {/* Hero */}
      <div className="rounded-3xl border border-purple-500/15 bg-gradient-to-br from-purple-500/[0.08] to-amber-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
          <MapIcon className="h-3.5 w-3.5" /> Your learning map
        </div>
        <h1 className="hand mt-1 text-3xl text-slate-100 sm:text-4xl">
          {prefs?.topic === "everything" || !prefs?.topic ? prefs?.subject : prefs?.topic}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {chapters.length} chapters · {completed.size} completed · tap a tile to start
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-400 transition-all"
            style={{ width: `${(completed.size / Math.max(1, chapters.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Snake & Ladder map */}
      <SnakeLadderMap
        chapters={chapters}
        completed={completed}
        onPick={(i) => setActiveIdx(i)}
        topic={prefs?.topic}
      />

      {/* Modal for active chapter */}
      {activeIdx !== null && chapters[activeIdx] && (
        <ChapterModal
          key={chapters[activeIdx].id}
          chapter={chapters[activeIdx]}
          chapterIndex={activeIdx}
          total={chapters.length}
          topic={prefs?.topic}
          language={prefs?.language ?? "english"}
          level={prefs?.level}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onPrev={activeIdx > 0 ? () => setActiveIdx(activeIdx - 1) : undefined}
          onNext={() => {
            const c = chapters[activeIdx];
            markDone(c.id);
            if (activeIdx < chapters.length - 1) setActiveIdx(activeIdx + 1);
            else setActiveIdx(null);
          }}
          onClose={() => {
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
              window.speechSynthesis.cancel();
            }
            setActiveIdx(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════ Snake & Ladder Map ═══════════ */
function SnakeLadderMap({
  chapters,
  completed,
  onPick,
  topic,
}: {
  chapters: RoadmapChapter[];
  completed: Set<string>;
  onPick: (i: number) => void;
  topic?: string;
}) {
  const perRow = 4;
  const rows = useMemo(() => {
    const out: { chapter: RoadmapChapter; idx: number }[][] = [];
    for (let i = 0; i < chapters.length; i += perRow) {
      const row = chapters.slice(i, i + perRow).map((c, j) => ({ chapter: c, idx: i + j }));
      // serpentine: reverse every other row
      if ((i / perRow) % 2 === 1) row.reverse();
      out.push(row);
    }
    return out;
  }, [chapters]);

  // Next chapter to play = first not-completed
  const nextIdx = chapters.findIndex((c) => !completed.has(c.id));

  return (
    <div className="relative rounded-3xl border border-purple-500/15 bg-gradient-to-b from-[#0a1628] via-[#080f1f] to-[#060d1a] p-3 shadow-[inset_0_0_40px_rgba(139,92,246,0.06)]">
      {/* faint grid */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative space-y-3">
        {rows.map((row, ri) => (
          <div key={ri} className="relative flex items-stretch justify-between gap-2">
            {row.map(({ chapter, idx }, ci) => {
              const isDone = completed.has(chapter.id);
              const isNext = idx === nextIdx;
              const isLocked = nextIdx >= 0 && idx > nextIdx;
              // Connector arrow between tiles in this row
              const showRightConnector = ci < row.length - 1;
              return (
                <div key={chapter.id} className="relative flex flex-1 items-center min-w-0">
                  <SnakeTile
                    chapter={chapter}
                    idx={idx}
                    isDone={isDone}
                    isNext={isNext}
                    isLocked={isLocked}
                    topic={topic}
                    onClick={() => onPick(idx)}
                  />
                  {showRightConnector && (
                    <div className="mx-1 hidden h-0.5 w-3 shrink-0 bg-gradient-to-r from-purple-500/40 to-purple-500/10 sm:block" />
                  )}
                </div>
              );
            })}
            {/* Curved drop connector to next row */}
            {ri < rows.length - 1 && (
              <div
                className={cn(
                  "pointer-events-none absolute -bottom-3 h-3 w-12 border-purple-500/30",
                  ri % 2 === 0
                    ? "right-3 rounded-br-3xl border-b-2 border-r-2"
                    : "left-3 rounded-bl-3xl border-b-2 border-l-2",
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnakeTile({
  chapter,
  idx,
  isDone,
  isNext,
  isLocked,
  topic,
  onClick,
}: {
  chapter: RoadmapChapter;
  idx: number;
  isDone: boolean;
  isNext: boolean;
  isLocked: boolean;
  topic?: string;
  onClick: () => void;
}) {
  // Use Pollinations for instant preview; Lovable AI quietly upgrades when ready.
  const fallback = useMemo(() => instantDoodle(chapter.title, topic), [chapter.title, topic]);
  const cached = doodleCache.get(doodleKey(chapter.title));
  const [aiSrc, setAiSrc] = useState<string | null>(cached || null);
  useEffect(() => {
    if (cached) {
      setAiSrc(cached);
      return;
    }
    const ctrl = new AbortController();
    fetchDoodleImage(chapter.title, topic, ctrl.signal)
      .then((u) => {
        if (!ctrl.signal.aborted && u) setAiSrc(u);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.title, topic]);
  const finalSrc = aiSrc || fallback;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex aspect-square min-w-0 flex-1 flex-col items-stretch justify-end overflow-hidden rounded-2xl border text-left transition-all",
        isDone &&
          "border-emerald-400/40 bg-emerald-500/[0.06] shadow-[0_0_15px_rgba(16,185,129,0.18)]",
        isNext &&
          "border-amber-400/60 bg-amber-500/[0.08] shadow-[0_0_24px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/40",
        !isDone && !isNext && !isLocked && "border-purple-500/20 bg-white/[0.04] hover:border-purple-400/50",
        isLocked && "border-white/[0.06] bg-white/[0.02] opacity-60",
      )}
      style={{ minHeight: 96 }}
    >
      {/* Background image */}
      <img
        src={finalSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity group-hover:opacity-70"
        style={{ mixBlendMode: "screen" }}
        loading="lazy"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* Number badge top-left */}
      <div
        className={cn(
          "absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold",
          isDone
            ? "bg-emerald-500 text-white"
            : isNext
              ? "bg-amber-400 text-black"
              : isLocked
                ? "bg-white/10 text-slate-400"
                : "bg-purple-500/80 text-white",
        )}
      >
        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : isLocked ? <Lock className="h-3 w-3" /> : idx + 1}
      </div>

      {isNext && (
        <div className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black animate-pulse">
          Start
        </div>
      )}

      {/* Full title — no clipping */}
      <div className="relative z-10 p-2">
        <div className="text-[11px] font-semibold leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {chapter.title}
        </div>
      </div>
    </button>
  );
}

/* ═══════════ Chapter Modal ═══════════ */
function ChapterModal({
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
  onClose,
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
  onClose: () => void;
}) {
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const cacheKey = `studymate.chapter.v1:${chapter.id}:${language}:${level || "default"}`;
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
          body: JSON.stringify({ title: chapter.title, summary: chapter.summary, topic, language, level }),
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center">
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-purple-500/20 bg-gradient-to-b from-[#0a1628] to-[#060d1a] shadow-[0_-10px_60px_rgba(139,92,246,0.4)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-slate-300 backdrop-blur hover:bg-black/80 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <ChapterVisual line={chapter.title} topic={topic} />

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
            <Sparkles className="h-3 w-3" /> Chapter {chapterIndex + 1} / {total}
          </div>
          <h2
            className="hand mt-1 text-3xl text-amber-400"
            style={{ textShadow: "0 0 10px rgba(245,158,11,0.4)" }}
          >
            {chapter.title}
          </h2>
          {chapter.summary && <p className="mt-1 text-sm text-slate-400">{chapter.summary}</p>}

          <div className="mt-4 min-h-[180px]">
            {loading || !content ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Writing your chapter…
              </div>
            ) : (
              <ChapterBody content={content} muted={muted} language={language} />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-black/30 p-3">
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
              {chapterIndex === total - 1 ? "Finish" : "Next"} <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChapterVisual({ line, topic }: { line: string; topic?: string }) {
  const fallback = useMemo(() => instantDoodle(line, topic), [line, topic]);
  const cached = doodleCache.get(doodleKey(line));
  const [aiSrc, setAiSrc] = useState<string | null>(cached || null);
  useEffect(() => {
    if (cached) {
      setAiSrc(cached);
      return;
    }
    const ctrl = new AbortController();
    fetchDoodleImage(line, topic, ctrl.signal)
      .then((u) => {
        if (!ctrl.signal.aborted && u) setAiSrc(u);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, topic]);
  const finalSrc = aiSrc || fallback;
  return (
    <div className="relative h-44 w-full overflow-hidden bg-[#060d1a] sm:h-52">
      <img
        src={finalSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
        style={{ mixBlendMode: "screen", opacity: 0.95 }}
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a1628] to-transparent" />
    </div>
  );
}

function ChapterBody({
  content,
  muted,
  language,
}: {
  content: ChapterContent;
  muted: boolean;
  language: "english" | "hindi" | "both";
}) {
  useEffect(() => {
    if (muted) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const text = [content.intro, ...content.steps, content.example].filter(Boolean).join(". ");
    if (!text) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(language);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = language === "hindi" ? "hi-IN" : "en-US";
    u.rate = 0.95;

    let keepAlive: ReturnType<typeof setInterval> | null = null;
    u.onstart = () => {
      keepAlive = setInterval(() => {
        try {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        } catch {
          /* noop */
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
    }, 200);

    return () => {
      clearTimeout(t);
      cleanup();
      window.speechSynthesis.cancel();
    };
  }, [content, muted, language]);

  return (
    <div className="space-y-4 text-slate-200">
      {content.intro && <p className="text-base leading-relaxed text-slate-200">{content.intro}</p>}
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
          <p className="mt-1 text-sm leading-relaxed text-amber-100/90">{content.example}</p>
        </div>
      )}
    </div>
  );
}
