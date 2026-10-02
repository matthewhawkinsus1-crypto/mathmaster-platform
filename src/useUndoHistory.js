import { useCallback, useEffect, useRef, useState } from 'react';
import { readQuestionDraft, studentInputMark, studentInputSince, writeQuestionDraft } from './questionDraftStorage';

const cloneValue = (value) => {
  if (value === undefined) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

/*
 * Writes, as useLocalDraftState makes them (PQ-044): the value written back
 * on mount or after a change is not an edit; setValue, undo and reset are
 * edits once the student has touched the page since this hook loaded its
 * draft (setValue takes `{ edit }` from a caller that knows better).
 */
export default function useUndoHistory(
  initialValue,
  maximumEntries = 60,
  persistenceKey = null,
) {
  const initialValueRef = useRef(initialValue);
  const activeKeyRef = useRef(persistenceKey);
  const skipNextWriteRef = useRef(false);
  const inputMarkRef = useRef(0);
  const [value, setValueState] = useState(() => {
    inputMarkRef.current = studentInputMark();
    return cloneValue(readQuestionDraft(persistenceKey, initialValue));
  });
  const historyRef = useRef([]);

  useEffect(() => {
    if (activeKeyRef.current === persistenceKey) return;
    activeKeyRef.current = persistenceKey;
    historyRef.current = [];
    skipNextWriteRef.current = true;
    inputMarkRef.current = studentInputMark();
    setValueState(cloneValue(readQuestionDraft(persistenceKey, initialValueRef.current)));
  }, [persistenceKey]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeQuestionDraft(persistenceKey, value, { edit: false });
  }, [persistenceKey, value]);

  const setValue = useCallback((nextValue, options = {}) => {
    setValueState((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      if (options.record !== false) {
        historyRef.current = [...historyRef.current, cloneValue(current)].slice(-maximumEntries);
      }
      const saved = cloneValue(resolved);
      writeQuestionDraft(persistenceKey, saved, { edit: typeof options.edit === 'boolean' ? options.edit : studentInputSince(inputMarkRef.current) });
      return saved;
    });
  }, [maximumEntries, persistenceKey]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (!history.length) return false;
    const previous = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    const saved = cloneValue(previous);
    writeQuestionDraft(persistenceKey, saved, { edit: studentInputSince(inputMarkRef.current) });
    setValueState(saved);
    return true;
  }, [persistenceKey]);

  const reset = useCallback((nextValue = initialValueRef.current) => {
    historyRef.current = [];
    const saved = cloneValue(nextValue);
    writeQuestionDraft(persistenceKey, saved, { edit: studentInputSince(inputMarkRef.current) });
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
