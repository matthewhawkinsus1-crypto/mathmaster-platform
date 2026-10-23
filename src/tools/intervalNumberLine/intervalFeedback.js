/*
 * WHAT A WRONG NUMBER-LINE GRAPH SAYS (walkthrough 2026-10-23, Modeling and
 * Solving Linear Inequalities CW 5).
 *
 * Every wrong graph got "Check each endpoint, whether it is open or closed,
 * and which region is shaded": an open dot at the right place was told to
 * recheck everything. When the endpoints are where the item's are, only the
 * open/closed choice can be off; when a single ray starts at the right number
 * but runs the other way, only the shading is. The message says which,
 * never a value. Where the method is withheld (a DOL, quiz or test) it stays
 * general.
 */
import { normalizeIntervals } from './intervalMath.js';

export const INTERVAL_GRAPH_RETRY = 'The graph is not right yet. Check each endpoint, whether it is open or closed, and which region is shaded.';

const same = (a, b) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const finiteEnd = (interval) => {
  const lower = Number.isFinite(interval.min);
  const upper = Number.isFinite(interval.max);
  if (lower === upper) return null;
  return lower ? { value: interval.min, toward: 'right' } : { value: interval.max, toward: 'left' };
};

export const intervalGraphMissMessage = ({ built = [], expected = [], methodWithheld = false } = {}) => {
  if (methodWithheld) return INTERVAL_GRAPH_RETRY;
  const mine = normalizeIntervals(built);
  const want = normalizeIntervals(expected);
  if (!mine.length || mine.length !== want.length) return INTERVAL_GRAPH_RETRY;
  if (mine.every((interval, index) => same(interval.min, want[index].min) && same(interval.max, want[index].max))) {
    return 'Your endpoints are in the right places. Check whether each one is open or closed: a closed dot includes the number, an open dot leaves it out.';
  }
  if (mine.length === 1) {
    const ray = finiteEnd(mine[0]);
    const target = finiteEnd(want[0]);
    if (ray && target && same(ray.value, target.value) && ray.toward !== target.toward) {
      return 'Your endpoint is in the right place, but the shading runs the wrong way. Check which numbers make the inequality true: test one on each side.';
    }
  }
  return INTERVAL_GRAPH_RETRY;
};
