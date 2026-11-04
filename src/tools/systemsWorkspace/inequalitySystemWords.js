/*
 * ONE INEQUALITY IS NOT A SYSTEM (F-SW-SYSTEM-WORDS, PR #537 walkthrough).
 *
 * The student-build workspace was written for systems, and said so on a
 * one-inequality lesson (Algebra I M3 T2 L4, the day before systems): "Find
 * overlap / Combine regions", "The overlap of the shaded sides is hatched",
 * "Is the point a solution to the entire system?". With one constraint the
 * same step is "Check your region" and the question "Is the point a
 * solution?". With two or more constraints nothing changes.
 *
 * The system sentence stays where it is used, so the screen still reads as it
 * always did; wordsFor(count) gives the one-constraint sentence for it. Every
 * sentence here is one the screen says (tests/platform/
 * inequalitySystemWords.test.mjs holds the two together), so an edited system
 * sentence cannot quietly lose its one-constraint wording.
 *
 * No React here.
 */
export const ONE_CONSTRAINT_WORDS = Object.freeze({
  // The tool's badge (SystemsWorkspace.jsx).
  'Systems of Inequalities': 'Inequality in Two Variables',
  // The combine step: one region, nothing to overlap.
  'Combine the regions': 'Check your region',
  'Find overlap / Combine regions': 'Check your region',
  'Every constraint checks out. Combine them to see your overlap region.': 'Your inequality checks out. Check your region to see it on the graph.',
  'Locked until every constraint above is correct.': 'Locked until your inequality above is correct.',
  'Every constraint is built. Combine them to see your overlap region.': 'Your inequality is built. Check your region to see it on the graph.',
  'Finish every constraint above first.': 'Finish your inequality above first.',
  'Your overlap is hatched on the graph.': 'Your region is hatched on the graph.',
  'Show where the shaded regions overlap.': 'Show the region your inequality shades.',
  'Build each constraint, combine them, and reason about the result.': 'Build your inequality, check its region, and reason about the result.',
  'Use the provided system to combine regions and complete the requested reasoning.': 'Use the provided inequality to show its region and complete the requested reasoning.',
  'Classify the combined solution region.': 'Classify the solution region.',
  // The graph, in words.
  'The overlap of the shaded sides is hatched.': 'The shaded side is hatched.',
  // A test point.
  'Test the marked point against each inequality.': 'Test the marked point against the inequality.',
  'Substitute the point into each inequality.': 'Substitute the point into the inequality.',
  'Is the point a solution to the entire system?': 'Is the point a solution?',
  'Does this point lie exactly on one of the boundary lines?': 'Does this point lie exactly on the boundary line?',
  'At least one individual inequality is misjudged. Substitute the point into that inequality by itself and see whether the statement is true.':
    'The inequality is misjudged. Substitute the point into it and see whether the statement is true.',
  'Your individual inequality answers are right, but the system verdict is not. A point solves the system only when it satisfies every inequality at once.':
    'Your answer about the inequality is right, but your answer to “Is the point a solution?” is not. A point is a solution exactly when it satisfies the inequality.',
  // The region and the hints.
  'Look at whether the shaded overlap keeps going forever in some direction, closes into a polygon, or never forms at all.':
    'Look at whether the shaded region keeps going forever in some direction, closes into a polygon, or never forms at all.',
  'A region is unbounded when the constraints leave a direction open forever. If no point satisfies every inequality at once, there is no solution.':
    'A region is unbounded when the inequality leaves a direction open forever. If no point satisfies the inequality, there is no solution.',
  'Solid means the boundary is included (≤ or ≥). Dashed means it is not (< or >). Shade the side where a point makes the original inequality true, then check a point in that shaded region against every inequality to find the system solution.':
    'Solid means the boundary is included (≤ or ≥). Dashed means it is not (< or >). Shade the side where a point makes the original inequality true, then check a point in that shaded region against the inequality.',
});

/** The words for a workspace of `constraintCount` constraints: the system sentence, or its one-constraint wording. */
export const wordsFor = (constraintCount) => (text) => (
  Number(constraintCount) === 1 && Object.hasOwn(ONE_CONSTRAINT_WORDS, text) ? ONE_CONSTRAINT_WORDS[text] : text
);
