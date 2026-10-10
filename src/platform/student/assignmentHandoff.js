/*
 * WHERE THE "CONTINUE" BUTTON GOES WHEN A SECTION IS FINISHED.
 *
 * The workspace's completion button used to fall back to the next section
 * even when that section was already complete — "Continue to Practice →" with
 * Practice done (QA round 2). The order is now:
 *
 *   1. the next LATER section that still has unfinished, open work;
 *   2. otherwise, when this assignment asks nothing more right now, hand off
 *      to "Up next" (resolveUpNext: the next thing Home would recommend);
 *   3. otherwise, the assignment's results page, which says what opens when.
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
  if (upNext?.assignment) {
    return { kind: 'upNext', label: upNext.assignment.title || 'your next assignment', upNext };
  }
  return { kind: 'results', label: 'your results' };
};

export default resolveAssignmentHandoff;
