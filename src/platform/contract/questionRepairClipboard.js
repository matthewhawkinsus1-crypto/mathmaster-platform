import {
  REPAIR_PACKET_VERSION,
  buildQuestionBatchRepairPacket,
} from './questionBatchRepairPacket.js';

/*
 * TWO CLIPBOARD BUTTONS, TWO DIFFERENT JOBS.
 *
 * "Copy Question JSON" is for a teacher who already knows what is wrong and
 * wants the question itself — to read it, to diff it, to paste it somewhere
 * that expects a question and nothing else. Diagnostics in that payload would
 * make it something no other tool can read.
 *
 * "Copy failed-question context" is for handing one question to an AI that has
 * never seen this assignment. That needs the findings, the teacher's
 * constraints, and enough identity that the reply can be checked before it is
 * applied — but still only the one question.
 *
 * NEITHER CARRIES THE ASSIGNMENT. Pasting the whole assignment into a chat is
 * how a one-question repair turns into a rewrite of the lesson: a model given
 * everything will return everything. The context payload therefore has no
 * sections key and no assignment body, only the identity needed to verify a
 * reply.
 *
 * IDENTITY COMES FROM THE BATCH BUILDER ON PURPOSE. Both paths end with a
 * teacher pasting a reply back, and the parser refuses a reply whose assignment
 * id or base revision does not match. If the single-question path described the
 * draft differently from the batch path, the same reply would be accepted
 * through one button and refused through the other.
 *
 * A CLIPBOARD PAYLOAD IS A SNAPSHOT. It is text, taken now. Nothing a teacher
 * pastes elsewhere can reach back into the draft.
 */

const text = (value) => String(value ?? '').trim();

const rowFor = (repairCenterModel, questionId) => {
  const wanted = text(questionId);
  const row = (Array.isArray(repairCenterModel?.questions) ? repairCenterModel.questions : [])
    .find((entry) => text(entry?.questionId) === wanted);
  if (!row) {
    // Copying an empty or neighbouring payload would be worse than copying
    // nothing: the teacher would paste it, get a confident repair back, and
    // apply it to a question the AI never saw.
    throw new Error(`Question "${questionId}" was not found in this Repair Center view.`);
  }
  return row;
};

/** The selected question, exactly as authored, and nothing else. */
export const buildQuestionJsonClipboardText = ({
  repairCenterModel = null,
  questionId = null,
} = {}) => JSON.stringify(rowFor(repairCenterModel, questionId).question ?? null, null, 2);

/** One question, its findings, the teacher's constraints, and the draft identity. */
export const buildFailedQuestionContextClipboardText = ({
  assignmentV5 = null,
  repairCenterModel = null,
  questionId = null,
  assignmentId = null,
  baseRevision = null,
} = {}) => {
  rowFor(repairCenterModel, questionId);

  const packet = buildQuestionBatchRepairPacket({
    assignmentV5,
    repairCenterModel,
    selectedQuestionIds: [questionId],
    assignmentId,
    baseRevision,
  });

  return JSON.stringify({
    repairPacketVersion: REPAIR_PACKET_VERSION,
    assignmentContext: packet.assignmentContext,
    question: packet.questions[0],
  }, null, 2);
};

export default {
  buildFailedQuestionContextClipboardText,
  buildQuestionJsonClipboardText,
};
