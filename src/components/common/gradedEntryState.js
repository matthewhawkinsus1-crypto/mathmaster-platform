/*
 * What a graded entry says about itself (GradedEntryMark.jsx): nothing before
 * it is graded, "Check this" when wrong, "Correct" when right.
 */
export const gradedEntryState = (grade) => {
  if (!grade || typeof grade.isCorrect !== 'boolean') return null;
  return grade.isCorrect
    ? { invalid: false, symbol: '✓', text: 'Correct' }
    : { invalid: true, symbol: '✗', text: 'Check this' };
};

export default gradedEntryState;
