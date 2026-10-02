/*
 * Shared grader for the `graphing` structured question surface ("Graphing
 * Lines", src/GraphLine.jsx) — run by the screen for the verdict it reports,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from GraphLine.jsx: two parts, slope and
 * y-intercept; a part is complete when its box is not empty and correct when
 * `Number(entry) === key` — exact, no tolerance, exactly as before. Partial
 * credit is the share of correct parts.
 *
 * THE KEY. An authored numeric `m` / `b` is the key, unchanged. GraphLine used
 * to compare against `question.m` / `question.b` even when they were absent —
 * and the type catalog's own example and the V5 compile author a `graph` with
 * one line (plus a single `answer`), never m/b — so those items could never be
 * marked correct: every slope and intercept was compared with `undefined`.
 * Now a key that is not authored is read from the one line the screen shows:
 * the displayed graph's single `{ type: 'line', m, b }` function, when that is
 * the ONLY line the graph draws. An authored numeric string ("2") is read as
 * its number (it too could never match before). Anything else still has no
 * key, and that part still cannot be correct. Where the old screen could mark
 * a part correct, the verdict is unchanged.
 */
import declaration from '../declarations/graphing.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { workText } from '../../toolMath/scenario/scenarioWork.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A finite number, or a numeric string, as a number; anything else null. */
const keyNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

/*
 * The graph GraphLine displays when it does not build one from m/b:
 * `question.graph` when set, else a `visual` of type graph. The single line
 * is used only when nothing else on that graph draws a line (GraphDisplay
 * also draws `graph.line` and a top-level `graph.m` / `graph.b`).
 */
const displayedSingleLine = (question) => {
  const shown = question.graph ? question.graph : (question.visual?.type === 'graph' ? question.visual : null);
  if (!isObject(shown)) return null;
  const functions = Array.isArray(shown.functions) ? shown.functions : [];
  if (functions.length !== 1 || !isObject(functions[0])) return null;
  const extraLine = Boolean(shown.line) || Number.isFinite(Number(shown.m)) || Number.isFinite(Number(shown.b));
  if (extraLine) return null;
  const line = functions[0];
  if ((line.type || line.kind || 'line') !== 'line') return null;
  const m = keyNumber(line.m);
  const b = keyNumber(line.b);
  return m === null || b === null ? null : { m, b };
};

export const lineFeatureKey = (question = {}) => {
  const line = displayedSingleLine(question);
  return {
    m: keyNumber(question.m) ?? line?.m ?? null,
    b: keyNumber(question.b) ?? line?.b ?? null,
  };
};

const part = (id, label, raw, key) => {
  const value = workText(raw);
  // GraphLine: `value !== ''` (the number input reports '' for anything it
  // cannot read), then an exact Number() comparison.
  return {
    id,
    label,
    isComplete: value !== '',
    isCorrect: value !== '' && key !== null && Number(value) === key,
    response: value,
  };
};

const lineFeatures = (question, work) => {
  const key = lineFeatureKey(question);
  return gradedResult({
    parts: [
      part('slope', 'Slope', work.slope, key.m),
      part('intercept', 'Y-intercept', work.intercept, key.b),
    ],
  });
};

export default bindToolGrader(declaration, 'graphing', {
  lineFeatures,
});
