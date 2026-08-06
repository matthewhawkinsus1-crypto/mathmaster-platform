import { useEffect, useRef, useState } from 'react';
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

  return [value, setValue];
}
