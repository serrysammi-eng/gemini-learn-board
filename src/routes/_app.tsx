import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Brain,
  Gamepad2,
  Layers,
  Map as MapIcon,
  Settings,
  Flame,
  Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AITutor } from "@/components/AITutor";
import { cn } from "@/lib/utils";
import { ensureRoadmap } from "@/lib/roadmap";
import { getPrefs, getProgress } from "@/lib/storage";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TABS = [
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/roadmap", label: "Roadmap", icon: MapIcon },
  { to: "/quiz", label: "Quiz", icon: Brain },
  { to: "/flashcards", label: "Cards", icon: Layers },
  { to: "/game", label: "Game", icon: Gamepad2 },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const prefs = getPrefs();
    if (!prefs) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    // Kick off roadmap + image pre-generation in the background so the
    // Roadmap tab feels instant when the user opens it. Fire-and-forget.
    void ensureRoadmap(prefs).catch(() => {
      /* network errors are surfaced inside the Roadmap page itself */
    });
  }, [navigate]);

  // Re-render on focus to refresh XP/streak shown in header
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    window.addEventListener("studymate:progress", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("studymate:progress", onFocus);
    };
  }, []);

  const prefs = getPrefs();
  const progress = getProgress();

  // hide bottom nav from settings if you want; keep it for consistency
  void tick;

  if (!prefs) return null;

  return (
    <div className="min-h-screen bg-[#060d1a] pb-24">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.06), transparent 50%), radial-gradient(ellipse at 80% 90%, rgba(245,158,11,0.03), transparent 50%)",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-purple-500/10 bg-[#060d1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/learn" className="flex items-center gap-2 group">
            <span
              className="text-2xl transition-transform group-hover:scale-110"
              style={{
                filter: "drop-shadow(0 0 8px rgba(139,92,246,0.4))",
              }}
            >
              🦉
            </span>
            <div className="text-sm">
              <div
                className="font-bold leading-tight"
                style={{
                  background: "linear-gradient(135deg, #a78bfa, #8b5cf6)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                StudyMate
              </div>
              <div className="text-xs text-slate-500 leading-tight">Hi, {prefs.name}!</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-3 py-1 text-sm font-bold text-amber-400">
              <Flame className="h-4 w-4" />
              <span>{progress.streak}</span>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/[0.08] px-3 py-1 text-sm font-bold text-purple-400">
              <Trophy className="h-4 w-4" />
              <span>{progress.xp}</span>
            </div>
            <Link
              to="/settings"
              className="rounded-full p-2 text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-4 py-5">
        <Outlet />
      </main>

      {/* Floating AI Tutor */}
      <AITutor />

      {/* Bottom Nav — Glassmorphic */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-purple-500/10 bg-[#060d1a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
          {TABS.map((t, i) => {
            const active = location.pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-xs font-medium transition-all duration-300",
                  active ? "text-purple-400" : "text-slate-500 hover:text-slate-300",
                )}
                style={{
                  opacity: 0,
                  animation: `fadeSlideUp 0.4s ease-out ${i * 60}ms forwards`,
                }}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-300",
                    active && "scale-110 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]",
                  )}
                />
                <span>{t.label}</span>
                {active && (
                  <span className="h-1 w-4 rounded-full bg-gradient-to-r from-purple-500 to-purple-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
