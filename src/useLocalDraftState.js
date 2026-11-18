import { useCallback, useEffect, useRef, useState } from 'react';
import { studentInputMark, studentInputSince, writeQuestionDraft } from './questionDraftStorage';
import { readCheckedQuestionDraft } from './platform/persistence/checkedQuestionDraft.js';

const cloneValue = (value) => {
  if (value === undefined) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

/*
 * WHICH OF THIS HOOK'S WRITES ARE THE STUDENT'S (PQ-044).
 *
 * The effect below writes the value back whenever it changes — including the
 * moment the workspace mounts with what it just read. That write is not an
 * edit, and says so, so opening a question never makes its drafts look newer
 * than work saved anywhere else (see writeQuestionDraft). The setter is how
 * the workspace changes the value: an edit when the student has touched the
 * page since this hook loaded its draft, unless the caller knows better and
 * passes `{ edit }` (WorkflowRunner does, per step).
 *
 * What is read back is checked first (checkedQuestionDraft.js): the kind of
 * `initialValue`, and `options.normalize`, the module's own statement of the
 * shape of its work (toolDraftShape.js `draftNormalizer`). A valid draft
 * comes back exactly as saved; a damaged one as its valid part.
 */
export default function useLocalDraftState(storageKey, initialValue, options = {}) {
  const initialValueRef = useRef(initialValue);
  // The latest check: it usually closes over the question on screen.
  const normalizeRef = useRef(options.normalize || null);
  normalizeRef.current = options.normalize || null;
  const activeKeyRef = useRef(storageKey);
  const skipNextWriteRef = useRef(false);
  const inputMarkRef = useRef(0);
  const [value, setValue] = useState(() => {
    const fallback = typeof initialValue === 'function' ? initialValue() : initialValue;
    inputMarkRef.current = studentInputMark();
    return cloneValue(readCheckedQuestionDraft(storageKey, fallback, { normalize: normalizeRef.current }));
  });

  useEffect(() => {
    if (activeKeyRef.current === storageKey) return;
    activeKeyRef.current = storageKey;
    skipNextWriteRef.current = true;
    const source = initialValueRef.current;
    const fallback = typeof source === 'function' ? source() : source;
    inputMarkRef.current = studentInputMark();
    setValue(cloneValue(readCheckedQuestionDraft(storageKey, fallback, { normalize: normalizeRef.current })));
  }, [storageKey]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    // What the state already holds: written by the setter if it was an edit,
    // read from the draft if it was not. Never an edit of its own.
    writeQuestionDraft(storageKey, value, { edit: false });
  }, [storageKey, value]);

  const setPersistedValue = useCallback((nextValue, options = {}) => {
    setValue((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;

      // Preserve React's no-op updater semantics.
      //
      // Workflow delegates intentionally return `current` when a child reports
      // the exact same state twice. Cloning that unchanged object here turns the
      // no-op into a brand-new reference, which forces a parent render. A child
      // effect that reports state on render then reports again, and the cycle can
      // lock the page. This is exactly what happened when the continuity choice
      // made the hidden Build-the-graph stage mount.
      if (Object.is(resolved, current)) return current;

      const saved = cloneValue(resolved);
      const edit = typeof options?.edit === 'boolean' ? options.edit : studentInputSince(inputMarkRef.current);
      writeQuestionDraft(storageKey, saved, { edit });
      return saved;
    });
  }, [storageKey]);

  return [value, setPersistedValue];
}
