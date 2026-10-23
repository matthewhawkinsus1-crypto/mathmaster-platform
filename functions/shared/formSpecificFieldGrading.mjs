/*
 * THE FORM-SPECIFIC FIELD COMPARATORS, REGISTERED WHERE ANSWERS ARE GRADED.
 *
 * Importing this module is what makes `gradingMode: 'factoredForm'` and
 * `gradingMode: 'simplestRadicalForm'` grade by their mathematics
 * (answerUtils.mjs matchesFieldAnswer). It is imported by every surface that
 * marks a field — the multi-answer screen (src/MultiAnswerGrader.jsx), the
 * server's grading dispatch (serverGrading/serverResponseGrading.mjs, which
 * ingestion, the deadline finalizer, Recovery and the response inspector all
 * use) and Pre-Flight's grading contract — and by nothing on the student's
 * first load.
 */
import { registerFormSpecificComparator } from './answerUtils.mjs';
import { sameFactoredPolynomialExpression } from './factoredPolynomialExpressionEquivalence.mjs';
import { sameSimplestRadicalForm } from './simplestRadicalFormEquivalence.mjs';

registerFormSpecificComparator('factoredForm', sameFactoredPolynomialExpression);
registerFormSpecificComparator('simplestRadicalForm', sameSimplestRadicalForm);

export const FORM_SPECIFIC_FIELD_COMPARATORS = Object.freeze({
  factoredForm: sameFactoredPolynomialExpression,
  simplestRadicalForm: sameSimplestRadicalForm,
});
