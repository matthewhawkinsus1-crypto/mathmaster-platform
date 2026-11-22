/*
 * THE WORKED-EXAMPLE PLAYER: ITS RULES AND ITS SLIDES (WE-A;
 * docs/platform/WORKED_EXAMPLES.md sections 3 to 5).
 *
 * "See a similar problem worked" is a step-through: one slide at a time, with
 * Next and Back, a "why" under a step that has one, and a last slide that
 * hands the student their own question ("Your turn"). This module is the part
 * a node test can run: which sections show an example, which example a
 * question gets, when one opens by itself, and what its slides say.
 * WorkedExamplePlayer.jsx draws them; QuestionEngine opens and records them.
 *
 * WHERE AN EXAMPLE APPEARS (the owner's decision, 2026-11-20). The section's
 * role decides, and an assignment cannot change it:
 *
 *   Classwork             on request on every question, and opened by itself
 *                         before the first question on a new skill;
 *   Practice, and the     only when the student asks;
 *   other help-giving
 *   sections
 *   DOL, quiz, test       never: not offered, not opened, not built.
 *
 * A DOL that runs as practice after its due date is still a DOL (the same
 * rule "Practise one like this" follows), so the section's own role is read
 * beside the role the question runs under, and either one of the three is
 * enough to withhold. Wherever hints are withheld, so is the example.
 *
 * WHICH EXAMPLE. Always a sibling problem, never the student's item and never
 * another item on the same assignment:
 *
 *   1. the example the lesson wrote for the question (`example` names an
 *      entry of `lessonSupports.examples`): a Step Algebra replay (`moves`),
 *      played through the tool's own engine (stepAlgebraReplay.js, WE-C), or
 *      a step card (`steps`); when it passes the same guard every built-in
 *      sibling passes (similarExampleIsSafe). A question that names none
 *      takes the one the first question on its skill named;
 *   2. otherwise the question family's sibling (buildSimilarWorkedExample):
 *      for a Step Algebra question as a replay of its equation, where the
 *      built-in moves cover it; otherwise as its text steps.
 *
 * An example whose problem is an item on the assignment is not shown. A
 * replay the engine cannot play to its answer is not shown either. Replays
 * for the other tools are later packages (WE-D, WE-E); until then such a
 * question gets its family's sibling.
 *
 * THE FADED EXAMPLE. On the second Classwork question on a skill the example
 * opens by itself with its first steps only (`handOverAfter`) and no answer;
 * the rest is the student's. Asked for, the whole example plays.
 *
 * WHAT OPENING ONE COSTS: nothing. It is recorded as `workedExampleUsed`, as
 * it always was, so the teacher sees it and mastery counts the attempt as
 * supported. No score reads it (tests/platform/workedExamplePlayer.test.mjs).
 * One that Classwork opened by itself is recorded apart, as
 * `workedExampleShown: 'auto'`: nobody asked for it, so the attempt stays
 * independent and mastery is unchanged (supportUseMemory.js).
 */
import { buildSimilarWorkedExample, similarExampleIsSafe } from './similarProblem.js';
import { exampleSkillOf } from './exampleSkill.js';
import { familyFor } from '../families/index.js';
import { isStepAlgebraReplayEntry, replayHandOver, replayStepAlgebra, stepAlgebraMovesFor } from './stepAlgebraReplay.js';
import { RADICAL_REPLAY_TOOL, isRadicalReplayEntry, radicalItemIsVerified, radicalSiblingEquation, replayRadicalEquation } from './radicalReplay.js';

// A step as { show, why } (the same reading exampleSlides.js gives it; that
// module is the player's own, and is not imported here: see its header).
const stepOf = (step) => (step && typeof step === 'object' && !Array.isArray(step)
  ? { show: typeof step.show === 'string' ? step.show.trim() : '', why: typeof step.why === 'string' ? step.why.trim() : '', ...(step.board && typeof step.board === 'object' ? { board: step.board } : {}) }
  : { show: typeof step === 'string' ? step.trim() : '', why: '' });

/** Said to a screen reader when Classwork opens an example by itself. */
export const EXAMPLE_OPENED_ANNOUNCEMENT = 'A worked example opened above your question: a problem like yours, one step at a time. Your answer box is still where you are.';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const lower = (value) => text(value).toLowerCase();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/* ------------------------------------------------------- the section rules */

