import { useEffect, useState } from "react";

/**
 * Load all available SpeechSynthesis voices and keep the list fresh
 * (the voiceschanged event fires asynchronously in most browsers).
 */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);
  return voices;
}

/**
 * Pick the best available voice for the given language and gender preference.
 * Falls back gracefully through: same-lang high-quality → same-lang any → all voices.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: "en" | "hi",
  gender: "female" | "male" = "female",
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const langPrefix = lang === "hi" ? "hi" : "en";
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const list = pool.length ? pool : voices;

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes("google")) s += 100;
    else if (n.includes("microsoft")) s += 80;
    if (n.includes("natural") || n.includes("neural")) s += 50;
    if (gender === "female" && /female|aria|jenny|samantha|zira|priya|neerja|swara/i.test(n))
      s += 20;
    if (gender === "male" && /male|david|alex|ravi|guy|matthew/i.test(n)) s += 20;
    if (v.localService) s += 5;
    return s;
  };

  return [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
}
