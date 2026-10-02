/*
 * A PENDING SYMBOL STEP IS SAVED AS WHAT THE STUDENT DID, NOT AS ITS ANSWER.
 *
 * Multiplying or dividing an inequality by a negative leaves a step open: the
 * student reverses each symbol themselves (MultiRelationAlgebraCore). The
 * draft used to keep `expectedRelations`, the reversed symbols — the answer to
 * that open step — in records the student can read: the device's draft and its
 * server backup. Drafts never carry answers (functions/shared/
 * workspaceDraftSchema.mjs); this key was simply not on the guard's list.
 *
 * The symbols are fixed by the relation before the operation, which the
 * pending step keeps anyway (`before`), so they are recomputed on restore and
 * never saved. A draft saved before this change still restores: with `before`
 * its symbols are recomputed, without it the ones it carried are used.
 */
import { reverseRelation } from './algebraRelationFoundation.js';

const flipBranchIndices = (pending) => {
  if (Array.isArray(pending?.branchResults) && pending.branchResults.length) {
    return pending.branchResults.map((item) => item?.branchIndex);
  }
  return Number.isInteger(pending?.branchIndex) ? [pending.branchIndex] : [];
};

/** The pending step as it is saved: no expected symbol anywhere in it. */
export const persistablePendingFlip = (pending) => {
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
  const { expectedRelations: _expected, branchResults, ...rest } = pending;
  return {
    ...rest,
    ...(Array.isArray(branchResults)
      ? { branchResults: branchResults.map((item) => ({ branchIndex: item?.branchIndex })) }
      : {}),
  };
};

/**
 * The pending step as the workspace runs it, its expected symbols derived from
 * the relation before the operation. Null when they cannot be known, and the
 * caller then drops the step, as for any unsound draft.
 */
export const restoredPendingFlip = (pending) => {
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
  const indices = flipBranchIndices(pending);
  if (!indices.length || !indices.every(Number.isInteger)) return null;
  const legacy = Array.isArray(pending.branchResults) && pending.branchResults.length
    ? pending.branchResults
    : [{ branchIndex: pending.branchIndex, expectedRelations: pending.expectedRelations }];
  const expectedFor = (branchIndex) => {
    const relations = pending.before?.branches?.[branchIndex]?.relations;
    if (Array.isArray(relations)) return relations.map(reverseRelation);
    const saved = legacy.find((item) => item?.branchIndex === branchIndex)?.expectedRelations;
    return Array.isArray(saved) ? saved : null;
  };
  const branchResults = indices.map((branchIndex) => ({ branchIndex, expectedRelations: expectedFor(branchIndex) }));
  if (branchResults.some((item) => !Array.isArray(item.expectedRelations))) return null;
  return {
    ...pending,
    // The single-branch fields an older workspace reads.
    branchIndex: branchResults[0].branchIndex,
    expectedRelations: branchResults[0].expectedRelations,
    branchResults,
  };
};
