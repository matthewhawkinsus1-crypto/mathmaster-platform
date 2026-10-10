// Question family: absolute value, quadratics and polynomials: polynomialWorkshop, parabolaGeometryLab, and multiAnswer items from absoluteValue.solveEquation / quadratics.identifyVertex / functions.identifyZeros (teacher-import-jsons L1_Absolute_Value).
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
export const family = 'quadraticsAbsoluteValue';
export const implemented = false;
export const matches = () => false;
export const hints = () => [];
export const similarProblem = () => null;
export const expectedValues = () => [];
export const backUpQuestion = () => null;
