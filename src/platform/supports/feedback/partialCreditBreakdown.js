/*
 * WHAT "40% PARTIAL CREDIT SO FAR" IS MADE OF.
 *
 *   partialCreditBreakdown(record) → "last attempt: 2 of 5 parts right — still to fix: Slope, y-intercept" | ''
 *
 * Read from the record's own part grades (the latest graded attempt, as the
 * attempt policy stores them): how many graded parts were right and which
 * still need work, by their labels. Parts nobody grades (graded: false) are
 * left out. It names parts, never answers. The caller shows it only where
 * outcome feedback is open — on a DOL, quiz or test before release it would
 * say which parts are right.
 */
const text = (value) => String(value ?? '').trim();

export const partialCreditBreakdown = (record = {}) => {
  const parts = (Array.isArray(record?.partGrades) ? record.partGrades : [])
    .filter((part) => part && typeof part === 'object' && part.graded !== false);
  if (parts.length < 2) return '';
  const right = parts.filter((part) => part.isCorrect === true);
  const wrong = parts.filter((part) => part.isCorrect !== true);
  if (!right.length || !wrong.length) return '';
  const names = wrong.map((part, index) => text(part.label) || `Part ${parts.indexOf(part) + 1 || index + 1}`).slice(0, 4);
  const more = wrong.length > names.length ? `, and ${wrong.length - names.length} more` : '';
  return `last attempt: ${right.length} of ${parts.length} parts right — still to fix: ${names.join(', ')}${more}`;
};

export default partialCreditBreakdown;
