import { ensureAssignmentV5QuestionIds } from '../contract/assignmentSchemaV5.js';
import { buildAssignmentV5PreflightModel } from './assignmentV5PreflightModel.js';
import {
  AUTHORING_STATES,
  canSalvageV5IntakeResult,
  teacherFlagNeedsReview,
} from './assignmentAuthoringState.js';
import { emptyTeacherReviewContext } from './teacherReviewContext.js';
import { buildRepairHistoryEntry } from './assignmentRepairHistory.js';
import { teacherMayOverrideDiagnostic } from './assignmentRepairTriage.js';
import {
  mergeAssignmentPlatformIssues,
  resolveAssignmentPlatformIssues,
} from './assignmentPlatformIssues.js';

const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

const requireAssignmentV5 = (candidate, label = 'Assignment draft') => {
  if (!candidate || typeof candidate !== 'object' || Number(candidate.schemaVersion) !== 5) {
    throw new Error(`${label} must be an Assignment V5 object.`);
  }
  return candidate;
};

const withStableQuestionIds = (candidate, label = 'Assignment draft') => (
  ensureAssignmentV5QuestionIds(requireAssignmentV5(candidate, label))
);

const countQuestions = (assignmentV5) => (
  (Array.isArray(assignmentV5?.sections) ? assignmentV5.sections : []).reduce(
    (count, section) => count + (Array.isArray(section?.questions) ? section.questions.length : 0),
    0,
  )
);

const uniqueStrings = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean),
)];

const sanitizeDiagnostics = (diagnostics = []) => (
  jsonSafe(Array.isArray(diagnostics) ? diagnostics : [])
);

const revisionNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? number : fallback;
};

const mirrorPlatformIssuesIntoReviewContext = (record, platformIssues) => ({
  ...(record?.teacherReviewContext || emptyTeacherReviewContext()),
  platformIssues: jsonSafe(Array.isArray(platformIssues) ? platformIssues : []),
});

export const restoreIncompleteAssignmentV5 = (record) => {
  const serialized = record?.authoringDraft?.canonicalJson;
  if (!serialized) {
    throw new Error('This incomplete assignment draft does not contain its saved V5 assignment.');
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('This incomplete assignment draft contains corrupted saved V5 JSON.');
  }

  // Older drafts predate immutable question ids. Upgrade identity in memory on
  // every open so the same saved JSON always receives the same IDs before
  // Repair Center selection, flags, history, or AI packets use it.
  return withStableQuestionIds(parsed, 'Saved incomplete assignment');
};

