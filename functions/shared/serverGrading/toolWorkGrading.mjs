/*
 * GRADE A TOOL'S WORK THROUGH THE EXACT BYTES THE SERVER WILL READ.
 *
 * A browser tool imports only its OWN grader module (serverGrading/tools/
 * <toolId>.mjs) and this small file, so a tool's lazy chunk never carries
 * every other tool's mathematics. The server reaches the same function
 * through serverResponseGrading.mjs.
 *
 * The work is bounded, serialized and re-parsed exactly as ingestion will
 * parse it — the same dropped keys, the same Infinity encoding, the same
 * oversize refusal — so the verdict the student sees on screen is the verdict
 * the server records.
 *
 * The server-only exclusions (legacy generators, Question Family templates,
 * variant pools) are NOT applied: the browser holds the instance the student
 * actually sees.
 *
 * Pure.
 */
import { ungradedResult } from './gradingResult.mjs';
import { buildToolResponse, readToolWork } from './toolResponseContract.mjs';

export const gradeWorkWithGrader = ({ grader, question, work } = {}) => {
  if (!grader || typeof grader.grade !== 'function') return ungradedResult('no-shared-grader');
  const toolResponse = buildToolResponse({
    question,
    toolId: grader.toolId,
    contractVersion: grader.contractVersion,
    work,
  });
  const read = readToolWork(toolResponse);
  if (!read.ok) return { ...ungradedResult(read.reason), toolResponse };
  return { ...grader.grade(question, read.work), toolResponse };
};
