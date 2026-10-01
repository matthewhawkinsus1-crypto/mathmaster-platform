import { useRef } from 'react';
import { stableStringify } from '../../utils/idUtils.js';

/*
 * THE SAME VALUE, THE SAME OBJECT.
 *
 * Hosts rebuild plain objects on every render — a Firestore snapshot, App's
 * 30-second clock, a workflow step that builds `question={{ ... }}` inline —
 * and a workspace that resets when its `question` changes identity then resets
 * for nothing. The balance workspace inside a composed question did exactly
 * that: one host re-render and the student's step was gone.
 *
 * Returns the previous object while the content is unchanged, so effects and
 * memos keyed on it run when the question really changes and only then.
 * QuestionEngine has kept a private copy of this (useDeepStableValue); this is
 * the shared one for workspaces mounted by other hosts.
 */
export const useContentStableValue = (value) => {
  const signature = stableStringify(value ?? null);
  const ref = useRef(null);
  if (!ref.current || ref.current.signature !== signature) ref.current = { signature, value };
  return ref.current.value;
};
