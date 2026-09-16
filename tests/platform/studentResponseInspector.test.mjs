import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  EXPECTED_UNAVAILABLE,
  NORMALIZED_UNAVAILABLE,
  OVERRIDE_REASONS,
  authoritativeQuestionForInspection,
  buildGradeOverride,
  buildGradingTrace,
  buildInspectorModel,
  captureAutomaticGradingEvidence,
  correctedDolProjection,
  diagnoseResponse,
  effectiveQuestionScore,
  expectedAnswers,
  legacyRecordedResponse,
  overrideAppliesToRecord,
  replayResponse,
  responseInspectionEvidenceDocumentId,
  resolveGradedWorkspace,
  restoreAutomaticScore,
  scoreWithFieldOverride,
} from '../../functions/shared/responseInspector.mjs';
import { gradeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import questionWeights from '../../functions/lib/questionWeights.js';
import {
  browserCallableServiceIds,
  firebaseFunctionTargets,
} from '../../scripts/response-inspector-deploy-surface.mjs';

const { weightedQuestionTotals } = questionWeights;

const question = {
  questionId: 'fixture-not-production-id',
  type: 'multiAnswer',
  prompt: 'For r = −0.70, calculate r² and the corresponding percentage.',
  activityRole: 'dol',
  answerFields: [
    { id: 'r2', label: 'r²', answer: 0.49, inputProfile: 'number' },
    { id: 'percent', label: 'Percentage', answer: 49, inputProfile: 'number' },
  ],
};

const response = {
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: [
    { id: 'r2', value: '0.49', isComplete: true },
    { id: 'percent', value: '49', isComplete: true },
  ],
};

const grading = gradeOrdinaryResponse({ question, response });
const evidence = captureAutomaticGradingEvidence({
  response,
  grading,
  question,
  submittedAt: '2026-09-15T12:00:00Z',
});
const baseRecord = {
  status: 'correct',
  attemptCount: 1,
  totalAttempts: 1,
  variantIndex: 0,
  partialCredit: 100,
  bestPartialCredit: 100,
  partGrades: grading.parts,
  lastSubmissionId: 'submission-1',
  lastAttemptAt: '2026-09-15T12:00:00Z',
};
const actor = { uid: 'teacher-1', email: 'teacher@example.edu', name: 'Teacher' };
const reason = OVERRIDE_REASONS[0];

const draftKey = (bucket, questionIndex, variant = 0, suffix = 'work:tool') =>
  `mathmaster:draft:v2::student-1:assignment-1:${questionIndex}:${variant}:${bucket}:${suffix}`;

test('exact 0.49 and 49 DOL response grades both fields correct at 100%', () => {
  assert.equal(grading.graded, true);
  assert.equal(grading.isCorrect, true);
  assert.deepEqual(
    grading.parts.map(({ id, isCorrect }) => ({ id, isCorrect })),
    [
      { id: 'r2', isCorrect: true },
      { id: 'percent', isCorrect: true },
    ],
  );
  assert.equal(evidence.automaticScore, 100);
});

test('finalized DOL correction remains finalized and preserves original finalization receipt', () => {
  const existingByDate = {
    '2026-09-15': {
      finalized: true,
      status: 'section-finalized',
      score: 50,
      recordedAt: '2026-09-15T20:00:00Z',
      finalizedAt: '2026-09-15T20:00:00Z',
      receiptId: 'final-receipt',
    },
  };
  const corrected = correctedDolProjection({
    existingByDate,
    dateKey: '2026-09-15',
    score: 100,
    questionIndices: [0, 1, 2],
    correctedAt: '2026-09-16T10:00:00Z',
  });
  assert.ok(corrected);
  assert.equal(corrected.finalized, true);
  assert.equal(corrected.status, 'section-finalized');
  assert.equal(corrected.score, 100);
  assert.equal(corrected.recordedAt, '2026-09-15T20:00:00Z');
  assert.equal(corrected.finalizedAt, '2026-09-15T20:00:00Z');
  assert.equal(corrected.receiptId, 'final-receipt');
  assert.equal(corrected.recalculatedAt, '2026-09-16T10:00:00Z');
  assert.equal(corrected.recalculationReason, 'teacher-grade-override');
});

test('live DOL correction stays live rather than being accidentally finalized', () => {
  const corrected = correctedDolProjection({
    existingByDate: { day: { finalized: false, score: 50, status: 'section-in-progress' } },
    dateKey: 'day',
    score: 100,
    questionIndices: [0],
    correctedAt: '2026-09-16T10:00:00Z',
  });
  assert.equal(corrected.finalized, false);
  assert.equal(corrected.status, 'section-in-progress');
  assert.equal(corrected.score, 100);
});

test('workspace timing uses the matching question entry, not a later update elsewhere in the document', () => {
  const workspace = resolveGradedWorkspace({
    document: {
      updatedAt: 9000,
      entries: [
        {
          key: draftKey('student', 0),
          valueJson: JSON.stringify({ r2: '0.49', percent: '49' }),
          savedAt: 1000,
          questionIndex: 0,
          variantIndex: 0,
        },
        {
          key: draftKey('student', 8),
          valueJson: JSON.stringify({ answer: 'later work' }),
          savedAt: 9000,
          questionIndex: 8,
          variantIndex: 0,
        },
      ],
    },
    questionIndex: 0,
    variantIndex: 0,
    submittedAt: 2000,
  });
  assert.equal(workspace.available, true);
  assert.equal(workspace.savedAt, 1000);
  assert.equal(workspace.documentUpdatedAt, 9000);
  assert.equal(workspace.relationToSubmission, 'older');
});

test('saved multiAnswer workspace is compared by field values instead of incompatible container shapes', () => {
  const sameWorkspace = {
    available: true,
    relationToSubmission: 'older',
    entries: [{ value: { r2: '0.49', percent: '49' }, savedAt: 1000 }],
  };
  const same = diagnoseResponse({
    record: baseRecord,
    workspace: sameWorkspace,
    replay: { available: true, discrepancy: false, currentResult: grading },
    gradingEvidence: evidence,
  });
  assert.equal(same.code, 'correct');

  const differentWorkspace = {
    ...sameWorkspace,
    entries: [{ value: { r2: '0.49', percent: '36' }, savedAt: 1000 }],
  };
  const different = diagnoseResponse({
    record: baseRecord,
    workspace: differentWorkspace,
    replay: { available: true, discrepancy: false, currentResult: grading },
    gradingEvidence: evidence,
  });
  assert.equal(different.code, 'workspace-submission-divergence');
  assert.match(different.explanation, /older than the submission/i);
});

test('Practice Mode and a different variant never masquerade as the graded workspace', () => {
  const result = resolveGradedWorkspace({
    document: {
      entries: [
        {
          key: draftKey('practice', 0, 0),
          valueJson: '{}',
          savedAt: 2000,
          questionIndex: 0,
          variantIndex: 0,
        },
        {
          key: draftKey('student', 0, 1),
          valueJson: '{}',
          savedAt: 3000,
          questionIndex: 0,
          variantIndex: 1,
        },
      ],
    },
    questionIndex: 0,
    variantIndex: 0,
    submittedAt: 2500,
  });
  assert.equal(result.available, false);
});

test('historical part responses are identified as legacy grader-recorded values, not exact submissions', () => {
  const legacy = legacyRecordedResponse({
    partGrades: [
      { id: 'r2', response: '0.49', isComplete: true, isCorrect: true },
      { id: 'percent', response: '49', isComplete: true, isCorrect: false },
    ],
  });
  assert.equal(legacy.provenance, 'legacy-grader-recorded-parts');
  assert.equal(legacy.label, 'Recorded grader response (legacy)');
  assert.deepEqual(
    legacy.fields.map(({ id, value }) => ({ id, value })),
    [
      { id: 'r2', value: '0.49' },
      { id: 'percent', value: '49' },
    ],
  );
});

test('numeric multiAnswer trace exposes the actual numeric normalization and does not persist answer keys', () => {
  const trace = buildGradingTrace({ question, response, grading });
  assert.equal(trace.available, true);
  assert.deepEqual(trace.fields[0].normalized, {
    kind: 'number',
    student: 0.49,
    accepted: [0.49],
  });
  assert.deepEqual(trace.fields[1].normalized, {
    kind: 'number',
    student: 49,
    accepted: [49],
  });

  assert.equal(evidence.gradingTrace.available, true);
  assert.deepEqual(evidence.gradingTrace.fields[0].normalized, {
    kind: 'number',
    student: 0.49,
  });
  assert.equal(Object.hasOwn(evidence.gradingTrace.fields[0], 'expected'), false);

  const opaque = captureAutomaticGradingEvidence({
    question: { type: 'regressionCalculator' },
    response: { kind: 'opaque', value: '{fit}' },
    grading: { isCorrect: false, parts: [] },
  });
  assert.equal(opaque.gradingTrace.available, false);
  assert.equal(opaque.gradingTrace.reason, NORMALIZED_UNAVAILABLE);
});

test('part-level override preserves weights and excludes ungraded parts', () => {
  const record = {
    status: 'expired',
    partGrades: [
      { id: 'heavy', isComplete: true, isCorrect: false, credit: 0, weight: 3 },
      { id: 'light', isComplete: true, isCorrect: true, credit: 1, weight: 1 },
      { id: 'note', graded: false, isComplete: true, isCorrect: false, weight: 100 },
    ],
  };
  assert.equal(scoreWithFieldOverride(record, { heavy: 50 }), 63);
  const correction = buildGradeOverride({
    record,
    score: 50,
    fieldId: 'heavy',
    reason,
    actor,
  });
  assert.equal(correction.override.score, 63);
  assert.deepEqual(correction.override.fieldOverrides, { heavy: 50 });
  assert.equal(record.gradeOverride, undefined, 'the canonical automatic record is not mutated');
});

test('weighted question totals can apply a server-owned override by question index', () => {
  const records = {
    0: { status: 'expired', bestPartialCredit: 0 },
    1: { status: 'correct', bestPartialCredit: 100 },
  };
  const overrides = { 0: { active: true, score: 100 } };
  const result = weightedQuestionTotals({
    tracker: records,
    questions: [{ questionWeight: 3 }, { questionWeight: 1 }],
    indices: [0, 1],
    creditForRecord: (record, index) => {
      const override = overrides[index];
      if (override?.active) return override.score / 100;
      return record.status === 'correct' ? 1 : (record.bestPartialCredit || 0) / 100;
    },
  });
  assert.equal(result.score, 100);
});

test('replay is read-only and detects a prior-vs-current grader discrepancy', () => {
  const historical = {
    ...structuredClone(baseRecord),
    status: 'expired',
    partialCredit: 50,
    bestPartialCredit: 50,
  };
  const historicalEvidence = {
    ...structuredClone(evidence),
    automaticScore: 50,
    automaticResult: {
      ...structuredClone(evidence.automaticResult),
      isCorrect: false,
      parts: evidence.automaticResult.parts.map((part, index) => (
        index === 1 ? { ...part, isCorrect: false, credit: 0 } : part
      )),
    },
  };
  const before = structuredClone(historical);
  const replay = replayResponse({
    question,
    attemptRecord: historical,
    gradingEvidence: historicalEvidence,
  });
  assert.equal(replay.available, true);
  assert.equal(replay.currentScore, 100);
  assert.equal(replay.discrepancy, true);
  assert.deepEqual(historical, before);
});

test('generated/personalized template answers are withheld without an authoritative delivered instance', () => {
  const generated = {
    ...question,
    generator: { parameters: { r: { type: 'choice', values: [-0.7, 0.6] } } },
  };
  const authority = authoritativeQuestionForInspection({ question: generated, evidence: {} });
  assert.equal(authority.authoritative, false);
  assert.equal(authority.reason, EXPECTED_UNAVAILABLE);
  const expected = expectedAnswers({ question: generated, evidence: {} });
  assert.equal(expected.available, false);
  assert.equal(expected.value, null);
  const replay = replayResponse({
    question: generated,
    attemptRecord: baseRecord,
    gradingEvidence: evidence,
  });
  assert.equal(replay.available, false);
  assert.match(replay.reason, /authoritative delivered question instance/i);
});

test('legacy generated families and auto-differentiated band profiles also require delivered authority', () => {
  for (const personalized of [
    { type: 'algebra', answer: 7 },
    { type: 'fraction', answer: '1/2' },
    { type: 'numberLine', answer: 'x>2' },
    { ...question, differentiation: { mode: 'auto', bandProfiles: { 2: { answerFields: [{ id: 'r2', answer: 0.36 }] } } } },
  ]) {
    const expected = expectedAnswers({ question: personalized, evidence: {} });
    assert.equal(expected.available, false);
    assert.equal(expected.reason, EXPECTED_UNAVAILABLE);
  }
});

test('authoritative delivered instance permits expected-answer inspection', () => {
  const generated = { ...question, generator: { parameters: {} } };
  const authoritativeEvidence = {
    ...evidence,
    deliveredInstanceAuthority: {
      authoritative: true,
      question,
    },
  };
  const expected = expectedAnswers({ question: generated, evidence: authoritativeEvidence });
  assert.equal(expected.available, true);
  assert.deepEqual(expected.value, { r2: [0.49], percent: [49] });
});

test('restoreAutomaticScore returns a correction instruction without changing the original record', () => {
  const previousOverride = buildGradeOverride({
    record: baseRecord,
    score: 100,
    reason,
    actor,
  }).override;
  const before = structuredClone(baseRecord);
  const restored = restoreAutomaticScore({
    record: baseRecord,
    previousOverride,
    reason: OVERRIDE_REASONS[4],
    actor,
  });
  assert.equal(restored.override, null);
  assert.equal(restored.audit.previousScore, 100);
  assert.equal(restored.audit.newScore, 100);
  assert.deepEqual(baseRecord, before);
  assert.equal(effectiveQuestionScore(baseRecord, previousOverride), 100);
});

test('inspector model keeps automatic result and server-owned assigned result separate', () => {
  const automaticWrong = {
    ...structuredClone(baseRecord),
    status: 'expired',
    partialCredit: 50,
    bestPartialCredit: 50,
  };
  const wrongEvidence = {
    ...structuredClone(evidence),
    automaticScore: 50,
    automaticResult: {
      ...structuredClone(evidence.automaticResult),
      isCorrect: false,
    },
  };
  const override = buildGradeOverride({
    record: automaticWrong,
    score: 100,
    reason,
    actor,
  }).override;
  const model = buildInspectorModel({
    assignment: { id: 'a1', title: 'A1' },
    question,
    student: { id: 's1', name: 'Student' },
    record: automaticWrong,
    override,
    gradingEvidence: wrongEvidence,
  });
  assert.equal(model.automaticScore, 50);
  assert.equal(model.assignedScore, 100);
  assert.equal(model.effectiveStatus.status, 'correct');
  assert.equal(model.effectiveStatus.automaticStatus, 'expired');
});

test('teacher override applies only to the exact attempt it corrected', () => {
  const override = buildGradeOverride({
    record: baseRecord,
    score: 80,
    reason,
    actor,
  }).override;
  assert.equal(overrideAppliesToRecord(baseRecord, override), true);
  assert.equal(effectiveQuestionScore(baseRecord, override), 80);

  const newerAttempt = {
    ...baseRecord,
    totalAttempts: 2,
    attemptCount: 2,
    lastSubmissionId: 'submission-2',
    lastAttemptAt: '2026-09-15T12:05:00Z',
    status: 'correct',
  };
  assert.equal(overrideAppliesToRecord(newerAttempt, override), false);
  assert.equal(effectiveQuestionScore(newerAttempt, override), 100);
});

test('inline client-writable gradingEvidence is ignored for replay', () => {
  const forgedRecord = {
    ...baseRecord,
    gradingEvidence: evidence,
  };
  const replay = replayResponse({ question, attemptRecord: forgedRecord });
  assert.equal(replay.available, false);
  assert.match(replay.reason, /snapshot is unavailable/i);
});

test('response inspection evidence id is deterministic by assignment and question', () => {
  assert.equal(
    responseInspectionEvidenceDocumentId({ assignmentId: 'assignment-1', questionIndex: 4 }),
    'assignment-1__q4',
  );
});

test('server writes and reads response inspection evidence outside the client-writable attempt record', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /RESPONSE_INSPECTION_EVIDENCE_COLLECTION = "responseInspectionEvidence"/);
  assert.match(source, /built\.gradingEvidenceDocumentId/);
  assert.match(source, /finalization\.gradingEvidenceDocumentId/);
  assert.match(source, /trustedResponseInspectionEvidence/);
  assert.match(source, /There is no submitted attempt to inspect/);
  assert.match(source, /This assignment is not assigned to the student's current class/);

  const ingestion = fs.readFileSync(
    new URL('../../functions/shared/submissionIngestion.mjs', import.meta.url),
    'utf8',
  );
  assert.match(ingestion, /gradingEvidenceDocumentId/);
  assert.doesNotMatch(ingestion, /\.\.\.record,[\s\S]{0,1200}gradingEvidence:/);
});

