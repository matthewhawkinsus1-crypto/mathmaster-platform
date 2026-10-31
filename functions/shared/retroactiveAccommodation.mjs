import { cachedReducedWorkloadPlan, projectStudentWorkload, resolveStudentWorkload, workloadItemsFromAssignment, workloadAnchorDateKey } from './reducedWorkload.mjs';
import { workloadContentKey } from './workloadCorrection.mjs';
import { isTestCycleAssignment } from './testCyclePolicy.mjs';
export { workloadContentKey } from './workloadCorrection.mjs';

const roles = ['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test'];
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const normalizeRetroactiveRequest = (input = {}) => {
  if (!Number.isInteger(input.percent) || input.percent < 10 || input.percent > 50) throw new Error('Choose a whole-number reduction from 10 to 50 percent.');
  if (![input.effectiveDate, input.fromDate, input.toDate].every(date) || input.fromDate > input.toDate) throw new Error('Choose valid effective and historical range dates.');
  const sourceDescriptor = String(input.sourceDescriptor || '').trim();
  if (!sourceDescriptor || sourceDescriptor.length > 120 || /[\r\n]/.test(sourceDescriptor)) throw new Error('Use a short source descriptor, not document text (120 characters maximum).');
  const appliesTo = [...new Set(Array.isArray(input.appliesTo) ? input.appliesTo : [])];
  if (appliesTo.some((role) => !roles.includes(role))) throw new Error('Choose supported activities.');
  return { percent: input.percent, effectiveDate: input.effectiveDate, fromDate: input.fromDate, toDate: input.toDate, sourceDescriptor, appliesTo };
};

/** Non-mutating selection; grade computation is supplied by the authoritative server pipeline. */
export const previewRetroactiveSelection = ({ assignment, gradeData = {}, request: raw, nowValue = Date.now(), includedIndices = null, practiceWaived = [] }) => {
  const request = normalizeRetroactiveRequest(raw);
  const dueDate = workloadAnchorDateKey(assignment, { nowValue });
  const reasons = [];
  if (!(assignment?.dueAt || assignment?.dueDate)) reasons.push('Original due date is unavailable.');
  if (assignment?.secure === true || isTestCycleAssignment(assignment)) reasons.push('Secure assessment: separate human decision required.');
  if (Number(assignment?.schemaVersion) !== 5 || !Array.isArray(assignment?.sections)) reasons.push('Faithful V5 historical content is unavailable.');
  // A content-upgraded document alone does not prove what the student was given.
  if (Number(assignment?.contentVersion || 1) > 1 || (Number(assignment?.contentLineage?.version || 1) > 1 && !assignment?.contentLineage?.sourceAssignmentId) || assignment?.contentUpgrade || assignment?.historicalContentUnavailable === true) reasons.push('Historical content revision needs manual review.');
  const overrides = gradeData.teacherGradeOverridesByAssignment?.[assignment?.id] || {};
  if (overrides.__assignment?.active === true || Object.values(overrides).some((entry) => entry?.persistent === true)) reasons.push('Conflicting assignment or persistent section override needs manual review.');
  const items = workloadItemsFromAssignment(assignment);
  const questions = (assignment?.sections || []).flatMap((section) => section.questions || []);
  const ids = questions.map((q) => q?.questionId).filter(Boolean);
  if (ids.length !== new Set(ids).size) reasons.push('Ambiguous question identity needs manual review.');
  for (const q of questions) {
    if (q?.supersedesQuestionId && (!questions.some((old) => old?.questionId === q.supersedesQuestionId && old.teacherExcluded === true) || questions.filter((candidate) => candidate?.supersedesQuestionId === q.supersedesQuestionId && !candidate.teacherExcluded).length !== 1)) reasons.push('Ambiguous replacement needs manual review.');
  }
  const tracker = gradeData.gradesByAssignment?.[assignment?.id] || null;
  for (const [index, record] of Object.entries(tracker || {})) {
    if (record?.questionId && questions[Number(index)]?.questionId !== record.questionId && questions[Number(index)]?.teacherExcluded !== true) reasons.push('Stored answer belongs to a different content revision.');
  }
  const base = (includedIndices || items.map((item) => item.storageIndex)).filter((index) => !practiceWaived.includes(index));
  const previous = resolveStudentWorkload({ assignment, profile: gradeData.profile, tracker, baseIndices: base, practiceWaived, nowValue });
  if (previous.reviewNeeded) reasons.push('Existing correction is stale; review its historical content first.');
  const plan = cachedReducedWorkloadPlan({ assignment, percent: request.percent, appliesTo: request.appliesTo });
  const proposed = projectStudentWorkload({ plan, baseIndices: base, tracker });
  const applicable = dueDate >= request.fromDate && dueDate <= request.toDate && dueDate >= request.effectiveDate && dueDate < workloadAnchorDateKey({}, { nowValue });
  const variance = [...plan.variance];
  if (practiceWaived.some((index) => plan.removed.includes(index))) variance.push('practice-pass');
  if (proposed.keptAnswered.length > proposed.compensated.length) variance.push('answered-before-reduction');
  return {
    status: !(assignment?.dueAt || assignment?.dueDate) ? 'manual-review' : !applicable ? 'out-of-range' : reasons.length ? 'manual-review' : 'eligible',
    assignmentId: assignment?.id, title: assignment?.title || 'Assignment', dueDate,
    reasons: [...new Set(reasons)], policy: request, contentKey: workloadContentKey(assignment),
    originalCount: base.length, previousRequiredCount: previous.indices.length, proposedRequiredCount: proposed.indices.length,
    previousRequiredIndices: previous.indices, proposedRequiredIndices: proposed.indices,
    omittedIndices: proposed.omitted, actualPercentTenths: base.length ? Math.round(1000 * proposed.omitted.length / base.length) : 0,
    variance: [...new Set(variance)], affectedRoles: [...new Set(items.filter((item) => proposed.omitted.includes(item.storageIndex)).map((item) => item.role))],
    answeredCount: proposed.indices.filter((index) => tracker?.[index] && (typeof tracker[index] === 'string' ? tracker[index] !== 'unattempted' : tracker[index].status && tracker[index].status !== 'unattempted')).length,
    policyDiscrepancy: previous.policy?.status === 'automatic' && (previous.policy.percent !== request.percent || JSON.stringify(previous.policy.appliesTo) !== JSON.stringify(request.appliesTo)),
  };
};
