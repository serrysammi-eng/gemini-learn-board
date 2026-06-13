import {
  fetchKhanAcademy,
  fetchOpenStax,
  fetchWikipedia,
} from "./study-sources.server";

export interface RagContext {
  context: string;
  imageUrl: string | null;
}

/**
 * Pull factual reference material from public educational sources in parallel.
 * The returned `context` string is fed into the AI system prompt as raw reference;
 * it must never be shown to the end user.
 */
export async function buildRagContext(args: {
  topic: string;
  subject?: string;
  level?: string;
  language?: string;
}): Promise<RagContext> {
  const topic = (args.topic || args.subject || "").trim();
  if (!topic) return { context: "", imageUrl: null };

  const [wiki, openstax, khan] = await Promise.all([
    fetchWikipedia(topic).catch(() => null),
    fetchOpenStax(topic).catch(() => null),
    fetchKhanAcademy(topic).catch(() => null),
  ]);

  const chunks: string[] = [];
  if (wiki?.text) chunks.push(`[Wikipedia]\n${wiki.text}`);
  if (openstax) chunks.push(`[OpenStax]\n${openstax}`);
  if (khan) chunks.push(`[Khan Academy]\n${khan}`);

  return {
    context: chunks.join("\n\n").slice(0, 6000),
    imageUrl: wiki?.imageUrl ?? null,
  };
}

export function ragSystemSuffix(
  context: string,
  level: string,
  language: string,
): string {
  if (!context) return "";
  return `\n\nYou have been given raw reference material from trusted educational sources below. Do NOT copy, quote, or paste it directly into your response. Use it only as a factual reference to ensure accuracy. Rewrite everything completely in your own words, tailored to a ${level} student in ${language}. Use simple real-life examples from cricket, food, or daily life. The student should never feel like they are reading a textbook.\n\nReference material:\n${context}`;
}
