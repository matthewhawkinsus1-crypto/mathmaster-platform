/*
 * "IS MY GRAPH RIGHT?" — ANSWERED WITHOUT ANSWERING THE QUESTION.
 *
 * A student plotting a function by hand has no way to find out whether they
 * have it right until they submit, and submitting spends an attempt. On paper
 * they would check a point or two against the rule; the platform gave them
 * nothing between "guess" and "commit".
 *
 * This is that check. It compares what the student plotted against the real
 * function and says, per point, how far off it is.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *
 *   It does not move the point. A check that fixed the answer would be a
 *   different feature — the student would learn where to click, not what the
 *   function does.
 *
 *   It does not report the analysis answers. Whether the vertex is (2, -9) is
 *   the question; where the curve passes above the point you plotted is a
 *   reading of your own work. Only the plotted x-values are ever evaluated, so
 *   a student cannot walk the check along the axis to harvest the graph.
 *
 *   It is not free. Using it is mathematical help and is reported exactly like
 *   a revealed hint, so mastery weight is discounted the same way. A check that
 *   cost nothing would make the independent solve and the assisted one
 *   indistinguishable in the evidence.
 */

const TOLERANCE = 1e-6;

const finite = (value) => Number.isFinite(Number(value));

const round = (value) => Math.round(Number(value) * 1000) / 1000;

/** How the difference reads to a student, in their own units. */
export const describeVerticalMiss = (plottedY, trueY) => {
  const delta = round(Number(trueY) - Number(plottedY));
  if (Math.abs(delta) <= TOLERANCE) return { correct: true, delta: 0, text: 'on the function' };
  const size = Math.abs(delta);
  const units = size === 1 ? '1 unit' : `${size} units`;
  return {
    correct: false,
    delta,
    text: delta > 0 ? `${units} below the function` : `${units} above the function`,
  };
};

/**
 * Compare every plotted point against the function it was meant to land on.
 *
 * `evaluate` is injected so this stays pure and testable: the workspace passes
 * its own evaluator, and a test passes a one-line function.
 *
 * A point the student has not placed yet is skipped rather than reported as
 * wrong — "not plotted" is not a mistake, it is an unfinished task, and telling
 * a student their blank is incorrect is how a check loses their trust.
 */
export const checkPlottedPoints = ({ placements = {}, tasks = [], evaluate = null } = {}) => {
  if (typeof evaluate !== 'function') return { checked: 0, results: [], allOnFunction: false };

  const results = [];
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const placement = placements?.[task?.id];
    if (!Array.isArray(placement) || placement.length < 2) continue;
    const [x, y] = placement.map(Number);
    if (!finite(x) || !finite(y)) continue;

    const trueY = Number(evaluate(x));
    if (!finite(trueY)) {
      // The function has no value at this x. That is a real answer — the
      // student may have plotted outside the domain — and is not a failure of
      // the check.
      results.push({
        id: task.id,
        label: task.label || task.id,
        point: [x, y],
        correct: false,
        undefinedHere: true,
        text: 'the function has no value at this x',
      });
      continue;
    }

    const miss = describeVerticalMiss(y, trueY);
    results.push({
      id: task.id,
      label: task.label || task.id,
      point: [x, y],
      correct: miss.correct,
      undefinedHere: false,
      delta: miss.delta,
      text: miss.text,
    });
  }

  return {
    checked: results.length,
    results,
    allOnFunction: results.length > 0 && results.every((entry) => entry.correct),
  };
};

/**
 * The one line a student reads first.
 *
 * Says how many are right without naming which, so the summary is a reason to
 * read the list rather than a replacement for it.
 */
export const summarizeSelfCheck = (report = null) => {
  if (!report || !report.checked) return 'Plot at least one point, then check it.';
  const right = report.results.filter((entry) => entry.correct).length;
  if (right === report.checked) {
    return report.checked === 1
      ? 'Your point is on the function.'
      : `All ${report.checked} of your points are on the function.`;
  }
  return `${right} of ${report.checked} of your points are on the function.`;
};

export default checkPlottedPoints;