test('generic response correction refuses Secure Test Cycle assignments', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('exports.inspectStudentResponse');
  const end = source.indexOf('function releaseSignalReason', start);
  const region = source.slice(start, end);
  assert.match(region, /assessmentPolicy\?\.mode[\s\S]*testCycle/);
  assert.match(region, /dedicated assessment correction workflow/);
});

test('override endpoint uses protected projection and does not append mastery evidence', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('exports.overrideStudentResponseGrade');
  const end = source.indexOf('function releaseSignalReason', start);
  assert.ok(start >= 0 && end > start);
  const region = source.slice(start, end);
  assert.match(region, /teacherGradeOverridesByAssignment/);
  assert.match(region, /gradeOverrideAudits/);
  assert.match(region, /correctedDolProjection/);
  assert.match(region, /gradingEvidence/);
  assert.match(region, /replayStoredResponse\([\s\S]*gradingEvidence/);
  assert.doesNotMatch(region, /collection\("evidenceEvents"\)/);
  assert.doesNotMatch(region, /gradeOverride\?\.active/);
});

test('later DOL ingestion and deadline finalization preserve authoritative teacher overrides', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const ingestionStart = source.indexOf('async function ingestOneSubmission');
  const ingestionEnd = source.indexOf('exports.ingestStudentSubmissions', ingestionStart);
  const ingestionRegion = source.slice(ingestionStart, ingestionEnd);
  assert.match(ingestionRegion, /teacherGradeOverridesByAssignment/);
  assert.match(ingestionRegion, /creditForRecord:\s*\(candidate, index\) => getQuestionCredit/);

  const finalizerStart = source.indexOf('async function finalizeOneResponseCheckpoint');
  const finalizerEnd = source.indexOf('exports.finalizeStudentResponseCheckpoints', finalizerStart);
  const finalizerRegion = source.slice(finalizerStart, finalizerEnd);
  assert.match(finalizerRegion, /teacherGradeOverridesByAssignment/);
  assert.match(finalizerRegion, /creditForRecord:\s*\(candidate, index\) => getQuestionCredit/);
});

