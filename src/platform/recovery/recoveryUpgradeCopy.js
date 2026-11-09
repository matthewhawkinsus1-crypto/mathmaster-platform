/*
 * PREPARE RECOVERY'S NUMBERS, ITS APPROVE RULE AND ITS ALERT.
 *
 * Pure, so the dialog (RecoveryUpgradeModal.jsx) and the tests read one
 * vocabulary (teacher features walk, items 2 and 4).
 */

// A count as a teacher reads it: "31,717,993 fresh versions", never
// "31717993". A family can number its fresh versions in the tens of millions,
// and a screen reader says a grouped number as a number, not digit by digit.
const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const groupedCount = (value) => GROUPED.format(Number(value) || 0);

/** "1 fresh version", "31,717,993 fresh versions". */
export const countOf = (value, one, many = `${one}s`) => `${groupedCount(value)} ${Number(value) === 1 ? one : many}`;

/** The line under one question the plan adds Recovery to: what its fresh versions keep. */
export const recoveryChangeDetail = (change = {}) => {
  const facts = [];
  if (Number.isFinite(change.freshVersions)) facts.push(countOf(change.freshVersions, 'fresh version'));
  if (change.excludedFromAssignment) facts.push(`never a problem already in this assignment (${groupedCount(change.excludedFromAssignment)} set aside)`);
  if (change.standards?.length) facts.push(`same TEKS (${change.standards.join(', ')})`);
  if (change.rigor?.dok) facts.push(`same DOK ${change.rigor.dok}`);
  facts.push('the same tool, graded by MathMaster');
  return facts.join(' · ');
};

/** What the plan leaves alone of the students' records: every one, counted. */
export const studentRecordsSentence = (records = {}) => {
  const students = Number(records.students) || 0;
  if (!students) return 'No student has a record for this assignment yet.';
  const parts = [
    `${groupedCount(records.withAnyWork)} with saved work`,
    `${groupedCount(records.withDolWork)} with DOL answers`,
    `${groupedCount(records.withCompletedDol)} who finished the DOL`,
  ];
  if (records.withRecoveryRecords) parts.push(`${groupedCount(records.withRecoveryRecords)} with a Recovery already under way`);
  return `${countOf(students, 'student record')} (${parts.join(', ')}). None of them is written.`;
};

/**
 * May the teacher approve now? Approve sends the plan the teacher read
 * (its plan hash). Once the server has said the assignment changed after
 * the preview, that plan is gone and a second press would only be refused
 * again, so Approve waits until "Check again" has loaded the plan as it
 * stands.
 */
export const canApproveRecoveryUpgrade = ({ preview = null, result = null, committing = false, loading = false, error = null } = {}) => Boolean(
  preview?.report?.changed && preview?.planHash && !result && !committing && !loading && !error?.planChanged,
);

export const PLAN_CHANGED_ALERT = Object.freeze({
  lead: 'The assignment changed after this preview.',
  detail: 'Nothing was changed. Check again to see what Recovery would add now.',
});

/**
 * The dialog's alert, each thing said once: `{ lead, detail, code }`, or null.
 * After "assignment changed" the lead was followed by the server's sentence
 * saying the same again ("This assignment changed after the preview, so
 * nothing was changed. Preview the Recovery upgrade again."), then its error
 * code: it now says it once, with the step in the dialog's own words (its
 * button is "Check again"). Any other refusal keeps the server's words and
 * the error code, which say what went wrong.
 */
export const recoveryUpgradeAlert = (error) => {
  if (!error) return null;
  if (error.planChanged) return { ...PLAN_CHANGED_ALERT, code: null };
  return {
    lead: 'Nothing was changed.',
    detail: String(error.message || ''),
    code: error.errorCode ? `${error.errorCode}${error.reason ? ` · ${error.reason}` : ''}` : null,
  };
};
