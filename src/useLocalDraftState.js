import { useCallback, useEffect, useRef, useState } from 'react';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';

const cloneValue = (value) => {
  if (value === undefined) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

export default function useLocalDraftState(storageKey, initialValue) {
  const initialValueRef = useRef(initialValue);
  const activeKeyRef = useRef(storageKey);
  const skipNextWriteRef = useRef(false);
  const [value, setValue] = useState(() => {
    const fallback = typeof initialValue === 'function' ? initialValue() : initialValue;
    return cloneValue(readQuestionDraft(storageKey, fallback));
  });

  useEffect(() => {
    if (activeKeyRef.current === storageKey) return;
    activeKeyRef.current = storageKey;
    skipNextWriteRef.current = true;
    const source = initialValueRef.current;
    const fallback = typeof source === 'function' ? source() : source;
    setValue(cloneValue(readQuestionDraft(storageKey, fallback)));
  }, [storageKey]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeQuestionDraft(storageKey, value);
  }, [storageKey, value]);

  const setPersistedValue = useCallback((nextValue) => {
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
      writeQuestionDraft(storageKey, saved);
      return saved;
    });
  }, [storageKey]);

  return [value, setPersistedValue];
}
