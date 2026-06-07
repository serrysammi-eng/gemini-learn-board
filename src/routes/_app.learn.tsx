import { createFileRoute } from "@tanstack/react-router";
import {
  Paperclip,
  Send,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { getAISettings, getPrefs } from "@/lib/storage";

export const Route = createFileRoute("/_app/learn")({
  head: () => ({
    meta: [
      { title: "Learn — StudyMate AI" },
      {
        name: "description",
        content:
          "Ask anything. Shiksha teaches line-by-line with visuals on top and synchronized voice + text below.",
      },
    ],
  }),
  component: ChalkboardPage,
});

/* ───────── Types ───────── */
interface DiagramBox {
  id: string;
  label: string;
}
interface DiagramArrow {
  from: string;
  to: string;
  label?: string;
}
interface Lesson {
  title: string;
  notes: string[];
  highlights: string[];
  diagram: { boxes: DiagramBox[]; arrows: DiagramArrow[] } | null;
  explanation: string;
  chat?: string;
}

/* ───────── Settings ───────── */
interface ChalkSettings {
  language: "english" | "hindi" | "both";
  voice: "female" | "male";
  muted: boolean;
  mode: "tutor" | "direct";
}
const SETTINGS_KEY = "studymate.chalkboard.settings";
const DEFAULT_SETTINGS: ChalkSettings = {
  language: "english",
  voice: "female",
  muted: false,
  mode: "tutor",
};
function loadSettings(): ChalkSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  const prefs = getPrefs();
  return {
    ...DEFAULT_SETTINGS,
    language: (prefs?.language as ChalkSettings["language"]) || "english",
  };
}
function saveSettings(s: ChalkSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

/* ───────── Voice ───────── */
function pickVoice(lang: ChalkSettings["language"], gender: ChalkSettings["voice"]) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return undefined;
  const wantLang = lang === "hindi" ? "hi" : "en";
  const sameLang = all.filter((v) => v.lang.toLowerCase().startsWith(wantLang));
  const pool = sameLang.length ? sameLang : all;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes("google")) s += 100;
    else if (n.includes("microsoft")) s += 80;
    if (n.includes("natural") || n.includes("neural")) s += 50;
    if (gender === "female" && /female|aria|jenny|samantha|zira|priya|neerja|swara/i.test(n))
      s += 20;
    if (gender === "male" && /male|david|alex|ravi|guy|matthew/i.test(n)) s += 20;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/* ───────── Question classification ───────── */
const CALC_RX =
  /\b(solve|calculate|compute|simplify|evaluate|integrate|differentiate|derive|code|program|write\s+(?:a\s+)?(?:function|program|code)|equation|find\s+the\s+value)\b|\d\s*[+\-*/=^]\s*\d|[+\-*/=^]\s*\d|\d\s*[+\-*/=^]/i;
const CONCEPT_RX =
  /\b(what\s+is|what\s+are|what\s+do|how\s+does|how\s+do|how\s+is|why\s+does|why\s+do|why\s+is|explain|describe|define|tell\s+me\s+about|kya\s+hai|kaise|kyu+n?)\b/i;
function isConceptQuestion(q: string) {
  if (CALC_RX.test(q)) return false;
  return CONCEPT_RX.test(q);
}

/* ───────── Doubt detection ───────── */
const DOUBT_PATTERNS: RegExp[] = [
  /i\s*don'?t\s*understand/i,
  /i\s*don'?t\s*get\s*it/i,
  /can\s*you\s*explain\s*(it\s*)?again/i,
  /explain\s*(it\s*)?again/i,
  /what\s*does\s*that\s*mean/i,
  /confused/i,
  /samajh\s*nahi+n?\s*aaya/i,
  /samajh\s*nahi+n?/i,
  /nahi+n?\s*samjha/i,
  /phir\s*se\s*(bata|samjha)o?/i,
  /^\s*huh\s*\??\s*$/i,
  /^\s*what\s*\??\s*$/i,
  /^\s*kya\s*\??\s*$/i,
];
function isDoubtMessage(s: string) {
  const t = s.trim();
  if (!t) return false;
  return DOUBT_PATTERNS.some((r) => r.test(t));
}

