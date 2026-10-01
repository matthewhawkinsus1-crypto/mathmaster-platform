/*
 * Shared grader for the `intervalNumberLine` registry tool — run by the browser
 * tool for its feedback, by QuestionEngine for the recorded verdict, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from IntervalNumberLine.jsx's Check:
 *
 *   - the stages are the question's `ask`, filtered to graph / interval /
 *     inequality, defaulting to graph + interval;
 *   - graph:      `sameIntervals(built, expected)` — order-free, endpoints to
 *                 1e-9, open/closed flags exact, an infinite end never closed;
 *   - interval:   the tool's own notation reader (exact endpoints such as
 *                 -13/8, \frac, sqrt and pi are accepted, as its hint promises);
 *   - inequality: the tool's literal comparison against the sentence it writes
 *                 for the expected intervals, whitespace and case ignored, and
 *                 MathLive's \le / \ge / \lor read as the ≤ / ≥ / "or" they
 *                 display (a fix: the box only ever sends LaTeX, so a correct
 *                 sentence using them could never match before);
 *   - score:      stages correct / stages asked; correct only when every
 *                 asked stage is.
 *
 * `expected` is recomputed from the question's own `intervals` and never
 * leaves this function.
 */
import declaration from '../declarations/intervalNumberLine.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import {
  inequalityTextMatches,
  intervalsToNotation,
  normalizeIntervals,
  notationMatchesFlexible,
  resolveIntervalAsk,
  sameIntervals,
} from '../../toolMath/intervalNumberLine/intervalMath.mjs';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// The tool's boxes only ever hold text; anything else is treated as blank.
const typed = (value) => (typeof value === 'string' ? value : '');
const filled = (value) => typed(value).trim() !== '';

const graphPart = (work, expected) => {
  const built = Array.isArray(work.intervals) ? work.intervals : [];
  // Every piece the tool builds is an object. A response holding anything
  // else was not produced by the tool, and its graph is not readable.
  const readable = built.every(isPlainObject);
  return {
    id: 'graph',
    label: 'Number-line graph',
    isComplete: built.length > 0,
    isCorrect: readable && sameIntervals(built, expected),
    response: readable && built.length ? intervalsToNotation(built) : '',
  };
};

const notationPart = (work, expected) => ({
  id: 'interval',
  label: 'Interval notation',
  isComplete: filled(work.notation),
  isCorrect: notationMatchesFlexible(typed(work.notation), expected),
  response: typed(work.notation),
});

const inequalityPart = (work, expected, variable) => ({
  id: 'inequality',
  label: 'Inequality',
  isComplete: filled(work.inequality),
  isCorrect: inequalityTextMatches(typed(work.inequality), expected, variable),
  response: typed(work.inequality),
});

const numberLine = (question, work) => {
  const expected = normalizeIntervals(question.intervals);
  // Authored intervals that all normalize away (a reversed segment, say) are
  // no key at all — never a key that an empty graph matches.
  if (!expected.length) return ungradedResult('no-answer-key');
  const variable = question.variable || 'x';
  const ask = resolveIntervalAsk(question.ask);
  const parts = [];
  if (ask.includes('graph')) parts.push(graphPart(work, expected));
  if (ask.includes('interval')) parts.push(notationPart(work, expected));
  if (ask.includes('inequality')) parts.push(inequalityPart(work, expected, variable));
  // Equal weights: the tool's score was always stages correct / stages asked.
  // With a non-empty key a correct stage is always a filled one, so "every
  // asked stage complete and correct" is exactly the tool's every-check rule.
  return gradedResult({ parts });
};

export default bindToolGrader(declaration, 'intervalNumberLine', {
  numberLine,
});