/** Sections that never show an example, a reference card or an explorer. */
export const NO_EXAMPLE_SECTION_ROLES = Object.freeze(['dol', 'quiz', 'test']);

/** How a step that uses an earlier skill is shown: its own slides in the sequence (Classwork), or one tap away. */
export const EXAMPLE_SUB_SKILLS = Object.freeze({ IN_SEQUENCE: 'inSequence', ON_REQUEST: 'onRequest' });

const NO_EXAMPLE = Object.freeze({ offered: false, opensByItself: false, subSkills: null });

/**
 * What a section does with worked examples.
 *   sectionRole   the section's own role, where the host knows it;
 *   activityRole  the role the question runs under (its activity policy);
 *   hintsAllowed  whether this question offers hints at all.
 */
export const exampleSectionRule = ({ sectionRole = null, activityRole = null, hintsAllowed = true } = {}) => {
  const section = lower(sectionRole);
  const activity = lower(activityRole);
  if (hintsAllowed !== true) return NO_EXAMPLE;
  if (NO_EXAMPLE_SECTION_ROLES.includes(section) || NO_EXAMPLE_SECTION_ROLES.includes(activity)) return NO_EXAMPLE;
  // By itself only on Classwork that is running as Classwork: a section a
  // student revisits as practice after its due date plays on request.
  const classwork = (section || activity) === 'classwork' && (!activity || activity === 'classwork');
  return Object.freeze({
    offered: true,
    opensByItself: classwork,
    subSkills: classwork ? EXAMPLE_SUB_SKILLS.IN_SEQUENCE : EXAMPLE_SUB_SKILLS.ON_REQUEST,
  });
};

/* ------------------------------------------------------ which example plays */

/** Why a question says it needs no example ("setup", "explain"), or null. */
export const questionExampleExemption = (question) => {
  const example = question?.example;
  return isObject(example) && text(example.none) ? text(example.none) : null;
};

// Text a problem is recognised by, as the authoring contract reads it
// (lessonSupportsV5.js): case, spaces and $ delimiters do not count.
const problemKey = (value) => lower(value).replace(/[\s$]+/g, '');
const PROBLEM_FIELDS = Object.freeze(['prompt', 'equation', 'expression', 'inequality', 'equationLatex']);

/** Every problem on the assignment, as keys an example's problem is checked against. */
export const assignmentProblemKeys = (questions = []) => new Set(list(questions)
  .flatMap((question) => (isObject(question) ? PROBLEM_FIELDS.map((field) => problemKey(question[field])) : []))
  .filter((key) => key.length >= 3));

const isAssignmentItem = (prompt, assignmentProblems) => Boolean(
  assignmentProblems && typeof assignmentProblems.has === 'function' && assignmentProblems.has(problemKey(prompt)),
);

// Where a faded example hands over: after `handOverAfter` steps, or before
// step `fromStep`. Zero where nothing is left for the student to do.
const handOverOf = (fade, stepCount) => {
  const after = replayHandOver(fade);
  return after >= 1 && after < stepCount ? after : 0;
};

const lessonExampleEntry = (id, lessonSupports, sectionRole) => {
  const entry = list(lessonSupports?.examples).find((example) => isObject(example) && text(example.id) === id);
  if (!entry) return null;
  const roles = list(entry.roles).map(lower).filter(Boolean);
  if (roles.length && lower(sectionRole) && !roles.includes(lower(sectionRole))) return null;
  return entry;
};

/**
 * The step card a lesson wrote for this question, or null: the entry of
 * `lessonSupports.examples` its `example` names, with `steps`. An entry kept
 * to other sections (`roles`) is not this section's. `exampleId` names the
 * entry for a question covered by an earlier question's example.
 */
export const authoredStepCard = (question, lessonSupports = null, { sectionRole = null, exampleId = null } = {}) => {
  const id = typeof question?.example === 'string' ? text(question.example) : text(exampleId);
  if (!id) return null;
  const entry = lessonExampleEntry(id, lessonSupports, sectionRole);
  if (!entry) return null;
  const steps = list(entry.steps).map(stepOf).filter((step) => step.show);
  const prompt = text(entry.problem)
    || (isObject(entry.sibling) ? Object.values(entry.sibling).map(text).filter(Boolean).join(', ') : '');
  if (!steps.length || !prompt) return null;
  // A step card ends on its answer: its last step is what the guard reads as the answer.
  return { id, source: 'authored', format: 'steps', prompt, steps, answer: steps[steps.length - 1].show, handOverAfter: handOverOf(entry.fade, steps.length) };
};

