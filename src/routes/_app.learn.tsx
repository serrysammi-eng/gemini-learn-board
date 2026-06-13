import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Calculator,
  Check,
  Code2,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  Settings2,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  doodleCache as sharedDoodleCache,
  doodleKey,
  fetchDoodleImage as sharedFetchDoodleImage,
  fetchWikimediaImage,
  getCachedWikimedia,
  instantDoodle,
} from "@/lib/doodle-cache";
import {
  extractPaperFromImage,
  generateFormulas,
  generatePracticePaper,
  generateStarterCode,
  generateTips,
} from "@/lib/ai.functions";
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
type TabId = "lesson" | "formulas" | "tips" | "code" | "practice";

function ChalkboardPage() {
  const [tab, setTab] = useState<TabId>("lesson");
  const [settings, setSettings] = useState<ChalkSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "teaching" | "done">("idle");
  const [speaking, setSpeaking] = useState(false);

  // Cancel any in-flight speech whenever the user leaves the Lesson tab.
  useEffect(() => {
    if (tab !== "lesson" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [tab]);


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
    // CRITICAL: prime audio synchronously inside the user-gesture click handler.
    // Doing this before the async handleAsk preserves browser autoplay permission
    // so the second/third lesson's speech also plays instead of going silent.
    primeAudio();
    setInput("");
    void handleAsk(v);
  };

  /** Conversational PDF / notes / code upload. Instead of silently OCR-ing or
   *  parsing, we hand the file's name + a question back to the tutor and let
   *  it ask the user "should I solve this, summarize it, or make notes?". */
  const handleFileAttach = useCallback(
    (file: File) => {
      const name = file.name;
      const lower = name.toLowerCase();
      const kind = lower.endsWith(".pdf")
        ? "PDF"
        : lower.endsWith(".py")
          ? "Python file"
          : lower.endsWith(".txt") || lower.endsWith(".md")
            ? "notes file"
            : lower.match(/\.(png|jpe?g|webp)$/)
              ? "image"
              : "file";
      // Synchronous primer for the audio that will follow.
      primeAudio();
      const q = `I just uploaded a ${kind} called "${name}". Ask me what I'd like you to do with it — solve the problems, summarize, make short notes, or explain the toughest parts — then break the answer into small bite-sized parts.`;
      void handleAsk(q);
    },
    [handleAsk, primeAudio],
  );


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

      {/* Tab bar */}
      <div className="px-3 pt-2">
        <TabBar tab={tab} onChange={setTab} />
      </div>

      {/* Tab content */}
      <div className="relative flex-1 overflow-hidden px-3 pb-2 pt-2">
        {tab === "lesson" && (
          <div className="chalkboard relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-purple-500/15 shadow-[inset_0_0_120px_rgba(0,0,0,0.6)]">
            <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-purple-500/10" />

            {/* 16:9 doodle banner on top */}
            {!!lesson && !lesson.chat && (
              <div className="relative z-10 shrink-0 border-b border-purple-500/15 bg-black/30 animate-fade-in">
                <div className="relative aspect-video w-full overflow-hidden">
                  <DoodleBox
                    line={currentLine || lesson.title || lesson.notes[0] || ""}
                    topic={question || lesson.title}
                  />
                  {/* Now teaching badge */}
                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-200 backdrop-blur">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                    Now teaching
                  </div>
                  {/* Spoken line overlay */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
                    <div
                      key={currentLine}
                      className="hand text-lg leading-snug text-amber-100 sm:text-xl animate-[fadeSlideUp_0.35s_ease-out_forwards]"
                      style={{ textShadow: "0 2px 10px rgba(0,0,0,0.8), 0 0 10px rgba(245,158,11,0.3)" }}
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
        )}

        {tab === "formulas" && <FormulasTab />}
        {tab === "tips" && <TipsTab />}
        {tab === "code" && <CodeTab />}
        {tab === "practice" && <PracticeTab />}
      </div>

      {/* Input bar — only on Lesson tab */}
      {tab === "lesson" && (
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
              aria-label="Attach PDF, notes, code or image"
              title="Attach PDF, notes, code or image"
            >
              <Paperclip className="h-4 w-4" />
              <input
                type="file"
                accept=".pdf,.txt,.md,.py,.js,.ts,.cpp,.c,.java,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileAttach(f);
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
      )}


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

/* ───────── AI Doodle box (top-left) ─────────
   INSTANT: Pollinations.ai URL renders immediately (no fetch, no wait).
   UPGRADE: Lovable AI image streams in behind it and replaces when ready.
   Both are cached per-line so repeats are instant. */



function DoodleBox({ line, topic }: { line: string; topic?: string }) {
  // Pollinations URL — instant, no fetch, just an <img src=…>.
  const pollSrc = useMemo(() => {
    if (!line || line.trim().length < 4) return null;
    return instantDoodle(line, topic);
  }, [line, topic]);

  // Lovable AI upgrade — streams in (partial frames included) and replaces Pollinations.
  const [aiSrc, setAiSrc] = useState<string | null>(() =>
    line ? sharedDoodleCache.get(doodleKey(line)) ?? null : null,
  );

  useEffect(() => {
    if (!line || line.trim().length < 4) return;
    const cached = sharedDoodleCache.get(doodleKey(line));
    if (cached) {
      flushSyncSafe(() => setAiSrc(cached));
      return;
    }
    setAiSrc(null);
    const ctrl = new AbortController();
    sharedFetchDoodleImage(line, topic, ctrl.signal, (partialUrl) => {
      if (ctrl.signal.aborted || !partialUrl) return;
      flushSyncSafe(() => setAiSrc(partialUrl));
    })
      .then((finalUrl) => {
        if (ctrl.signal.aborted || !finalUrl) return;
        flushSyncSafe(() => setAiSrc(finalUrl));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [line, topic]);

  const displaySrc = aiSrc || pollSrc;
  const showSketching = !displaySrc && !!line && line.trim().length >= 4;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#060d1a]">
      {/* dotted board backdrop */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <pattern id="ddots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="rgba(167,139,250,0.18)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ddots)" />
      </svg>

      {displaySrc && (
        <img
          key={displaySrc}
          src={displaySrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ mixBlendMode: "screen" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {showSketching && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-purple-500/30" />
            <div className="hand text-sm text-purple-300/80 animate-pulse">
              Sketching…
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes kenburns-learn {
          0%   { transform: scale(1.0) translate(0,0); }
          50%  { transform: scale(1.08) translate(-2%, -1.5%); }
          100% { transform: scale(1.0) translate(0,0); }
        }
        .doodle-kenburns-learn { animation: kenburns-learn 8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function flushSyncSafe(fn: () => void) {
  try {
    flushSync(fn);
  } catch {
    fn();
  }
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
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    window.speechSynthesis.cancel();
    // Some browsers (Chrome) silently drop a speak() that comes too soon after cancel().
    // Resume() any paused state first.
    try {
      window.speechSynthesis.resume();
    } catch {
      /* noop */
    }
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

      // Chrome bug: speechSynthesis silently pauses after ~15 seconds.
      // Pinging pause()+resume() every 8s keeps it alive. This is what
      // makes subsequent lessons actually play instead of going silent.
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

    const stopKeepAlive = () => {
      if (keepAlive) clearInterval(keepAlive);
      keepAlive = null;
    };

    u.onend = () => {
      onSpeakingChange(false);
      stopKeepAlive();
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      setRevealedUpTo(expTokens.length);
      onFinished();
    };
    u.onerror = () => {
      onSpeakingChange(false);
      stopKeepAlive();
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      setRevealedUpTo(expTokens.length);
      onFinished();
    };

    // Slightly longer delay (200ms) gives Chrome time to fully reset after cancel().
    // 80ms wasn't enough — that's why the second lesson's voice was dropped.
    const t = setTimeout(() => {
      try {
        window.speechSynthesis.speak(u);
      } catch {
        boundaryFired = false;
      }
    }, 200);

    return () => {
      clearTimeout(t);
      stopKeepAlive();
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

      {/* Diagram — wrapped in its own scrollable card so it never overlaps notes/explanation */}
      {lesson.diagram && lesson.diagram.boxes.length > 0 && (
        <div className="mt-8 fade-in">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-purple-400">
            Concept map
          </div>
          <div className="overflow-x-auto rounded-2xl border border-purple-500/20 bg-black/30 p-4 shadow-[inset_0_0_30px_rgba(139,92,246,0.08)]">
            <div className="mx-auto w-full max-w-2xl">
              <DiagramSVG diagram={lesson.diagram} />
            </div>
          </div>
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
        const startY = p.y + (boxH - totalHeight) / 2 + fontSize;
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

/* ═══════════ Tab bar ═══════════ */
const TAB_DEFS: {
  id: TabId;
  label: string;
  icon: typeof BookOpen;
  emoji: string;
  hue: string; // hex for the neon outline
  desc: string;
}[] = [
  { id: "lesson", label: "Lesson", icon: BookOpen, emoji: "📖", hue: "#a78bfa", desc: "Live teach" },
  { id: "formulas", label: "Formulas", icon: Calculator, emoji: "🧮", hue: "#22d3ee", desc: "Cheat sheet" },
  { id: "tips", label: "Tips", icon: Lightbulb, emoji: "💡", hue: "#fbbf24", desc: "Memory tricks" },
  { id: "code", label: "Code", icon: Code2, emoji: "💻", hue: "#34d399", desc: "Sandbox" },
  { id: "practice", label: "Practice", icon: FileText, emoji: "📝", hue: "#f472b6", desc: "Paper" },
];

/** Metro / subway gates row.  Five glass gates that slide "open" when active. */
function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="metro-gates flex items-stretch justify-between gap-1.5 rounded-2xl border border-purple-500/15 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-1.5 backdrop-blur-xl">
        {TAB_DEFS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-pressed={active}
              className={cn(
                "metro-gate group relative flex flex-1 select-none flex-col items-center justify-center overflow-hidden rounded-xl px-1 py-2 text-center transition-all duration-300",
                active
                  ? "metro-gate--open bg-black/40 text-white shadow-[inset_0_0_18px_rgba(0,0,0,0.5)]"
                  : "bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
              )}
              style={{
                boxShadow: active
                  ? `0 0 0 1px ${t.hue}55, 0 0 22px ${t.hue}44`
                  : undefined,
              }}
            >
              {/* sliding doors */}
              <span
                aria-hidden
                className="metro-door metro-door--l pointer-events-none absolute inset-y-0 left-0 w-1/2 origin-left"
                style={{
                  background: `linear-gradient(135deg, ${t.hue}33, transparent 70%)`,
                  borderRight: `1px solid ${t.hue}66`,
                }}
              />
              <span
                aria-hidden
                className="metro-door metro-door--r pointer-events-none absolute inset-y-0 right-0 w-1/2 origin-right"
                style={{
                  background: `linear-gradient(225deg, ${t.hue}33, transparent 70%)`,
                  borderLeft: `1px solid ${t.hue}66`,
                }}
              />
              {/* glyph */}
              <span
                className="relative z-10 text-xl leading-none transition-transform group-hover:scale-110"
                style={{ filter: active ? `drop-shadow(0 0 6px ${t.hue})` : undefined }}
              >
                {t.emoji}
              </span>
              <span
                className="relative z-10 mt-0.5 text-[10px] font-bold uppercase tracking-wider sm:text-[11px]"
                style={{ color: active ? t.hue : undefined }}
              >
                {t.label}
              </span>
              {active && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full" style={{ background: t.hue, boxShadow: `0 0 8px ${t.hue}` }} />
              )}
            </button>
          );
        })}
      </div>
      <style>{`
        .metro-gate { min-height: 56px; }
        .metro-door { transition: transform 320ms cubic-bezier(.7,.2,.2,1), opacity 320ms ease; }
        .metro-gate--open .metro-door--l { transform: translateX(-101%); opacity: 0; }
        .metro-gate--open .metro-door--r { transform: translateX(101%); opacity: 0; }
        .metro-gate:not(.metro-gate--open):hover .metro-door--l { transform: translateX(-15%); }
        .metro-gate:not(.metro-gate--open):hover .metro-door--r { transform: translateX(15%); }
      `}</style>
    </div>
  );
}

/* ═══════════ Shared helpers for new tabs ═══════════ */
function usePrefsOrNull() {
  return useMemo(() => getPrefs(), []);
}
function aiBase() {
  const ai = getAISettings();
  const prefs = getPrefs();
  return {
    model: ai.model,
    userApiKey: ai.geminiApiKey,
    name: prefs?.name || "learner",
    language: (prefs?.language as "english" | "hindi" | "both") || "english",
    subject: prefs?.subject || "science",
    level: prefs?.level || "high_school",
    topic: prefs?.topic || "everything",
  };
}

/* ═══════════ Formulas tab ═══════════ */
interface FormulaCard {
  formula: string;
  meaning: string;
  example: string;
}
function FormulasTab() {
  const prefs = usePrefsOrNull();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [cards, setCards] = useState<FormulaCard[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!prefs) return;
    const key = `studymate.formulas.v1:${prefs.subject}:${prefs.topic || "everything"}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        setCards(JSON.parse(cached));
        setStatus("done");
        return;
      }
    } catch {
      /* noop */
    }
    setStatus("loading");
    generateFormulas({ data: aiBase() })
      .then((r) => {
        setCards(r.cards || []);
        setStatus("done");
        try {
          localStorage.setItem(key, JSON.stringify(r.cards || []));
        } catch {
          /* noop */
        }
      })
      .catch(() => setStatus("error"));
  }, [prefs]);

  const copy = (text: string, i: number) => {
    void navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="h-full overflow-y-auto rounded-3xl border border-purple-500/15 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
          Formula Sheet
        </h2>
      </div>
      {status === "loading" && <SkeletonGrid />}
      {status === "error" && (
        <p className="text-sm text-red-300">Couldn't generate formulas. Try again later.</p>
      )}
      {status === "done" && cards.length === 0 && (
        <p className="text-sm text-slate-400">
          No formulas found for this topic — try a math or science subject.
        </p>
      )}
      {status === "done" && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div
              key={i}
              className="relative rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 animate-[fadeSlideUp_0.4s_ease-out_forwards]"
              style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
            >
              <button
                onClick={() => copy(c.formula, i)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-amber-300"
                aria-label="Copy formula"
              >
                {copied === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <div className="pr-8 font-mono text-2xl font-bold text-amber-300">{c.formula}</div>
              <div className="mt-2 text-sm text-slate-300">{c.meaning}</div>
              <div className="mt-1 text-xs italic text-slate-500">{c.example}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.02]"
        />
      ))}
    </div>
  );
}

/* ═══════════ Tips tab ═══════════ */
interface TipCard {
  title: string;
  tip: string;
  emoji: string;
}
function TipsTab() {
  const prefs = usePrefsOrNull();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [tips, setTips] = useState<TipCard[]>([]);

  useEffect(() => {
    if (!prefs) return;
    const key = `studymate.tips.v1:${prefs.subject}:${prefs.topic || "everything"}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        setTips(JSON.parse(cached));
        setStatus("done");
        return;
      }
    } catch {
      /* noop */
    }
    setStatus("loading");
    generateTips({ data: aiBase() })
      .then((r) => {
        setTips(r.tips || []);
        setStatus("done");
        try {
          localStorage.setItem(key, JSON.stringify(r.tips || []));
        } catch {
          /* noop */
        }
      })
      .catch(() => setStatus("error"));
  }, [prefs]);

  return (
    <div className="h-full overflow-y-auto rounded-3xl border border-purple-500/15 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-purple-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-purple-300">
          Tips & Tricks
        </h2>
      </div>
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cooking up clever tricks…
        </div>
      )}
      {status === "error" && (
        <p className="text-sm text-red-300">Couldn't generate tips. Try again later.</p>
      )}
      {status === "done" && (
        <div className="space-y-3">
          {tips.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.03] p-4 animate-[fadeSlideUp_0.4s_ease-out_forwards]"
              style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-500/20 text-xl">
                {t.emoji || "💡"}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-100">{t.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-300">{t.tip}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════ Code Sandbox tab ═══════════ */
function CodeTab() {
  const prefs = usePrefsOrNull();
  const isTech = prefs?.subject === "technology";
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isTech || loaded) return;
    setLoaded(true);
    generateStarterCode({ data: aiBase() })
      .then((r) => setCode(r.code || "# start coding here\n"))
      .catch(() => setCode("# couldn't load a starter snippet\n"));
  }, [isTech, loaded]);

  const callAI = async (instruction: string) => {
    setRunning(true);
    setOutput("");
    try {
      const ai = getAISettings();
      const res = await fetch("/api/chalkboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `${instruction}\n\nCode:\n\`\`\`\n${code}\n\`\`\``,
          language: prefs?.language || "english",
          mode: "direct",
          model: ai.model,
          userApiKey: ai.geminiApiKey,
          isCalculation: true,
        }),
      });
      if (!res.ok || !res.body) throw new Error("ai failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        setOutput(buf.replace(/^EXPLANATION:\s*/im, "").replace(/\nEND\s*$/i, ""));
      }
    } catch {
      setOutput("Couldn't reach the AI. Try again.");
    } finally {
      setRunning(false);
    }
  };

  if (!isTech) {
    return (
      <div className="grid h-full place-items-center rounded-3xl border border-purple-500/15 bg-white/[0.02] p-6 text-center">
        <div>
          <Code2 className="mx-auto h-10 w-10 text-purple-400/60" />
          <p className="mt-3 text-sm text-slate-300">
            Code Sandbox is available for <b>Technology</b> topics.
          </p>
          <p className="mt-1 text-xs text-slate-500">Go to Settings to switch your subject.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-3xl border border-purple-500/15 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-emerald-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
          Code Sandbox
        </h2>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full resize-none rounded-2xl border border-purple-500/20 bg-[#0d1b2e] p-4 font-mono text-sm leading-relaxed text-emerald-300 focus:border-purple-400/40 focus:outline-none"
        placeholder="# starter code will appear here…"
      />
      <div className="flex gap-2">
        <Button
          onClick={() => callAI("Review this code snippet and explain what it does, any bugs, and one improvement suggestion. Be brief and friendly.")}
          disabled={running || !code.trim()}
          className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:opacity-95"
        >
          ▶ AI Review
        </Button>
        <Button
          onClick={() => callAI("Give one short helpful hint for improving or continuing this code. One sentence only.")}
          disabled={running || !code.trim()}
          variant="outline"
          className="flex-1 border-purple-500/30 bg-white/[0.04] text-slate-200 hover:bg-white/10"
        >
          💡 Get Hint
        </Button>
      </div>
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
          AI Code Review
        </div>
        <div className="mt-2 min-h-[80px] whitespace-pre-wrap font-mono text-sm text-emerald-200">
          {output || (running ? "…" : "Run AI Review to see feedback.")}
          {running && <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-emerald-300" />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Practice Paper tab ═══════════ */
interface PaperQuestion {
  id?: string;
  number: number;
  text: string;
  marks: number;
  type: string;
  options?: string[];
  answerIndex?: number;
  answer?: string;
}
function PracticeTab() {
  const prefs = usePrefsOrNull();
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [topic, setTopic] = useState(prefs?.topic || "");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState<5 | 10 | 15>(10);
  const [types, setTypes] = useState<string[]>(["MCQ"]);
  const [loading, setLoading] = useState(false);
  const [paper, setPaper] = useState<{ title: string; questions: PaperQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [revealed, setRevealed] = useState(false);

  const toggleType = (t: string) =>
    setTypes((cur) =>
      cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t],
    );

  const generate = async () => {
    if (!prefs) return;
    setLoading(true);
    setPaper(null);
    setAnswers({});
    setRevealed(false);
    try {
      const r = await generatePracticePaper({
        data: { ...aiBase(), topic: topic || prefs.topic, difficulty, count, types },
      });
      setPaper(r);
    } catch {
      setPaper({ title: "Error", questions: [] });
    } finally {
      setLoading(false);
    }
  };

  const onUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      alert("PDFs aren't supported yet — please upload a clear photo or screenshot of the paper.");
      return;
    }
    setLoading(true);
    setPaper(null);
    setAnswers({});
    setRevealed(false);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const r = String(fr.result || "");
          resolve(r.split(",")[1] || "");
        };
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const r = await extractPaperFromImage({
        data: { ...aiBase(), imageBase64: base64, mimeType: file.type },
      });
      setPaper({
        title: r.title,
        questions: r.questions.map((q, i) => ({ ...q, id: `q${i + 1}` })),
      });
    } catch {
      setPaper({ title: "Couldn't read your paper", questions: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto rounded-3xl border border-purple-500/15 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-purple-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-purple-300">
            Practice Paper
          </h2>
        </div>
        <div className="flex gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5 text-xs">
          {(["generate", "upload"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full px-3 py-1 transition",
                mode === m
                  ? "bg-gradient-to-r from-purple-600 to-purple-400 text-white"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {m === "generate" ? "Generate" : "Upload"}
            </button>
          ))}
        </div>
      </div>

      {!paper && mode === "generate" && (
        <div className="space-y-4 rounded-2xl border border-purple-500/15 bg-white/[0.03] p-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Topic
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-xl border border-purple-500/15 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-purple-400/40 focus:outline-none"
              placeholder="e.g. Photosynthesis"
            />
          </div>
          <PillRow
            label="Difficulty"
            options={["easy", "medium", "hard"]}
            value={difficulty}
            onChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}
          />
          <PillRow
            label="Questions"
            options={["5", "10", "15"]}
            value={String(count)}
            onChange={(v) => setCount(Number(v) as 5 | 10 | 15)}
          />
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Types (pick at least one)
            </div>
            <div className="flex flex-wrap gap-2">
              {["MCQ", "Short Answer", "Long Answer"].map((t) => {
                const on = types.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition",
                      on
                        ? "border-purple-400/40 bg-purple-500/20 text-purple-100"
                        : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-slate-200",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <Button
            onClick={generate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:opacity-95"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate Paper ✨
          </Button>
        </div>
      )}

      {!paper && mode === "upload" && (
        <UploadZone loading={loading} onFile={onUpload} />
      )}

      {paper && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="hand text-2xl text-amber-300">{paper.title || "Practice Paper"}</div>
              <div className="text-xs text-slate-500">
                {paper.questions.length} questions · {difficulty}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPaper(null);
                setAnswers({});
                setRevealed(false);
              }}
              className="border-purple-500/30 bg-white/[0.04] text-slate-200 hover:bg-white/10"
            >
              New
            </Button>
          </div>
          {paper.questions.map((q, i) => {
            const qid = q.id || `q${i + 1}`;
            return (
              <div
                key={qid}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 animate-[fadeSlideUp_0.3s_ease-out_forwards]"
                style={{ animationDelay: `${i * 40}ms`, opacity: 0 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-200">
                      {q.number || i + 1}
                    </div>
                    <div className="text-sm text-slate-100">{q.text}</div>
                  </div>
                  <div className="shrink-0 text-xs font-semibold text-amber-300">
                    {q.marks ? `[${q.marks}]` : ""}
                  </div>
                </div>
                {q.type === "MCQ" && q.options && (
                  <div className="mt-3 grid gap-2 pl-10">
                    {q.options.map((opt, oi) => {
                      const selected = answers[qid] === oi;
                      const correct = revealed && q.answerIndex === oi;
                      const wrong = revealed && selected && q.answerIndex !== oi;
                      return (
                        <button
                          key={oi}
                          onClick={() => !revealed && setAnswers({ ...answers, [qid]: oi })}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-left text-sm transition",
                            correct
                              ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                              : wrong
                                ? "border-red-400/60 bg-red-500/20 text-red-100"
                                : selected
                                  ? "border-purple-400/40 bg-purple-500/20 text-purple-100"
                                  : "border-white/[0.06] bg-white/[0.03] text-slate-300 hover:border-purple-500/30",
                          )}
                        >
                          {String.fromCharCode(65 + oi)}. {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.type !== "MCQ" && (
                  <div className="mt-3 pl-10">
                    <textarea
                      value={(answers[qid] as string) || ""}
                      onChange={(e) => setAnswers({ ...answers, [qid]: e.target.value })}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-slate-100 focus:border-purple-400/40 focus:outline-none"
                      placeholder="Write your answer…"
                    />
                    {revealed && q.answer && (
                      <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs text-emerald-100">
                        <div className="mb-1 font-bold text-emerald-300">Model answer</div>
                        {q.answer}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {paper.questions.length > 0 && (
            <div className="sticky bottom-0 bg-gradient-to-t from-[#060d1a] to-transparent pb-2 pt-3">
              <Button
                onClick={() => setRevealed((r) => !r)}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:opacity-95"
              >
                {revealed ? "Hide Answers" : "Check Answers"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PillRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 rounded-full border px-3 py-1.5 text-xs capitalize transition",
              value === o
                ? "border-purple-400/40 bg-purple-500/20 text-purple-100"
                : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-slate-200",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadZone({
  loading,
  onFile,
}: {
  loading: boolean;
  onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition",
        drag
          ? "border-purple-400/60 bg-purple-500/[0.08]"
          : "border-purple-500/30 bg-purple-500/[0.03] hover:bg-purple-500/[0.06]",
      )}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-2 text-slate-300">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div className="text-sm">Reading your paper…</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-300">
          <Upload className="h-8 w-8 text-purple-300" />
          <div className="text-sm">Drop an image of your question paper</div>
          <div className="text-xs text-slate-500">PNG, JPG, or screenshot</div>
        </div>
      )}
    </label>
  );
}
