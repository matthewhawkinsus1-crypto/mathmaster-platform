/*
 * WHETHER A QUESTION IS EXAM-STYLE PRACTICE, AND FOR WHICH EXAM.
 *
 * Split from ./questionAlignmentInfo.js, which re-exports it: the assignment's
 * question navigator (App.jsx) reads only this, and importing it from there
 * put every assessment standard reference (about 11 KB gzip) in a student's
 * first load (scripts/check-first-load-budget.mjs).
 */
const EXAM_FRAMEWORKS = new Set(['digitalSAT', 'act', 'tsia2', 'asvab']);

export const cleanFramework = (value) => {
  const framework = String(value || '').trim();
  return EXAM_FRAMEWORKS.has(framework) ? framework : null;
};

const directAssessmentAlignment = (question = {}, framework = null) => (
  Boolean(framework)
    ? (Array.isArray(question?.alignments) ? question.alignments : []).find((entry) => (
      String(entry?.framework || '').trim() === framework
      && Boolean(String(entry?.domainId || '').trim())
    )) || null
    : null
);

export const questionAssessmentFramework = (question = {}, fallbackContext = null) => {
  const authored = question?.assessmentContext;
  const authoredFramework = cleanFramework(authored?.framework);
  // A label should be as strict as the Honors policy: assessmentContext alone
  // is not enough to call an ordinary course item "SAT style." The authored
  // question also needs a direct framework/domain alignment. Secure framework
  // sessions can use the explicit fallback context because the server already
  // selected the item from that framework's direct exam bank.
  const authoredAlignment = directAssessmentAlignment(question, authoredFramework);
  if (authored?.examStyle === true && authoredFramework && authoredAlignment) {
    return { framework: authoredFramework, domainId: String(authoredAlignment.domainId || ''), examStyle: true };
  }

  const fallbackFramework = cleanFramework(fallbackContext?.framework || fallbackContext?.assessmentFramework);
  if (fallbackFramework && fallbackContext?.examStyle === true) {
    return { framework: fallbackFramework, domainId: String(fallbackContext?.domainId || ''), examStyle: true };
  }
  return { framework: null, domainId: '', examStyle: false };
};
