/*
 * THE WORKED-EXAMPLE PLAYER'S SLIDES AND WORDS (WE-A).
 *
 * The part of examplePlayer.js the player itself draws from: an example as
 * slides, and the sentences around them. It imports nothing, on purpose. The
 * player is a chunk of its own (WorkedExamplePlayer.jsx), and the rules in
 * examplePlayer.js reach the question families and their mathematics; had the
 * player imported those, the build would have shared them out between the
 * question's chunk and the player's, and some of that reaches the first load
 * (scripts/check-first-load-budget.mjs). For the same reason nothing in the
 * question's chunk imports this module: only the player does.
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/** A step as { show, why }: a built-in step is its sentence, with no separate why. */
export const stepOf = (step) => (isObject(step)
  ? { show: text(step.show), why: text(step.why) }
  : { show: text(step), why: '' });

/* ---------------------------------------------------------------- the slides */

export const EXAMPLE_SLIDE = Object.freeze({ PROBLEM: 'problem', STEP: 'step', ANSWER: 'answer' });
export const EXAMPLE_PROBLEM_NOTE = 'This problem is like yours, with different numbers. Go through each step, then do yours.';
export const EXAMPLE_YOUR_TURN_TEXT = 'Your question uses different numbers — use the same steps on it.';
export const EXAMPLE_YOUR_TURN_LABEL = 'Your turn';
export const EXAMPLE_OPENED_BY_ITSELF_TEXT = 'New skill. Here is one like it, worked step by step, before you start yours.';

/**
 * The example as slides, one move each: the problem (with a line on what to
 * do with it), each step with its why, and the answer. The last slide carries "Your turn". A step card ends on its
 * own last step, so it gets no separate answer slide.
 */
export const exampleSlides = (example) => {
  if (!isObject(example)) return [];
  const prompt = text(example.prompt);
  const steps = list(example.steps).map(stepOf).filter((step) => step.show);
  if (!prompt || !steps.length) return [];
  const slides = [{ kind: EXAMPLE_SLIDE.PROBLEM, label: 'The problem', show: prompt, why: '', note: EXAMPLE_PROBLEM_NOTE }];
  steps.forEach((step, index) => {
    slides.push({ kind: EXAMPLE_SLIDE.STEP, label: `Step ${index + 1} of ${steps.length}`, show: step.show, why: step.why });
  });
  const answer = text(example.answer);
  if (answer && example.source !== 'authored') slides.push({ kind: EXAMPLE_SLIDE.ANSWER, label: 'The answer', show: answer, why: '' });
  return slides.map((slide, index) => ({ ...slide, index, last: index === slides.length - 1 }));
};

/** The slide a move lands on: never before the first or past the last. */
export const exampleSlideAt = (slides, index) => {
  const count = list(slides).length;
  if (!count) return 0;
  return Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), count - 1);
};

/** What Read aloud and Translate are given for a slide: its move, then its why. */
export const slideReadingText = (slide) => {
  if (!isObject(slide)) return '';
  const closed = (value) => (/[.!?:]$/.test(value) ? value : `${value}.`);
  return [
    closed(slide.label),
    slide.kind === EXAMPLE_SLIDE.ANSWER ? `Answer: ${slide.show}` : slide.show,
    slide.why ? `Why: ${slide.why}` : '',
    slide.note || '',
    slide.last ? EXAMPLE_YOUR_TURN_TEXT : '',
  ].filter(Boolean).join(' ');
};

/**
 * What Translate is given for a slide: the example's own sentence, as the
 * language pack knows it (the prompt, a step, "Answer: …"), with a lesson's
 * why after it. The player's labels are not part of it.
 */
export const slideTranslationText = (slide) => {
  if (!isObject(slide)) return '';
  return [
    slide.kind === EXAMPLE_SLIDE.ANSWER ? `Answer: ${slide.show}` : slide.show,
    slide.kind === EXAMPLE_SLIDE.STEP ? slide.why : '',
  ].filter(Boolean).join(' ');
};
