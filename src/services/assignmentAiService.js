import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const authorAssignment = httpsCallable(functions, 'authorAssignmentWithAI', {
  timeout: 300000,
});

const cleanCode = (value) => String(value || '').replace(/^functions\//, '').trim();

export const assignmentAiErrorCode = (error) => cleanCode(error?.code);

export const assignmentAiFallbackRecommended = (error) => (
  ['failed-precondition', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal']
    .includes(assignmentAiErrorCode(error))
);

export const assignmentAiFailureMessage = (error) => {
  const code = assignmentAiErrorCode(error);
  const message = String(error?.message || '').replace(/^Firebase:\s*/i, '').trim();
  if (message && !/^internal$/i.test(message)) return message;
  if (code === 'deadline-exceeded') return 'MathMaster AI timed out before it finished. Use the outside-AI import option or try again.';
  if (code === 'resource-exhausted') return 'MathMaster AI is temporarily rate-limited. Use the outside-AI import option or try again shortly.';
  if (code === 'unavailable') return 'MathMaster AI could not reach its server provider. Use the outside-AI import option while the connection is checked.';
  if (code === 'failed-precondition') return 'MathMaster AI is not fully configured on this deployment. The outside-AI import option will still work.';
  return 'MathMaster AI returned a server error. The outside-AI import option will still work while the server configuration is checked.';
};

export async function buildAssignmentWithAI(prompt) {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Finish the assignment plan before building with AI.');

  const response = await authorAssignment({ prompt: text });
  const data = response?.data || {};
  const assignmentJson = String(data.assignmentJson || '').trim();
  if (!assignmentJson) {
    throw new Error('MathMaster AI returned no assignment. Use the copy/paste AI workflow and try again.');
  }

  return {
    assignmentJson,
    model: String(data.model || '').trim() || null,
    responseId: String(data.responseId || '').trim() || null,
    usage: data.usage && typeof data.usage === 'object' ? data.usage : null,
  };
}

export default buildAssignmentWithAI;
