import confetti from "canvas-confetti";

export function celebrate() {
  if (typeof window === "undefined") return;
  const duration = 1500;
  const end = Date.now() + duration;
  const colors = ["#9b6cf0", "#ec4899", "#22d3ee", "#facc15"];
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
