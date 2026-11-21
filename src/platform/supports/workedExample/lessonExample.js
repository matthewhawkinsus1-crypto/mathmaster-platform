/*
 * THE WORKED-EXAMPLE PLAYER: WHICH EXAMPLE A QUESTION PLAYS, WHERE, AND ITS
 * SLIDES (WE-A; WORKED_EXAMPLES.md sections 3, 4, 5 and 10).
 *
 * "See a similar problem worked" used to be a list of text steps. It is now
 * stepped through: one slide per step with its "why" under it, Next and Back,
 * and a final "Your turn" that returns the student to their own question
 * (WorkedExamplePlayer.jsx). This module is the part with no React in it.
 *
 * WHAT PLAYS
 *
 *   authored step card   an entry of the assignment's `lessonSupports.examples`
 *                        with `steps: [{ show, why }]`, which the question
 *                        names by `example`, or which an earlier Classwork
 *                        question on the same skill names (on request);
 *   built-in sibling     today's worked sibling from the question's support
 *                        family (similarProblem.js), where one exists.
 *
 * An entry with only `moves` is a tool replay (a later package). It is not
 * played here: the question falls back to its built-in sibling, or shows
 * nothing. `{ "none": "setup" | "explain" }` on a question shows no example.
 *
 * WHERE (the owner's decision 1; the section's own role decides)
 *
 *   Classwork        opens by itself before the first question on a skill,
 *                    once, and on request on every question;
 *   Practice         only on request;
 *   DOL, quiz, test  never, and no control for it. Anywhere hints are
 *                    withheld (`hintsAllowed` false), nothing.
 *
 * AN EXAMPLE IS A SIBLING, NEVER THE STUDENT'S ITEM. The built-in sibling is
 * checked by similarExampleIsSafe where it is built. An authored one is
 * checked here against the question as this student has it
 * (authoredExampleIsSafe): it may not be the question's own problem, and it
 * may not state one of the question's answers. One that fails is not shown;
 * Pre-Flight tells the author (assignmentV5PreflightModel.js).
 *
 * Opening an example is help with the mathematics: QuestionEngine records it
 * as workedExampleUsed, exactly as before. It never changes a score.
 *
 * Pure: no React, no I/O.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { questionAnswerValues } from '../hints/questionHints.js';
import { exampleSkillOf, questionExampleClaim } from './exampleSkill.js';
import { buildSimilarWorkedExample } from './similarProblem.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const roleName = (value) => text(value).toLowerCase();

/* ------------------------------------------------------- the section rules */

// The owner's decision (2026-11-20): never on a DOL, quiz or test. The same
// three roles the authoring contract refuses an example on (lessonSupportsV5.js).
export const NO_EXAMPLE_ROLES = Object.freeze(['dol', 'quiz', 'test']);

const NO_EXAMPLE = Object.freeze({ onRequest: false, opensByItself: false });

/*
 * What a section allows. `sectionRole` is the section's OWN role, from the
 * host (a DOL replayed after its due date runs as practice and is still a
 * DOL); `activityRole` is the role the question is running under. Either one
 * being a DOL, quiz or test withholds the example, and so does a host that
 * withholds hints. Only a Classwork section running as classwork opens an
 * example by itself; a host that names no section never does.
 */
export const workedExampleSectionRule = ({ sectionRole = null, activityRole = null, hintsAllowed = false } = {}) => {
  if (hintsAllowed !== true) return NO_EXAMPLE;
  const own = roleName(sectionRole);
  const running = roleName(activityRole);
  if (NO_EXAMPLE_ROLES.includes(own) || NO_EXAMPLE_ROLES.includes(running)) return NO_EXAMPLE;
  return { onRequest: true, opensByItself: own === 'classwork' && running === 'classwork' };
};

/* ---------------------------------------------------- the authored example */

