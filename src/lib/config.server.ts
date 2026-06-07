import process from "node:process";

/**
 * Legacy export kept for backwards compatibility. The app no longer requires
 * a YouTube API key — we now generate visual references with Pollinations
 * (no API key required). Anything still importing this just gets `undefined`.
 */
export const youtubeApiKey = process.env.YOUTUBE_API_KEY;

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
  };
}
