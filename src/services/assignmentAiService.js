import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const authorAssignment = httpsCallable(functions, 'authorAssignmentWithAI', {
  timeout: 300000,
});

const repairQuestion = httpsCallable(functions, 'repairAssignmentQuestionWithAI', {
  timeout: 120000,
});

const selfTest = httpsCallable(functions, 'assignmentAiSelfTest', {
  timeout: 90000,
});

const cleanCode = (value) => String(value || '').replace(/^functions\//, '').trim();

export const assignmentAiErrorCode = (error) => cleanCode(error?.code);

export const assignmentAiFallbackRecommended = (error) => (
  ['failed-precondition', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal']
    .includes(assignmentAiErrorCode(error))
);

// The server now attaches provider diagnostics (status, codes, token counts) to
// every classified failure. Surfacing them turns "the AI is unavailable" into a
// line an administrator can act on.
export const assignmentAiDiagnostics = (error) => {
  const details = error?.details;
  if (!details || typeof details !== 'object') return null;
  const parts = [];
  if (details.responseStatus) parts.push(`status ${details.responseStatus}`);
  if (details.incompleteReason) parts.push(`stopped: ${details.incompleteReason}`);
  if (details.providerCode) parts.push(details.providerCode);
  if (details.networkCode) parts.push(details.networkCode);
  if (details.servedModel || details.requestedModel) parts.push(`model ${details.servedModel || details.requestedModel}`);
  if (details.elapsedMs) parts.push(`${Math.round(details.elapsedMs / 1000)}s`);
  return parts.length ? parts.join(' · ') : null;
};

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

export async function repairQuestionWithAI(prompt) {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Describe what you want the AI to fix first.');

  const response = await repairQuestion({ prompt: text });
  const data = response?.data || {};
  const questionJson = String(data.questionJson || '').trim();
  if (!questionJson) {
    throw new Error('MathMaster AI returned no replacement question. Use the copy/paste AI workflow and try again.');
  }

  let question;
  try {
    question = JSON.parse(questionJson);
  } catch {
    throw new Error('MathMaster AI returned a replacement question MathMaster could not read.');
  }
  return {
    question,
    model: String(data.model || '').trim() || null,
    responseId: String(data.responseId || '').trim() || null,
    usage: data.usage && typeof data.usage === 'object' ? data.usage : null,
  };
}

// Root-admin diagnostic. Resolves with { ok, stage, code, message, ... } for a
// reachable server, so a configuration problem reads as a report rather than a
// thrown error.
export async function runAssignmentAiSelfTest() {
  const response = await selfTest({});
  return response?.data || { ok: false, message: 'The self-test returned no result.' };
}

export default buildAssignmentWithAI;