// Text a problem is recognised by, as the authoring contract compares it
// (lessonSupportsV5.js problemText): case, spaces and $ delimiters do not count.
const problemKey = (value) => text(value).toLowerCase().replace(/[\s$]+/g, '');
const QUESTION_PROBLEM_FIELDS = Object.freeze(['prompt', 'stem', 'equation', 'expression', 'inequality', 'equationLatex']);

const siblingTexts = (sibling) => (isObject(sibling) ? Object.values(sibling) : [sibling]).map(text).filter(Boolean);

/*
 * An authored entry as a step card the player can show, or null when it has
 * nothing to step through (a tool replay with `moves`, a built-in or generated
 * entry, a malformed one):
 *   { kind: 'authored', id, prompt, steps: [{ show, why }], answer: '', fromStep, problemTexts }
 */
export const authoredStepCard = (entry) => {
  if (!isObject(entry)) return null;
  const authored = list(entry.steps);
  if (!authored.length) return null;
  const steps = authored.map((step) => ({ show: text(step?.show), why: text(step?.why) }));
  if (steps.some((step) => !step.show)) return null;
  const problemTexts = [text(entry.problem), ...siblingTexts(entry.sibling)].filter(Boolean);
  const prompt = text(entry.problem) || siblingTexts(entry.sibling).join(', ');
  if (!prompt) return null;
  const fromStep = Number.isInteger(entry.fade?.fromStep) && entry.fade.fromStep >= 1 && entry.fade.fromStep <= steps.length
    ? entry.fade.fromStep
    : null;
  return { kind: 'authored', id: text(entry.id) || null, prompt, steps, answer: '', fromStep, problemTexts };
};

// A number as a value: 3, −2, 0.5, 4/3, \frac{3}{4}.
const numberValue = (value) => {
  const squashed = text(value)
    .replace(/−/g, '-')
    .replace(/\\[dt]?frac\{(-?\d+(?:\.\d+)?)\}\{(\d+(?:\.\d+)?)\}/g, '$1/$2')
    .replace(/[\s$]+/g, '')
    .replace(/[.!]+$/, '');
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(squashed)) return Number(squashed);
  const fraction = squashed.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

// Where a line states a result: after "=", ":" or an arrow, between commas,
// and after "so", "is", "are", "equals", "gives", "and", "or", "then".
const STATEMENT_BREAK = /=|≈|≠|→|⇒|:|;|,|\b(?:so|and|or|then|is|are|equals|gives)\b/i;

/** The numbers a line states as results: "m = 6 / 2 = 3" states 3 (6 / 2 is 3 too); "(3, 8)" states none. */
export const statedNumbers = (line) => text(line).split(STATEMENT_BREAK).map(numberValue).filter((value) => value !== null);

/*
 * Why an authored step card may not be shown on this question, or null when
 * it may. `reason` is a sentence for the author (Pre-Flight), never for a
 * student.
 *
 *   - it is the question's own problem (its prompt, equation or expression);
 *   - its problem or a step contains one of the question's answers that is
 *     not a bare number (an equation, an expression, a point, a word), as
 *     similarExampleIsSafe reads a built-in sibling's;
 *   - a step states, as a result, a number that is one of the question's
 *     answers. A number the example only uses on the way (a coordinate, a
 *     coefficient) is not a statement of the answer: read as text, every
 *     small number is an answer to something.
 */
