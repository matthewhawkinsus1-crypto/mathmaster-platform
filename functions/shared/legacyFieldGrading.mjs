// The legacy field-graded Path question.
//
// There are exactly TWO secure ways a Path question can be issued, and this is
// the second one:
//
//   1. TOOL-BACKED — declares a Path tool (`pathToolId`, `toolId` or `type`),
//      that tool has a Path Tool Contract, and the contract produces a
//      gradeable server definition. See pathToolContracts.mjs.
//
//   2. LEGACY FIELD-GRADED — declares NO Path tool at all, carries
//      `responseFields` with server-side expected answers, and is graded here.
//
// Both are legitimate. The starter bank is deliberately category 2: labelled
// inputs with expected values, which the server can mark without any tool
// contract existing. Rejecting those for lacking a contract would reject the
// entire bootstrap.
//
// WHAT IS NOT A TOOL DECLARATION. `questionType: "response"` is the generic
// question category, not a tool identifier. A question is only tool-backed if
// `pathToolId`, `toolId` or `type` names one — reading `questionType` as a tool
// would turn every legacy seed document into a question demanding a contract
// for a tool called "response", and fail the lot.
//
// The one rule that must never soften: a question that DOES declare a tool with
// no contract must fail closed. It must not drop through to field grading,
// because that is how a graphing question silently becomes "type your answer".

const list = (value) => (Array.isArray(value) ? value : []);

/** Which Path tool this question declares, if any. Never `questionType`. */
export const declaredToolId = (question = {}) => (
  String(question?.pathToolId || question?.toolId || question?.type || '').trim()
);

/**
 * The private grading definition for a field-graded question.
 *
 * Shared so the server's grader, the coverage index and the promotion gate all
 * mean the same thing by "this can be graded".
 */
export const buildFieldGradingDefinition = (question = {}) => {
  const explicit = question.grading && typeof question.grading === 'object' ? question.grading : {};
  const fields = list(question.responseFields).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    expected: field?.expected ?? field?.answer,
    accepted: [
      ...(Array.isArray(field?.accepted) ? field.accepted : []),
      ...(Array.isArray(field?.acceptedAnswers) ? field.acceptedAnswers : []),
    ],
    numericTolerance: Number(field?.numericTolerance ?? explicit.numericTolerance ?? 1e-6),
    caseSensitive: Boolean(field?.caseSensitive ?? explicit.caseSensitive),
    equivalence: field?.equivalence ? String(field.equivalence) : null,
  }));
  return { ...explicit, fields };
};

/**
 * Can the server mark this without a tool contract?
 *
 * Every field must carry either an `expected` value or a non-empty `accepted`
 * list; otherwise the question would mark every student wrong forever.
 */
export const hasFieldGradableDefinition = (question = {}) => {
  const grading = buildFieldGradingDefinition(question);
  return grading.fields.length > 0
    && grading.fields.every((field) => field.expected !== undefined || field.accepted?.length);
};