export const buildIncompleteAssignmentDraftRecord = ({
  intakeResult,
  rawText = '',
  sourceName = 'Imported assignment',
  ownerUid = null,
  ownerEmail = null,
  nowIso = new Date().toISOString(),
} = {}) => {
  if (!canSalvageV5IntakeResult(intakeResult)) {
    throw new Error('Only parseable Assignment V5 validation failures can be saved as incomplete drafts.');
  }

  const canonical = withStableQuestionIds(intakeResult.parsed.assignmentV5);
  const model = buildAssignmentV5PreflightModel(canonical);
  const errors = uniqueStrings(model.errors?.length ? model.errors : intakeResult.errors);
  const warnings = uniqueStrings([...(model.warnings || []), ...(intakeResult.warnings || [])]);
  const diagnostics = sanitizeDiagnostics(model.diagnostics);
  const blockingCount = diagnostics.filter((entry) => entry?.severity === 'blocking').length || errors.length;
  const warningCount = diagnostics.filter((entry) => entry?.severity === 'warning').length || warnings.length;
  const timestamp = String(nowIso || new Date().toISOString());

  return {
    schemaVersion: 5,
    title: String(canonical.assignment?.title || 'Incomplete Assignment').trim() || 'Incomplete Assignment',
    courseId: canonical.assignment?.courseId || null,
    authoringState: AUTHORING_STATES.INCOMPLETE,
    assignmentRevision: 1,
    authoringReview: {
      state: AUTHORING_STATES.INCOMPLETE,
      sourceName: String(sourceName || 'Imported assignment'),
      ownerUid: ownerUid || null,
      ownerEmail: ownerEmail || null,
      savedAt: timestamp,
      questionCount: countQuestions(canonical),
      blockingCount,
      warningCount,
      errors,
      warnings,
      diagnostics,
    },
    // Platform defects are review metadata, not question JSON. Keeping this list
    // separate means a report-only AI reply cannot silently become a content
    // revision. The review-context mirror lets the existing Repair Center model
    // render the same durable reports without a second UI state system.
    platformIssues: [],
    teacherReviewContext: {
      ...emptyTeacherReviewContext(),
      platformIssues: [],
    },
    authoringDraft: {
      sourceJson: String(rawText || JSON.stringify(canonical)),
      canonicalJson: JSON.stringify(canonical),
      sourceSchemaVersion: 5,
    },
    assignedClassIds: [],
    assignedClassPeriods: [],
    dueAt: null,
    dueDate: null,
    lateDueAt: null,
    lateDueDate: null,
    releaseAt: null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const markIncompleteDraftForReview = (
  record,
  repairedAssignmentV5,
  { nowIso = new Date().toISOString() } = {},
) => {
  const canonical = withStableQuestionIds(repairedAssignmentV5, 'Repaired assignment');
  const model = buildAssignmentV5PreflightModel(canonical);
  const errors = uniqueStrings(model.errors || []);
  const warnings = uniqueStrings(model.warnings || []);
  const diagnostics = sanitizeDiagnostics(model.diagnostics);
  const state = model.isValid ? AUTHORING_STATES.NEEDS_REVIEW : AUTHORING_STATES.INCOMPLETE;
  const timestamp = String(nowIso || new Date().toISOString());

  return {
    ...record,
    schemaVersion: 5,
    title: String(canonical.assignment?.title || record?.title || 'Incomplete Assignment').trim() || 'Incomplete Assignment',
    courseId: canonical.assignment?.courseId || record?.courseId || null,
    authoringState: state,
    authoringReview: {
      ...(record?.authoringReview || {}),
      state,
      reviewedAt: timestamp,
      questionCount: countQuestions(canonical),
      blockingCount: diagnostics.filter((entry) => entry?.severity === 'blocking').length || errors.length,
      warningCount: diagnostics.filter((entry) => entry?.severity === 'warning').length || warnings.length,
      errors,
      warnings,
      diagnostics,
    },
    authoringDraft: {
      ...(record?.authoringDraft || {}),
      canonicalJson: JSON.stringify(canonical),
      sourceSchemaVersion: 5,
    },
    updatedAt: timestamp,
  };
};

/**
 * Save report-only platform findings without changing canonical assignment JSON,
 * assignmentRevision, teacher flags, or repair history.
 */
export const applyIncompleteDraftPlatformIssueReport = (
  record,
  incomingIssues = [],
  {
    repairManifest = [],
    nowIso = new Date().toISOString(),
  } = {},
) => {
  const merged = mergeAssignmentPlatformIssues(record?.platformIssues || [], incomingIssues, { nowIso });
  const platformIssues = resolveAssignmentPlatformIssues(merged, repairManifest);
  return {
    ...record,
    platformIssues,
    teacherReviewContext: mirrorPlatformIssuesIntoReviewContext(record, platformIssues),
    updatedAt: String(nowIso || new Date().toISOString()),
  };
};

/** Re-evaluate existing reports against the current deterministic repair manifest. */
export const refreshIncompleteDraftPlatformIssues = (
  record,
  {
    repairManifest = [],
    nowIso = new Date().toISOString(),
  } = {},
) => {
  const platformIssues = resolveAssignmentPlatformIssues(record?.platformIssues || [], repairManifest);
  return {
    ...record,
    platformIssues,
    teacherReviewContext: mirrorPlatformIssuesIntoReviewContext(record, platformIssues),
    updatedAt: String(nowIso || new Date().toISOString()),
  };
};

/**
 * Complete the human review boundary after repair.
 *
 * A successful repair import only proves that the candidate introduced no new
 * blocker. It does not approve the teacher's own flags, and it does not mean
 * the assignment should silently appear in the normal Library. Final review
 * reruns Preflight against the saved canonical V5 plus the persisted teacher
 * context. True blockers and unresolved teacher flags refuse promotion.
 *
 * Warnings are deliberately retained rather than erased. Reaching this function
 * is the teacher's explicit acknowledgement that they reviewed those warnings,
 * so a warning may remain in authoringReview while the draft advances to Ready.
 * Publishing is a separate explicit choice. Neither action mutates question
 * JSON or advances assignmentRevision.
 */
export const finalizeIncompleteAssignmentReview = (
  record,
  {
    published = false,
    nowIso = new Date().toISOString(),
  } = {},
) => {
  const canonical = restoreIncompleteAssignmentV5(record);
  const teacherReviewContext = record?.teacherReviewContext || emptyTeacherReviewContext();
  const model = buildAssignmentV5PreflightModel(canonical, { teacherReviewContext });
  const diagnostics = sanitizeDiagnostics(model.diagnostics);
  const errors = uniqueStrings(model.errors || []);
  const warnings = uniqueStrings(model.warnings || []);
  const timestamp = String(nowIso || new Date().toISOString());

  const overrideKeyOf = (entry) => `${String(entry?.code ?? entry?.diagnosticCode ?? '').trim()}::${String(entry?.questionId ?? '').trim()}`;
  const diagnosticOverrides = Array.isArray(teacherReviewContext?.diagnosticOverrides)
    ? teacherReviewContext.diagnosticOverrides
    : [];
  const blockingDiagnostics = diagnostics.filter((entry) => {
    if (!['blocking', 'error'].includes(String(entry?.severity || '').toLowerCase())) return false;
    const overridden = diagnosticOverrides.some((override) => overrideKeyOf(override) === overrideKeyOf(entry));
    return !(overridden && teacherMayOverrideDiagnostic(entry));
  });

  if (blockingDiagnostics.length > 0) {
    throw new Error(`This assignment still has ${blockingDiagnostics.length} blocking repair issue${blockingDiagnostics.length === 1 ? '' : 's'}. Finish the Repair Center work before final review.`);
  }

  const unresolvedTeacherFlags = (Array.isArray(teacherReviewContext?.flags) ? teacherReviewContext.flags : [])
    .filter(teacherFlagNeedsReview);
  if (unresolvedTeacherFlags.length > 0) {
    throw new Error(`Teacher review is not complete: ${unresolvedTeacherFlags.length} teacher flag${unresolvedTeacherFlags.length === 1 ? '' : 's'} still need verification or resolution.`);
  }

  const state = published === true ? AUTHORING_STATES.PUBLISHED : AUTHORING_STATES.READY;
  return {
    ...record,
    schemaVersion: 5,
    title: String(canonical.assignment?.title || record?.title || 'Incomplete Assignment').trim() || 'Incomplete Assignment',
    courseId: canonical.assignment?.courseId || record?.courseId || null,
    authoringState: state,
    authoringReview: {
      ...(record?.authoringReview || {}),
      state,
      reviewedAt: timestamp,
      finalizedAt: timestamp,
      ...(published === true ? { publishedAt: timestamp } : {}),
      questionCount: countQuestions(canonical),
      blockingCount: 0,
      warningCount: diagnostics.filter((entry) => entry?.severity === 'warning').length || warnings.length,
      errors,
      warnings,
      diagnostics,
    },
    updatedAt: timestamp,
  };
};

/**
 * Turn an already-validated Step 5 repair into the next persisted draft record.
 * Assignment content repairs advance the canonical revision. Report-only
 * platform findings take the metadata-only branch above and never do.
 */
export const applyIncompleteDraftRepairCommit = (
  record,
  committedRepair = {},
  { nowIso = new Date().toISOString() } = {},
) => {
  if (committedRepair?.kind === 'platformIssueReport') {
    return applyIncompleteDraftPlatformIssueReport(
      record,
      committedRepair?.platformIssues || [],
      { nowIso },
    );
  }

  const canonical = withStableQuestionIds(committedRepair?.assignmentV5, 'Committed repaired assignment');
  const currentRevision = revisionNumber(record?.assignmentRevision, 1);
  const committedRevision = revisionNumber(committedRepair?.committedRevision, null);
  if (committedRevision == null || committedRevision <= currentRevision) {
    throw new Error(`A saved repair must advance the assignment revision beyond ${currentRevision}.`);
  }

  const liveSignals = [
    Array.isArray(record?.assignedClassIds) && record.assignedClassIds.length > 0,
    Array.isArray(record?.assignedClassPeriods) && record.assignedClassPeriods.length > 0,
    record?.hasLiveProtection === true,
    Number(record?.studentEvidenceCount) > 0,
  ];
  if (liveSignals.some(Boolean)) {
    throw new Error('This assignment has been delivered to students, so it cannot be repaired through the authoring draft path. Use Safe Live Repair, which preserves student attempts and scoring history.');
  }

  const beforeAssignmentV5 = (() => {
    try {
      return restoreIncompleteAssignmentV5(record);
    } catch (error) {
      return null;
    }
  })();

  const reviewed = markIncompleteDraftForReview(record, canonical, { nowIso });
  const historyEntry = buildRepairHistoryEntry({
    beforeAssignmentV5,
    afterAssignmentV5: canonical,
    fromRevision: currentRevision,
    toRevision: committedRevision,
    committedAt: nowIso,
  });

  return {
    ...reviewed,
    assignmentRevision: committedRevision,
    teacherReviewContext: jsonSafe(
      committedRepair?.teacherReviewContext
      || record?.teacherReviewContext
      || emptyTeacherReviewContext(),
    ),
    repairHistory: historyEntry
      ? [...(Array.isArray(record?.repairHistory) ? record.repairHistory : []), historyEntry]
      : (Array.isArray(record?.repairHistory) ? record.repairHistory : []),
  };
};
