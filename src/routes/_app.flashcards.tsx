import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { generateFlashcards } from "@/lib/ai.functions";
import { addXP, awardBadge, getAISettings, getCached, getPrefs, setCached } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/flashcards")({
  head: () => ({ meta: [{ title: "Flashcards — StudyMate AI" }] }),
  component: FlashcardsPage,
});

interface Card {
  front: string;
  back: string;
}

function FlashcardsPage() {
  const navigate = useNavigate();
  const prefs = getPrefs();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knew, setKnew] = useState(0);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  const cacheKey = prefs
    ? `cards:${prefs.subject}:${prefs.topic}:${prefs.language}:${prefs.level}`
    : "";

  const load = async (force = false) => {
    if (!prefs) return;
    setError(null);
    setIdx(0);
    setFlipped(false);
    setKnew(0);
    setReviewed(new Set());
    setDone(false);
    if (!force) {
      const cached = getCached<{ cards: Card[] }>(cacheKey);
      if (cached) {
        setCards(cached.cards);
        return;
      }
    }
    setLoading(true);
    try {
      const settings = getAISettings();
      const res = (await generateFlashcards({
        data: {
          model: settings.model,
          userApiKey: settings.geminiApiKey,
          name: prefs.name,
          language: prefs.language,
          subject: prefs.subject,
          level: prefs.level,
          topic: prefs.topic,
        },
      })) as { cards: Card[] };
      setCards(res.cards);
      setCached(cacheKey, res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!prefs) return null;

  const goto = (delta: number, knewIt?: boolean) => {
    if (knewIt !== undefined) {
      setReviewed((s) => new Set(s).add(idx));
      if (knewIt) setKnew((k) => k + 1);
    }
    const next = idx + delta;
    if (next >= cards.length) {
      setDone(true);
      addXP(15 + knew * 2);
      awardBadge(`🃏 Cards: ${prefs.topic}`);
      window.dispatchEvent(new Event("studymate:progress"));
      return;
    }
    if (next < 0) return;
    setIdx(next);
    setFlipped(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.03] backdrop-blur-xl p-12 text-slate-400 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" /> Making your flashcards…
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
    return (
      <div className="space-y-4 animate-pop">
        <div className="rounded-3xl bg-gradient-to-br from-purple-900/80 via-amber-900/20 to-[#0a1628] border border-purple-500/20 p-6 text-center text-white shadow-[0_0_40px_rgba(139,92,246,0.15)]">
          <div className="text-6xl drop-shadow-[0_0_20px_rgba(245,158,11,0.4)]">🎉</div>
          <h2 className="mt-3 text-2xl font-bold text-amber-400">All done!</h2>
          <p className="mt-1 text-slate-200">
            You knew{" "}
            <strong>
              {knew}/{cards.length}
            </strong>{" "}
            cards
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate({ to: "/quiz" })}
            className="rounded-full bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
          >
            Retry Quiz →
          </button>
          <button
            onClick={() => load(true)}
            className="flex items-center justify-center gap-1 rounded-full border border-purple-500/20 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-300 hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-4 w-4" /> New cards
          </button>
        </div>
      </div>
    );
  }

  const card = cards[idx];
  if (!card) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          Card {idx + 1} of {cards.length}
        </span>
        <span className="font-semibold text-emerald-400">{knew} known</span>
      </div>

      {/* Custom progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-all duration-500"
          style={{ width: `${(reviewed.size / cards.length) * 100}%` }}
        />
      </div>

      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative h-72 cursor-pointer select-none"
        style={{ perspective: 1200 }}
      >
        <div
          className="absolute inset-0 transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-purple-900/60 to-[#0a1628] border border-purple-500/20 p-6 text-center text-white shadow-[0_0_40px_rgba(139,92,246,0.2)]"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-xs uppercase tracking-wider text-purple-400/80">Question</div>
            <p className="mt-3 text-xl font-bold leading-snug text-slate-100">{card.front}</p>
            <div className="mt-6 text-xs text-slate-500">Tap to flip 🔄</div>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-[#0a1628] border border-amber-500/20 p-6 text-center shadow-[0_0_20px_rgba(245,158,11,0.1)]"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div className="text-xs uppercase tracking-wider text-amber-400/80">Answer</div>
            <p className="mt-3 text-lg leading-snug text-slate-200">{card.back}</p>
            <div className="mt-6 text-xs text-slate-500">Tap to flip back</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => goto(-1)}
          disabled={idx === 0}
          className="rounded-full border border-purple-500/20 bg-white/[0.04] p-2.5 text-purple-400 transition-all duration-300 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => goto(1, false)}
          className="flex-1 rounded-full border border-red-500/30 bg-red-500/[0.06] py-2.5 text-sm font-medium text-red-400 transition-all duration-300 hover:bg-red-500/[0.12]"
        >
          Didn't know
        </button>
        <button
          onClick={() => goto(1, true)}
          className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 py-2.5 text-sm font-medium text-slate-900 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,158,11,0.5)]"
        >
          Knew it ✓
        </button>
        <button
          onClick={() => goto(1)}
          className="rounded-full border border-purple-500/20 bg-white/[0.04] p-2.5 text-purple-400 transition-all duration-300 hover:bg-white/[0.08]"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
