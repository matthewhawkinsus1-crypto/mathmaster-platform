import { gradeOrdinaryResponse, serverGradingSupport } from './ordinaryResponseGrading.mjs';
import { answerCandidatesForField, matchesFieldAnswer, normalizeMathAnswer, parseNumericAnswer } from './answerUtils.mjs';
import { getQuestionCredit, normalizeQuestionRecord } from './attemptPolicy.mjs';
import { dolSectionProjection } from './assignmentProjections.mjs';
import { readWorkspaceDraftEntries } from './workspaceDraftSchema.mjs';

export const GRADER_VERSION = 'ordinary-response-v3';
export const GRADING_EVIDENCE_VERSION = 3;
export const RESPONSE_INSPECTION_EVIDENCE_COLLECTION = 'responseInspectionEvidence';

export const responseInspectionEvidenceDocumentId = ({ assignmentId, questionIndex } = {}) => {
  const assignment = encodeURIComponent(String(assignmentId ?? '').trim());
  const index = Number(questionIndex);
  if (!assignment || !Number.isInteger(index) || index < 0) {
    throw new Error('Response inspection evidence requires assignment and question identity.');
  }
  return `${assignment}__q${index}`.slice(0, 1400);
};

export const NORMALIZED_UNAVAILABLE = 'Unavailable — grader does not expose normalized representation';
export const EXPECTED_UNAVAILABLE = 'Unavailable — authoritative delivered question instance was not retained.';
export const OVERRIDE_REASONS = Object.freeze([
  'Correct response was incorrectly graded',
  'Equivalent answer accepted by teacher',
  'Partial credit awarded',
  'Platform/grader issue',
  'Other',
]);

const list = (value) => (Array.isArray(value) ? value : []);
const clamp = (value) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
const json = (value) => JSON.stringify(value ?? null);
const millis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const scoreGradingResult = (result = {}) => {
  if (result.isCorrect === true) return 100;
  const parts = list(result.parts).filter((part) => part?.graded !== false);
  const possible = parts.reduce((sum, part) => sum + (Number(part?.weight ?? part?.scoreWeight) > 0 ? Number(part.weight ?? part.scoreWeight) : 1), 0);
  const earned = parts.reduce((sum, part) => {
    const weight = Number(part?.weight ?? part?.scoreWeight) > 0 ? Number(part.weight ?? part.scoreWeight) : 1;
    const credit = Number.isFinite(Number(part?.credit))
      ? Math.max(0, Math.min(1, Number(part.credit)))
      : (part?.isCorrect ? 1 : 0);
    return sum + (part?.isComplete === false ? 0 : credit * weight);
  }, 0);
  return possible ? Math.round((earned / possible) * 100) : 0;
};

const traceField = (field, rawValue, result) => {
  const accepted = answerCandidatesForField(field);
  const raw = String(rawValue ?? '');
  const numericStudent = parseNumericAnswer(raw);
  const numericAccepted = accepted.map(parseNumericAnswer);
  const numericComparison = numericStudent !== null && numericAccepted.some((value) => value !== null);
  const normalized = field?.gradingMode === 'equivalentExpression'
    ? null
    : numericComparison
      ? { kind: 'number', student: numericStudent, accepted: numericAccepted.filter((value) => value !== null) }
      : { kind: 'canonical-text', student: normalizeMathAnswer(raw), accepted: accepted.map(normalizeMathAnswer) };
  return {
    id: String(field?.id || result?.id || ''),
    raw,
    normalized,
    normalizedAvailable: normalized !== null,
    normalizedUnavailableReason: normalized === null ? NORMALIZED_UNAVAILABLE : null,
    expected: accepted,
    comparator: field?.gradingMode === 'equivalentExpression'
      ? 'equivalent-expression'
      : numericComparison
        ? 'numeric-or-math-equivalence'
        : 'canonical-math-or-text-equivalence',
    isCorrect: result?.isCorrect ?? (raw.trim() !== '' && matchesFieldAnswer(raw, field)),
    credit: result?.credit ?? (result?.isCorrect ? 1 : 0),
  };
};

