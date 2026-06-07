/** Legacy step type — kept for backwards compatibility but no longer generated. */
export interface AnimationStep {
  text: string;
  type: "box" | "arrow" | "text" | "equation";
  duration: number; // seconds
  position: "left" | "center" | "right";
}

export interface LessonSection {
  heading: string;
  body: string;
  type?: "concept" | "application" | "mistakes" | "challenge";
}

/* ─── Scene player types ─── */

export interface InteractiveQuestion {
  question: string;
  choices: [string, string, string, string]; // always 4
  answerIndex: 0 | 1 | 2 | 3;
  hint: string; // shown on wrong answer
}

export interface SceneStep {
  /** Short text displayed prominently on the canvas (also word-highlighted). */
  on_screen_text: string;
  /** What Shiksha says out loud for this step. */
  voiceover_script: string;
  /**
   * Raw inline SVG string (<svg ...>…</svg>).
   * If empty or null the player falls back to a chalk text animation.
   */
  svg_doodle: string | null;
  /** How long this step should play in seconds (excluding voice). */
  duration: number;
}

export interface LessonScene {
  /** One-sentence setup that frames the analogy for the whole scene. */
  analogy_context: string;
  steps: SceneStep[];
  /** Shown after the last step finishes. */
  interactive_question: InteractiveQuestion;
}

export interface EnrichedLesson {
  title: string;
  intro: string;
  sections: LessonSection[];
  keyTakeaways: string[];
  funFact: string;
  scene: LessonScene;
}