/**
 * The tool replay a lesson wrote for this question, or null: an entry with
 * `moves` for Step Algebra, played through the tool's own engine
 * (stepAlgebraReplay.js). A script the engine cannot play to its answer is
 * refused there, and so is not this question's example.
 */
export const authoredReplay = (question, lessonSupports = null, { sectionRole = null, exampleId = null } = {}) => {
  const id = typeof question?.example === 'string' ? text(question.example) : text(exampleId);
  if (!id) return null;
  const entry = lessonExampleEntry(id, lessonSupports, sectionRole);
  if (isRadicalReplayEntry(entry)) {
    const radical = replayRadicalEquation({ sibling: entry.sibling, moves: Array.isArray(entry.moves) ? entry.moves : null });
    if (!radical.ok) return null;
    return {
      id,
      source: 'authored',
      format: 'replay',
      tool: RADICAL_REPLAY_TOOL,
      prompt: radical.prompt,
      steps: radical.steps,
      answer: radical.answer,
      handOverAfter: Math.min(handOverOf(entry.fade, radical.steps.length), radical.fadeLimit),
      fadeLimit: radical.fadeLimit,
    };
  }
  if (!isStepAlgebraReplayEntry(entry)) return null;
  const replay = replayStepAlgebra({ sibling: entry.sibling, moves: entry.moves });
  if (!replay.ok) return null;
  return {
    id,
    source: 'authored',
    format: 'replay',
    prompt: replay.prompt,
    steps: replay.steps,
    answer: replay.answer,
    // A faded replay stops before the solving move, whatever the lesson asked for.
    handOverAfter: Math.min(handOverOf(entry.fade, replay.steps.length), replay.fadeLimit),
    fadeLimit: replay.fadeLimit,
  };
};

// The family's sibling for a Step Algebra question, as a replay: its equation
// is read out of "Solve $…$ for $x$." and played with the built-in moves.
// Null where the equation is not one the built-in moves cover; the sibling's
// text steps are then the example, as before.
const SOLVE_PROMPT = /^Solve \$([^$]+)\$ for \$([A-Za-z])\$\.$/;
const familyReplay = (question, sibling) => {
  if (lower(question?.type) !== 'stepalgebra') return null;
  const match = SOLVE_PROMPT.exec(text(sibling?.prompt));
  if (!match) return null;
  const source = { equation: match[1], variable: match[2] };
  const moves = stepAlgebraMovesFor(source);
  if (!moves) return null;
  const replay = replayStepAlgebra({ sibling: source, moves });
  if (!replay.ok) return null;
  return {
    source: 'family',
    format: 'replay',
    prompt: replay.prompt,
    steps: replay.steps,
    answer: replay.answer,
    // A built-in replay fades after its first move, and never shows the solving one.
    handOverAfter: Math.min(1, replay.fadeLimit),
    fadeLimit: replay.fadeLimit,
  };
};

// A radical equation solved on the relation workspace has no family sibling:
// its example is a sibling equation of the same kind (radicalReplay.js),
// played on the workspace's own engine with the factoring slides. Null where
// the item is not such an equation, or no sibling of it can be played.
const radicalItemEquation = (question) => (lower(question?.type) === 'stepalgebra' && question?.relationWorkspace === true
  ? text(question.equationLatex) || text(question.equation)
  : '');