export const buildGradingTrace = ({ question, response, grading } = {}) => {
  if (question?.type !== 'multiAnswer' || response?.kind !== 'fields') {
    return { available: false, reason: NORMALIZED_UNAVAILABLE, fields: [] };
  }
  const values = Object.fromEntries(list(response.fields).map((field) => [String(field?.id), field?.value]));
  const resultById = new Map(list(grading?.parts).map((part) => [String(part?.id), part]));
  return {
    available: true,
    reason: null,
    fields: list(question.answerFields)
      .filter((field) => field?.id)
      .map((field) => traceField(field, values[String(field.id)], resultById.get(String(field.id)))),
  };
};

export const captureAutomaticGradingEvidence = ({
  response,
  grading,
  question,
  submittedAt,
  source = 'manual-submit',
  deliveredInstanceAuthority = null,
  gradingAuthority = 'server',
  graderVersion = GRADER_VERSION,
} = {}) => ({
  schemaVersion: GRADING_EVIDENCE_VERSION,
  submittedResponse: structuredClone(response ?? null),
  submissionProvenance: 'exact-server-ingested-snapshot',
  gradingTrace: (() => {
    const trace = buildGradingTrace({ question, response, grading });
    return {
      ...trace,
      fields: trace.fields.map(({ expected: _expected, normalized, ...field }) => ({
        ...field,
        normalized: normalized && typeof normalized === 'object'
          ? Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== 'accepted'))
          : normalized,
      })),
    };
  })(),
  automaticResult: structuredClone(grading ?? null),
  automaticScore: scoreGradingResult(grading),
  submittedAt: submittedAt || new Date().toISOString(),
  source,
  gradingAuthority,
  graderVersion,
  contentVersion: question?.contentVersion ?? question?.version ?? null,
  answerKeyVersion: question?.answerKeyVersion ?? question?.version ?? null,
  deliveredInstanceAuthority: deliveredInstanceAuthority?.authoritative === true
    ? structuredClone(deliveredInstanceAuthority)
    : null,
});

export const legacyRecordedResponse = (record) => {
  const parts = list(record?.partGrades)
    .filter((part) => part?.id && Object.prototype.hasOwnProperty.call(part, 'response'));
  if (!parts.length) return null;
  return {
    kind: 'fields',
    type: 'legacy',
    value: '',
    fields: parts.map((part) => ({
      id: String(part.id),
      value: part.response,
      isComplete: part.isComplete === true,
    })),
    provenance: 'legacy-grader-recorded-parts',
    label: 'Recorded grader response (legacy)',
  };
};

export const resolveGradedWorkspace = ({
  document,
  questionIndex,
  variantIndex = 0,
  submittedAt = null,
} = {}) => {
  const entries = readWorkspaceDraftEntries(document).filter((entry) => (
    entry.questionIndex === Number(questionIndex)
    && Number(entry.variantIndex ?? 0) === Number(variantIndex)
    && !String(entry.key).split(':').includes('practice')
    && String(entry.key).split(':').includes('student')
  ));
  if (!entries.length) {
    return {
      available: false,
      reason: 'No server-backed graded workspace is available. Work held only on a disconnected device cannot be inspected yet.',
      entries: [],
    };
  }
  const savedAt = Math.max(...entries.map((entry) => Number(entry.savedAt) || 0));
  const documentUpdatedAt = millis(document?.updatedAt);
  const submittedMs = millis(submittedAt);
  return {
    available: true,
    provenance: 'server-workspace-draft',
    sessionBucket: 'student',
    variantIndex: Number(variantIndex) || 0,
    savedAt,
    documentUpdatedAt,
    relationToSubmission: submittedMs === null
      ? 'unknown'
      : savedAt > submittedMs
        ? 'newer'
        : savedAt < submittedMs
          ? 'older'
          : 'same-time',
    entries: entries.map((entry) => ({
      key: entry.key,
      scope: String(entry.key).split(':').slice(9).join(':') || 'question',
      value: entry.value,
      savedAt: entry.savedAt,
    })),
  };
};

export const automaticQuestionScore = (record) => Math.round(
  getQuestionCredit({ ...normalizeQuestionRecord(record), gradeOverride: null }) * 100,
);

