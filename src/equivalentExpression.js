// Expression equivalence is a GRADING CONTRACT, not a UI helper.
//
// It now lives in functions/shared so the browser grader, the Cloud Functions
// deadline finalizer and the tests all mark the same response the same way.
// This file stays as the import path every existing caller already uses.
export { sameEquivalentExpression, default } from '../functions/shared/equivalentExpression.mjs';
