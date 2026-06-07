import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  MessageCircle,
  Send,
  X,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAISettings, getChat, getPrefs, setChat } from "@/lib/storage";
import { pickVoice, useVoices } from "@/lib/voice";

/* ------------------- Whiteboard with word-by-word reveal ------------------- */
function Whiteboard({
  text,
  voiceLang,
  enabled,
  onDone,
}: {
  text: string;
  voiceLang: "en" | "hi";
  enabled: boolean;
  onDone?: () => void;
}) {
  const voices = useVoices();
  const [revealedCount, setRevealedCount] = useState(0);
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setRevealedCount(0);
    if (!text) return;
    if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setRevealedCount(words.length);
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voices, voiceLang);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = voiceLang === "hi" ? "hi-IN" : "en-US";
    }
    u.rate = 0.85;
    u.pitch = 1.05;
    u.volume = 1;

    const starts: number[] = [];
    {
      let i = 0;
      for (const w of words) {
        const idx = text.indexOf(w, i);
        starts.push(idx);
        i = idx + w.length;
      }
    }

    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name && e.name !== "word") return;
      const ci = e.charIndex;
      let n = 0;
      for (let k = 0; k < starts.length; k++) {
        if (starts[k] <= ci) n = k + 1;
        else break;
      }
      setRevealedCount((prev) => Math.max(prev, n));
    };
    u.onend = () => {
      setRevealedCount(words.length);
      onDone?.();
    };
    u.onerror = () => {
      setRevealedCount(words.length);
      onDone?.();
    };

    utterRef.current = u;
    const t = setTimeout(() => window.speechSynthesis.speak(u), 60);
    return () => {
      clearTimeout(t);
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, voices.length, voiceLang]);

  useEffect(() => {
    if (!text || !enabled) return;
    const totalMs = Math.max(1500, words.length * 320);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const expected = Math.min(words.length, Math.floor((elapsed / totalMs) * words.length));
      setRevealedCount((prev) => (prev < expected ? expected : prev));
      if (elapsed >= totalMs) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [text, enabled, words.length]);

  return (
    <div className="font-caveat text-2xl leading-snug text-slate-200">
      {words.map((w, i) => (
        <span
          key={i}
          className="board-word"
          style={{
            visibility: i < revealedCount ? "visible" : "hidden",
            animationDelay: "0s",
          }}
        >
          {w}{" "}
        </span>
      ))}
      {revealedCount < words.length && (
        <span className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-purple-400 align-middle" />
      )}
    </div>
  );
}

/* ------------------- Mic input ------------------- */
function useSpeechRecognition(lang: string, onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const supported =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!supported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      onResult(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  }, [lang, onResult, supported]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  return { listening, start, stop, supported: !!supported };
}

