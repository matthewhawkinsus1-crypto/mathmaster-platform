/*
 * GRADING A REGISTRY TOOL'S RAW WORK IN THE BROWSER — THE SERVER'S WAY.
 *
 * QuestionEngine calls this when a tool is checked (for the verdict it
 * records) and as a tool's work changes (for the completeness a deadline
 * checkpoint needs). Both go through the shared grader the server runs, over
 * the same bounded bytes the server will read, so the browser cannot record a
 * verdict the server would not reach.
 *
 * The structured `toolResponse` is always returned — even when no shared
 * grader can mark this mode — because the server should hold exactly what the
 * student did rather than a truncated string.
 */
import { buildToolResponse } from '../../../functions/shared/serverGrading/toolResponseContract.mjs';
import { TOOL_GRADING_DECLARATIONS } from '../../../functions/shared/serverGrading/gradingManifest.mjs';
import { loadSharedGrading } from './sharedGradingLoader.js';

export const buildRegistryToolResponse = ({ toolId, question, work }) => buildToolResponse({
  question,
  toolId,
  contractVersion: TOOL_GRADING_DECLARATIONS[toolId]?.contractVersion || 1,
  work,
});

export const gradeRegistryToolWork = async ({ toolId, question, work } = {}) => {
  const fallbackResponse = toolId ? buildRegistryToolResponse({ toolId, question, work }) : null;
  if (!toolId) return { graded: false, reason: 'no-tool', toolResponse: null };
  try {
    const { gradeToolWork } = await loadSharedGrading();
    const result = gradeToolWork({ toolId, question, work });
    return { ...result, toolResponse: result.toolResponse || fallbackResponse };
  } catch {
    return { graded: false, reason: 'shared-grading-unavailable', toolResponse: fallbackResponse };
  }
};

/*
 * Does this shared result mean "do not record an attempt"?
 *
 * Yes when the mode IS server-graded but this particular work could not be
 * graded (the question cannot be computed, the work is unreadable or
 * oversize): the server will hold the same submission for teacher review, so
 * recording a fallback verdict would spend an attempt the gradebook never
 * sees. No when the mode is documented as graded on the device, or when the
 * shared grader itself could not load — then the tool's own verdict stands,
 * exactly as before.
 */
const DEVICE_VERDICT_REASONS = /^(mode-not-server-gradable|no-tool|no-tool-grader|shared-grading-unavailable)/;
export const sharedVerdictWithholdsAttempt = (verdict) => Boolean(verdict)
  && verdict.graded !== true
  && !DEVICE_VERDICT_REASONS.test(String(verdict.reason || ''));
