/*
 * WHERE THE "CONTINUE" BUTTON GOES WHEN A SECTION IS FINISHED.
 *
 * The workspace's completion button used to fall back to the next section
 * even when that section was already complete — "Continue to Practice →" with
 * Practice done (QA round 2). The order is now:
 *
 *   1. the next section that still has unfinished, open work;
 *   2. otherwise, this assignment's results page.
 *
 * FINISHING LANDS ON THE SUMMARY (student pass 3, RUN-12). The last button
 * used to read "Continue to <next lesson> →" and opened the next lesson, so a
 * student never saw this one's results: score by section, which items closed
 * wrong, Review. Now the results page comes first, and Up next is its second
 * action (StudentAssignmentResult shows the Up next card) — `upNext` rides
 * along for the page, it is never where the button goes.
 *
 * Pure: the caller supplies the candidates and performs the navigation.
 */
export const resolveAssignmentHandoff = ({
  nextIncompleteSection = null,
  nextIncompleteSectionLabel = '',
  upNext = null,
  student = true,
} = {}) => {
  if (nextIncompleteSection) {
    return { kind: 'section', label: nextIncompleteSectionLabel || 'next section' };
  }
  if (!student) return null;
  return { kind: 'results', label: 'your results', upNext: upNext?.assignment ? upNext : null };
};

/*
 * A SKIPPED QUESTION IS NOT A DEAD END (RUN-12).
 *
 * A student skipped Practice Q1, finished Q2 — the last open question — and
 * got "Correct!" with no Next, no Continue and no Enter: Next looks forward
 * only, and the section was not complete. When nothing workable lies ahead,
 * this names the earliest question still to do, this section's first:
 * "Go back to Practice Q1 (not answered)". `entries` are the navigator's
 * entries ({ index, role, sectionPosition }) in order.
 */
export const resolveSkippedQuestion = ({
  entries = [],
  currentIndex = null,
  currentRole = null,
  isWorkable = () => true,
  isComplete = () => false,
  attemptCountOf = () => 0,
  sectionLabelOf = () => '',
} = {}) => {
  const open = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.index !== currentIndex && isWorkable(entry) && !isComplete(entry.index));
  const target = open.find((entry) => entry.role === currentRole) || open[0];
  if (!target) return null;
  const section = String(sectionLabelOf(target.role) || '').trim();
  const number = (Number(target.sectionPosition) || 0) + 1;
  const state = Number(attemptCountOf(target.index)) > 0 ? 'not finished' : 'not answered';
  return {
    index: target.index,
    label: `Go back to ${section ? `${section} ` : ''}Q${number} (${state})`,
  };
};

export default resolveAssignmentHandoff;
