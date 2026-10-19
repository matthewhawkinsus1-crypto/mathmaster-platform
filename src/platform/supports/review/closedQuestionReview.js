import { buildPrivateSupport } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { buildToolSolutionReviewModel } from '../../../tools/shared/toolSolutionReview.js';
import { familyFor } from '../families/index.js';

/*
 * WHAT A CLOSED QUESTION'S WORKED SOLUTION IS MADE OF — one model for the
 * review panel (src/SolutionReviewPanel.jsx), so the panel, its Read aloud
 * text and the attempt message all agree on whether there is a review at all.
 *
 *   authored  the question's own solutionReview (Path shape), when it has one
 *   tool      the registry tool's builder output (text only)
 *   legacy    true when the legacy question-type review has something to show
 *             (`legacyContent` is injected — SolutionReview.jsx's
 *             legacySolutionReviewContent — so this module stays importable
 *             in node)
 *   fromFamily true when `authored` was written by the question's support
 *             family (familyFor(question).workedSolution): the question has no
 *             authored reasoning steps of its own, and no tool review with
 *             steps, so the family's worked solution of THIS question fills
 *             the authored shape (headline, reasoning = its steps, answer
 *             summary); an authored headline, answerSummary, commonError and
 *             connection still win. It states the answer, which is why only
 *             this closed-question model asks for it — never hints, the
 *             back-up step or a sibling, which are shown while the item is open.
 *   hasContent / hasSteps / intro / speechText
 *
 * Pure and safe on any input: a builder or family that throws is "no tool
 * review" / "no family review".
 */
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

const authoredReviewOf = (question) => {
  try {
    const review = buildPrivateSupport(question || {}).solutionReview;
    if (!review) return null;
    const hasBody = Boolean(review.headline || review.reasoning.length || review.answerSummary || review.commonError || review.connection);
    return hasBody ? review : null;
  } catch {
    return null;
  }
};

/** The question family's worked solution, in the authored shape; null when it has none. */
const familyReviewOf = (question) => {
  try {
    const worked = familyFor(question)?.workedSolution?.(question);
    if (!worked || typeof worked !== 'object') return null;
    const reasoning = list(worked.steps).map(clean).filter(Boolean);
    if (!reasoning.length) return null;
    return { headline: clean(worked.headline), reasoning, answerSummary: clean(worked.answerSummary) || null };
  } catch {
    return null;
  }
};

/** Authored fields win; the family supplies the steps (and whatever the author left out). */
const withFamilySteps = (authored, family) => ({
  headline: clean(authored?.headline) || family.headline,
  reasoning: family.reasoning,
  commonError: authored?.commonError || null,
  connection: authored?.connection || null,
  answerSummary: authored?.answerSummary || family.answerSummary,
});

const toolReviewOf = (question) => {
  try {
    const model = buildToolSolutionReviewModel(question || {});
    if (!model) return null;
    const hasBody = Boolean(model.items.length || model.steps.length || model.why);
    return hasBody ? model : null;
  } catch {
    return null;
  }
};

const legacyContentOf = (question, legacyContent) => {
  try {
    return typeof legacyContent === 'function' ? legacyContent(question) || null : null;
  } catch {
    return null;
  }
};

// LaTeX is read as mathematics ($…$ for speechText.js), a sentence as words.
const looksLikeProse = (value) => (clean(value).match(/[A-Za-z]{2,}/g) || []).length >= 3 && !/\\(?:frac|sqrt|pi|infty|quad)|[=<>≤≥≠^]/.test(clean(value));
const spokenMath = (value) => {
  const text = clean(value);
  if (!text) return '';
  return text.includes('$') || looksLikeProse(text) ? text : `$${text}$`;
};

/*
 * WHAT THE LEGACY REVIEW SAYS, AS WORDS FOR READ ALOUD (HELP-11). 79 real
 * items had a worked solution Read aloud skipped, because only the authored
 * and tool reviews reached `speechText`. Each piece the legacy review draws is
 * read in the order it is drawn: the workflow's steps, the equation, the
 * answer forms, each part's answer, the graph-reading summary.
 */
export const legacyReviewSpeechLines = (question, content) => {
  if (!content || typeof content !== 'object') return [];
  const lines = [];
  list(content.workflowSolution?.entries).forEach((entry) => {
    lines.push([clean(entry.title), clean(entry.prompt)].filter(Boolean).join('. '));
    if (clean(entry.math)) lines.push(spokenMath(entry.math));
    list(entry.lines).forEach((line) => lines.push(clean(line)));
    list(entry.table?.rows).forEach((row) => lines.push(`Input ${row[0]}, output ${row[1]}`));
    if (clean(entry.note)) lines.push(clean(entry.note));
  });
  if (clean(question?.equationLatex)) lines.push(spokenMath(question.equationLatex));
  list(content.representations).forEach((representation) => lines.push(spokenMath(representation)));
  list(content.completeAnswerDetails).forEach((detail) => lines.push(clean(detail)));
  list(content.analysisSummary).forEach((summary) => lines.push(clean(summary)));
  return lines.map(clean).filter(Boolean);
};