export const overrideAppliesToRecord = (record, override = null) => {
  if (override?.active !== true || !Number.isFinite(Number(override.score))) return false;
  const recordAttempts = Number(record?.totalAttempts ?? record?.attemptCount ?? 0);
  const overrideAttempts = Number(override?.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;
  const recordVariant = Number(record?.variantIndex ?? 0);
  const overrideVariant = Number(override?.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;

  const overrideSubmissionId = String(override?.submissionId || '');
  if (overrideSubmissionId) {
    return overrideSubmissionId === String(record?.lastSubmissionId || '');
  }
  const overrideLastAttemptAt = String(override?.lastAttemptAt || '');
  return Boolean(overrideLastAttemptAt)
    && overrideLastAttemptAt === String(record?.lastAttemptAt || record?.academicOccurredAt || '');
};

export const effectiveQuestionScore = (record, override = null) => (
  overrideAppliesToRecord(record, override)
    ? clamp(override.score)
    : automaticQuestionScore(record)
);

export const effectiveGradeStatus = (record, override = null) => {
  const score = effectiveQuestionScore(record, override);
  const overridden = overrideAppliesToRecord(record, override);
  return {
    score,
    overridden,
    automaticStatus: record?.status || 'unattempted',
    status: overridden
      ? (score >= 100 ? 'correct' : score > 0 ? 'partial' : 'incorrect')
      : (record?.status || 'unattempted'),
    label: overridden
      ? (score >= 100 ? 'Teacher assigned · Correct' : `Teacher assigned · ${score}%`)
      : null,
  };
};

const questionNeedsDeliveredAuthority = (question = {}) => Boolean(
  ['algebra', 'fraction', 'numberLine'].includes(String(question?.type || ''))
  || question?.generator
  || question?.variantGenerator
  || (Array.isArray(question?.variants) && question.variants.length)
  || question?.personalized
  || question?.autoDifferentiation
  || question?.adaptation
  || question?.differentiation?.mode === 'auto'
  || question?.differentiation?.bandProfiles,
);

export const authoritativeQuestionForInspection = ({ question, evidence } = {}) => {
  if (evidence?.deliveredInstanceAuthority?.authoritative === true
      && evidence.deliveredInstanceAuthority.question) {
    return {
      authoritative: true,
      question: evidence.deliveredInstanceAuthority.question,
      source: 'stored-delivered-instance',
    };
  }
  if (questionNeedsDeliveredAuthority(question)) {
    return {
      authoritative: false,
      question: null,
      source: 'template-not-authoritative',
      reason: EXPECTED_UNAVAILABLE,
    };
  }
  return { authoritative: true, question, source: 'identity-delivered-assignment-question' };
};

export const replayResponse = ({ question, attemptRecord, gradingEvidence } = {}) => {
  const evidence = gradingEvidence || null;
  if (!evidence?.submittedResponse) {
    return {
      available: false,
      adapter: 'none',
      reason: 'The historical submitted response snapshot is unavailable, so exact replay is unavailable.',
    };
  }
  const authority = authoritativeQuestionForInspection({ question, evidence });
  if (!authority.authoritative) {
    return {
      available: false,
      adapter: 'unsupported-safe-inspection',
      reason: authority.reason,
    };
  }
  const deliveredQuestion = authority.question;
  const support = serverGradingSupport(deliveredQuestion);
  if (!support.supported) {
    return {
      available: false,
      adapter: 'unsupported-safe-inspection',
      reason: `Replay unavailable for this question type or delivery mode (${support.reason}). Stored response and grading evidence remain inspectable.`,
    };
  }
  const currentResult = gradeOrdinaryResponse({
    question: deliveredQuestion,
    response: evidence.submittedResponse,
  });
  if (!currentResult.graded) {
    return {
      available: false,
      adapter: 'ordinary-response',
      reason: `The ordinary grader could not replay this response (${currentResult.reason || 'unknown reason'}).`,
    };
  }
  const originalResult = evidence.automaticResult || null;
  const originalScore = Number.isFinite(Number(evidence.automaticScore))
    ? Number(evidence.automaticScore)
    : null;
  const currentScore = scoreGradingResult(currentResult);
  const byId = new Map(list(originalResult?.parts).map((part) => [String(part.id), part]));
  const fieldDifferences = list(currentResult.parts)
    .filter((part) => json(byId.get(String(part.id))) !== json(part))
    .map((part) => ({
      id: part.id,
      original: byId.get(String(part.id)) || null,
      current: part,
    }));
  return {
    available: true,
    adapter: 'ordinary-response',
    originalResult,
    originalScore,
    currentResult,
    currentScore,
    fieldDifferences,
    discrepancy: originalScore !== currentScore || fieldDifferences.length > 0,
    gradingTrace: buildGradingTrace({
      question: deliveredQuestion,
      response: evidence.submittedResponse,
      grading: currentResult,
    }),
  };
};

export const replayStoredResponse = ({ question, record, gradingEvidence = null } = {}) => replayResponse({
  question,
  attemptRecord: record,
  gradingEvidence,
});

const submittedFieldMap = (submitted) => {
  if (submitted?.kind !== 'fields') return null;
  return Object.fromEntries(
    list(submitted.fields)
      .filter((field) => field?.id)
      .map((field) => [String(field.id), field.value]),
  );
};

const comparableWorkspaceResponse = (workspace, submitted) => {
  if (!workspace?.available) return { comparable: false, equal: null };
  const submittedFields = submittedFieldMap(submitted);
  if (submittedFields) {
    const ids = Object.keys(submittedFields);
    for (const entry of workspace.entries || []) {
      const candidates = [
        entry?.value,
        entry?.value?.answers,
        entry?.value?.responses,
        entry?.value?.fields,
      ];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        if (!ids.some((id) => Object.prototype.hasOwnProperty.call(candidate, id))) continue;
        const comparable = Object.fromEntries(ids.map((id) => [id, candidate[id] ?? '']));
        return {
          comparable: true,
          equal: json(comparable) === json(submittedFields),
          workspaceValue: comparable,
          submittedValue: submittedFields,
        };
      }
    }
    return { comparable: false, equal: null };
  }

  if ((workspace.entries || []).length === 1 && submitted?.value !== undefined) {
    const workspaceValue = workspace.entries[0]?.value;
    if (
      workspaceValue === null
      || ['string', 'number', 'boolean'].includes(typeof workspaceValue)
    ) {
      return {
        comparable: true,
        equal: json(workspaceValue) === json(submitted.value),
        workspaceValue,
        submittedValue: submitted.value,
      };
    }
  }
  return { comparable: false, equal: null };
};

export const diagnoseResponse = ({
  record,
  workspace = null,
  replay = null,
  gradingEvidence = null,
} = {}) => {
  const evidence = gradingEvidence;
  const submitted = evidence?.submittedResponse;
  if (!submitted) {
    return legacyRecordedResponse(record)
      ? {
        code: 'legacy-evidence',
        explanation: 'An exact submitted snapshot was not retained. The field values below are the responses recorded by the historical grader.',
      }
      : {
        code: 'insufficient-history',
        explanation: 'Insufficient historical data to determine the cause. The submitted response snapshot is unavailable.',
      };
  }
  if (replay?.discrepancy) {
    return {
      code: 'grader-version-discrepancy',
      explanation: 'The current grader result differs from the original grader result.',
      values: { original: replay.originalResult, current: replay.currentResult },
    };
  }
  if (submitted.kind === 'fields'
      && list(submitted.fields).some((field) => String(field?.value ?? '').trim() === '')) {
    return {
      code: 'missing-submitted-field',
      explanation: 'At least one submitted field was blank or missing, even if a saved workspace contains a value.',
      values: { submitted },
    };
  }
  if (record?.persistencePending === true) {
    return {
      code: 'not-persisted-before-close',
      explanation: 'The response was not persisted before the assignment closed.',
    };
  }
  const workspaceComparison = comparableWorkspaceResponse(workspace, submitted);
  if (workspaceComparison.comparable && !workspaceComparison.equal) {
    const timing = workspace?.relationToSubmission || 'unknown';
    const explanation = timing === 'older'
      ? 'The saved workspace differs from the submitted response, but the workspace is older than the submission. The submitted snapshot is the response that was graded.'
      : timing === 'newer'
        ? 'The saved workspace differs from the submitted response and was saved after submission. This may represent later editing; the submitted snapshot remains the response that was graded.'
        : 'The saved workspace differs from the submitted response. The submitted snapshot is the response that was graded.';
    return {
      code: 'workspace-submission-divergence',
      explanation,
      values: workspaceComparison,
    };
  }
  const result = replay?.currentResult || evidence.automaticResult;
  if (list(result?.parts).length > 1 && list(result.parts).some((part) => !part.isCorrect)) {
    return {
      code: 'multipart-partial',
      explanation: 'One or more parts of this multi-part response were missing or incorrect.',
      values: { parts: result.parts },
    };
  }
  return result?.isCorrect === false
    ? {
      code: 'genuinely-incorrect',
      explanation: 'The stored submitted response does not match the accepted answer under the grader used here.',
    }
    : {
      code: 'correct',
      explanation: 'The stored submitted response matches the accepted answer.',
    };
};

export const expectedAnswers = ({ question, evidence } = {}) => {
  const authority = authoritativeQuestionForInspection({ question, evidence });
  if (!authority.authoritative) {
    return { available: false, reason: authority.reason, value: null };
  }
  const authoritativeQuestion = authority.question || {};
  const value = list(authoritativeQuestion.answerFields).length
    ? Object.fromEntries(authoritativeQuestion.answerFields.map((field) => [
      field.id,
      answerCandidatesForField(field),
    ]))
    : (authoritativeQuestion.acceptedAnswers
      || authoritativeQuestion.answer
      || authoritativeQuestion.solution
      || authoritativeQuestion.target
      || null);
  return { available: true, reason: null, value };
};

export const buildInspectorModel = ({
  assignment,
  question,
  section,
  student,
  record,
  workspace = null,
  override = null,
  gradingEvidence = null,
  auditHistory = [],
} = {}) => {
  const evidence = gradingEvidence || null;
  const authority = authoritativeQuestionForInspection({ question, evidence });
  const replay = replayStoredResponse({ question, record, gradingEvidence: evidence });
  const legacy = evidence?.submittedResponse ? null : legacyRecordedResponse(record);
  const teacherTrace = evidence?.submittedResponse && authority.authoritative
    ? buildGradingTrace({
      question: authority.question,
      response: evidence.submittedResponse,
      grading: evidence.automaticResult,
    })
    : null;
  const expected = expectedAnswers({ question, evidence });
  return {
    assignment: {
      id: assignment?.id || assignment?.assignmentId || null,
      title: assignment?.title || 'Unavailable',
    },
    section: {
      title: section?.title || 'Unavailable',
      role: section?.role || question?.activityRole || 'Unavailable',
    },
    question: {
      id: question?.questionId || 'Unavailable',
      prompt: question?.prompt || 'Unavailable',
      type: question?.type || question?.toolId || 'Unavailable',
    },
    student: {
      id: student?.id || null,
      name: student?.displayName || student?.name || 'Unavailable',
    },
    attemptNumber: Number(record?.totalAttempts || record?.attemptCount) || null,
    automaticScore: evidence?.automaticScore ?? automaticQuestionScore(record),
    assignedScore: effectiveQuestionScore(record, override),
    effectiveStatus: effectiveGradeStatus(record, override),
    override: overrideAppliesToRecord(record, override) ? override : null,
    states: {
      rawInput: null,
      workspace,
      submitted: evidence?.submittedResponse ?? null,
      submittedProvenance: evidence?.submissionProvenance ?? null,
      legacyRecorded: legacy,
      gradingTrace: teacherTrace || replay?.gradingTrace || evidence?.gradingTrace || null,
    },
    expected: expected.value,
    expectedAvailable: expected.available,
    expectedUnavailableReason: expected.reason,
    automaticResult: evidence?.automaticResult || {
      parts: record?.partGrades || [],
      isCorrect: record?.status === 'correct',
    },
    timestamps: {
      inputUpdatedAt: null,
      workspaceSavedAt: workspace?.savedAt || null,
      workspaceDocumentUpdatedAt: workspace?.documentUpdatedAt || null,
      submittedAt: evidence?.submittedAt || record?.lastAttemptAt || null,
      finalizedAt: record?.finalizedAt || null,
    },
    versions: {
      content: evidence?.contentVersion ?? null,
      answerKey: evidence?.answerKeyVersion ?? null,
      grader: evidence?.graderVersion ?? null,
    },
    replay,
    diagnosis: diagnoseResponse({ record, workspace, replay, gradingEvidence: evidence }),
    auditHistory: list(auditHistory),
  };
};

export const scoreWithFieldOverride = (record, overrides) => {
  const parts = list(record?.partGrades).filter((part) => part?.graded !== false);
  if (!parts.length) throw new Error('Part-level credit is unavailable for this historical attempt.');
  let earned = 0;
  let possible = 0;
  parts.forEach((part) => {
    const weight = Number(part?.weight ?? part?.scoreWeight) > 0
      ? Number(part.weight ?? part.scoreWeight)
      : 1;
    const automaticCredit = Number.isFinite(Number(part?.credit))
      ? clamp(Number(part.credit) * 100)
      : (part?.isCorrect ? 100 : 0);
    const key = String(part.id);
    const credit = Object.prototype.hasOwnProperty.call(overrides || {}, key)
      ? clamp(overrides[key])
      : automaticCredit;
    earned += credit * weight;
    possible += 100 * weight;
  });
  return possible ? Math.round((earned / possible) * 100) : 0;
};

export const buildGradeOverride = ({
  record,
  previousOverride = null,
  score,
  fieldId = null,
  reason,
  note = '',
  actor,
  at = new Date().toISOString(),
  source = 'teacher-override',
} = {}) => {
  if (!OVERRIDE_REASONS.includes(reason)) throw new Error('A valid override reason is required.');
  if (!actor?.uid) throw new Error('An authenticated teacher identity is required.');
  const requested = Number(score);
  if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
    throw new Error('Score must be between 0 and 100.');
  }
  const previousApplies = overrideAppliesToRecord(record, previousOverride);
  const previousScore = effectiveQuestionScore(record, previousOverride);
  const fieldOverrides = { ...(previousApplies ? previousOverride?.fieldOverrides : {}) };
  if (fieldId) {
    const parts = list(record?.partGrades).filter((part) => part?.graded !== false);
    if (!parts.some((part) => String(part?.id) === String(fieldId))) {
      throw new Error('That response part is not available for a part-level override.');
    }
    fieldOverrides[String(fieldId)] = requested;
  }
  const nextScore = fieldId
    ? scoreWithFieldOverride(record, fieldOverrides)
    : requested;
  const audit = {
    type: source,
    actor: {
      uid: actor.uid,
      email: actor.email || null,
      name: actor.name || null,
    },
    at,
    previousScore,
    newScore: nextScore,
    reason,
    note: String(note || '').slice(0, 1000),
    fieldId: fieldId ? String(fieldId) : null,
  };
  return {
    // This projection lives on the student-readable grades document because
    // the normal Grade Center must be able to show the assigned score. Keep it
    // deliberately free of teacher identity and private notes; those belong
    // only in the server-only gradeOverrideAudits subcollection.
    override: {
      active: true,
      score: nextScore,
      fieldOverrides,
      updatedAt: at,
      source,
      automaticScore: automaticQuestionScore(record),
      submissionId: record?.lastSubmissionId ? String(record.lastSubmissionId) : null,
      lastAttemptAt: record?.lastAttemptAt || record?.academicOccurredAt || null,
      variantIndex: Number(record?.variantIndex ?? 0),
      totalAttempts: Number(record?.totalAttempts ?? record?.attemptCount ?? 0),
    },
    audit,
  };
};