export const authoredExampleProblem = (question, card) => {
  if (!card || card.kind !== 'authored' || !list(card.steps).length) return { code: 'unplayable', reason: 'it has no steps to show' };
  const own = QUESTION_PROBLEM_FIELDS.map((key) => problemKey(question?.[key])).filter((value) => value.length >= 3);
  if (list(card.problemTexts).map(problemKey).some((value) => value.length >= 3 && own.includes(value))) {
    return { code: 'ownItem', reason: 'it is this question\'s own problem' };
  }
  const answers = questionAnswerValues(question);
  const words = answers.filter((value) => numberValue(value) === null);
  const numbers = answers.map(numberValue).filter((value) => value !== null);
  if (hintRevealsAnswer(card.prompt, words)) return { code: 'statesAnswer', reason: 'its problem contains one of this question\'s answers' };
  for (let index = 0; index < card.steps.length; index += 1) {
    const lines = [card.steps[index].show, card.steps[index].why];
    if (lines.some((line) => hintRevealsAnswer(line, words))) {
      return { code: 'statesAnswer', step: index + 1, reason: `step ${index + 1} contains one of this question's answers` };
    }
    const stated = lines.flatMap(statedNumbers).find((value) => numbers.some((answer) => Math.abs(answer - value) < 1e-9));
    if (stated !== undefined) {
      return { code: 'statesAnswer', step: index + 1, reason: `step ${index + 1} states ${stated}, which is one of this question's answers` };
    }
  }
  return null;
};

export const authoredExampleIsSafe = (question, card) => {
  try {
    return authoredExampleProblem(question, card) === null;
  } catch {
    return false;
  }
};

/* ------------------------------------------------ which example a question has */

const defaultRoleOf = (question) => question?.activityRole ?? question?.role;
const defaultBuiltInFor = (question) => {
  try {
    return Boolean(buildSimilarWorkedExample(question));
  } catch {
    return false;
  }
};

const entryFor = (question, claim, lessonSupports) => {
  if (claim?.kind !== 'own') return null;
  if (isObject(question?.example)) return question.example;
  return list(lessonSupports?.examples).find((entry) => isObject(entry) && text(entry.id) === claim.exampleId) || null;
};

// An entry with `roles` is for those sections only.
const forRole = (entry, role) => !Array.isArray(entry?.roles) || !entry.roles.length || entry.roles.map(roleName).includes(role);

/*
 * What the lesson says about one question's example, worked out by the host
 * that holds the whole assignment (the student's assignment screen):
 *
 *   { sectionRole, exempt, example, from, firstOnSkill }
 *
 *   example       the `lessonSupports.examples` entry to play, as authored, or
 *                 null (the engine then uses the built-in sibling, if any);
 *   from          'own' when the question names it; 'earlierSameSkill' when an
 *                 earlier Classwork question on the same skill does (the skill
 *                 rule, WORKED_EXAMPLES.md section 6; Classwork only);
 *   exempt        the question says it needs none: no example at all;
 *   firstOnSkill  on Classwork, no earlier Classwork question on this skill
 *                 had an example to show, so this is where one opens by itself.
 *
 * `questions` are the assignment's questions in the order a student meets
 * them; `roleOf(question, index)` is each one's section role. A question the
 * teacher excluded is never delivered, so it does not count.
 */
export const lessonExampleContext = ({
  questions = [],
  index = 0,
  lessonSupports = null,
  roleOf = defaultRoleOf,
  builtInFor = defaultBuiltInFor,
} = {}) => {
  const question = list(questions)[index];
  if (!isObject(question)) return null;
  const sectionRole = roleName(roleOf(question, index));
  const none = { sectionRole, exempt: false, example: null, from: null, firstOnSkill: false };
  if (NO_EXAMPLE_ROLES.includes(sectionRole)) return none;
  const claim = questionExampleClaim(question, lessonSupports);
  if (claim?.kind === 'exempt') return { ...none, exempt: true };

  const ownEntry = entryFor(question, claim, lessonSupports);
  let example = ownEntry && forRole(ownEntry, sectionRole) ? ownEntry : null;
  let from = example ? 'own' : null;
  if (sectionRole !== 'classwork') return { ...none, example, from };

  const skill = exampleSkillOf(question);
  let earlierHadExample = false;
  for (let at = 0; at < index && skill; at += 1) {
    const earlier = questions[at];
    if (!isObject(earlier) || earlier.teacherExcluded === true) continue;
    if (roleName(roleOf(earlier, at)) !== 'classwork' || exampleSkillOf(earlier) !== skill) continue;
    const earlierClaim = questionExampleClaim(earlier, lessonSupports);
    if (earlierClaim?.kind === 'exempt') continue;
    const earlierEntry = entryFor(earlier, earlierClaim, lessonSupports);
    if (earlierEntry && forRole(earlierEntry, 'classwork') && authoredStepCard(earlierEntry)) {
      earlierHadExample = true;
      if (!example) {
        example = earlierEntry;
        from = 'earlierSameSkill';
      }
    } else if (!earlierHadExample && builtInFor(earlier)) {
      earlierHadExample = true;
    }
  }
  // A question whose skill cannot be told (no family, no student action) is
  // not known to start one: its example waits to be asked for, unless the
  // question names it.
  return { sectionRole, exempt: false, example, from, firstOnSkill: (Boolean(skill) || from === 'own') && !earlierHadExample };
};

