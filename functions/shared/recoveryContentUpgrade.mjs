/*
 * THE RECOVERY V2 UPGRADE OF A LIVE ASSIGNMENT — DRY RUN, APPROVE, APPLY.
 *
 * A live assignment's static Warm-Up and DOL questions gain Recovery without
 * any of them changing: the upgrade writes ONE field, `recoveryContent`
 * (recoveryContent.mjs), and one audit event. This module is everything the
 * preview and the commit callables, the operator's migration script and the
 * tests share:
 *
 *   buildRecoveryUpgradePreview   the plan (recoveryContentPlan.mjs), the
 *                                 dry-run report a teacher approves — what
 *                                 will change and everything that will not —
 *                                 and the plan hash the approval is bound to
 *   applyRecoveryUpgrade          the new `recoveryContent` and the audit
 *                                 event, from a plan whose hash matched
 *
 * SAFE BY CONSTRUCTION.
 *   - No question is edited, added, removed, reordered or retired, so no
 *     content classification (assignmentContentUpgradePolicy.mjs) and no
 *     supersession is involved: the questions students answered stay exactly
 *     the questions they answered.
 *   - No student document is written: attempts, scores, drafts, delivery
 *     pins, checkpoints and Recovery records are untouched, and no Classroom
 *     release signal is raised, because no grade can change.
 *   - Atomic: the commit re-plans inside its transaction and writes only if
 *     the plan hash still matches the one the teacher approved.
 *   - Idempotent: a plan with nothing to add writes nothing, and applying the
 *     same bindings twice creates no new version.
 *   - Auditable: `recoveryContent.history` (uid only — every student reads the
 *     assignment) and an `assignmentVersionEvents` row with the approver.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */

import { hashString32 } from './questionFamilyEngine.mjs';
import { stableStringify } from './idUtils.mjs';
import {
  RECOVERY_BINDING_ORIGIN,
  RECOVERY_SECTIONS_WITH_CONTENT,
  applyRecoveryBindings,
  assignmentRecoveryContent,
  recoverySourceSignature,
} from './recoveryContent.mjs';
import {
  RECOVERY_PLAN_ROW,
  RECOVERY_ROWS_READY_AFTER_APPROVAL,
  RECOVERY_ROWS_READY_NOW,
  RECOVERY_SECTION_STATUS,
  flattenAssignmentQuestions,
  planAssignmentRecoveryContent,
  recoverySectionStatusWith,
} from './recoveryContentPlan.mjs';
import { matchPreparedRecoveryMigration } from './recoveryMigrations.mjs';
import { getPlatformQuestionFamily } from './questionFamilyRegistry.mjs';
import { certifyRecoveryBinding } from './recoveryCertification.mjs';