const radicalFamilyReplay = (question, { seed = 0, assignmentProblems = null, asReplay = true } = {}) => {
  const equation = radicalItemEquation(question);
  const variable = text(question?.solveFor) || null;
  if (!equation || !radicalItemIsVerified(equation, variable)) return null;
  // Asked only whether the question has an example: it has, and nothing is played.
  if (!asReplay) return { source: 'family', format: 'steps', tool: RADICAL_REPLAY_TOOL, prompt: 'A radical equation like this one.', steps: [{ show: 'Played on request.', why: '' }], answer: '', handOverAfter: 0 };
  for (let turn = 0; turn < 6; turn += 1) {
    const sibling = radicalSiblingEquation(equation, { seed: (Number(seed) || 0) + turn, variable });
    if (!sibling) return null;
    if (assignmentProblems && typeof assignmentProblems.has === 'function' && assignmentProblems.has(problemKey(sibling.equation))) continue;
    const replay = replayRadicalEquation({ sibling });
    if (!replay.ok) continue;
    const example = {
      source: 'family',
      format: 'replay',
      tool: RADICAL_REPLAY_TOOL,
      prompt: replay.prompt,
      steps: replay.steps,
      answer: replay.answer,
      // A built-in replay fades after its first move, and never shows a candidate.
      handOverAfter: Math.min(1, replay.fadeLimit),
      fadeLimit: replay.fadeLimit,
    };
    if (!isAssignmentItem(example.prompt, assignmentProblems) && safeFor(question, example)) return example;
  }
  return null;
};

function safeFor(question, example) {
  return similarExampleIsSafe(question, {
  prompt: example.prompt,
    steps: example.steps.map((step) => [step.show, step.why].filter(Boolean).join(' ')),
    answer: example.answer,
  });
}

// A step that uses another skill: Classwork plays that skill's slides in the
// sequence; any other section keeps the step one line, with "Show how".
const withSubSkillMode = (example, sectionRole) => (list(example.steps).some((step) => isObject(step?.subSkill))
  ? { ...example, subSkills: !lower(sectionRole) || lower(sectionRole) === 'classwork' ? EXAMPLE_SUB_SKILLS.IN_SEQUENCE : EXAMPLE_SUB_SKILLS.ON_REQUEST }
  : example);

/**
 * The example this question plays, or null:
 *   { source: 'authored' | 'family', format: 'steps' | 'replay', prompt,
 *     steps: [{ show, why, board? }], answer, handOverAfter }
 * `assignmentProblems` (assignmentProblemKeys) keeps out an example that is an
 * item on the same assignment. `coveringExample` is the id of the example an
 * earlier question on the same skill named, for a question that names none.
 */