export const restoreAutomaticScore = ({
  record,
  previousOverride = null,
  actor,
  reason,
  note = '',
  at = new Date().toISOString(),
} = {}) => {
  if (!OVERRIDE_REASONS.includes(reason)) throw new Error('A valid override reason is required.');
  if (!actor?.uid) throw new Error('An authenticated teacher identity is required.');
  if (!overrideAppliesToRecord(record, previousOverride)) {
    throw new Error('There is no active teacher override for this submitted attempt to restore.');
  }
  const automaticScore = automaticQuestionScore(record);
  return {
    override: null,
    audit: {
      type: 'restore-automatic',
      actor: {
        uid: actor.uid,
        email: actor.email || null,
        name: actor.name || null,
      },
      at,
      previousScore: effectiveQuestionScore(record, previousOverride),
      newScore: automaticScore,
      reason,
      note: String(note || '').slice(0, 1000),
      fieldId: null,
    },
  };
};

export const correctedDolProjection = ({
  existingByDate = {},
  dateKey,
  score,
  questionIndices,
  correctedAt = new Date().toISOString(),
} = {}) => {
  const previous = existingByDate?.[dateKey] || null;
  const projection = dolSectionProjection({
    existing: existingByDate,
    dateKey,
    score,
    questionIndices,
    recordedAt: correctedAt,
    finalize: previous?.finalized === true,
    correctionReason: 'teacher-grade-override',
  });
  if (!projection) throw new Error('The DOL correction could not produce a safe projection.');
  return projection;
};