/* ------------------- Main component ------------------- */
export function AITutor() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefs = getPrefs();
  const settings = getAISettings();

  const voiceLang: "en" | "hi" =
    prefs?.language === "hindi" || prefs?.language === "both" ? "hi" : "en";
  const recogLang = voiceLang === "hi" ? "hi-IN" : "en-US";

  const initialMessages = useMemo(() => {
    if (typeof window === "undefined") return [];
    return getChat().map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text" as const, text: m.content }],
    }));
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          model: settings.model,
          userApiKey: settings.geminiApiKey,
          context: prefs
            ? {
                name: prefs.name,
                language: prefs.language,
                level: prefs.level,
                subject: prefs.subject,
                topic: prefs.topic,
              }
            : undefined,
        }),
      }),
    [
      settings.model,
      settings.geminiApiKey,
      prefs?.name,
      prefs?.language,
      prefs?.level,
      prefs?.subject,
      prefs?.topic,
    ],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    messages: initialMessages as never,
  });

  useEffect(() => {
    if (messages.length === 0) return;
    const flat = messages.map((m) => {
      const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
      return { id: m.id, role: m.role as "user" | "assistant", content: text, ts: Date.now() };
    });
    setChat(flat);
  }, [messages]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, open]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ question?: string }>).detail;
      setOpen(true);
      if (detail?.question) setTimeout(() => sendMessage({ text: detail.question! }), 200);
    };
    window.addEventListener("studymate:tutor", handler as EventListener);
    return () => window.removeEventListener("studymate:tutor", handler as EventListener);
  }, [sendMessage]);

  const submit = (override?: string) => {
    const v = (override ?? input).trim();
    if (!v) return;
    setInput("");
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    sendMessage({ text: v });
  };

  const mic = useSpeechRecognition(recogLang, (t) => submit(t));

  const isLoading = status === "submitted" || status === "streaming";

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        const text = messages[i].parts.map((p) => (p.type === "text" ? p.text : "")).join("");
        return { id: messages[i].id, text };
      }
    }
    return null;
  }, [messages]);

  return (
    <>
      <button
        aria-label="Open AI Tutor"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-transform hover:scale-110 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#060d1a] border-purple-500/15 animate-[fadeSlideUp_0.35s_ease-out_forwards] sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[640px] sm:w-[760px] sm:rounded-3xl sm:border sm:border-purple-500/15 sm:shadow-[0_0_40px_rgba(139,92,246,0.15)] sm:overflow-hidden font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-purple-500/15 bg-[#0a1628]/85 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="text-2xl drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">👩‍🏫</div>
              <div>
                <div className="text-sm font-bold text-slate-100">Shiksha — AI Tutor</div>
                <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">
                  Real classroom feel
                </div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:text-purple-400 hover:bg-white/[0.04]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
            {/* Whiteboard */}
            <div className="flex-1 overflow-hidden bg-white/[0.02] p-3">
              <div className="relative h-full overflow-y-auto rounded-2xl border border-purple-500/20 bg-[#0a1628]/95 p-5 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]">
                <div className="absolute right-3 top-2 font-caveat text-sm text-purple-400/70">
                  Shiksha's board
                </div>
                {!latestAssistant && !isLoading && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="text-5xl drop-shadow-[0_0_20px_rgba(168,85,247,0.4)] animate-bounce">
                      🦉
                    </div>
                    <p className="mt-4 font-caveat text-2xl text-slate-300">
                      Hi {prefs?.name || "friend"}! Ask me anything.
                    </p>
                  </div>
                )}
                {isLoading && !latestAssistant && (
                  <div className="flex h-full items-center justify-center font-caveat text-2xl text-slate-400 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                    Thinking…
                  </div>
                )}
                {latestAssistant && (
                  <Whiteboard
                    key={latestAssistant.id + ":" + latestAssistant.text.length}
                    text={latestAssistant.text}
                    voiceLang={voiceLang}
                    enabled={voiceOn}
                  />
                )}
              </div>
            </div>

            {/* Chat list (side pane) */}
            <div className="flex h-48 flex-col border-t border-purple-500/15 sm:h-auto sm:w-72 sm:border-l sm:border-t-0 bg-[#070e1b]">
              <div className="flex items-center justify-between border-b border-purple-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Conversation</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setVoiceOn((v) => !v)}
                    className="rounded-full p-1 hover:bg-white/[0.05] hover:text-purple-400"
                    title={voiceOn ? "Mute voice" : "Unmute voice"}
                  >
                    {voiceOn ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setMessages([]);
                      setChat([]);
                      if (typeof window !== "undefined" && "speechSynthesis" in window) {
                        window.speechSynthesis.cancel();
                      }
                    }}
                    className="rounded-full p-1 hover:bg-white/[0.05] hover:text-purple-400"
                    title="Clear history"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
                {messages.length === 0 && (
                  <div className="text-center text-xs text-slate-500 mt-4">
                    Chat history is empty
                  </div>
                )}
                {messages.map((m) => {
                  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                          m.role === "user"
                            ? "bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_10px_rgba(139,92,246,0.25)]"
                            : "border border-purple-500/15 bg-white/[0.04] text-slate-200",
                        )}
                      >
                        <div className="whitespace-pre-wrap">{text}</div>
                      </div>
                    </div>
                  );
                })}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-purple-500/15 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping" />
                      typing…
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-purple-500/15 bg-[#0a1628]/50 p-3">
            <div className="flex items-end gap-2">
              {mic.supported && (
                <Button
                  type="button"
                  onClick={() => (mic.listening ? mic.stop() : mic.start())}
                  size="icon"
                  variant={mic.listening ? "default" : "outline"}
                  className={cn(
                    "h-10 w-10 shrink-0 rounded-full border-purple-500/20 bg-white/[0.04] text-purple-400",
                    mic.listening &&
                      "animate-pulse bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] border-transparent",
                  )}
                  aria-label="Voice input"
                >
                  {mic.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={mic.listening ? "Listening…" : "Ask Shiksha anything…"}
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-purple-500/15 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 focus:border-purple-500/40"
              />
              <Button
                onClick={() => submit()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-r from-purple-600 to-purple-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function openTutor(question?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("studymate:tutor", { detail: { question } }));
}
