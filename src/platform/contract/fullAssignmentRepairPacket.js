import { applyQuestionBatchRepairReplacements } from './questionBatchRepairPacket.js';

export const FULL_ASSIGNMENT_REPAIR_PACKET_VERSION = 2;
export const FULL_ASSIGNMENT_REPAIR_SCOPE = 'fullAssignmentAudit';
export const FULL_AUDIT_CLASSIFICATIONS = Object.freeze(['passed', 'assignmentIssue', 'platformIssue', 'unclear']);

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const stripFence = (value) => {
  const source = clean(value);
  const match = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : source;
};
const assignmentQuestions = (assignmentV5) => list(assignmentV5?.sections).flatMap((section) => (
  list(section?.questions).map((question) => ({ section, question }))
));

export const buildFullAssignmentRepairPacket = ({
  assignmentV5, repairCenterModel = null, assignmentId = null, baseRevision = null,
} = {}) => {
  const rows = new Map(list(repairCenterModel?.questions).map((row) => [clean(row?.questionId), row]));
  const seen = new Set();
  const questions = assignmentQuestions(assignmentV5).map(({ section, question }, index) => {
    const questionId = clean(question?.questionId);
    if (!questionId) throw new Error(`Question ${index + 1} is missing a stable questionId. Repair the assignment integrity before starting a full audit.`);
    if (seen.has(questionId)) throw new Error(`The assignment contains duplicate questionId "${questionId}". Repair assignment integrity before starting a full audit.`);
    seen.add(questionId);
    const row = rows.get(questionId);
    return {
      questionId,
      sectionId: clean(section?.id) || null,
      sectionRole: clean(section?.role) || null,
      question,
      automatedFindings: list(row?.automatedFindings),
      teacherConstraints: list(row?.teacherConstraints).map((constraint) => ({ ...constraint, hardConstraint: constraint?.hardConstraint !== false })),
    };
  });
  if (!questions.length) throw new Error('A full assignment audit requires at least one current question.');
  return {
    repairPacketVersion: FULL_ASSIGNMENT_REPAIR_PACKET_VERSION,
    repairScope: FULL_ASSIGNMENT_REPAIR_SCOPE,
    assignmentId: clean(assignmentId) || clean(assignmentV5?.assignment?.assignmentId) || null,
    baseRevision: Number.isFinite(Number(baseRevision)) ? Number(baseRevision) : null,
    assignmentContext: {
      title: clean(assignmentV5?.assignment?.title) || null,
      schemaVersion: Number(assignmentV5?.schemaVersion) || null,
      diagnostics: list(repairCenterModel?.assignmentFindings),
      sections: list(assignmentV5?.sections).map(({ id, role, title }) => ({ id: clean(id) || null, role: clean(role) || null, title: clean(title) || null })),
    },
    questions,
  };
};

export const buildFullAssignmentRepairRequest = (options = {}) => {
  const packet = buildFullAssignmentRepairPacket(options);
  return [
    'MathMaster Full Assignment Audit.',
    'Inspect every question; do not assume unflagged questions are correct. Classify every question exactly once as passed, assignmentIssue, platformIssue, or unclear.',
    'Repair only assignmentIssue. Report platformIssue and unclear without rewriting the question or lowering rigor. Do not regenerate the full assignment.',
    'Keep every questionId unchanged, honor all teacherConstraints (hardConstraint is mandatory), and preserve assignmentId and baseRevision.',
    'Return only JSON using repairPacketVersion 2, repairScope "fullAssignmentAudit", assignmentId, baseRevision, auditResults, replacements, platformIssues, unclearIssues, and globalFindings.',
    JSON.stringify(packet, null, 2),
  ].join('\n\n');
};

