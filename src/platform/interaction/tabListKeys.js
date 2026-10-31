/*
 * THE KEYS OF A TAB LIST (TT27, slice 2; WAI-ARIA "Tabs", manual activation).
 *
 * Live Class's Room / Walkthrough / Attention were buttons with role="tab" and
 * nothing else of the pattern: every tab was a Tab stop, the arrow keys did
 * nothing, and no panel said it belonged to them. A tab list is ONE Tab stop:
 * the selected tab, with the others tabindex -1. The arrow keys, Home and End
 * move focus between the tabs; Enter or Space (a native button's click) is what
 * selects one.
 *
 * Moving does not select (the pattern's "manual activation", which it advises
 * when choosing a tab does work). Choosing Walkthrough picks the class's live
 * assignment when none is chosen, and the choice carries to the other views, so
 * a teacher arrowing from Room to Attention would have changed it on the way
 * past, where a click on Attention does not.
 *
 * A horizontal list takes Left and Right; Up and Down are left to the page,
 * which scrolls on them. (`vertical` swaps the pair.) Both wrap.
 */

/** The tab a key moves focus to from `index`, or null when the key does not move it. */
export const tabKeyTarget = (key, index, count, { vertical = false } = {}) => {
  const total = Number(count) || 0;
  if (total <= 0) return null;
  const current = Number.isInteger(index) && index >= 0 && index < total ? index : 0;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  const forward = vertical ? 'ArrowDown' : 'ArrowRight';
  const back = vertical ? 'ArrowUp' : 'ArrowLeft';
  if (key === forward) return (current + 1) % total;
  if (key === back) return (current - 1 + total) % total;
  return null;
};
