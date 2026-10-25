/*
 * WHAT AN IMPORT TELLS THE TEACHER ABOUT THE AUDITED CCMR BANK.
 *
 * The import's audit (the server's hydration, then proveImportedCcmrClaims in
 * canonicalCcmrHydration.js) becomes the warnings Review shows: what was
 * sourced, and every exam-style question kept as written with the reason.
 * Teacher-only; it lives here, not in App, so the student first load does
 * not carry it.
 */
// #359: "no compatible audited CCMR item" must be a clear, teacher-facing
// message distinguishable from a plain "nothing sourced" silence — never a
// reason to insert an unrelated question merely to hit the 15% target.
export const ccmrAuditWarnings = (audit) => {
  const messages = [];
  const sourcedCount = Number(audit?.autoSourced || 0) + Number(audit?.replaced || 0);
  if (sourcedCount > 0) {
    messages.push(`MathMaster sourced ${sourcedCount} Practice item${sourcedCount === 1 ? '' : 's'} from the audited CCMR Fidelity V2.1 bank.`);
  }
  const gaps = Array.isArray(audit?.misses) ? audit.misses : [];
  const semanticGaps = gaps.filter((miss) => miss?.reason === 'no_semantically_compatible_audited_item'
    || (Array.isArray(miss?.details) && miss.details.some((detail) => detail?.reason === 'no_semantically_compatible_audited_item')));
  if (semanticGaps.length) {
    messages.push('MathMaster kept the teacher-authored Practice question(s) as written: the audited CCMR bank has same-TEKS items, but none that match this question\'s construct (e.g. a sequence rather than function evaluation, a matrix task, or a system\'s dimension), so nothing was substituted.');
  }
  // proveImportedCcmrClaims: every audited item offered for an exam-style
  // question failed MathMaster's checks in its place, so none was used.
  const failedChecks = gaps.filter((miss) => miss?.reason === 'no_audited_item_passed_checks');
  if (failedChecks.length) {
    const which = failedChecks.map((miss) => `Question ${miss.questionNumber}`).join(', ');
    messages.push(`MathMaster kept ${which} as written: no audited CCMR item offered for ${failedChecks.length === 1 ? 'it' : 'them'} passed MathMaster's assignment checks in place, so nothing was substituted.`);
  }
  // TT11: an exam-style question the import never checked against the bank,
  // or one whose TEKS the bank has no item on, is named too: neither is
  // kept as written in silence.
  const numbered = (miss) => (Number.isFinite(Number(miss?.questionNumber)) ? `Question ${miss.questionNumber}` : null);
  const unchecked = gaps.filter((miss) => miss?.reason === 'no_audited_item_offered');
  if (unchecked.length) {
    const which = unchecked.map(numbered).filter(Boolean).join(', ') || `${unchecked.length} exam-style question${unchecked.length === 1 ? '' : 's'}`;
    messages.push(`MathMaster kept ${which} as written: no audited CCMR item was offered for ${unchecked.length === 1 ? 'it' : 'them'}, so ${unchecked.length === 1 ? 'it was' : 'they were'} not checked against the bank.`);
  }
  const noSameTeks = gaps.filter((miss) => miss?.reason === 'no_same_teks_audited_item');
  if (noSameTeks.length) {
    const which = noSameTeks.map(numbered).filter(Boolean).join(', ') || `${noSameTeks.length} exam-style question${noSameTeks.length === 1 ? '' : 's'}`;
    messages.push(`MathMaster kept ${which} as written: the audited CCMR bank has no item on ${noSameTeks.length === 1 ? 'its' : 'their'} TEKS for that exam, so nothing was substituted.`);
  }
  return messages;
};

export default ccmrAuditWarnings;
