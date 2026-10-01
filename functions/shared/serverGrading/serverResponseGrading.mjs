/*
 * ONE ENTRY POINT FOR "MARK THIS STUDENT'S RAW WORK", WHEREVER IT IS ASKED.
 *
 * Before this module the platform had three separate answers:
 *
 *   - ordinaryResponseGrading.mjs marked five ordinary question types;
 *   - questionFamilyGrading.mjs added a Step Algebra final-answer check for
 *     family instances only;
 *   - every rich tool marked itself in the browser, and the server could only
 *     sanitize and bound the verdict it was handed.
 *
 * Now every grade-bearing surface is declared in gradingManifest.mjs, and
 * every caller — browser feedback, server ingestion, the deadline finalizer,
 * Practice-based Recovery, the Response Inspector, Pre-Flight and Recovery
 * readiness — asks the same two questions:
 *
 *   serverResponseGradingSupport(question)        can the server mark this?
 *   gradeServerResponse({ question, response })   mark it
 *
 * THE QUESTION IS ALWAYS THE AUTHORITATIVE ONE. Callers pass the question the
 * server holds (or the Question Family instance rebuilt from a validated
 * delivery pin). Nothing here reads a verdict, a score or an answer key from
 * the response; the response is raw student work, nothing else.
 *
 * This is the HEAVY half: it loads every grader. The light half
 * (gradingSupport.mjs) answers "can it be marked" without loading any.
 *
 * Pure: no Firestore, no clock, no React.
 */
import { GRADING_MANIFEST } from './gradingManifest.mjs';
import { ungradedResult } from './gradingResult.mjs';
import { serverResponseGradingSupport } from './gradingSupport.mjs';
import { QUESTION_GRADERS, gradeQuestionResponse, questionGraderAccepts } from './questionResponseGrading.mjs';
import { TOOL_GRADERS } from './toolGraders.mjs';
import { isToolResponse, readToolWork } from './toolResponseContract.mjs';
import { gradeWorkWithGrader } from './toolWorkGrading.mjs';

export { gradeWorkWithGrader };

export { QUESTION_GRADERS, gradeQuestionResponse, questionGraderAccepts };
export {
  commonServerGradingExclusion,
  declaredGradingSupport,
  serverResponseGradingSupport,
  usesToolResponse,
} from './gradingSupport.mjs';

const text = (value) => String(value ?? '');

/**
 * Mark raw work against the authoritative question.
 *
 * Returns the gradingResult.mjs shape plus `surfaceId`, `graderVersion` and
 * `mode`. `graded: false` carries a machine-readable `reason` and means "the
 * server has no verdict" — never "incorrect".
 *
 * Completeness is REPORTED, not enforced, for tools: an explicitly submitted
 * tool check with an empty box is a real (incorrect) attempt, exactly as the
 * browser records it, while the deadline finalizer refuses to auto-submit
 * anything that is not complete. Ordinary types keep their contract: an
 * incomplete ordinary response is `graded: false, reason: incomplete-response`.
 */
export const gradeServerResponse = ({ question, response } = {}) => {
  const support = serverResponseGradingSupport(question);
  const surfaceId = support.surfaceId;
  if (!support.supported) return { ...ungradedResult(support.reason), surfaceId, mode: support.mode || null };
  const declaration = GRADING_MANIFEST[surfaceId];

  // Ordinary types and question graders: the light half, one implementation.
  if (declaration.kind !== 'tool') return gradeQuestionResponse({ question, response });

  // A registry tool. Only a tool response for THIS tool is read.
  const grader = TOOL_GRADERS[surfaceId];
  if (!grader) return { ...ungradedResult(`no-tool-grader:${surfaceId}`), surfaceId, mode: support.mode };
  if (grader.problems?.length) return { ...ungradedResult('grader-declaration-drift'), surfaceId, mode: support.mode };
  if (!isToolResponse(response)) return { ...ungradedResult('no-tool-response'), surfaceId, mode: support.mode };
  if (text(response.toolId) && text(response.toolId) !== grader.toolId) {
    return { ...ungradedResult('response-tool-mismatch'), surfaceId, mode: support.mode };
  }
  const claimedVersion = Math.max(1, Math.floor(Number(response.contractVersion) || 1));
  if (claimedVersion > grader.contractVersion) {
    // A newer client than this server. The work is kept; the verdict waits.
    return { ...ungradedResult('response-contract-newer-than-server'), surfaceId, mode: support.mode };
  }
  const work = readToolWork(response);
  if (!work.ok) return { ...ungradedResult(work.reason), surfaceId, mode: support.mode };
  const result = grader.grade(question, work.work);
  return {
    ...result,
    surfaceId,
    graderVersion: `${grader.toolId}@${grader.contractVersion}`,
    mode: result.mode ?? support.mode,
  };
};

/**
 * Grade a tool's work directly — what a browser tool and QuestionEngine call.
 *
 * Through the exact bytes the server will parse: the same bounding, the same
 * dropped keys, the same oversize refusal. The server-only exclusions
 * (generated / family template / variants) are NOT applied here — the browser
 * holds the instance the student actually sees. Returns the grading result
 * plus the `toolResponse` that should travel with the attempt.
 */
export const gradeToolWork = ({ toolId, question, work } = {}) => {
  const grader = TOOL_GRADERS[toolId];
  if (!grader) return ungradedResult(`no-shared-grader:${toolId}`);
  return gradeWorkWithGrader({ grader, question, work });
};

/**
 * Mark a raw response against a built Question Family instance — the same
 * dispatch as every other question, named for the Recovery and Pre-Flight
 * callers that hold an instance rebuilt from a delivery pin.
 */
export const gradeFamilyInstanceResponse = ({ question = null, response = null } = {}) => gradeServerResponse({ question, response });

/**
 * Is the shared grader for this question's surface consistent with its
 * declaration? Drift is refused by the coverage gate; this lets ingestion keep
 * a drifted tool's submissions on the bounded legacy path instead of blocking.
 */
export const sharedGraderDrift = (question) => {
  const support = serverResponseGradingSupport(question);
  const grader = support.surfaceId ? TOOL_GRADERS[support.surfaceId] : null;
  return grader?.problems?.length ? [...grader.problems] : [];
};

/** The shared grader module for a tool id, or null. */
export const sharedToolGrader = (toolId) => TOOL_GRADERS[toolId] || null;