export const workedExampleFor = (question, { seed = 0, lessonSupports = null, sectionRole = null, assignmentProblems = null, coveringExample = null, asReplay = true } = {}) => {
  try {
    const authoredOptions = { sectionRole, exampleId: coveringExample };
    const authored = authoredReplay(question, lessonSupports, authoredOptions) || authoredStepCard(question, lessonSupports, authoredOptions);
    if (authored && !isAssignmentItem(authored.prompt, assignmentProblems) && safeFor(question, authored)) return withSubSkillMode(authored, sectionRole);
    const radical = radicalFamilyReplay(question, { seed, assignmentProblems, asReplay });
    if (radical) return withSubSkillMode(radical, sectionRole);
    // The family tries six seeds from the one it is given, so each pass here is six new ones.
    for (let pass = 0; pass < 3; pass += 1) {
      const sibling = buildSimilarWorkedExample(question, { seed: (Number(seed) || 0) + pass * 6 });
      if (!sibling) return null;
      if (!isAssignmentItem(sibling.prompt, assignmentProblems)) {
        // `asReplay: false` asks only whether the question has an example at
        // all (lessonExampleContext, for the questions before this one): the
        // sibling's text answers that without playing it on the engine.
        const replay = asReplay ? familyReplay(question, sibling) : null;
        if (replay && !isAssignmentItem(replay.prompt, assignmentProblems) && safeFor(question, replay)) return replay;
        return { source: 'family', format: 'steps', prompt: sibling.prompt, steps: sibling.steps.map(stepOf), answer: sibling.answer, handOverAfter: 0 };
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * The example as a faded one: its first steps only (`handOverAfter`), with no
 * answer, for the second Classwork question on a skill. The example itself
 * where it has nothing to fade.
 */
export const fadedExample = (example) => {
  // A replay carries `fadeLimit`: the steps before its solving move. The line
  // that reads x = value is never on a faded slide.
  const asked = Number(example?.handOverAfter);
  const after = Number.isInteger(example?.fadeLimit) ? Math.min(asked, example.fadeLimit) : asked;
  if (!isObject(example) || !(after >= 1) || after >= list(example.steps).length) return example;
  return { ...example, steps: example.steps.slice(0, after), answer: '', faded: true, stepCount: example.steps.length };
};

/* --------------------------------------- before the first question on a skill */

// A Question Family slot is stored as a blueprint: its numbers, and so its
// worked sibling, exist only once it is delivered. Its skill is its family,
// and it has an example when a support family claims it.
const familySlotId = (question) => (isObject(question?.questionFamily) ? text(question.questionFamily.id) : '');
const lessonSkillOf = (question) => exampleSkillOf(question) || familySlotId(question) || null;
const claimedFamilySlot = (question) => {
  try {
    return Boolean(familySlotId(question)) && Boolean(familyFor(question));
  } catch {
    return false;
  }
};

/**
 * What the assignment tells the question about its example: the section's own
 * role, the lesson's examples, the assignment's problems, and whether this is
 * the first Classwork question on its skill that has an example to open
 * (`newSkill`). An earlier question on the same skill that showed one has
 * taught it already; a question that says it needs none opens none.
 *
 *   questions            the questions THIS student is given, in the order
 *                        they meet them (a retired or omitted question taught
 *                        nothing);
 *   index                this question's place in them;
 *   roleOf               (question) → its section's role;
 *   assignmentQuestions  every question of the assignment, for "never another
 *                        item on the same assignment" (default: `questions`).
 */
export const lessonExampleContext = ({ questions = [], index = -1, sectionRole = null, roleOf = null, lessonSupports = null, assignmentQuestions = null } = {}) => {
  const supports = isObject(lessonSupports) ? lessonSupports : null;
  const all = list(questions);
  const assignmentProblems = assignmentProblemKeys(Array.isArray(assignmentQuestions) ? assignmentQuestions : all);
  const context = { sectionRole: lower(sectionRole) || null, lessonSupports: supports, assignmentProblems, newSkill: false, fadeTurn: false, coveringExample: null };
  const question = all[index];
  if (!isObject(question) || context.sectionRole !== 'classwork' || questionExampleExemption(question)) return context;
  const skill = lessonSkillOf(question);
  // No skill to name: nothing says this is a new one, so nothing opens by itself.
  if (!skill) return context;
  const role = (candidate) => lower(typeof roleOf === 'function' ? roleOf(candidate) : candidate?.activityRole);
  // Only "none", "one" and "more than one" matter, so the count stops at two:
  // a long run of questions on one skill costs no more than its first two.
  const taughtEarlier = [];
  for (const earlier of all.slice(0, index)) {
    if (taughtEarlier.length >= 2) break;
    if (isObject(earlier)
      && role(earlier) === 'classwork'
      && !questionExampleExemption(earlier)
      && lessonSkillOf(earlier) === skill
      && (claimedFamilySlot(earlier) || Boolean(workedExampleFor(earlier, { lessonSupports: supports, sectionRole: 'classwork', assignmentProblems, asReplay: false })))) {
      taughtEarlier.push(earlier);
    }
  }
  // One example can cover several questions on a skill: a question that names
  // none takes the one the first question on its skill named.
  const named = taughtEarlier.map((earlier) => (typeof earlier.example === 'string' ? text(earlier.example) : '')).find(Boolean) || null;
  return {
    ...context,
    newSkill: taughtEarlier.length === 0,
    // The second question on the skill: its example plays faded.
    fadeTurn: taughtEarlier.length === 1,
    coveringExample: question.example === undefined ? named : null,
  };
};

/**
 * Whether the example opens by itself now: Classwork, the first question on a
 * new skill, an example to open, and a question the student has not started.
 * One they have opened, tried or closed is theirs: it never opens again.
 */
export const exampleOpensByItself = ({ rule = null, newSkill = false, fadeTurn = false, example = null, alreadyUsed = false, alreadyShown = false, attemptCount = 0, totalAttempts = 0, locked = false } = {}) => Boolean(
  rule?.opensByItself === true
    && (newSkill === true || (fadeTurn === true && Number(example?.handOverAfter) >= 1))
    && example
    && alreadyUsed !== true
    && alreadyShown !== true
    && locked !== true
    && !(Number(attemptCount) > 0)
    && !(Number(totalAttempts) > 0),
);