/* ───────── Lesson parser ───────── */
function parseLesson(raw: string): Lesson | null {
  const text = raw.replace(/\r/g, "");
  const chatMatch = text.match(/^\s*CHAT:\s*(.+?)\s*(?:\nEND)?$/im);
  if (chatMatch && !/^TITLE:/im.test(text)) {
    return {
      title: "",
      notes: [],
      highlights: [],
      diagram: null,
      explanation: "",
      chat: chatMatch[1].trim(),
    };
  }
  const section = (name: string) => {
    const re = new RegExp(
      `^${name}\\s*:\\s*([\\s\\S]*?)(?=^(?:TITLE|NOTES|HIGHLIGHT|DIAGRAM|EXPLANATION|END)\\b|\\Z)`,
      "im",
    );
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  const sectionAll = (name: string) => {
    const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "gim");
    const out: string[] = [];
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1].trim());
    return out;
  };

  const title = section("TITLE").split(/\n/)[0]?.trim() || "";
  const notesBlock = section("NOTES");
  const notes = notesBlock
    .split(/\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  const highlights = sectionAll("HIGHLIGHT").filter(Boolean);

  const diagBlock = section("DIAGRAM");
  let diagram: Lesson["diagram"] = null;
  if (diagBlock && !/^none\b/i.test(diagBlock)) {
    const boxes: DiagramBox[] = [];
    const arrows: DiagramArrow[] = [];
    for (const ln of diagBlock.split(/\n/)) {
      const line = ln.replace(/^\s*[-•*]\s*/, "").trim();
      if (!line) continue;
      const boxM = line.match(/^box\s*:\s*(.+)$/i);
      if (boxM) {
        const label = boxM[1].trim();
        boxes.push({ id: label.toLowerCase(), label });
        continue;
      }
      const arrM = line.match(
        /^arrow\s*:\s*(.+?)\s*(?:->|→|=>)\s*([^,]+?)(?:\s*,\s*label\s*:\s*(.+))?$/i,
      );
      if (arrM) {
        arrows.push({
          from: arrM[1].trim().toLowerCase(),
          to: arrM[2].trim().toLowerCase(),
          label: arrM[3]?.trim().replace(/^["']|["']$/g, ""),
        });
      }
    }
    if (boxes.length) diagram = { boxes, arrows };
  }
  const explanation = section("EXPLANATION")
    .replace(/\nEND\s*$/i, "")
    .trim();
  if (!title && !notes.length && !explanation) return null;
  return { title, notes, highlights, diagram, explanation };
}

/* ───────── Page ───────── */
function ChalkboardPage() {
  const [settings, setSettings] = useState<ChalkSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "teaching" | "done">("idle");
  const [speaking, setSpeaking] = useState(false);

  // Currently spoken sentence (lifted up from BoardScene for the top doodle box)
  const [currentLine, setCurrentLine] = useState<string>("");

  // Doubt tracking
  const doubtLayerRef = useRef<0 | 1 | 2 | 3>(0);
  const originalTopicRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const voicesReadyRef = useRef(false);
  const prefs = getPrefs();

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) voicesReadyRef.current = true;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // (Removed YouTube/image visual-reference fetch — replaced by inline doodle box.)

  const primeAudio = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* noop */
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setCurrentLine("");
    setStatus((s) => (s === "idle" ? s : "done"));
  }, []);

  const handleAsk = useCallback(
    async (q: string) => {
      stop();
      await new Promise((r) => setTimeout(r, 30));

      // Doubt detection
      const isDoubt = isDoubtMessage(q) && !!originalTopicRef.current;
      let nextLayer: 0 | 1 | 2 | 3 = 0;
      let topicForApi: string | undefined;
      if (isDoubt) {
        nextLayer = Math.min(3, (doubtLayerRef.current || 0) + 1) as 0 | 1 | 2 | 3;
        doubtLayerRef.current = nextLayer;
        topicForApi = originalTopicRef.current!;
      } else {
        doubtLayerRef.current = 0;
        nextLayer = 0;
        originalTopicRef.current = q;
        topicForApi = undefined;
      }

      setQuestion(q);
      setLesson(null);
      setStatus("generating");
      setCurrentLine("");
      primeAudio();

      const ai = getAISettings();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const isCalculation = !isConceptQuestion(q);
        const res = await fetch("/api/chalkboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            question: q,
            language: settings.language,
            mode: settings.mode,
            model: ai.model,
            userApiKey: ai.geminiApiKey,
            context: prefs
              ? { name: prefs.name, level: prefs.level, subject: prefs.subject }
              : undefined,
            doubtLayer: nextLayer,
            originalTopic: topicForApi,
            forceDiagram: nextLayer === 2,
            isCalculation,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
        }
        const parsed = parseLesson(buf);
        if (!parsed) {
          setLesson({
            title: "",
            notes: [],
            highlights: [],
            diagram: null,
            explanation: "",
            chat: "Hmm, I couldn't put that on the board. Try rephrasing?",
          });
          setStatus("done");
          return;
        }
        if (parsed.chat) {
          doubtLayerRef.current = 0;
          originalTopicRef.current = null;
        }
        setLesson(parsed);
        setStatus("teaching");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error(err);
        setLesson({
          title: "",
          notes: [],
          highlights: [],
          diagram: null,
          explanation: "",
          chat: "Couldn't reach the AI. Try again.",
        });
        setStatus("done");
      } finally {
        abortRef.current = null;
      }
    },
    [prefs, settings.language, settings.mode, primeAudio, stop],
  );

  const submit = () => {
    const v = input.trim();
    if (!v) return;
    setInput("");
    void handleAsk(v);
  };

  const onLessonFinished = useCallback(() => {
    setStatus("done");
  }, []);

  const isBusy = status === "generating" || status === "teaching";

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  const headerTopic = useMemo(() => question || "AI Chalkboard", [question]);

  return (
    <div className="-mx-4 -my-5 flex h-[calc(100dvh-3.5rem)] flex-col bg-[#060d1a] text-slate-100 font-sans">
      <ChalkHeader
        topic={headerTopic}
        mode={settings.mode}
        onOpenSettings={() => setSettingsOpen(true)}
        muted={settings.muted}
        onToggleMute={() => {
          if (!settings.muted && typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            setSpeaking(false);
          }
          setSettings({ ...settings, muted: !settings.muted });
        }}
      />

      <div className="relative flex-1 px-3 pb-2 pt-2">
        <div className="chalkboard relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-purple-500/15 shadow-[inset_0_0_120px_rgba(0,0,0,0.6)]">
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-purple-500/10" />

          {/* Top doodle + current spoken line */}
          {!!lesson && !lesson.chat && (
            <div
              className="relative z-10 shrink-0 border-b border-purple-500/15 bg-black/30 px-3 py-2 animate-fade-in"
              style={{ maxHeight: "38%" }}
            >
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                Now teaching
              </div>
              <div className="flex items-stretch gap-3">
                <div
                  className="relative shrink-0 overflow-hidden rounded-xl border border-purple-500/20 bg-[#060d1a] shadow-[inset_0_0_30px_rgba(139,92,246,0.15)]"
                  style={{ width: 180, aspectRatio: "1 / 1" }}
                >
                  <DoodleBox
                    line={currentLine}
                    title={lesson.title}
                    highlights={lesson.highlights}
                  />
                </div>
                <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-amber-400/25 bg-amber-500/[0.04] px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                    Line {currentLine ? "" : "1"}
                  </div>
                  <div
                    key={currentLine}
                    className="hand mt-1 text-xl leading-snug text-amber-100 sm:text-2xl animate-[fadeSlideUp_0.35s_ease-out_forwards]"
                    style={{ textShadow: "0 0 10px rgba(245,158,11,0.3)" }}
                  >
                    {currentLine || lesson.title || "Listen as I draw it out…"}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="relative flex-1 overflow-hidden">
            {!lesson ? (
              <EmptyState busy={status === "generating"} />
            ) : lesson.chat ? (
              <ChatOnly text={lesson.chat} />
            ) : (
              <BoardScene
                lesson={lesson}
                settings={settings}
                onSpeakingChange={setSpeaking}
                onFinished={onLessonFinished}
                onLineChange={setCurrentLine}
              />
            )}

            {isBusy && (
              <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-purple-500/20 bg-black/40 px-3 py-1 text-[11px] font-medium text-purple-200 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-300" />
                </span>
                {status === "generating"
                  ? doubtLayerRef.current
                    ? `Re-teaching (try ${doubtLayerRef.current})…`
                    : "Thinking…"
                  : `Teaching ${question?.slice(0, 28) || "now"}…`}
              </div>
            )}

            <Visualizer active={speaking} />
          </div>
        </div>
      </div>

      <div className="px-3 pb-4 pt-2">
        {question && (
          <div className="mx-auto mb-2 flex max-w-xl justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-purple-600 to-purple-400 px-3.5 py-2 text-sm text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-[fadeSlideUp_0.3s_ease-out_forwards]">
              {question}
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-xl items-end gap-2 rounded-3xl border border-purple-500/20 bg-white/[0.04] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-xl focus-within:border-purple-500/40 transition-all">
          <label
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10"
            aria-label="Attach image"
          >
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  setInput((cur) =>
                    cur ? cur + ` (image: ${f.name})` : `Help me with this image: ${f.name}`,
                  );
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              settings.mode === "tutor"
                ? "Ask anything — I'll teach you step by step…"
                : "Ask a question…"
            }
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {isBusy ? (
            <Button
              onClick={stop}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-red-500/90 hover:bg-red-600"
              aria-label="Stop"
            >
              <Square className="h-4 w-4 fill-current text-white" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:opacity-95"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {!question && !isBusy && (
          <div className="mx-auto mt-3 flex max-w-xl flex-wrap justify-center gap-2">
            {["Hello!", "What is photosynthesis?", "Explain TCP vs UDP", "Solve 2x + 3 = 11"].map(
              (q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput("");
                    void handleAsk(q);
                  }}
                  className="rounded-full border border-purple-500/15 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 backdrop-blur transition hover:border-purple-400/40 hover:text-white"
                >
                  {q}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      <Drawer open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DrawerContent className="border-purple-500/15 bg-[#0a1628] text-slate-100">
          <DrawerHeader>
            <DrawerTitle className="text-slate-100">Chalkboard settings</DrawerTitle>
            <DrawerDescription className="text-slate-400">
              Choose your teacher's voice, language and teaching style.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-5 px-5 pb-8">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Teaching style
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-purple-500/15 bg-white/[0.04] p-1">
                {(
                  [
                    { v: "tutor", label: "Tutor mode", sub: "Slow, step-by-step" },
                    { v: "direct", label: "Direct mode", sub: "Quick answers" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setSettings({ ...settings, mode: opt.v })}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-left transition",
                      settings.mode === opt.v
                        ? "bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                        : "text-slate-300 hover:bg-white/5",
                    )}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-[11px] opacity-80">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Native language
              </div>
              <select
                value={settings.language}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    language: e.target.value as ChalkSettings["language"],
                  })
                }
                className="w-full rounded-2xl border border-purple-500/15 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 focus:border-purple-500/40 focus:outline-none"
              >
                <option value="english">English</option>
                <option value="hindi">हिन्दी (Hindi)</option>
                <option value="both">Hinglish (Both)</option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Voice type
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-purple-500/15 bg-white/[0.04] p-1">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setSettings({ ...settings, voice: g })}
                    className={cn(
                      "rounded-xl py-2.5 text-sm font-medium capitalize transition",
                      settings.voice === g
                        ? "bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                        : "text-slate-300 hover:bg-white/5",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSettings({ ...settings, muted: !settings.muted })}
              className="flex w-full items-center justify-between rounded-2xl border border-purple-500/15 bg-white/[0.04] px-4 py-3 text-sm"
            >
              <span className="text-slate-200">Mute teacher voice</span>
              <span
                className={cn(
                  "flex h-6 w-11 items-center rounded-full p-0.5 transition",
                  settings.muted ? "bg-slate-700" : "bg-purple-500",
                )}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded-full bg-white transition",
                    settings.muted ? "translate-x-0" : "translate-x-5",
                  )}
                />
              </span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');
        .chalkboard {
          background:
            radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.08), transparent 50%),
            radial-gradient(ellipse at 80% 90%, rgba(245,158,11,0.05), transparent 55%),
            linear-gradient(180deg, #0a1628 0%, #060d1a 100%);
        }
        .chalkboard::before {
          content: ""; position: absolute; inset: 0;
          background-image:
            repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px);
          mix-blend-mode: overlay; pointer-events: none; border-radius: inherit;
        }
        .hand { font-family: 'Caveat','Comic Sans MS',cursive; }

        @keyframes note-pop {
          0%   { opacity: 0; transform: scale(0.7) translateY(4px); filter: blur(2px); }
          60%  { opacity: 1; transform: scale(1.08) translateY(0); filter: blur(0); }
          100% { opacity: 1; transform: scale(1); }
        }
        .note-word { display: inline-block; opacity: 0; animation: note-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }

        @keyframes word-fade {
          from { opacity: 0; transform: translateY(3px); filter: blur(1.5px); }
          to   { opacity: 1; transform: none; filter: none; }
        }
        .spoken { display: inline-block; opacity: 0; }
        .spoken.on { animation: word-fade 0.28s ease-out forwards; }

        .hl-glow {
          color: #fbbf24;
          text-shadow: 0 0 10px rgba(245,158,11,0.55), 0 0 22px rgba(245,158,11,0.3);
          position: relative;
        }
        .hl-glow::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -3px; height: 3px;
          background: linear-gradient(90deg, #fbbf24, #f59e0b);
          border-radius: 2px;
          transform-origin: left center;
          transform: scaleX(0);
          box-shadow: 0 0 8px rgba(245,158,11,0.7);
        }
        .hl-glow.on::after { animation: ul-grow 0.3s ease-out forwards; }
        @keyframes ul-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .hl-note {
          background: linear-gradient(transparent 55%, rgba(245,158,11,0.45) 55%);
          padding: 0 2px; border-radius: 2px; color: #fbbf24;
          font-weight: 700;
        }

        @keyframes draw { to { stroke-dashoffset: 0; } }
        .stroke-draw {
          stroke-dasharray: var(--len, 400);
          stroke-dashoffset: var(--len, 400);
          animation: draw var(--dur, 0.9s) ease-out forwards;
          animation-delay: var(--delay, 0s);
        }
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        .fade-in { animation: fadein 0.45s ease-out both; }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

/* ───────── Header ───────── */
function ChalkHeader({
  topic,
  mode,
  onOpenSettings,
  muted,
  onToggleMute,
}: {
  topic: string;
  mode: "tutor" | "direct";
  onOpenSettings: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 mx-3 mt-2 flex items-center justify-between rounded-2xl border border-purple-500/15 bg-[#0a1628]/80 px-3 py-2 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-pulse">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">{topic}</div>
          <div className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">
            Shiksha · {mode === "tutor" ? "Tutor mode" : "Direct mode"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={onToggleMute}
          className="grid h-9 w-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/10"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          aria-label="Settings"
          onClick={onOpenSettings}
          className="grid h-9 w-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/10"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ───────── Empty + Chat ───────── */
function EmptyState({ busy }: { busy: boolean }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <svg
        viewBox="0 0 200 200"
        className="h-40 w-40 animate-[float_3s_ease-in-out_infinite] text-purple-400/60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <circle cx="100" cy="100" r="14" />
        <ellipse cx="100" cy="100" rx="70" ry="22" />
        <ellipse cx="100" cy="100" rx="70" ry="22" transform="rotate(60 100 100)" />
        <ellipse cx="100" cy="100" rx="70" ry="22" transform="rotate(120 100 100)" />
        <circle cx="100" cy="100" r="78" strokeDasharray="2 6" opacity="0.4" />
      </svg>
      <p
        className="hand mt-4 text-2xl text-slate-200/90"
        style={{ textShadow: "0 0 12px rgba(168,85,247,0.4)" }}
      >
        {busy ? "Preparing your lesson…" : "Say hi, or ask me anything!"}
      </p>
      <p className="mt-1 text-xs text-slate-500">Shiksha will teach you step by step.</p>
    </div>
  );
}
function ChatOnly({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div
        className="hand max-w-md text-3xl text-amber-200 fade-in"
        style={{ textShadow: "0 0 10px rgba(245,158,11,0.35)" }}
      >
        {text}
      </div>
    </div>
  );
}

/* ───────── Doodle box (top-left) ─────────
   Re-draws a small hand-drawn chalk sketch whenever the spoken line changes.
   Uses deterministic shapes seeded from the line's hash so each beat looks
   different but stable while it's on screen. Stroke-dashoffset animates
   the strokes left-to-right like a real chalkboard. */
function DoodleBox({
  line,
  title,
  highlights,
}: {
  line: string;
  title: string;
  highlights: string[];
}) {
  const seed = useMemo(() => {
    let h = 5381;
    const s = line || title || "x";
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }, [line, title]);

  // Pick a couple of keywords to label the doodle
  const label = useMemo(() => {
    const src = line || highlights[0] || title || "";
    const words = src
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter((w) => w.length > 2);
    return (words[0] || "idea").slice(0, 14);
  }, [line, highlights, title]);

  // Deterministic pseudo-random helpers
  const rand = (i: number) => {
    const x = Math.sin(seed + i * 9301) * 43758.5453;
    return x - Math.floor(x);
  };

  const shapes = useMemo(() => {
    // pick 3 shape "kinds" varying by seed
    const kinds = ["circle", "triangle", "wave", "arrow", "leaf", "spark"] as const;
    return [0, 1, 2].map((i) => {
      const k = kinds[Math.floor(rand(i + 1) * kinds.length)];
      const cx = 30 + rand(i + 7) * 100;
      const cy = 35 + rand(i + 13) * 80;
      const size = 18 + rand(i + 19) * 22;
      return { k, cx, cy, size, i };
    });
  }, [seed]);

  return (
    <svg
      key={seed}
      viewBox="0 0 180 180"
      className="h-full w-full"
      fill="none"
      stroke="rgba(216,180,254,0.95)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* dotted board grid */}
      <defs>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="rgba(167,139,250,0.18)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="180" height="180" fill="url(#dots)" />

      {shapes.map(({ k, cx, cy, size, i }) => {
        const delay = i * 0.45;
        const dash = 260;
        const style = {
          strokeDasharray: dash,
          strokeDashoffset: dash,
          animation: `doodle-draw 1.1s ease-out ${delay}s forwards`,
        } as const;
        if (k === "circle")
          return <circle key={i} cx={cx} cy={cy} r={size} style={style} />;
        if (k === "triangle") {
          const p = `M ${cx} ${cy - size} L ${cx + size} ${cy + size} L ${cx - size} ${cy + size} Z`;
          return <path key={i} d={p} style={style} />;
        }
        if (k === "wave") {
          const p = `M ${cx - size} ${cy} Q ${cx - size / 2} ${cy - size}, ${cx} ${cy} T ${cx + size} ${cy}`;
          return <path key={i} d={p} style={style} />;
        }
        if (k === "arrow") {
          const p = `M ${cx - size} ${cy} L ${cx + size} ${cy} M ${cx + size - 6} ${cy - 5} L ${cx + size} ${cy} L ${cx + size - 6} ${cy + 5}`;
          return <path key={i} d={p} style={style} />;
        }
        if (k === "leaf") {
          const p = `M ${cx} ${cy - size} Q ${cx + size} ${cy}, ${cx} ${cy + size} Q ${cx - size} ${cy}, ${cx} ${cy - size} Z M ${cx} ${cy - size} L ${cx} ${cy + size}`;
          return <path key={i} d={p} style={style} />;
        }
        // spark
        const s = size * 0.7;
        const p = `M ${cx - s} ${cy} L ${cx + s} ${cy} M ${cx} ${cy - s} L ${cx} ${cy + s} M ${cx - s * 0.7} ${cy - s * 0.7} L ${cx + s * 0.7} ${cy + s * 0.7} M ${cx + s * 0.7} ${cy - s * 0.7} L ${cx - s * 0.7} ${cy + s * 0.7}`;
        return <path key={i} d={p} style={style} />;
      })}

      {/* handwritten label */}
      <text
        x="50%"
        y="92%"
        textAnchor="middle"
        fontFamily="'Caveat', cursive"
        fontSize="20"
        fill="rgba(252,211,77,0.95)"
        stroke="none"
        style={{ opacity: 0, animation: "doodle-fade 0.6s ease-out 1.2s forwards" }}
      >
        {label}
      </text>

      <style>{`
        @keyframes doodle-draw { to { stroke-dashoffset: 0; } }
        @keyframes doodle-fade { to { opacity: 1; } }
      `}</style>
    </svg>
  );
}



/* ───────── Board scene ───────── */
function BoardScene({
  lesson,
  settings,
  onSpeakingChange,
  onFinished,
  onLineChange,
}: {
  lesson: Lesson;
  settings: ChalkSettings;
  onSpeakingChange: (b: boolean) => void;
  onFinished: () => void;
  onLineChange?: (line: string) => void;
}) {
  const noteTokens = useMemo(() => {
    const tokens: Array<{ id: number; text: string; line: number; isHL: boolean }> = [];
    let id = 0;
    const hlKeys = new Set<string>();
    for (const h of lesson.highlights) {
      h.toLowerCase()
        .split(/\s+/)
        .forEach((w) => {
          const k = w.replace(/[^\p{L}\p{N}]+/gu, "");
          if (k) hlKeys.add(k);
        });
    }
    lesson.notes.forEach((note, li) => {
      const parts = note.split(/(\s+)/);
      for (const p of parts) {
        if (/^\s+$/.test(p) || !p) continue;
        const key = p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
        tokens.push({ id: id++, text: p, line: li, isHL: hlKeys.has(key) });
      }
    });
    return tokens;
  }, [lesson]);

  const expTokens = useMemo(() => {
    const out: Array<{ id: number; text: string; start: number; end: number; isHL: boolean }> = [];
    const hlKeys = new Set<string>();
    for (const h of lesson.highlights) {
      h.toLowerCase()
        .split(/\s+/)
        .forEach((w) => {
          const k = w.replace(/[^\p{L}\p{N}]+/gu, "");
          if (k) hlKeys.add(k);
        });
    }
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let id = 0;
    while ((m = re.exec(lesson.explanation)) !== null) {
      const word = m[0];
      const key = word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      out.push({
        id: id++,
        text: word,
        start: m.index,
        end: m.index + word.length,
        isHL: hlKeys.has(key),
      });
    }
    return out;
  }, [lesson]);

  const [revealedUpTo, setRevealedUpTo] = useState(0);

  // Push the currently spoken sentence up to the page so the top "Now teaching" box can mirror it.
  useEffect(() => {
    if (!onLineChange) return;
    if (revealedUpTo === 0) {
      onLineChange(lesson.notes[0] || lesson.title || "");
      return;
    }
    const exp = lesson.explanation;
    if (!exp) return;
    // Find the sentence containing the last revealed word.
    const lastIdx = Math.min(revealedUpTo, expTokens.length) - 1;
    if (lastIdx < 0) return;
    const charIdx = expTokens[lastIdx].end;
    const before = exp.slice(0, charIdx);
    const start = Math.max(
      before.lastIndexOf(". ") + 2,
      before.lastIndexOf("? ") + 2,
      before.lastIndexOf("! ") + 2,
      0,
    );
    const remainder = exp.slice(start);
    const endRel = remainder.search(/[.?!]\s|$/);
    const sentence = (endRel >= 0 ? remainder.slice(0, endRel + 1) : remainder).trim();
    if (sentence) onLineChange(sentence);
  }, [revealedUpTo, expTokens, lesson.explanation, lesson.notes, lesson.title, onLineChange]);

  useEffect(() => {
    setRevealedUpTo(0);

    if (!lesson.explanation) {
      onFinished();
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onFinished();
      return;
    }

    if (settings.muted) {
      setRevealedUpTo(expTokens.length);
      onFinished();
      return;
    }

    let boundaryFired = false;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(lesson.explanation);
    const v = pickVoice(settings.language, settings.voice);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = settings.language === "hindi" ? "hi-IN" : "en-US";
    u.rate = 0.85;
    u.pitch = 1.05;
    u.volume = 1;

    u.onstart = () => {
      onSpeakingChange(true);

      // Fallback timer: starts after 1.5s if no boundary event fires
      fallbackTimeout = setTimeout(() => {
        if (!boundaryFired) {
          console.warn(
            "SpeechSynthesis onboundary didn't fire. Starting timer-based word reveal fallback.",
          );
          const wordsTotal = expTokens.length;
          const totalMs = Math.max(2000, wordsTotal * 300); // 300ms per word
          const startTime = Date.now();

          fallbackInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const expected = Math.min(wordsTotal, Math.floor((elapsed / totalMs) * wordsTotal));
            setRevealedUpTo((cur) => Math.max(cur, expected));
            if (elapsed >= totalMs) {
              if (fallbackInterval) clearInterval(fallbackInterval);
              onSpeakingChange(false);
              setRevealedUpTo(wordsTotal);
              onFinished();
            }
          }, 150);
        }
      }, 1500);
    };

    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name && e.name !== "word") return;
      boundaryFired = true;
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);

      const ci = e.charIndex ?? 0;
      let idx = -1;
      for (let k = 0; k < expTokens.length; k++) {
        if (expTokens[k].start <= ci) idx = k;
        else break;
      }
      if (idx >= 0) {
        setRevealedUpTo((cur) => Math.max(cur, idx + 1));
      }
    };

    u.onend = () => {
      onSpeakingChange(false);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      setRevealedUpTo(expTokens.length);
      onFinished();
    };
    u.onerror = () => {
      onSpeakingChange(false);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      setRevealedUpTo(expTokens.length);
      onFinished();
    };

    const t = setTimeout(() => {
      try {
        window.speechSynthesis.speak(u);
      } catch {
        boundaryFired = false;
      }
    }, 80);

    return () => {
      clearTimeout(t);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      window.speechSynthesis.cancel();
      onSpeakingChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, settings.muted, settings.language, settings.voice]);

  return (
    <div className="relative h-full w-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
      {/* Title */}
      {lesson.title && (
        <div
          className="hand fade-in mb-4 text-3xl font-bold text-amber-400 sm:text-4xl"
          style={{ textShadow: "0 0 10px rgba(245,158,11,0.4)" }}
        >
          ✦ {lesson.title}
        </div>
      )}

      {/* Notes */}
      <div
        key={lesson.title + lesson.explanation}
        className="hand space-y-2 text-2xl leading-snug text-slate-100 sm:text-3xl"
      >
        {lesson.notes.map((_, li) => (
          <div key={li} className="flex items-start gap-2">
            <span className="mt-2.5 inline-block h-2 w-2 shrink-0 rounded-full bg-purple-400/80" />
            <div className="flex flex-wrap gap-x-1.5">
              {noteTokens
                .filter((t) => t.line === li)
                .map((t, i) => (
                  <span
                    key={t.id}
                    className={cn("note-word", t.isHL && "hl-note")}
                    style={{ animationDelay: `${t.id * 35 + i * 10}ms` }}
                  >
                    {t.text}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Diagram */}
      {lesson.diagram && lesson.diagram.boxes.length > 0 && (
        <div className="mt-6 fade-in">
          <DiagramSVG diagram={lesson.diagram} />
        </div>
      )}

      {/* Explanation */}
      {expTokens.length > 0 && (
        <div className="hand mt-6 border-t border-purple-500/10 pt-4 text-xl leading-relaxed text-slate-200 sm:text-2xl">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-purple-400">
            Shiksha says
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {expTokens.map((t, i) => {
              const on = i < revealedUpTo;
              return (
                <span
                  key={t.id}
                  className={cn("spoken", on && "on", t.isHL && "hl-glow", on && t.isHL && "on")}
                >
                  {t.text}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Diagram ───────── */
function DiagramSVG({ diagram }: { diagram: NonNullable<Lesson["diagram"]> }) {
  const W = 560;
  const cols = Math.min(3, Math.max(1, diagram.boxes.length));
  const rows = Math.ceil(diagram.boxes.length / cols);
  const boxW = 150,
    boxH = 64;
  const rowGap = 130;
  const H = Math.max(160, rows * rowGap + 40);
  const positions = new Map<string, { x: number; y: number }>();
  diagram.boxes.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const gapX = (W - cols * boxW) / (cols + 1);
    const x = gapX + col * (boxW + gapX);
    const y = 20 + row * rowGap;
    positions.set(b.id, { x, y });
  });

  const wrapLabel = (label: string, maxCharsPerLine = 14): string[] => {
    const words = label.split(/\s+/);
    if (words.length === 1) return [label];
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const next = current ? current + " " + w : w;
      if (next.length > maxCharsPerLine && current) {
        lines.push(current);
        current = w;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 2);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" preserveAspectRatio="xMidYMid meet">
      {diagram.arrows.map((a, i) => {
        const f = positions.get(a.from);
        const t = positions.get(a.to);
        if (!f || !t) return null;
        const x1 = f.x + boxW,
          y1 = f.y + boxH / 2;
        const x2 = t.x,
          y2 = t.y + boxH / 2;
        const mx = (x1 + x2) / 2;
        const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 8} ${y2}`;
        const delay = 0.6 + i * 0.35;
        return (
          <g key={i}>
            <path
              d={path}
              stroke="#fbbf24"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              className="stroke-draw"
              style={{
                ["--len" as any]: 420,
                ["--dur" as any]: "0.9s",
                ["--delay" as any]: `${delay}s`,
              }}
            />
            <polygon
              points={`${x2 - 10},${y2 - 5} ${x2},${y2} ${x2 - 10},${y2 + 5}`}
              fill="#fbbf24"
              className="fade-in"
              style={{ animationDelay: `${delay + 0.7}s` }}
            />
            {a.label && (
              <text
                x={mx}
                y={(y1 + y2) / 2 - 6}
                textAnchor="middle"
                className="fade-in"
                style={{
                  animationDelay: `${delay + 0.4}s`,
                  fontFamily: "'Caveat',cursive",
                  fontSize: 16,
                  fill: "#a78bfa",
                }}
              >
                {a.label}
              </text>
            )}
          </g>
        );
      })}
      {diagram.boxes.map((b, i) => {
        const p = positions.get(b.id)!;
        const delay = 0.1 + i * 0.25;
        const lines = wrapLabel(b.label);
        const longest = Math.max(...lines.map((l) => l.length));
        const maxFont = lines.length > 1 ? 18 : 22;
        const fontSize = Math.max(12, Math.min(maxFont, Math.floor((boxW - 16) / (longest * 0.5))));
        const lineHeight = fontSize + 2;
        const totalHeight = lineHeight * lines.length;
        const startY = p.y + boxH / 2 - totalHeight / 2 + fontSize - 2;
        return (
          <g key={b.id}>
            <rect
              x={p.x}
              y={p.y}
              width={boxW}
              height={boxH}
              rx="12"
              stroke="#a78bfa"
              strokeWidth="2"
              fill="rgba(167,139,250,0.08)"
              className="stroke-draw"
              style={{
                ["--len" as any]: 380,
                ["--dur" as any]: "0.7s",
                ["--delay" as any]: `${delay}s`,
              }}
            />
            <text
              x={p.x + boxW / 2}
              y={startY}
              textAnchor="middle"
              className="fade-in"
              style={{
                animationDelay: `${delay + 0.5}s`,
                fontFamily: "'Caveat',cursive",
                fontSize,
                fill: "#f8fafc",
              }}
            >
              {lines.map((line, idx) => (
                <tspan key={idx} x={p.x + boxW / 2} dy={idx === 0 ? 0 : lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


/* ───────── Visualizer ───────── */
function Visualizer({ active }: { active: boolean }) {
  const bars = 24;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex h-10 items-end gap-[3px] rounded-full border border-purple-500/15 bg-black/40 px-3 py-1.5 backdrop-blur">
      {Array.from({ length: bars }).map((_, i) => {
        const delay = (i % 8) * 60;
        return (
          <span
            key={i}
            className="w-[2.5px] rounded-full bg-gradient-to-t from-purple-500 to-amber-400"
            style={{
              height: active ? `${6 + ((i * 7) % 22)}px` : "4px",
              animation: active
                ? `viz-bar 0.${5 + (i % 4)}s ease-in-out ${delay}ms infinite alternate`
                : undefined,
              boxShadow: active ? "0 0 6px rgba(168,85,247,0.5)" : undefined,
              opacity: active ? 1 : 0.35,
            }}
          />
        );
      })}
      <style>{`
        @keyframes viz-bar { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1.4); } }
      `}</style>
    </div>
  );
}
