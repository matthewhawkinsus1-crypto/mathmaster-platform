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

export default function useUndoHistory(
  initialValue,
  maximumEntries = 60,
  persistenceKey = null,
) {
  const initialValueRef = useRef(initialValue);
  const activeKeyRef = useRef(persistenceKey);
  const skipNextWriteRef = useRef(false);
  const [value, setValueState] = useState(() =>
    cloneValue(readQuestionDraft(persistenceKey, initialValue)),
  );
  const historyRef = useRef([]);

  useEffect(() => {
    if (activeKeyRef.current === persistenceKey) return;
    activeKeyRef.current = persistenceKey;
    historyRef.current = [];
    skipNextWriteRef.current = true;
    setValueState(cloneValue(readQuestionDraft(persistenceKey, initialValueRef.current)));
  }, [persistenceKey]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeQuestionDraft(persistenceKey, value);
  }, [persistenceKey, value]);

  const setValue = useCallback((nextValue, options = {}) => {
    setValueState((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      if (options.record !== false) {
        historyRef.current = [...historyRef.current, cloneValue(current)].slice(-maximumEntries);
      }
      const saved = cloneValue(resolved);
      writeQuestionDraft(persistenceKey, saved);
      return saved;
    });
  }, [maximumEntries, persistenceKey]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (!history.length) return false;
    const previous = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    const saved = cloneValue(previous);
    writeQuestionDraft(persistenceKey, saved);
    setValueState(saved);
    return true;
  }, [persistenceKey]);

  const reset = useCallback((nextValue = initialValueRef.current) => {
    historyRef.current = [];
    const saved = cloneValue(nextValue);
    writeQuestionDraft(persistenceKey, saved);
    setValueState(saved);
  }, [persistenceKey]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
  }, []);

  return {
    value,
    setValue,
    undo,
    reset,
    clearHistory,
    get canUndo() {
      return historyRef.current.length > 0;
    },
    historyRef,
  };
}
