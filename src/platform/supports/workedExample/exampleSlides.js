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

/**
 * A step as { show, why }: a built-in step is its sentence, with no separate
 * why. A tool replay's step also carries its `board`: the same move as the
 * lines the tool's engine gave for it (stepAlgebraReplay.js, WE-C).
 */
export const stepOf = (step) => (isObject(step)
  ? {
    show: text(step.show),
    why: text(step.why),
    ...(isObject(step.board) ? { board: step.board } : {}),
    // A step of another skill's own slides (the factoring inside a radical
    // equation, radicalReplay.js), and the step as it reads without them.
    ...(isObject(step.subSkill) ? { subSkill: step.subSkill } : {}),
    ...(isObject(step.alone) ? { alone: step.alone } : {}),
  }
  : { show: text(step), why: '' });

/* ---------------------------------------------------------------- the slides */

// How a step that uses another skill is played (examplePlayer.js exampleSectionRule).
export const EXAMPLE_SUB_SKILL_MODE = Object.freeze({ IN_SEQUENCE: 'inSequence', ON_REQUEST: 'onRequest' });
export const EXAMPLE_SHOW_HOW_LABEL = 'Show how';
const SUB_SKILL_NAMES = Object.freeze({ 'factor.trinomial': 'factoring', 'factor.trinomialAC': 'factoring', 'factor.commonFactor': 'factoring' });
const subSkillName = (skill) => SUB_SKILL_NAMES[skill] || 'the skill inside this step';

/**
 * A plane picture in words (planeReplay.js): what is plotted, drawn and
 * shaded so far. The picture's name for a screen reader; the step's own lines
 * say the same move in full.
 */
export const planeSummary = (plane) => {
  if (!isObject(plane)) return '';
  const points = list(plane.points).map((point) => text(point?.label)).filter(Boolean);
  const lines = list(plane.lines);
  const regions = list(plane.regions).length;
  return [
    'Coordinate plane.',
    points.length ? `${points.length === 1 ? 'Point' : 'Points'} ${points.join(', ')}.` : '',
    lines.length ? `${lines.length === 1 ? 'One line' : `${lines.length} lines`}: ${lines.map((drawn) => (drawn?.style === 'dashed' ? 'dashed' : 'solid')).join(', ')}.` : '',
    regions ? `${regions === 1 ? 'One shaded region' : `${regions} shaded regions`}.` : '',
  ].filter(Boolean).join(' ');
};

/** Where "Show how" lands: the first of the slides it opens. */
export const shownHowSlideIndex = (example, skill) => {
  const index = exampleSlides(example, { shownHow: true }).findIndex((slide) => slide.subSkill?.skill === skill);
  return index < 0 ? 0 : index;
};

export const EXAMPLE_SLIDE = Object.freeze({ PROBLEM: 'problem', STEP: 'step', ANSWER: 'answer' });
export const EXAMPLE_PROBLEM_NOTE = 'This problem is like yours, with different numbers. Go through each step, then do yours.';
export const EXAMPLE_YOUR_TURN_TEXT = 'Your question uses different numbers — use the same steps on it.';
export const EXAMPLE_YOUR_TURN_LABEL = 'Your turn';
export const EXAMPLE_OPENED_BY_ITSELF_TEXT = 'New skill. Here is one like it, worked step by step, before you start yours.';
// A faded example (the second Classwork question on a skill): the first moves
// are played, and the rest are the student's, on their own question.
export const EXAMPLE_FADED_OPENED_TEXT = 'Same skill as before. This time only the first part is worked for you.';
export const EXAMPLE_FADED_TURN_TEXT = 'The rest is yours. Make the same start on your own question, then finish it.';

/**
 * The example as slides, one move each: the problem (with a line on what to
 * do with it), each step with its why, and the answer. The last slide carries "Your turn". A step card ends on its
 * own last step, so it gets no separate answer slide.
 */
