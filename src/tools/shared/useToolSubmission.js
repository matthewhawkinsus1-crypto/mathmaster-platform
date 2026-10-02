import { useRef, useState } from 'react';
import { useToolRuntimeContext } from './ToolRuntimeContext';

export default function useToolSubmission(onAction) {
  const [feedback, setFeedback] = useState(null);
  const submittedRef = useRef(false);
  const { showImmediateFeedback } = useToolRuntimeContext();
  const submit = (result, response = null, metadata = {}) => {
    const payload = { ...result, response, metadata };
    setFeedback(showImmediateFeedback ? payload : null);
    submittedRef.current = true;
    onAction?.('ATTEMPT_SUBMITTED', payload);
    return payload;
  };
  // A tool clears its verdict when the student changes the work it judged. A
  // host that keeps the last Check as a step's answer — a composed question's
  // number line or mapping stage, the relation solver's graph — would
  // otherwise grade work that is no longer on screen. It is told once
  // (ATTEMPT_WITHDRAWN), and asks for a fresh Check. A host that treats each
  // Check as its own attempt (QuestionEngine) ignores it.
  const clearFeedback = () => {
    setFeedback(null);
    if (submittedRef.current) {
      submittedRef.current = false;
      onAction?.('ATTEMPT_WITHDRAWN');
    }
  };
  return { feedback, submit, clearFeedback };
}