/*
 * For the author (Pre-Flight): each question whose own authored step card
 * will not be shown on it, and why. A warning, never an error: the assignment
 * still imports, and the student gets the built-in sibling or nothing there.
 * The message leads with "Section S Question Q", the locator Pre-Flight reads.
 */
export const authoredExampleWarnings = (assignment) => {
  const lessonSupports = assignment?.lessonSupports;
  if (!isObject(lessonSupports) || !list(lessonSupports.examples).length) return [];
  const warnings = [];
  list(assignment.sections).forEach((section, sectionIndex) => {
    if (NO_EXAMPLE_ROLES.includes(roleName(section?.role))) return;
    list(section?.questions).forEach((question, questionIndex) => {
      if (!isObject(question) || question.teacherExcluded === true) return;
      const card = authoredStepCard(entryFor(question, questionExampleClaim(question, lessonSupports), lessonSupports));
      if (!card) return;
      let problem = null;
      try { problem = authoredExampleProblem(question, card); } catch { problem = null; }
      if (!problem) return;
      warnings.push(`Section ${sectionIndex + 1} Question ${questionIndex + 1} example${card.id ? ` "${card.id}"` : ''} will not be shown to students on this question: ${problem.reason}. An example is a sibling problem with different numbers: change it so that no step gives this question's answer.`);
    });
  });
  return warnings;
};

/* ------------------------------------------------- the example the engine plays */

const builtInExample = (similar) => {
  const steps = list(similar?.steps).map(text).filter(Boolean).map((show) => ({ show, why: '' }));
  if (!text(similar?.prompt) || !steps.length) return null;
  return { kind: 'builtIn', id: null, prompt: text(similar.prompt), steps, answer: text(similar.answer), fromStep: null };
};

/*
 * The example this question plays for this student, or null:
 *
 *   { kind, id, prompt, steps, answer, handOverAfter, from, opensByItself }
 *
 * `question` is the question as the student has it (its own numbers and
 * answers); `context` is lessonExampleContext's answer, or null from a host
 * that holds no lesson; `builtIn` is buildSimilarWorkedExample's sibling for
 * the question, already checked there, or null. `handOverAfter` is how many
 * steps a faded example shows before it hands over (`fade.fromStep`): only on
 * a later Classwork question that borrows an earlier one's example.
 */
export const resolveWorkedExample = ({ question = null, context = null, builtIn = null, activityRole = null, hintsAllowed = false } = {}) => {
  const rule = workedExampleSectionRule({ sectionRole: context?.sectionRole ?? null, activityRole, hintsAllowed });
  if (!rule.onRequest || context?.exempt === true) return null;
  const card = authoredStepCard(context?.example);
  const authored = card && authoredExampleIsSafe(question, card) ? card : null;
  // The sibling is worked only when it is the one to play (`builtIn` may be a
  // function that builds it).
  const example = authored || builtInExample(typeof builtIn === 'function' ? builtIn() : builtIn);
  if (!example) return null;
  const from = authored ? (context.from === 'earlierSameSkill' ? 'earlierSameSkill' : 'own') : 'builtIn';
  const faded = from === 'earlierSameSkill' && Number.isInteger(example.fromStep) && example.fromStep >= 2;
  return {
    kind: example.kind,
    id: example.id,
    prompt: example.prompt,
    steps: example.steps,
    answer: example.answer,
    handOverAfter: faded ? example.fromStep - 1 : null,
    from,
    // By itself only before the first question on a skill, and never an
    // example borrowed from an earlier question: that one opened there.
    opensByItself: rule.opensByItself && context?.firstOnSkill === true && from !== 'earlierSameSkill',
  };
};

