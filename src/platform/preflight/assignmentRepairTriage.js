import {
  findFirestoreUnsafeNestedArrays,
  repairKnownFirestoreNestedArrays,
} from '../persistence/firestoreAssignmentSafety.js';

/*
 * NOT EVERY BLOCKER IS THE SAME KIND OF PROBLEM.
 *
 * Preflight reports one undifferentiated list, and a teacher looking at it can
 * only do one thing with every entry: ask an AI to rewrite the question. That
 * is the wrong answer to two of the three cases.
 *
 *   technicalBlocker — the question cannot be stored or delivered. Nothing a
 *     teacher believes about it changes that, so it can never be overridden.
 *     Some are deterministically fixable without touching any mathematics.
 *
 *   qualityBlocker — a judgement about rigor, alignment or support. Judgements
 *     can be wrong, and the teacher is the subject expert, so this is the ONLY
 *     class a teacher may override.
 *
 *   warning — worth reading, never blocking. There is nothing to override,
 *     because it is not stopping anything.
 *
 * A PLATFORM DEFECT IS NEVER A CONTENT FALSE POSITIVE. When the authored
 * question is right and MathMaster renders or grades it wrongly, the fix is in
 * MathMaster. Letting a teacher wave it through would publish a question that
 * genuinely does not work for students, and letting an AI "repair" it would
 * quietly lower the rigor of a correct question to dodge a bug. So a
 * platformIssue is a technical blocker, it is never override-eligible, and it
 * produces a reproduction fixture instead of an edit.
 *
 * A SAFE REPAIR IS DETERMINISTIC AND MATHEMATICALLY NEUTRAL. Turning [1, 2]
 * into {x: 1, y: 2} under a key the platform already knows is a coordinate list
 * changes storage, not mathematics. Every other nested array stays blocked:
 * [[1, 0], [0, 1]] under `matrix` has the same shape as a coordinate pair and a
 * completely different meaning, and guessing at it would corrupt the question
 * while reporting success.
 */

export const TRIAGE_CLASS = Object.freeze({
  TECHNICAL_BLOCKER: 'technicalBlocker',
  QUALITY_BLOCKER: 'qualityBlocker',
  WARNING: 'warning',
});

// Storage, structure and delivery: whether the question can exist and run at
// all. No amount of subject expertise makes a Firestore-illegal value legal.
const TECHNICAL_SOURCES = new Set([
  'persistence',
  'structural',
  'interaction',
  'worksheetPrint',
]);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isBlocking = (entry) => ['blocking', 'error'].includes(text(entry?.severity).toLowerCase());
const isPlatformIssue = (entry) => text(entry?.issueKind).toLowerCase() === 'platformissue';

/** Classify one diagnostic. Idempotent: re-triaging a triaged entry is a no-op. */
export const triageDiagnostic = (diagnostic = {}) => {
  const source = text(diagnostic.source).toLowerCase();
  const platform = isPlatformIssue(diagnostic);

  let triageClass = TRIAGE_CLASS.WARNING;
  if (isBlocking(diagnostic)) {
    triageClass = platform || TECHNICAL_SOURCES.has(source)
      ? TRIAGE_CLASS.TECHNICAL_BLOCKER
      : TRIAGE_CLASS.QUALITY_BLOCKER;
  }

  return {
    ...diagnostic,
    issueKind: text(diagnostic.issueKind) || 'assignmentIssue',
    triageClass,
    // The single place this decision is made. A teacher may overrule a
    // judgement about their own subject; they may not overrule storage,
    // delivery, or a defect in MathMaster itself.
    teacherOverrideEligible: triageClass === TRIAGE_CLASS.QUALITY_BLOCKER,
  };
};

export const teacherMayOverrideDiagnostic = (diagnostic) => (
  triageDiagnostic(diagnostic).teacherOverrideEligible
);

/** The triaged diagnostics plus the counts a Repair Center header needs. */
export const buildAssignmentRepairTriage = (diagnostics = []) => {
  const triaged = list(diagnostics).map(triageDiagnostic);
  const countBy = (triageClass) => triaged.filter((entry) => entry.triageClass === triageClass).length;

  return {
    diagnostics: triaged,
    summary: {
      technicalBlockers: countBy(TRIAGE_CLASS.TECHNICAL_BLOCKER),
      qualityBlockers: countBy(TRIAGE_CLASS.QUALITY_BLOCKER),
      warnings: countBy(TRIAGE_CLASS.WARNING),
      // Counted separately AND inside technicalBlockers on purpose: a platform
      // defect blocks like a technical issue but is repaired somewhere else
      // entirely, so a teacher needs to see how many of their blockers are not
      // theirs to fix.
      platformIssues: triaged.filter(isPlatformIssue).length,
      overrideEligible: triaged.filter((entry) => entry.teacherOverrideEligible).length,
    },
  };
};

const overrideKey = (diagnostic) => `${text(diagnostic?.code)}::${text(diagnostic?.questionId)}`;

/**
 * Record a teacher's decision that a quality blocker is a false positive.
 *
 * The reason is required and stored. An override silently removes a blocker
 * from a live assignment, so the record of who decided and why has to outlive
 * the click — and the revision is kept so a later reader can tell whether the
 * override was made against the question as it stands now.
 */
