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
