/*
 * REPAIR THE QUESTIONS THE TEACHER PICKED, AND NOTHING ELSE.
 *
 * The tempting shape for AI repair is to hand over the whole assignment and
 * take back whatever comes out. It is also the shape that loses work: a model
 * asked to return an entire assignment will happily rewrite the six questions
 * that were fine, and the teacher has no way to see that it did. So a batch
 * packet carries only the selected questions, the response may only contain
 * replacements for those questions, and applying it touches nothing else.
 *
 * THREE THINGS CAN BE WRONG, AND ONLY ONE OF THEM IS THE QUESTION. A question
 * can be genuinely broken; MathMaster's own renderer or tool can be broken
 * while the authored question is correct; or the finding can be unclear. These
 * are not the same and must not be repaired the same way. Told to fix
 * everything, a model will "repair" a perfectly good question to work around a
 * platform bug — replacing a graph with multiple choice because the graph tool
 * misbehaves — which hides the defect and quietly lowers the rigor of the
 * lesson. The request asks for triage first, and platformIssues/unclearIssues
 * come back as REPORTS rather than as edits.
 *
 * A STALE REPAIR MUST NOT LAND. A packet is generated against one revision of
 * one assignment. A teacher can paste a response from an hour ago, from a
 * different assignment, or from a chat they had already superseded. Every one
 * of those overwrites newer work with older content and looks like a successful
 * repair. So the response carries the assignment id and base revision it was
 * built from, and the parser refuses anything that does not match.
 *
 * IDENTITY IS CHECKED TWICE. A replacement names a question id, and the
 * question inside it carries its own. If those disagree, something has gone
 * wrong upstream and the replacement would land on the wrong question, so it is
 * rejected rather than reconciled.
 */

export const REPAIR_PACKET_VERSION = 1;

const text = (value) => String(value ?? '').trim();

const list = (value) => (Array.isArray(value) ? value : []);