/* ------------------------------------------------------------- the slides */

export const EXAMPLE_PLAYER_COPY = Object.freeze({
  title: 'A similar problem, worked out',
  why: 'Why',
  back: 'Back',
  next: 'Next',
  yourTurn: 'Your turn',
  yourTurnLine: 'Your question uses different numbers — use the same steps on it.',
  handOverLine: 'The example stops here. Do the next steps on your own question.',
  showRest: 'Show the rest of the example',
  goToQuestion: 'Go to my question',
  openedByItself: 'A worked example is open above your question. Step through it with Next, then try your question.',
});

/*
 * The player's own sentences, for the assessment leak gate
 * (tests/browser/support/assessmentLadderWords.mjs): none may be anywhere in a
 * DOL, quiz or test page. Its one-word labels ("Next", "Back", "Why") are on
 * every page for other reasons, so the gate looks for the player itself too.
 */
export const EXAMPLE_PLAYER_LEAK_TEXTS = Object.freeze([
  EXAMPLE_PLAYER_COPY.title,
  EXAMPLE_PLAYER_COPY.yourTurnLine,
  EXAMPLE_PLAYER_COPY.handOverLine,
  EXAMPLE_PLAYER_COPY.showRest,
  EXAMPLE_PLAYER_COPY.goToQuestion,
  EXAMPLE_PLAYER_COPY.openedByItself,
]);

/*
 * One slide per step, then "Your turn". A faded example stops after
 * `handOverAfter` steps unless the student asks for the rest (`showAll`).
 *   step      { kind: 'step', number, of, show, why }
 *   yourTurn  { kind: 'yourTurn', handedOver, answer }
 */
export const exampleSlides = (example, { showAll = false } = {}) => {
  const steps = list(example?.steps);
  if (!steps.length) return [];
  const cut = Number.isInteger(example.handOverAfter) && !showAll ? Math.max(1, Math.min(steps.length, example.handOverAfter)) : steps.length;
  const handedOver = cut < steps.length;
  return [
    // A built-in sibling handed over as it was built (steps as text) plays too.
    ...steps.slice(0, cut).map((step, index) => ({ kind: 'step', number: index + 1, of: steps.length, show: text(typeof step === 'string' ? step : step?.show), why: text(step?.why) })),
    { kind: 'yourTurn', handedOver, answer: handedOver ? '' : text(example.answer) },
  ];
};

/** "Step 2 of 4", or "Your turn". */
export const slideLabel = (slide) => (slide?.kind === 'step' ? `Step ${slide.number} of ${slide.of}` : EXAMPLE_PLAYER_COPY.yourTurn);

/** The slide as one text: what Read aloud says and Translate reads (the pipeline Solution Review uses). */
export const slideReadingText = (slide) => {
  if (!slide) return '';
  if (slide.kind === 'step') return [slide.show, slide.why ? `${EXAMPLE_PLAYER_COPY.why}: ${slide.why}` : ''].filter(Boolean).join('\n');
  return [
    slide.answer ? `Answer: ${slide.answer}` : '',
    slide.handedOver ? EXAMPLE_PLAYER_COPY.handOverLine : EXAMPLE_PLAYER_COPY.yourTurnLine,
  ].filter(Boolean).join('\n');
};

/** Where Next and Back land: never before the first slide or after the last. */
export const stepSlide = (index, by, count) => Math.max(0, Math.min(Math.max(0, count - 1), (Number(index) || 0) + by));
