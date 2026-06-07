import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { getPrefs } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const prefs = getPrefs();
    const timer = setTimeout(() => {
      navigate({ to: prefs ? "/learn" : "/onboarding", replace: true });
    }, 2200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060d1a] overflow-hidden relative">
      {/* Ambient background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.12), transparent 60%), radial-gradient(ellipse at 30% 70%, rgba(245,158,11,0.05), transparent 50%)",
        }}
      />

      {/* Animated concentric rings */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border border-purple-500/20"
          style={{
            width: 200,
            height: 200,
            animation: `ringExpand 3s ease-out ${i * 0.8}s infinite`,
            opacity: 0,
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 text-center">
        {/* Glowing owl */}
        <div
          className="text-6xl animate-float mx-auto"
          style={{
            filter:
              "drop-shadow(0 0 30px rgba(139,92,246,0.5)) drop-shadow(0 0 60px rgba(139,92,246,0.2))",
          }}
        >
          🦉
        </div>

        {/* Logo text with shimmer */}
        <h1
          className="mt-6 text-4xl font-bold animate-scale-glow"
          style={{
            background: "linear-gradient(135deg, #a78bfa, #8b5cf6, #f59e0b)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          StudyMate AI
        </h1>
        <p
          className="mt-2 text-sm text-slate-400 animate-slide-up"
          style={{ animationDelay: "0.3s" }}
        >
          Learn anything, your way ✨
        </p>

        {/* Loading dots */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-purple-500"
              style={{
                animation: "glowPulse 1.4s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