export const exampleSlides = (example, { shownHow = false } = {}) => {
  if (!isObject(example)) return [];
  const prompt = text(example.prompt);
  // Sub-skill slides: Classwork plays them in the sequence. On Practice
  // (`subSkills: 'onRequest'`) the step stays one line with "Show how", and
  // they join the sequence once the student asks.
  const folded = example.subSkills === EXAMPLE_SUB_SKILL_MODE.ON_REQUEST && shownHow !== true;
  const steps = list(example.steps).map(stepOf).filter((step) => step.show)
    .filter((step) => !(folded && step.subSkill?.optional === true))
    .map((step) => (folded && step.alone ? { ...step, show: text(step.alone.show) || step.show, why: text(step.alone.why) || step.why, board: step.alone.board || step.board, showHow: true } : step));
  if (!prompt || !steps.length) return [];
  // A faded example plays its first steps only, and says how many there are.
  const faded = example.faded === true;
  const stepCount = faded && Number.isInteger(example.stepCount) && example.stepCount > steps.length ? example.stepCount : steps.length;
  const slides = [{ kind: EXAMPLE_SLIDE.PROBLEM, label: 'The problem', show: prompt, why: '', note: EXAMPLE_PROBLEM_NOTE }];
  steps.forEach((step, index) => {
    slides.push({
      kind: EXAMPLE_SLIDE.STEP,
      label: `Step ${index + 1} of ${stepCount}${step.subSkill && !folded ? `: ${subSkillName(step.subSkill.skill)}, ${step.subSkill.index} of ${step.subSkill.count}` : ''}`,
      show: step.show,
      why: step.why,
      ...(step.board ? { board: step.board } : {}),
      ...(step.subSkill ? { subSkill: step.subSkill } : {}),
      ...(step.showHow ? { showHow: true } : {}),
    });
  });
  // A step card ends on its own last step; a replay ends on its check, so its
  // answer is a slide; a faded example stops before the answer.
  const answer = text(example.answer);
  if (answer && !faded && (example.source !== 'authored' || example.format === 'replay')) {
    slides.push({ kind: EXAMPLE_SLIDE.ANSWER, label: 'The answer', show: answer, why: '' });
  }
  return slides.map((slide, index) => ({ ...slide, index, last: index === slides.length - 1, ...(faded ? { faded: true } : {}) }));
};

/** What the last slide says before "Your turn". */
export const slideTurnText = (slide) => (slide?.faded === true ? EXAMPLE_FADED_TURN_TEXT : EXAMPLE_YOUR_TURN_TEXT);

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
    slide.last ? slideTurnText(slide) : '',
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

/* ------------------------------------------------- why this step? (WE-F) */

/*
 * WHY THIS STEP? (WE-F; WORKED_EXAMPLES.md sections 4 and 5). Classwork only,
 * once per example: before one step plays, the slide before it names the move
 * that comes next and asks for its reason. The choices are that step's own
 * `why` and two other steps' `why` lines from the same example; nothing is
 * written for it. The step's own slide then plays as every step does, its
 * reason under it. An example with fewer than three different `why` lines
 * asks nothing. It can be skipped (Skip, or Next), and it is never scored or
 * recorded.
 */
export const WHY_THIS_STEP_PROMPT = 'Why this step? Pick the reason before it plays.';
export const WHY_THIS_STEP_NEXT = 'The next step';
export const WHY_THIS_STEP_SKIP_LABEL = 'Skip';
export const WHY_THIS_STEP_RIGHT = 'Yes, that is the reason. Next shows the step.';
export const WHY_THIS_STEP_OTHER = 'Not this one. Next shows the step with its reason.';

const whyKey = (value) => text(value).toLowerCase().replace(/\s+/g, ' ');
// A fixed place for the right choice, read from the step's own words: the same
// example asks the same way every time, and the reason is not always first.
const placeOf = (value, count) => [...text(value)].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 9973, 7) % count;

/**
 * The question for an example's slides (exampleSlides), or null:
 *   { askAt, stepAt, nextStep, choices: [{ id, text, right }] }
 * The step asked about (`stepAt`) is the first step with a why; it is asked on
 * the slide before it (`askAt`), which names the move (`nextStep`: a replayed
 * move's name, or a step card's line). The other two choices are the first two
 * different whys of the other steps.
 */
export const whyThisStepFor = (slides) => {
  const steps = list(slides).filter((slide) => slide?.kind === EXAMPLE_SLIDE.STEP && text(slide.why));
  const distinct = [...new Map(steps.map((slide) => [whyKey(slide.why), text(slide.why)])).values()];
  if (distinct.length < 3) return null;
  const target = steps[0];
  const nextStep = text(target.board?.label) || text(target.show);
  if (!(target.index >= 1) || !nextStep) return null;
  const texts = distinct.filter((why) => whyKey(why) !== whyKey(target.why)).slice(0, 2);
  texts.splice(placeOf(target.why, 3), 0, text(target.why));
  return {
    askAt: target.index - 1,
    stepAt: target.index,
    nextStep,
    choices: texts.map((why, index) => ({ id: `why-${index + 1}`, text: why, right: whyKey(why) === whyKey(target.why) })),
  };
};

const withStop = (value) => (/[.!?:]$/.test(value) ? value : `${value}.`);

