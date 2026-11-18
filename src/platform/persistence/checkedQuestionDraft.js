/*
 * A RESPONSE MODULE'S SAVED DRAFT IS READ BACK THE WAY A TOOL'S IS.
 *
 * The registry tools read their drafts through hydrateToolDraftField
 * (usePersistentToolState.js), which keeps only what each field can hold
 * (toolDraftShape.js). The question engine's own response modules (the
 * multi-answer boxes, tables, number lines, graph workspaces, Step Algebra,
 * composed workflows) read theirs straight from storage, under a key of their
 * own (`${draftKey}:multi-answer`), and drew whatever was there: a record
 * where a typed answer belongs, a list with no strokes in it, a step that was
 * a word. That threw in the first render, and since the draft was still saved
 * the question showed "This question could not be displayed" on every reload
 * and every Chromebook until the student started it fresh.
 *
 * Here a module's draft goes through the same check, with the module's own
 * `normalize` (built from toolDraftShape.js) and the platform's rule for a
 * value of the draft's starting kind: a draft that starts as text restores
 * text, a map a map, and no `__proto__` key reaches the module. A valid draft
 * comes back exactly as it was saved. A repair is reported once, as a tool's
 * is. Nothing here rewrites the stored draft; a module that writes back what
 * it holds as it opens (useLocalDraftState, useUndoHistory) saves the repaired
 * value then, as it saved the raw one before, and not as an edit.
 *
 * Only modules that load with a question import this (never the first load).
 */
import { readQuestionDraft } from '../../questionDraftStorage.js';
import { hydrateToolDraftField, reportDraftRepair } from '../../tools/shared/usePersistentToolState.js';

/**
 * The draft under `key`, checked: `fallback` when there is none or nothing of
 * it can be kept, else what `normalize` and the kind of `fallback` keep of it.
 * `field` names the draft in a repair report.
 */
export const readCheckedQuestionDraft = (key, fallback, { normalize = null, field = 'draft' } = {}) => {
  const stored = readQuestionDraft(key, null);
  // No draft, or a saved null: the fallback, as readQuestionDraft gave it.
  if (stored === null || stored === undefined) return fallback;
  const result = hydrateToolDraftField({ record: { [field]: stored }, field, initialValue: () => fallback, normalize });
  reportDraftRepair(key, field, result.issues);
  return result.value;
};