/*
 * PART BY PART: WHAT THE STUDENT WROTE BESIDE THE ANSWER, WRONG PARTS FIRST
 * (HELP-11). For a question with several authored answer boxes, given the
 * device's own grading of each part ({ key | id, response, isCorrect }).
 * Rows: { id, label, yourAnswer, correct, isCorrect } — parts marked wrong
 * first, then parts not graded, then the right ones; authored order within
 * each. Empty for a single box (the card's "Your answer" already says it) and
 * for anything that is not a list of answer boxes.
 */
const fieldAnswerText = (field) => {
  const candidates = [field?.answer, field?.expected, ...list(field?.acceptedAnswers), ...list(field?.accepted)];
  const first = candidates.find((value) => value !== undefined && value !== null && clean(Array.isArray(value) ? value.join(', ') : value) !== '');
  if (first === undefined) return '';
  return Array.isArray(first) ? `(${first.join(', ')})` : clean(first);
};

export const buildPartReviewRows = ({ question = null, parts = [] } = {}) => {
  const fields = list(question?.answerFields).filter((field) => field && clean(field.id));
  const given = list(parts).filter((part) => part && clean(part.key ?? part.id));
  if (fields.length < 2 || !given.length) return [];
  const rows = fields.map((field, order) => {
    const part = given.find((entry) => clean(entry.key ?? entry.id) === clean(field.id));
    return {
      id: clean(field.id),
      label: clean(field.label || field.prompt) || `Part ${order + 1}`,
      yourAnswer: clean(part?.response),
      correct: fieldAnswerText(field),
      isCorrect: typeof part?.isCorrect === 'boolean' ? part.isCorrect : null,
      order,
    };
  }).filter((row) => row.correct);
  if (rows.length < 2) return [];
  const rank = (row) => (row.isCorrect === false ? 0 : row.isCorrect === null ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.order - b.order).map(({ order: _order, ...row }) => row);
};

/** The rows as words for Read aloud. */
export const partReviewSpeech = (rows = []) => list(rows).map((row) => (
  `${row.label}: ${row.isCorrect === false ? 'not correct. ' : row.isCorrect === true ? 'correct. ' : ''}You wrote ${row.yourAnswer ? spokenMath(row.yourAnswer) : 'nothing'}. The answer is ${spokenMath(row.correct)}.`
)).join(' ');

export const buildClosedQuestionReview = ({ question = null, isToolQuestion = false, wasCorrect = false, legacyContent = null } = {}) => {
  if (!question || typeof question !== 'object') return null;
  const tool = isToolQuestion ? toolReviewOf(question) : null;
  const ownReview = authoredReviewOf(question);
  // Steps of its own, or a tool review with steps: the family adds nothing.
  // The tool review is asked for even when the caller did not flag a tool
  // question (SolutionReview2 does not), so the rule holds for every caller.
  const toolSteps = (isToolQuestion ? tool : toolReviewOf(question))?.steps?.length;
  const family = ownReview?.reasoning?.length || toolSteps ? null : familyReviewOf(question);
  const authored = family ? withFamilySteps(ownReview, family) : ownReview;
  const fromFamily = Boolean(family);
  const legacyReview = isToolQuestion ? null : legacyContentOf(question, legacyContent);
  const legacy = Boolean(legacyReview?.hasContent);
  const hasContent = Boolean(authored || tool || legacy);
  // The words promise what is shown: steps only when there are steps
  // (release-candidate QA m9 — "Compare each step" over a bare answer).
  const hasSteps = Boolean(list(authored?.reasoning).length || list(tool?.steps).length || (legacy && list(legacyReview?.workflowSolution?.entries).length > 0));
  const intro = !hasContent
    // HELP-24: Ask is gone once a question closes, so this does not point at
    // it; the teacher is someone to talk to, not a button.
    ? 'There is no worked solution for this question yet. Your teacher can go over it with you.'
    : wasCorrect
      ? (hasSteps
        ? 'You got this one. Here is the reasoning behind it, so the next one is not a guess.'
        : 'You got this one. Here is the answer, for reference.')
      : (hasSteps
        ? 'Compare each step of your work with the worked solution.'
        : 'Compare your answer with the correct one below.');
  const speechText = [
    authored?.headline, ...(authored?.reasoning || []), authored?.answerSummary, authored?.commonError,
    ...(tool?.steps || []), ...(tool?.items || []).map((item) => `${item.label}: ${item.value}`), tool?.why ? `Why it works: ${tool.why}` : '',
    // The legacy review is read too (HELP-11): it used to be skipped.
    ...(legacy ? legacyReviewSpeechLines(question, legacyReview) : []),
  ].map(clean).filter(Boolean).join(' ');
  return { authored, tool, legacy, fromFamily, hasContent, hasSteps, intro, speechText };
};

/** Does this closed question have a worked solution to point at? */
export const closedQuestionHasReview = (args) => Boolean(buildClosedQuestionReview(args)?.hasContent);
