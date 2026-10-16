/*
 * HOW MANY TRIES A RECOVERY PRACTICE QUESTION HAS — ONE ANSWER.
 *
 * Recovery practice takes ONE graded answer per item: the mastery gate counts
 * unique questions, so a second answer to the same item would not be new
 * evidence, and the server closes the item on the first graded answer, right
 * or wrong (SectionRecoveryRunner `handleGrade`). The engine used to be handed
 * the Practice policy's three tries anyway, so the student read "3 of 3 tries
 * left" and lost the item on the first miss (QA pass 3, HELP-19 in
 * 03-help-and-self-correction.md).
 *
 * STEP WORK KEEPS ITS TRIES. Step tools spend tries on rejected moves before
 * the answer is submitted (recordQuestionStep), exactly as in the original
 * section. Those tries are real, so an item keeps the policy's count when
 *
 *   - it renders the balance / step workspace itself (the engine's own step
 *     types, and a literal question that asked for the workspace), or
 *   - it has already recorded a step: a registry tool with an algebra mode
 *     (Systems Workspace, Rewrite Linear Form, …) shows its steps only once the
 *     student works in that mode, and its type alone cannot say whether it will.
 *
 * Display and bookkeeping only. Nothing here grades or reaches the server.
 */
import { usesLiteralWorkspace } from '../../../functions/shared/runtime/literalWorkspaceRoute.mjs';

export const RECOVERY_PRACTICE_ONE_ANSWER = 'One answer per practice question.';

const STEP_WORKSPACE_TYPES = new Set(['stepAlgebra', 'stepAlgebra2', 'algebra']);

/** Does this question open the step workspace itself? */
export const recoveryPracticeOpensStepWorkspace = (question = null) => {
  const type = String(question?.type ?? '').trim();
  if (STEP_WORKSPACE_TYPES.has(type)) return true;
  return type === 'literal' && usesLiteralWorkspace(question);
};

/**
 * The tries the engine is told a Recovery practice item has.
 * `policyMaximum` is the Practice policy's count for this question; `stepRecord`
 * is the item's step bookkeeping, if any step was recorded.
 */
export const recoveryPracticeMaximumAttempts = ({ question = null, policyMaximum = 1, stepRecord = null } = {}) => {
  const policy = Math.max(1, Math.floor(Number(policyMaximum) || 1));
  if (recoveryPracticeOpensStepWorkspace(question) || stepRecord) return policy;
  return 1;
};