export const recordTeacherDiagnosticOverride = (context, diagnostic, {
  reason = '',
  assignmentRevision = null,
  nowIso = null,
} = {}) => {
  const triaged = triageDiagnostic(diagnostic);
  if (!triaged.teacherOverrideEligible) {
    const because = triaged.triageClass === TRIAGE_CLASS.WARNING
      ? 'a warning is not blocking anything'
      : isPlatformIssue(triaged)
        ? 'it reports a platform defect, which is not a content false positive'
        : 'it is a technical blocker, so the question cannot be stored or delivered as authored';
    throw new Error(`"${triaged.code}" is not eligible for teacher override: ${because}.`);
  }

  const note = text(reason);
  if (!note) {
    throw new Error('An override needs a reason: it removes a blocker from a live assignment.');
  }

  const timestamp = text(nowIso) || new Date().toISOString();
  const current = context && typeof context === 'object' ? context : {};
  return {
    ...current,
    flags: list(current.flags),
    diagnosticOverrides: [...list(current.diagnosticOverrides), {
      diagnosticCode: triaged.code,
      questionId: triaged.questionId ?? null,
      sectionId: triaged.sectionId ?? null,
      triageClass: triaged.triageClass,
      reason: note,
      assignmentRevision: Number.isFinite(Number(assignmentRevision)) ? Number(assignmentRevision) : null,
      overriddenAt: timestamp,
    }],
  };
};

export const isDiagnosticOverridden = (context, diagnostic) => (
  list(context?.diagnosticOverrides).some((entry) => (
    `${text(entry?.diagnosticCode)}::${text(entry?.questionId)}` === overrideKey(diagnostic)
  ))
);

/**
 * Apply every repair that cannot change what a question asks.
 *
 * Deliberately delegates to the platform's existing coordinate-list whitelist
 * rather than introducing a second idea of what is safe. Anything it does not
 * recognise is reported as still unsafe, not guessed at.
 */
export const repairAllSafeTechnicalIssues = (assignmentV5) => {
  const repaired = repairKnownFirestoreNestedArrays(assignmentV5);
  const remainingUnsafePaths = findFirestoreUnsafeNestedArrays(repaired.value);

  return {
    assignmentV5: repaired.value,
    changed: repaired.repairCount > 0,
    repairs: list(repaired.repairedPaths).map((path) => ({
      repairCode: 'persistence.coordinatePairToPointObject',
      path,
      description: 'Stored a coordinate pair as a point object so Firestore can save it. The mathematics is unchanged.',
    })),
    // Named so the teacher can see what is left rather than assuming "Repair
    // All" finished the job.
    remainingUnsafePaths,
  };
};

/**
 * A minimal, self-contained reproduction of a MathMaster defect.
 *
 * Only the affected question travels. The rest of the assignment is not
 * evidence about a renderer bug, and shipping it turns a bug report into a
 * disclosure of every other question in the lesson.
 */
export const buildPlatformBugReproductionFixture = ({
  assignmentV5 = null,
  questionId = null,
  diagnostic = null,
  platformIssue = null,
} = {}) => {
  const wanted = text(questionId);
  let section = null;
  let question = null;

  for (const candidate of list(assignmentV5?.sections)) {
    const match = list(candidate?.questions).find((entry) => text(entry?.questionId) === wanted);
    if (match) {
      section = candidate;
      question = match;
      break;
    }
  }
  if (!question) {
    throw new Error(`Question "${questionId}" is not in this assignment, so no reproduction can be built for it.`);
  }

  const triaged = diagnostic ? triageDiagnostic(diagnostic) : null;

  return {
    fixtureVersion: 1,
    assignmentContext: {
      assignmentId: assignmentV5?.assignment?.assignmentId ?? null,
      title: assignmentV5?.assignment?.title ?? null,
      courseId: assignmentV5?.assignment?.courseId ?? null,
      schemaVersion: Number(assignmentV5?.schemaVersion) || null,
    },
    // Section identity only. Its `questions` array holds the rest of the
    // lesson, and none of it is relevant to reproducing this defect.
    section: {
      id: section?.id ?? null,
      role: section?.role ?? null,
      title: section?.title ?? null,
    },
    question,
    issue: {
      diagnosticCode: triaged?.code ?? null,
      issueKind: triaged?.issueKind ?? 'platformIssue',
      triageClass: triaged?.triageClass ?? TRIAGE_CLASS.TECHNICAL_BLOCKER,
      componentId: triaged?.componentId ?? platformIssue?.suspectedComponent ?? null,
      message: triaged?.message ?? null,
      fieldPath: triaged?.fieldPath ?? null,
      reportedReason: platformIssue?.reason ?? null,
    },
  };
};

export default {
  TRIAGE_CLASS,
  buildAssignmentRepairTriage,
  buildPlatformBugReproductionFixture,
  isDiagnosticOverridden,
  recordTeacherDiagnosticOverride,
  repairAllSafeTechnicalIssues,
  teacherMayOverrideDiagnostic,
  triageDiagnostic,
};
