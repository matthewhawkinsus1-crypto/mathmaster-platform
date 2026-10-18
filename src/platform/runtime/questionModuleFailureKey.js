/*
 * WHICH MODULE FAILED (student pass 3, Batch 5, RUN-13 review).
 *
 * "Start this question fresh" has to be pressable on a closed question, so the
 * engine lifts its disabled/inert gate while a failed module's panel is all the
 * work area holds. That failure belongs to the module that failed: the next
 * module must start not-failed, or a closed question stays editable.
 *
 * The boundary key alone does not tell modules apart. My Math Path mounts one
 * engine for every item with no generationKey, a record without variantIndex,
 * a question with no id (sanitizePublicQuestion keeps content fields only), and
 * the reset version goes back to 0 for each new item — so every item had the
 * same key, and item 1's failure was item 2's. The draft key is per item
 * (`path-${questionInstanceId}` there, the assignment question's key in App),
 * so it is part of the identity, beside the question id.
 */
export function questionModuleFailureKey({ boundaryKey, questionId, draftKey }) {
  return [boundaryKey ?? '', questionId ?? '', draftKey ?? ''].join('|');
}
