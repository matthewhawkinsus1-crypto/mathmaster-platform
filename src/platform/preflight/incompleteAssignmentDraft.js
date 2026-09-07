import { buildAssignmentV5PreflightModel } from './assignmentV5PreflightModel.js';
import {
  AUTHORING_STATES,
  canSalvageV5IntakeResult,
} from './assignmentAuthoringState.js';
import { emptyTeacherReviewContext } from './teacherReviewContext.js';
import { buildRepairHistoryEntry } from './assignmentRepairHistory.js';

const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

const requireAssignmentV5 = (candidate, label = 'Assignment draft') => {
  if (!candidate || typeof candidate !== 'object' || Number(candidate.schemaVersion) !== 5) {
    throw new Error(`${label} must be an Assignment V5 object.`);
  }
  return candidate;
};

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

  return requireAssignmentV5(parsed, 'Saved incomplete assignment');
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

  const canonical = requireAssignmentV5(intakeResult.parsed.assignmentV5);
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
    // Present from the first save, so a draft document has one shape whether or
    // not the teacher has flagged anything yet. listIncompleteAssignmentDrafts()
    // reads these records back; a field that only exists once someone adds a
    // flag is a field every reader has to guard against.
    teacherReviewContext: emptyTeacherReviewContext(),
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
  const canonical = requireAssignmentV5(repairedAssignmentV5, 'Repaired assignment');
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
 * Turn an already-validated Step 5 repair commit into the next persisted draft
 * record. The assignment, review context, and revision advance together so the
 * Firestore record can never say "revision 13" while still carrying revision
 * 12's question JSON or teacher flags.
 */
export const applyIncompleteDraftRepairCommit = (
  record,
  committedRepair = {},
  { nowIso = new Date().toISOString() } = {},
) => {
  const canonical = requireAssignmentV5(committedRepair?.assignmentV5, 'Committed repaired assignment');
  const currentRevision = revisionNumber(record?.assignmentRevision, 1);
  const committedRevision = revisionNumber(committedRepair?.committedRevision, null);
  if (committedRevision == null || committedRevision <= currentRevision) {
    throw new Error(`A saved repair must advance the assignment revision beyond ${currentRevision}.`);
  }

  // Once an assignment has reached students, this is the wrong door.
  //
  // MathMaster already has a path for changing delivered work: Safe Live Repair
  // restricts edits to response-entry mechanics, preserves attempts and credit,
  // and records liveCorrectionHistory. This path does none of that — it
  // replaces whole questions. Letting a delivered assignment through here would
  // be a second, weaker live-mutation path, and the first thing it would break
  // is the scoring history of students who have already answered.
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
      return JSON.parse(String(record?.authoringDraft?.canonicalJson || 'null'));
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
    // Appended, never replaced: the point of history is that it accumulates.
    repairHistory: historyEntry
      ? [...(Array.isArray(record?.repairHistory) ? record.repairHistory : []), historyEntry]
      : (Array.isArray(record?.repairHistory) ? record.repairHistory : []),
  };
};
