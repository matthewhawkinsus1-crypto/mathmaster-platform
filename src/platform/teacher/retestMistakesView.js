/*
 * WHAT THE RETEST SHOWED, IN THE TEACHER'S PER-STUDENT VIEW (TC02).
 *
 * The cycle has no Corrections after a Retest, so the mistakes its work proved
 * (functions/shared/testCycleRetestMistakes.mjs, read by getTeacherTestCyclePlans
 * once the student has turned it in) had no reader. These are the lines the plans
 * panel shows for them: each skill the Retest missed, the mistake MathMaster
 * recorded for it in the registry's own words, and, where the work did not show
 * one pattern, only that the skill was missed. Nothing is inferred here.
 *
 * Teacher words only. A student is never shown this.
 *
 * Pure: no React, no network.
 */

export const RETEST_MISTAKES_HEADING = 'What the Retest showed';
export const RETEST_NOTHING_MISSED = 'Nothing was missed on the Retest.';
export const RETEST_NO_PATTERN = 'No specific mistake was recorded. The work did not show one pattern.';

export const RETEST_STOOD_IN = 'No correction plan — this student missed the Test, so the Retest stood in for it.';
export const NO_CORRECTION_PLAN = 'No correction plan — this student did not fail the Test.';

/**
 * Whether this student's Retest stood in for a Test they missed. The plan stored
 * for it says nothing was targeted (there was no Test to target from), so the panel
 * says that instead of "did not fail the Test", and has no targeting to describe.
 */
export const retestStoodIn = (plans) => plans?.retest?.audit?.withoutOriginal === true;

/** The panel's lines, or null when there is nothing to show (no Retest turned in yet). */
export const describeRetestMistakes = (retestMistakes) => {
  if (!retestMistakes || !Array.isArray(retestMistakes.skills)) return null;
  const skills = retestMistakes.skills.map((skill) => {
    const mistakes = (Array.isArray(skill.mistakes) ? skill.mistakes : []).map((mistake) => ({
      key: mistake.code,
      text: `MathMaster recorded "${mistake.label}". ${mistake.meaning}`,
    }));
    return {
      key: skill.targetId,
      title: skill.label,
      missed: `Missed ${skill.missed} of ${skill.attempted}`,
      mistakes,
      note: mistakes.length ? null : RETEST_NO_PATTERN,
    };
  });
  return {
    heading: RETEST_MISTAKES_HEADING,
    skills,
    empty: skills.length ? null : RETEST_NOTHING_MISSED,
  };
};