export const RECOVERY_UPGRADE_EVENT_TYPE = 'recoveryUpgrade';
export const RECOVERY_UPGRADE_REPORT_VERSION = 1;

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hashHex = (text) => [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  .map((seed) => hashString32(text, seed).toString(16).padStart(8, '0'))
  .join('');

const EXCEPTION_STATUSES = new Set([RECOVERY_SECTION_STATUS.OFF, RECOVERY_SECTION_STATUS.LIVE_CHALLENGE, RECOVERY_SECTION_STATUS.SECURE, RECOVERY_SECTION_STATUS.NOT_PRESENT]);

/** The approval is bound to exactly this: the questions as they stand and the bindings to write. */
export const recoveryUpgradePlanHash = ({ assignment = null, plan = null, migrationId = null } = {}) => {
  const questions = flattenAssignmentQuestions(assignment)
    .filter((question) => RECOVERY_SECTIONS_WITH_CONTENT.includes(clean(question?.activityRole).toLowerCase()))
    .map((question) => ({ questionId: clean(question?.questionId) || null, signature: recoverySourceSignature(question), excluded: question?.teacherExcluded === true }));
  const toApply = Object.keys(plan?.bindingsToApply || {}).sort().map((questionId) => {
    const binding = plan.bindingsToApply[questionId];
    return {
      questionId,
      questionFamily: binding.questionFamily,
      sourceSignature: binding.sourceSignature,
      originalFingerprints: [...list(binding.originalFingerprints)].sort(),
    };
  });
  return `rup1:${hashHex(stableStringify({
    assignmentId: clean(assignment?.id) || null,
    migrationId: clean(migrationId) || null,
    questions,
    currentBindingsHash: plan?.currentBindingsHash || null,
    toApply,
  }))}`;
};

/*
 * What students already have, in counts only: the report is shown to the
 * teacher and saved by an operator, and it never needs a name or an id.
 */
const studentRecordSummary = ({ assignment, trackers = [] }) => {
  const questions = flattenAssignmentQuestions(assignment);
  const indicesFor = (role) => questions
    .map((question, index) => ({ question, index }))
    .filter((entry) => clean(entry.question?.activityRole).toLowerCase() === role)
    .map((entry) => entry.index);
  const warmup = indicesFor('warmup');
  const dol = indicesFor('dol');
  const answered = (record) => Boolean(record) && !['unattempted', undefined, null].includes(record?.status ?? (typeof record === 'string' ? record : undefined));
  const summary = { students: 0, withAnyWork: 0, withWarmupWork: 0, withDolWork: 0, withCompletedDol: 0, withRecoveryRecords: 0 };
  list(trackers).forEach(({ tracker, recovery }) => {
    summary.students += 1;
    const entries = isObject(tracker) ? tracker : {};
    const has = (indices) => indices.some((index) => answered(entries[index] ?? entries[String(index)]));
    if (Object.values(entries).some(answered)) summary.withAnyWork += 1;
    if (has(warmup)) summary.withWarmupWork += 1;
    if (has(dol)) summary.withDolWork += 1;
    if (dol.length && dol.every((index) => ['correct', 'expired'].includes((entries[index] ?? entries[String(index)])?.status))) summary.withCompletedDol += 1;
    if (isObject(recovery) && Object.keys(recovery).length) summary.withRecoveryRecords += 1;
  });
  return summary;
};

/**
 * The dry run: the plan, the report, and the hash an approval is bound to.
 *
 *   trackers  [{ tracker, recovery }] per student record that exists for this
 *             assignment (no ids are read into the report)
 *   manifest  a prepared migration (recoveryMigrations.mjs), or null
 */
export const buildRecoveryUpgradePreview = ({
  assignment = null,
  manifest = null,
  gradeSample = null,
  validateVersion = null,
  trackers = [],
  at = null,
} = {}) => {
  const migrationMatch = manifest ? matchPreparedRecoveryMigration(manifest, assignment) : null;
  const plan = planAssignmentRecoveryContent({
    assignment,
    manifest: manifest && migrationMatch?.matches ? manifest : null,
    gradeSample,
    validateVersion,
    origin: manifest && migrationMatch?.matches ? RECOVERY_BINDING_ORIGIN.MIGRATION : RECOVERY_BINDING_ORIGIN.UPGRADE,
    migrationId: manifest && migrationMatch?.matches ? manifest.id : null,
    at,
  });
  const migrationId = manifest && migrationMatch?.matches ? manifest.id : null;
  const planHash = recoveryUpgradePlanHash({ assignment, plan, migrationId });
  const content = assignmentRecoveryContent(assignment);
  const questions = flattenAssignmentQuestions(assignment);
  const familyTitle = (id, version) => getPlatformQuestionFamily(id, version)?.title || id;
  const changes = plan.rows
    .filter((row) => row.status === RECOVERY_PLAN_ROW.ADD || row.status === RECOVERY_PLAN_ROW.REPLACE)
    .map((row) => ({
      questionId: row.questionId,
      label: row.label,
      section: row.section,
      action: row.status,
      family: { id: row.familyId, version: row.familyVersion, title: familyTitle(row.familyId, row.familyVersion) },
      constraints: row.constraints || {},
      freshVersions: row.certification?.freshVersions ?? null,
      excludedFromAssignment: row.certification?.excludedFromAssignment ?? null,
      standards: row.certification?.standards || [],
      rigor: row.certification?.rigor || null,
      tool: row.certification?.tool || null,
      describes: manifest?.questions?.[row.questionId]?.describes || null,
    }));
  const readiness = Object.fromEntries(RECOVERY_SECTIONS_WITH_CONTENT.map((section) => [section, {
    before: recoverySectionStatusWith(section, plan.sections[section], RECOVERY_ROWS_READY_NOW),
    after: recoverySectionStatusWith(section, plan.sections[section], RECOVERY_ROWS_READY_AFTER_APPROVAL),
    message: plan.sections[section]?.message || null,
  }]));
  const report = {
    reportVersion: RECOVERY_UPGRADE_REPORT_VERSION,
    generatedAt: clean(at) || null,
    migrationId,
    migrationMatch: migrationMatch ? { matches: migrationMatch.matches, reasons: migrationMatch.reasons, variant: migrationMatch.variant } : null,
    assignment: {
      id: clean(assignment?.id) || null,
      title: clean(assignment?.title) || null,
      courseId: clean(assignment?.courseId || assignment?.courseProfile?.course) || null,
      rigorVariant: clean(assignment?.rigorVariant || assignment?.courseProfile?.courseLevel) || null,
      assignedClassIds: list(assignment?.assignedClassIds).map(clean).filter(Boolean),
      assignedClassPeriods: list(assignment?.assignedClassPeriods).map(clean).filter((value) => value && value !== 'Unassigned'),
      dueAt: assignment?.dueAt ?? assignment?.dueDate ?? null,
      lateDueAt: assignment?.lateDueAt ?? assignment?.lateDueDate ?? null,
      assignmentRevision: Number(assignment?.assignmentRevision || 1),
      contentVersion: Number(assignment?.contentLineage?.version || 1),
    },
    recoveryContent: {
      versionBefore: content?.version || 0,
      versionAfter: plan.changed ? (content?.version || 0) + 1 : (content?.version || 0),
      bindingsBefore: Object.keys(content?.bindings || {}).length,
      bindingsAfter: Object.keys(plan.desiredBindings).length,
    },
    readiness,
    fullyReadyAfter: Object.values(readiness).every((entry) => entry.after === RECOVERY_SECTION_STATUS.READY || EXCEPTION_STATUSES.has(entry.after)),
    changes,
    kept: plan.rows.filter((row) => row.status === RECOVERY_PLAN_ROW.KEPT || row.status === RECOVERY_PLAN_ROW.FAMILY)
      .map((row) => ({ questionId: row.questionId, label: row.label, section: row.section, source: row.status, familyId: row.familyId })),
    notReady: plan.rows.filter((row) => row.status === RECOVERY_PLAN_ROW.UNAVAILABLE)
      .map((row) => ({ questionId: row.questionId, label: row.label, section: row.section, issues: row.issues })),
    untouched: {
      questionCount: questions.length,
      // Every question, in storage order, with the signature it has now and
      // will still have after the upgrade.
      questions: questions.map((question, index) => ({
        index,
        questionId: clean(question?.questionId) || null,
        section: clean(question?.activityRole).toLowerCase() || null,
        signature: recoverySourceSignature(question),
      })),
      studentRecords: studentRecordSummary({ assignment, trackers }),
      statements: [
        'No question is edited, added, removed, reordered or retired; question ids, mathematics and tools stay exactly as students saw them.',
        'No student record is written: attempts, scores, saved drafts, delivery pins, checkpoints and Recovery records are untouched, so no grade can change.',
        'Due dates, class assignments, Classroom posts and gradebook columns are untouched, and no Classroom grade sync is requested.',
        'Original answers keep being graded exactly as before; only a Recovery, after the original closes, uses the new Recovery versions.',
      ],
    },
    writes: plan.changed
      ? [
        `assignments/${clean(assignment?.id)}: the recoveryContent field only (version ${content?.version || 0} → ${(content?.version || 0) + 1})`,
        'assignmentVersionEvents/<new>: one recoveryUpgrade audit event',
      ]
      : [],
    changed: plan.changed,
    planHash,
  };
  return { plan, report, planHash };
};

/**
 * Apply a plan whose hash matched the approved one. Returns
 * { changed, recoveryContent, added, replaced, auditEvent }.
 */
export const applyRecoveryUpgrade = ({
  assignment = null,
  plan = null,
  planHash = null,
  migrationId = null,
  at = null,
  actorUid = null,
  actorEmail = null,
  authorizationType = null,
  approvedBy = null,
  affectedStudentCount = null,
} = {}) => {
  if (!plan) throw new Error('A reviewed recovery upgrade plan is required.');
  const content = assignmentRecoveryContent(assignment);
  const applied = applyRecoveryBindings({
    content,
    bindings: plan.bindingsToApply,
    at,
    actorUid,
    source: migrationId ? RECOVERY_BINDING_ORIGIN.MIGRATION : RECOVERY_BINDING_ORIGIN.UPGRADE,
    migrationId,
    planHash,
  });
  return {
    changed: applied.changed,
    recoveryContent: applied.content,
    added: applied.added,
    replaced: applied.replaced,
    auditEvent: applied.changed ? {
      eventType: RECOVERY_UPGRADE_EVENT_TYPE,
      assignmentId: clean(assignment?.id) || null,
      assignmentTitle: clean(assignment?.title) || null,
      migrationId: clean(migrationId) || null,
      planHash: clean(planHash) || null,
      recoveryContentVersionFrom: content?.version || 0,
      recoveryContentVersionTo: applied.content.version,
      bindingsAdded: applied.added,
      bindingsReplaced: applied.replaced,
      bindings: Object.fromEntries([...applied.added, ...applied.replaced].map((questionId) => {
        const binding = applied.content.bindings[questionId];
        return [questionId, {
          section: binding.section,
          familyId: binding.questionFamily.id,
          familyVersion: binding.questionFamily.version,
          constraints: binding.questionFamily.constraints,
          sourceSignature: binding.sourceSignature,
        }];
      })),
      actorUid: clean(actorUid) || null,
      actorEmail: clean(actorEmail) || null,
      actorAuthorizationType: clean(authorizationType) || null,
      approvedBy: clean(approvedBy) || null,
      affectedStudentCount: Number.isFinite(Number(affectedStudentCount)) ? Number(affectedStudentCount) : null,
      // What the upgrade did NOT touch, for whoever reads the audit later.
      questionsChanged: 0,
      studentRecordsWritten: 0,
      classroomSyncRequested: false,
      at: clean(at) || null,
    } : null,
  };
};

/** The dry-run report as plain text, for the operator's terminal and the saved file. */
export const renderRecoveryUpgradeReportText = (report = {}) => {
  const lines = [];
  const assignment = report.assignment || {};
  lines.push(`Recovery V2 upgrade — ${report.changed ? 'DRY RUN' : 'NOTHING TO CHANGE'}`);
  lines.push(`Assignment ${assignment.id} · ${assignment.title}${assignment.rigorVariant ? ` · ${assignment.rigorVariant}` : ''}`);
  if (report.migrationId) lines.push(`Prepared migration: ${report.migrationId}`);
  if (report.migrationMatch && !report.migrationMatch.matches) lines.push(`  (not a copy of the prepared lesson: ${report.migrationMatch.reasons.join(', ')})`);
  lines.push(`Classes: ${(assignment.assignedClassIds || []).join(', ') || (assignment.assignedClassPeriods || []).join(', ') || 'none'} · due ${assignment.dueAt || '—'} · final ${assignment.lateDueAt || '—'}`);
  lines.push(`Recovery content: version ${report.recoveryContent?.versionBefore} → ${report.recoveryContent?.versionAfter} (${report.recoveryContent?.bindingsBefore} → ${report.recoveryContent?.bindingsAfter} prepared questions)`);
  Object.entries(report.readiness || {}).forEach(([section, entry]) => {
    lines.push(`${section === 'dol' ? 'DOL' : 'Warm-Up'} Recovery: ${entry.before} → ${entry.after}${entry.message ? ` (${entry.message})` : ''}`);
  });
  lines.push('');
  lines.push('WILL CHANGE');
  if (!(report.changes || []).length) lines.push('  nothing');
  (report.changes || []).forEach((change) => {
    lines.push(`  ${change.label} (${change.questionId}): ${change.action === 'replace' ? 'replace stale Recovery with' : 'add Recovery from'} ${change.family.title} [${change.family.id} v${change.family.version}] ${JSON.stringify(change.constraints)} — ${change.freshVersions} fresh versions, ${change.excludedFromAssignment} of this assignment's own problems excluded, ${change.tool?.type}${change.tool?.mode ? `/${change.tool.mode}` : ''}, ${change.standards.join(', ')}, DOK ${change.rigor?.dok} difficulty ${change.rigor?.band}`);
  });
  if ((report.notReady || []).length) {
    lines.push('');
    lines.push('NOT READY (no Recovery will be offered for these)');
    report.notReady.forEach((row) => lines.push(`  ${row.label} (${row.questionId}): ${row.issues.map((entry) => entry.message).join(' ')}`));
  }
  lines.push('');
  lines.push('WILL NOT CHANGE');
  (report.untouched?.statements || []).forEach((statement) => lines.push(`  - ${statement}`));
  const records = report.untouched?.studentRecords || {};
  lines.push(`  - ${records.students ?? 0} student records (${records.withWarmupWork ?? 0} with Warm-Up work, ${records.withDolWork ?? 0} with DOL work, ${records.withCompletedDol ?? 0} with a finished DOL, ${records.withRecoveryRecords ?? 0} with Recovery records) stay exactly as they are.`);
  lines.push(`  - ${report.untouched?.questionCount ?? 0} questions keep their ids, order and content.`);
  lines.push('');
  lines.push('WRITES');
  if (!(report.writes || []).length) lines.push('  none');
  (report.writes || []).forEach((write) => lines.push(`  ${write}`));
  lines.push(`Plan hash: ${report.planHash}`);
  return lines.join('\n');
};

/*
 * A CONTENT V2 UPGRADE'S RECOVERY PROPOSALS, CERTIFIED.
 *
 * assignmentContentVersion.buildContentUpgradePlan proposes a binding for each
 * recovery-capability change (and for the target release's own recovery
 * content on a question it leaves as it is). Each is certified here against
 * the assignment as the upgrade leaves it — the live questions, kept — exactly
 * like any binding; one that does not certify is simply not added, and says
 * why. Returns { bindings, results }.
 */
export const certifyRecoveryProposals = ({
  assignment = null,
  proposals = {},
  gradeSample = null,
  at = null,
} = {}) => {
  const questions = flattenAssignmentQuestions(assignment);
  const bindings = {};
  const results = Object.entries(isObject(proposals) ? proposals : {}).map(([questionId, proposal]) => {
    const storageIndex = questions.findIndex((question) => clean(question?.questionId) === clean(questionId));
    const question = storageIndex >= 0 ? questions[storageIndex] : null;
    const section = clean(question?.activityRole).toLowerCase();
    if (!question || !RECOVERY_SECTIONS_WITH_CONTENT.includes(section) || question.teacherExcluded === true) {
      return { questionId, ok: false, issues: [{ code: 'not-a-delivered-warmup-or-dol-question', message: `${questionId} is not a delivered Warm-Up or DOL question.`, fix: null }] };
    }
    const certified = certifyRecoveryBinding({
      assignmentId: clean(assignment?.id) || 'assignment',
      question,
      storageIndex,
      section,
      questionFamily: proposal?.questionFamily,
      questions,
      label: questionId,
      gradeSample,
      origin: RECOVERY_BINDING_ORIGIN.UPGRADE,
      at,
    });
    if (certified.ok) bindings[questionId] = certified.binding;
    return { questionId, ok: certified.ok, issues: certified.issues, familyId: certified.certification?.familyId || null };
  });
  return { bindings, results };
};
