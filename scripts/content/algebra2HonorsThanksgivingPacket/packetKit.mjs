/*
 * THE SHAPES EVERY QUESTION AND WORKED EXAMPLE OF THE THANKSGIVING PACKET
 * REPEATS, AND THE RULES EACH ONE IS HELD TO AS IT IS BUILT.
 *
 * The packet is worked alone, over a break, by students who may have missed
 * the lesson. So every question carries the same supports, and `item` refuses
 * a question that lacks one: three hints, a "Let's back up" step with two
 * choices, a worked solution with its steps and the usual mistake. A question
 * that starts a new skill also names a worked example (`example`) and gives
 * the idea in one sentence (`idea`): Classwork shows that idea and the
 * example's one-line working as guided notes today, and plays the example's
 * step card once the step-through player ships
 * (docs/platform/WORKED_EXAMPLES.md).
 */
import { backUp, review, teks } from '../lib/lessonKit.mjs';

const fail = (id, message) => { throw new Error(`${id}: ${message}`); };

/** A worked example: a sibling problem (never an item of the packet) and its steps, each with its reason. */
export const example = (id, { skill, tool = null, problem, sibling = null, steps, moves = null }) => {
  if (!problem || !skill) fail(id, 'an example names its skill and states its problem.');
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 6) fail(id, `an example has 3 to 6 steps, not ${steps?.length}.`);
  steps.forEach(([show, why], index) => { if (!show || !why) fail(id, `step ${index + 1} needs what is shown and why.`); });
  return {
    id,
    skill,
    ...(tool ? { tool } : {}),
    source: 'authored',
    ...(sibling ? { sibling } : {}),
    problem,
    steps: steps.map(([show, why]) => ({ show, why })),
    ...(moves ? { moves } : {}),
  };
};

/** The example's working on one line, for today's guided notes. */
const oneLine = (worked) => `${worked.problem} ${worked.steps.map((step) => step.show).join(' → ')}`;

/**
 * One question. `tool` holds the fields its tool reads (or `responses` for an
 * answer box); `example` is a worked example of this unit, or 'setup' /
 * 'explain' for a question that needs none; a question on a skill an earlier
 * question already taught leaves it out.
 */
export const item = (questionId, {
  standards, dok, band, actions, prompt, tool = {}, hints, back, solution, example: worked = null, idea = null,
}) => {
  if (!Array.isArray(hints) || hints.length !== 3) fail(questionId, 'three hints.');
  if (!Array.isArray(back) || back.length !== 3 || back[1].length !== 2) fail(questionId, 'a back-up step: [prompt, [two options], correct].');
  const [headline, reasoning, answerSummary, commonError] = solution || [];
  if (!headline || !Array.isArray(reasoning) || reasoning.length < 2 || !commonError) fail(questionId, 'a worked solution: [headline, [steps], answer, usual mistake].');
  // Short and plain: a story problem may take four sentences, nothing takes more.
  if (String(prompt).split(/(?<=[.?!])\s+/).length > 4) fail(questionId, `the prompt is at most four short sentences: ${prompt}`);
  const exempt = worked === 'setup' || worked === 'explain';
  if (worked && !exempt && !idea) fail(questionId, 'a question that opens a worked example gives its idea in one sentence.');
  if (idea && exempt) fail(questionId, 'an idea belongs to a question that teaches a skill.');
  return {
    questionId,
    ...teks(...standards),
    studentActions: actions,
    dok,
    difficultyBand: band,
    prompt,
    ...tool,
    ...(worked ? { example: exempt ? { none: worked } : worked.id } : {}),
    ...(worked && !exempt ? {
      guidedNotes: { steps: [{ title: 'Key idea', instruction: idea }, { title: 'Worked example', instruction: oneLine(worked) }] },
    } : {}),
    // A first question whose honest sibling would state its answers (a parent
    // function's facts are its family's) names no authored example: it gives
    // the idea, and the platform's own sibling is the example.
    ...(!worked && idea ? { guidedNotes: { steps: [{ title: 'Key idea', instruction: idea }] } } : {}),
    hints,
    scaffold: backUp(...back),
    solutionReview: review(headline, reasoning, answerSummary, commonError),
  };
};

/** One unit: a Classwork section and the worked examples its questions open. */
export const unit = (number, title, examples, questions) => {
  const used = new Set(questions.map((question) => question.example).filter((value) => typeof value === 'string'));
  Object.values(examples).forEach((worked) => { if (!used.has(worked.id)) fail(worked.id, `no question of unit ${number} opens this example.`); });
  return {
    examples: Object.values(examples),
    section: {
      id: `unit-${number}`,
      role: 'classwork',
      title: `Unit ${number} — ${title}`,
      feedbackMode: 'immediate',
      hintsAllowed: true,
      attemptsAllowed: 3,
      questions,
    },
  };
};

/** A part that builds on earlier parts: its own key, and the key written with their names. */
export const builtOn = (from, answer) => ({ followThrough: { from, answer } });
