/*
 * LESSONS WITH EXACTLY THE HONORS DEPTH AREAS A TEST ASKS FOR.
 *
 * Each question supplies the one depth area it is named for and nothing else
 * (honorsDepthAiRepair.test.mjs checks that against the real check), so a
 * lesson can be built with any set of areas and judged by inspectHonorsRigor
 * itself rather than by a hand-written report.
 */
export const AREA_QUESTIONS = Object.freeze({
  higherOrderReasoning: { activityRole: 'classwork', dok: 3, prompt: 'Solve $3(x - 2) = 2x + 5$.' },
  multipleRepresentations: { activityRole: 'classwork', dok: 2, studentActions: ['connectRepresentations'], prompt: 'Match each table to its equation.' },
  justification: { activityRole: 'practice', dok: 2, prompt: 'Explain why $x = 4$ solves $2x + 3 = 11$.' },
  modelingApplication: { activityRole: 'practice', dok: 2, taskType: 'modeling', prompt: 'A box has volume $x^3 + 3x^2 + 2x$ and height $x + 2$. Find its width and length.' },
});

// A lesson whose questions supply exactly `areas`, aligned to a TEKS unless `teks` is false.
export const lessonWith = (areas, { teks = true } = {}) => [
  { activityRole: 'classwork', dok: 2, prompt: 'Solve $2x + 3 = 11$.' },
  ...areas.map((area) => AREA_QUESTIONS[area]),
].map((question) => ({ ...question, ...(teks ? { standard: 'A.5A' } : {}) }));