// Every chat UI a teacher will paste from wraps JSON in a fence. Refusing that
// would mean telling teachers to hand-edit an AI reply before MathMaster will
// read it, which is exactly the manual step this feature exists to remove.
const stripJsonFence = (value) => {
  const trimmed = text(value);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

/**
 * The selected questions, with everything a repair needs to honour and nothing
 * it does not need to see.
 *
 * Question order follows the teacher's selection rather than assignment order:
 * they chose these, and the packet should read the way they picked them.
 */
export const buildQuestionBatchRepairPacket = ({
  assignmentV5 = null,
  repairCenterModel = null,
  selectedQuestionIds = [],
  assignmentId = null,
  baseRevision = null,
} = {}) => {
  const rows = list(repairCenterModel?.questions);
  const byId = new Map(rows.map((row) => [text(row.questionId), row]));

  const questions = list(selectedQuestionIds)
    .map((id) => byId.get(text(id)))
    .filter(Boolean)
    .map((row) => ({
      questionId: row.questionId,
      questionNumber: row.questionNumber ?? null,
      sectionId: row.sectionId ?? null,
      sectionRole: row.sectionRole ?? null,
      question: row.question ?? null,
      automatedFindings: list(row.automatedFindings),
      teacherConstraints: list(row.teacherConstraints),
    }));

  return {
    repairPacketVersion: REPAIR_PACKET_VERSION,
    assignmentContext: {
      assignmentId: text(assignmentId) || text(assignmentV5?.assignment?.assignmentId) || null,
      baseRevision: Number.isFinite(Number(baseRevision)) ? Number(baseRevision) : null,
      schemaVersion: Number(assignmentV5?.schemaVersion) || null,
      title: text(assignmentV5?.assignment?.title) || null,
      courseId: text(assignmentV5?.assignment?.courseId) || null,
    },
    questions,
  };
};

/**
 * The packet as something a teacher can paste into any AI chat.
 *
 * The instructions are part of the contract, not decoration: without the triage
 * step a model treats a platform defect as a question defect, and without the
 * "do not regenerate the assignment" line it returns the whole thing.
 */
export const buildQuestionBatchRepairRequest = (options = {}) => {
  const packet = buildQuestionBatchRepairPacket(options);

  return [
    'MathMaster question repair — selected questions only.',
    '',
    'Triage each question before repairing it. Classify every finding as one of:',
    '  assignmentIssue — the authored question is genuinely wrong. Repair it.',
    '  platformIssue   — the question is correct and MathMaster renders or grades it wrongly.',
    '                    Report it. Do NOT rewrite a correct question to work around it.',
    '  unclear         — you cannot tell. Report it and leave the question alone.',
    '',
    'Rules:',
    '  1. Do not regenerate or return the full assignment. Return only the questions below.',
    '  2. Keep each questionId exactly as given. It is how the repair is matched.',
    '  3. Honour every entry in teacherConstraints. An entry with hardConstraint true is a',
    '     requirement, not a suggestion, and outranks your own judgement about the question.',
    '  4. Preserve the assignmentId and baseRevision so a stale reply cannot be applied.',
    '',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "repairPacketVersion": 1,',
    `  "assignmentId": ${JSON.stringify(packet.assignmentContext.assignmentId)},`,
    `  "baseRevision": ${JSON.stringify(packet.assignmentContext.baseRevision)},`,
    '  "replacements": [{ "questionId": "...", "question": { ...full repaired question... } }],',
    '  "platformIssues": [{ "questionId": "...", "classification": "platformIssue", "reason": "...", "suspectedComponent": "..." }],',
    '  "unclearIssues": [{ "questionId": "...", "reason": "..." }]',
    '}',
    '',
    'Questions to repair:',
    JSON.stringify(packet, null, 2),
  ].join('\n');
};

/**
 * Read one AI reply, or refuse it.
 *
 * Every check here exists because the alternative silently damages an
 * assignment: an unselected question gets replaced, an older draft overwrites a
 * newer one, or a replacement lands on the wrong question.
 */
export const parseQuestionBatchRepairResponse = (responseText, {
  expectedAssignmentId = null,
  expectedBaseRevision = null,
  allowedQuestionIds = [],
} = {}) => {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(responseText));
  } catch (error) {
    throw new Error(`The repair reply is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The repair reply must be a single JSON object.');
  }

  // Identity of the draft this reply was built from. Checked before anything is
  // read out of it, so a stale or foreign reply is refused rather than partly
  // applied.
  const expectedId = text(expectedAssignmentId);
  if (expectedId && text(parsed.assignmentId) !== expectedId) {
    throw new Error(`This repair reply is for assignment "${text(parsed.assignmentId) || 'unknown'}", not the assignment being repaired.`);
  }
  if (expectedBaseRevision !== null && expectedBaseRevision !== undefined) {
    const expectedRevision = Number(expectedBaseRevision);
    if (Number(parsed.baseRevision) !== expectedRevision) {
      throw new Error(`This repair reply was built from revision ${parsed.baseRevision}, but the draft is now at revision ${expectedRevision}. Rebuild the packet so a stale repair cannot overwrite newer work.`);
    }
  }

  const allowed = new Set(list(allowedQuestionIds).map(text).filter(Boolean));
  const seen = new Set();

  const replacements = list(parsed.replacements).map((entry) => {
    const questionId = text(entry?.questionId);
    if (!questionId) throw new Error('A replacement is missing its questionId.');
    if (allowed.size && !allowed.has(questionId)) {
      throw new Error(`Question "${questionId}" is not part of this repair request, so its replacement was refused.`);
    }
    if (seen.has(questionId)) {
      throw new Error(`The reply contains duplicate replacements for question "${questionId}".`);
    }
    seen.add(questionId);

    const question = entry?.question;
    if (!question || typeof question !== 'object') {
      throw new Error(`The replacement for question "${questionId}" does not contain a question.`);
    }
    const innerId = text(question.questionId);
    if (innerId && innerId !== questionId) {
      throw new Error(`The replacement for "${questionId}" contains a question whose questionId is "${innerId}".`);
    }

    // questionId belongs to MathMaster. Outside AIs are asked to echo it for
    // clarity, but an otherwise valid repair should not lose identity merely
    // because the AI omitted duplicated platform metadata inside the question.
    return { questionId, question: { ...question, questionId } };
  });

  return {
    repairPacketVersion: Number(parsed.repairPacketVersion) || REPAIR_PACKET_VERSION,
    assignmentId: text(parsed.assignmentId) || null,
    baseRevision: Number.isFinite(Number(parsed.baseRevision)) ? Number(parsed.baseRevision) : null,
    replacements,
    // Reports, never edits. These say something is wrong somewhere else.
    platformIssues: list(parsed.platformIssues),
    unclearIssues: list(parsed.unclearIssues),
  };
};

/**
 * Swap in the repaired questions and leave the rest of the assignment alone.
 *
 * Untouched questions keep their identity — the very same object, not a copy —
 * so anything comparing before and after can tell at a glance which questions
 * this repair actually changed.
 */
export const applyQuestionBatchRepairReplacements = (assignmentV5, parsedResponse) => {
  const replacements = new Map(
    list(parsedResponse?.replacements).map((entry) => [text(entry.questionId), entry.question]),
  );
  if (!replacements.size) return assignmentV5;

  let changed = false;
  const applied = new Set();
  const sections = list(assignmentV5?.sections).map((section) => {
    let sectionChanged = false;
    const questions = list(section?.questions).map((question) => {
      const questionId = text(question?.questionId);
      const replacement = replacements.get(questionId);
      if (!replacement) return question;
      applied.add(questionId);
      sectionChanged = true;
      changed = true;
      return replacement;
    });
    return sectionChanged ? { ...section, questions } : section;
  });

  // A replacement that matched nothing means the reply and the assignment
  // disagree about what exists. Applying the rest and saying nothing would
  // report a successful repair while quietly dropping one of the questions the
  // teacher asked to have fixed.
  const unmatched = [...replacements.keys()].filter((questionId) => !applied.has(questionId));
  if (unmatched.length) {
    throw new Error(`This repair replaces question${unmatched.length === 1 ? '' : 's'} ${unmatched.join(', ')}, which ${unmatched.length === 1 ? 'is' : 'are'} not in this assignment.`);
  }

  return changed ? { ...assignmentV5, sections } : assignmentV5;
};

export default {
  REPAIR_PACKET_VERSION,
  applyQuestionBatchRepairReplacements,
  buildQuestionBatchRepairPacket,
  buildQuestionBatchRepairRequest,
  parseQuestionBatchRepairResponse,
};
