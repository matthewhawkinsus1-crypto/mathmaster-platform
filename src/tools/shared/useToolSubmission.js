import { useState } from 'react';
import { useToolRuntimeContext } from './ToolRuntimeContext';

export default function useToolSubmission(onAction) {
  const [feedback, setFeedback] = useState(null);
  const { showImmediateFeedback } = useToolRuntimeContext();
  const submit = (result, response = null, metadata = {}) => {
    const payload = { ...result, response, metadata };
    setFeedback(showImmediateFeedback ? payload : null);
    onAction?.('ATTEMPT_SUBMITTED', payload);
    return payload;
  };
  const clearFeedback = () => setFeedback(null);
  return { feedback, submit, clearFeedback };
}