/** What Read aloud is given for the question: the move, the prompt, then each choice. */
export const whyThisStepReadingText = (check) => (isObject(check)
  ? [`${WHY_THIS_STEP_NEXT}: ${withStop(check.nextStep)}`, WHY_THIS_STEP_PROMPT, ...list(check.choices).map((choice, index) => `Choice ${index + 1}: ${withStop(choice.text)}`)].join(' ')
  : '');
/** What Translate is given for it: the move, the prompt and the choices, one a line, without the numbers. */
export const whyThisStepTranslationText = (check) => (isObject(check)
  ? [check.nextStep, WHY_THIS_STEP_PROMPT, ...list(check.choices).map((choice) => choice.text)].join('\n')
  : '');

/* ------------------------------------------------ spot the mistake (WE-F) */

/*
 * SPOT THE MISTAKE (WE-F). After the example's last slide: a step with the
 * question's own common error in it (`solutionReview.commonError`), and three
 * choices for what is wrong with it. What it says is worked out, and checked
 * against the question's answers, by spotTheMistake.js; these are only the
 * player's words around it. It is feedback: never scored, and recorded only as
 * the fact that the student answered it.
 */
export const SPOT_THE_MISTAKE_HEADING = 'Spot the mistake';
export const SPOT_THE_MISTAKE_INTRO = 'Here is a step someone could write on this question.';
export const SPOT_THE_MISTAKE_QUESTION = 'What is wrong with it?';
export const SPOT_THE_MISTAKE_RIGHT = 'Yes, that is what went wrong.';
export const SPOT_THE_MISTAKE_OTHER = 'Not this one. This is what went wrong.';
export const SPOT_THE_MISTAKE_NOTE = 'Not scored: it only shows what to watch for.';
export const SPOT_THE_MISTAKE_CHOSEN = 'Your choice';
// A borrowed choice (another question's reason, spotTheMistake.js) is true
// there: what is said about it never calls it wrong or false.
export const SPOT_THE_MISTAKE_DIFFERENT = 'That describes a different mistake, one made on another question.';
export const SPOT_THE_MISTAKE_THIS_STEP = 'Here is the mistake in this step.';
export const SPOT_THE_MISTAKE_NOT_THIS_STEP = 'Not this step\'s mistake';

/**
 * What it says once a choice is made. The right one: yes, then the whole
 * common error. A fixed choice (false of any step with a mistake): not this
 * one, then the whole common error. A borrowed one: a different mistake, made
 * on another question, then this step's own.
 */
export const spotTheMistakeFeedback = (spot, choiceId) => {
  const choice = list(spot?.choices).find((entry) => entry.id === choiceId);
  if (!choice) return '';
  if (choice.kind === 'borrowed') {
    const reason = text(spot.reason) || text(list(spot.choices).find((entry) => entry.right)?.text);
    return [SPOT_THE_MISTAKE_DIFFERENT, SPOT_THE_MISTAKE_THIS_STEP, reason].filter(Boolean).join(' ');
  }
  return [choice.right ? SPOT_THE_MISTAKE_RIGHT : SPOT_THE_MISTAKE_OTHER, text(spot.explanation)].filter(Boolean).join(' ');
};

/** How the chosen button says it was chosen: a borrowed one is "not this step's mistake", never "wrong". */
export const spotTheMistakeChosenLabel = (choice) => (choice?.kind === 'borrowed' ? `${SPOT_THE_MISTAKE_CHOSEN}: ${SPOT_THE_MISTAKE_NOT_THIS_STEP.charAt(0).toLowerCase()}${SPOT_THE_MISTAKE_NOT_THIS_STEP.slice(1)}` : SPOT_THE_MISTAKE_CHOSEN);

/** What Read aloud is given: the intro, the step, the question and each choice, then the feedback once there is some. */
export const spotTheMistakeReadingText = (spot, choiceId = null) => {
  if (!isObject(spot)) return '';
  return [
    `${SPOT_THE_MISTAKE_HEADING}.`,
    SPOT_THE_MISTAKE_INTRO,
    text(spot.line),
    SPOT_THE_MISTAKE_QUESTION,
    ...list(spot.choices).map((choice, index) => `Choice ${index + 1}: ${choice.text}`),
    spotTheMistakeFeedback(spot, choiceId),
  ].filter(Boolean).join(' ');
};

/** What Translate is given: the same sentences, one a line, without the choice numbers. */
export const spotTheMistakeTranslationText = (spot, choiceId = null) => {
  if (!isObject(spot)) return '';
  return [
    SPOT_THE_MISTAKE_INTRO,
    text(spot.line),
    SPOT_THE_MISTAKE_QUESTION,
    ...list(spot.choices).map((choice) => choice.text),
    spotTheMistakeFeedback(spot, choiceId),
  ].filter(Boolean).join('\n');
};