export const parseFullAssignmentRepairResponse = (responseText, {
  expectedAssignmentId, expectedBaseRevision, currentQuestionIds = [],
} = {}) => {
  let parsed;
  try { parsed = JSON.parse(stripFence(responseText)); } catch (error) { throw new Error(`The full audit reply is not valid JSON: ${error.message}`); }
  if (Number(parsed?.repairPacketVersion) !== FULL_ASSIGNMENT_REPAIR_PACKET_VERSION || parsed?.repairScope !== FULL_ASSIGNMENT_REPAIR_SCOPE) {
    throw new Error('This is not a Full Assignment Audit version 2 response.');
  }
  if (clean(parsed.assignmentId) !== clean(expectedAssignmentId)) throw new Error(`This audit is for assignment "${clean(parsed.assignmentId) || 'unknown'}", not "${clean(expectedAssignmentId)}".`);
  if (Number(parsed.baseRevision) !== Number(expectedBaseRevision)) throw new Error(`This audit was built from revision ${parsed.baseRevision}, but the assignment is now revision ${expectedBaseRevision}. Re-run Full Assignment Audit before applying repairs.`);

  const expected = new Set(list(currentQuestionIds).map(clean));
  const classifications = new Map();
  const auditResults = list(parsed.auditResults).map((result) => {
    const questionId = clean(result?.questionId);
    if (!expected.has(questionId)) throw new Error(`The audit contains unknown question "${questionId || 'missing'}".`);
    if (classifications.has(questionId)) throw new Error(`The audit contains a duplicate result for question "${questionId}".`);
    if (!FULL_AUDIT_CLASSIFICATIONS.includes(result?.classification)) throw new Error(`Question "${questionId}" has an unsupported audit classification.`);
    if (!clean(result?.reason)) throw new Error(`Question "${questionId}" needs an audit reason.`);
    classifications.set(questionId, result.classification);
    return { ...result, questionId, reason: clean(result.reason) };
  });
  const missing = [...expected].filter((id) => !classifications.has(id));
  if (missing.length) throw new Error(`The reply is missing an audit result for: ${missing.join(', ')}.`);

  const seenReplacements = new Set();
  const replacements = list(parsed.replacements).map((entry) => {
    const questionId = clean(entry?.questionId);
    if (seenReplacements.has(questionId)) throw new Error(`The audit contains a duplicate replacement for question "${questionId}".`);
    seenReplacements.add(questionId);
    const classification = classifications.get(questionId);
    if (classification !== 'assignmentIssue') throw new Error(`Question "${questionId}" is ${classification || 'unknown'} and cannot contain a replacement.`);
    if (!entry?.question || typeof entry.question !== 'object') throw new Error(`The replacement for "${questionId}" is incomplete.`);
    if (clean(entry.question.questionId) !== questionId) throw new Error(`Replacement outer and inner questionId values disagree for "${questionId}".`);
    return { questionId, question: entry.question };
  });
  const replacementIds = new Set(replacements.map((entry) => entry.questionId));
  for (const [questionId, classification] of classifications) {
    if (classification === 'assignmentIssue' && !replacementIds.has(questionId)) throw new Error(`Assignment issue "${questionId}" has no valid replacement.`);
  }
  return { ...parsed, auditResults, replacements, platformIssues: list(parsed.platformIssues), unclearIssues: list(parsed.unclearIssues), globalFindings: list(parsed.globalFindings) };
};

export const stageFullAssignmentRepairs = ({ assignmentV5, parsedResponse, selectedQuestionIds = [] } = {}) => {
  const selected = new Set(list(selectedQuestionIds).map(clean));
  const permitted = new Set(list(parsedResponse?.auditResults).filter((result) => result.classification === 'assignmentIssue').map((result) => clean(result.questionId)));
  const replacements = list(parsedResponse?.replacements).filter((entry) => selected.has(clean(entry.questionId)) && permitted.has(clean(entry.questionId)));
  if (selected.size !== replacements.length) throw new Error('A selected repair is missing, duplicated, or does not target an assignment issue.');
  return applyQuestionBatchRepairReplacements(assignmentV5, { replacements });
};

export const summarizeFullAssignmentAudit = (response) => {
  const counts = Object.fromEntries(FULL_AUDIT_CLASSIFICATIONS.map((classification) => [classification, 0]));
  list(response?.auditResults).forEach((result) => { counts[result.classification] += 1; });
  return { total: list(response?.auditResults).length, ...counts, proposedReplacements: list(response?.replacements).length, globalFindings: list(response?.globalFindings).length };
};
