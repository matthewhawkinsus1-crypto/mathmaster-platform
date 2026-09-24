/*
 * DISTRIBUTION AND LIKE TERMS INSIDE AN INEQUALITY — THE SAME OPERATIONS.
 *
 * The equation engine (StepByStepAlgebraCore) has had tactile distribution and
 * combine-like-terms since #336; the relation workspace (inequalities, compound
 * inequalities, absolute-value branches) had neither, so −3(x − 4) > 2x + 7
 * made the student type the distributed form into Rewrite. These helpers apply
 * the SAME shared models — algebraDistributionModel and algebraLikeTermsModel —
 * to one expression of one relation branch. Nothing is computed for the
 * student: they place the multiplier on each term, or choose the like terms and
 * type the combined term; the relation workspace then validates the step as an
 * equivalent rewrite exactly as it validates every other one.
 */
import {
  commitDistribution,
  detectDistributableGroup,
} from './algebraDistributionModel.js';
import {
  findLikeTermGroups,
  replaceSelectedLikeTerms,
  replacementIsSingleLikeTerm,
  selectedLikeTermInfo,
} from './algebraLikeTermsModel.js';
import { latexToExpression } from './algebraAstEngine.js';

const cloneState = (state) => JSON.parse(JSON.stringify(state));

// The distribution model reads one side of an equation; an expression of a
// relation branch is exactly one side.
const asSide = (expression) => ({ left: String(expression ?? ''), right: '0' });

/** Every expression in a branch that holds a group the student can distribute over. */
export const relationDistributionCandidates = (branch) => (branch?.expressions || [])
  .map((expression, expressionIndex) => ({ expressionIndex, detected: detectDistributableGroup(asSide(expression)) }))
  .filter((entry) => entry.detected && entry.detected.side === 'left' && entry.detected.terms?.length >= 2);

/** The next relation state once the student has placed the multiplier on every term. */
export const commitRelationDistribution = (state, branchIndex, expressionIndex, distributionState) => {
  const branch = state?.branches?.[branchIndex];
  if (!branch) return null;
  const committed = commitDistribution(asSide(branch.expressions[expressionIndex]), distributionState);
  if (!committed) return null;
  const next = cloneState(state);
  next.branches[branchIndex].expressions[expressionIndex] = committed.left;
  return next;
};

/** Every expression in a branch with two or more like terms. */
export const relationLikeTermCandidates = (branch) => (branch?.expressions || [])
  .map((expression, expressionIndex) => ({ expressionIndex, groups: findLikeTermGroups(expression) }))
  .filter((entry) => entry.groups.length > 0);

/**
 * Combine the student's chosen terms into the student's typed term. Returns the
 * next state, or a reason the choice or the term is not acceptable. The
 * workspace still validates equivalence before committing.
 */
export const commitRelationLikeTerms = (state, branchIndex, expressionIndex, indices, replacementInput) => {
  const branch = state?.branches?.[branchIndex];
  const expression = branch?.expressions?.[expressionIndex];
  if (expression == null) return { next: null, reason: 'Choose the expression to combine in.' };
  const info = selectedLikeTermInfo(expression, indices);
  if (!info.valid) return { next: null, reason: info.reason };
  let replacement;
  try {
    replacement = latexToExpression(replacementInput);
  } catch {
    return { next: null, reason: 'Enter the single term these terms combine to.' };
  }
  if (!String(replacement || '').trim()) return { next: null, reason: 'Enter the single term these terms combine to.' };
  if (!replacementIsSingleLikeTerm(replacement, info.key)) {
    return { next: null, reason: 'Write one term with the same variable part as the terms you chose.' };
  }
  const combined = replaceSelectedLikeTerms(expression, info.indices, replacement);
  if (!combined) return { next: null, reason: 'That combination could not be written into the expression.' };
  const next = cloneState(state);
  next.branches[branchIndex].expressions[expressionIndex] = combined;
  return { next, reason: null };
};