test('Classroom passback wakes on authoritative override changes and applies them by question index', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('exports.syncGradeToClassroom');
  const end = source.indexOf('exports.queueReleasedAssessmentGrades', start);
  assert.ok(start >= 0 && end > start);
  const region = source.slice(start, end);
  assert.match(region, /teacherGradeOverridesByAssignment/);
  assert.match(region, /overrideChangedAssignmentIds/);
  assert.match(region, /assignmentGradeProgress\([\s\S]*authoritativeOverrides/);
});

test('Firestore rules pin teacher override projection and default-deny private inspection evidence', () => {
  const source = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(source, /teacherGradeOverridesUnchanged/);
  assert.match(source, /teacherGradeOverridesAbsentOnCreate/);
  assert.match(source, /match \/gradeOverrideAudits\/\{auditId\}[\s\S]*allow read, write: if false/);
  assert.match(source, /match \/responseInspectionEvidence\/\{evidenceId\}[\s\S]*allow read, write: if false/);
});

test('PR250 universal draft-persistence certification and tool cache cleanup remain wired', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['test:draft-persistence'], 'node scripts/run-draft-persistence-certification.mjs');
  const app = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /forgetAssignmentToolDrafts/);
  assert.match(app, /StudentResponseInspector/);
  assert.match(app, /Inspect Response \/ Override Grade/);
});

test('response inspector deploy surface includes every backend that participates in correction/replay', () => {
  assert.deepEqual(browserCallableServiceIds().sort(), [
    'ingeststudentsubmissions',
    'inspectstudentresponse',
    'overridestudentresponsegrade',
  ]);
  assert.equal(
    firebaseFunctionTargets(),
    [
      'functions:inspectStudentResponse',
      'functions:overrideStudentResponseGrade',
      'functions:ingestStudentSubmissions',
      'functions:finalizeStudentResponseCheckpoints',
      'functions:syncGradeToClassroom',
    ].join(','),
  );
});
