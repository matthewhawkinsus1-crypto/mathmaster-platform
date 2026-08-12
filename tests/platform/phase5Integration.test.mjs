import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

import { toCanonicalKey, toDisplayCode, sameTeks } from '../../src/utils/teksUtils.js';
import { getAllAlgebraOneWheelTeks, getStrandForTEKS } from '../../src/platform/mastery/strandConfig.js';
import { calculateNextRetentionDueDate, evaluateStudentRetentionSchedule, RETENTION_HORIZONS_MS } from '../../src/platform/retention/retentionScheduler.js';
import { evaluateRetentionProbeResult } from '../../src/platform/retention/retentionProbeEvaluator.js';
import { buildAttemptEvidenceEvent } from '../../src/platform/history/evidenceEvent.js';
import { buildStudentEvidenceTimeline } from '../../src/platform/history/evidenceTimelineService.js';
import { generateRuntimeUUID } from '../../src/utils/idUtils.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

test('Phase 5 canonical TEKS conversion is bidirectional and preserves other namespaces', () => {
  assert.equal(toCanonicalKey('a.5a'), 'texas:A.5A');
  assert.equal(toCanonicalKey('texas:a.5a'), 'texas:A.5A');
  assert.equal(toDisplayCode('texas:A.5A'), 'A.5A');
  assert.equal(toCanonicalKey('honors:finite-series'), 'honors:finite-series');
  assert.equal(sameTeks('A.5A', 'texas:a.5a'), true);
});

test('Phase 5A wheel is derived from the real Algebra I registry without duplicate content TEKS', () => {
  const codes = getAllAlgebraOneWheelTeks();
  assert.ok(codes.includes('A.5A'));
  assert.ok(codes.includes('A.9A'));
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(getStrandForTEKS('texas:A.5A').id, 'equations_inequalities');
});

test('Phase 5B retention horizons remain 14, 30, then 60 days', () => {
  const base = Date.UTC(2026, 0, 1);
  assert.equal(calculateNextRetentionDueDate(base, 0, base) - base, RETENTION_HORIZONS_MS.INITIAL_MASTERY);
  assert.equal(calculateNextRetentionDueDate(base, 1, base) - base, RETENTION_HORIZONS_MS.EXTENDED_VERIFIED);
  assert.equal(calculateNextRetentionDueDate(base, 2, base) - base, RETENTION_HORIZONS_MS.LONG_TERM_SECURE);
});

test('Phase 5B schedules retention concerns ahead of merely overdue probes', () => {
  const now = Date.UTC(2026, 7, 8);
  const profiles = {
    'A.5A': { mastery: { status: 'Mastered' }, signals: { retention: 'concern' }, dimensions: { lastIndependentSuccessAt: now - 40 * 86400000 } },
    'A.2A': { mastery: { status: 'Secure' }, signals: { retention: 'stable' }, dimensions: { lastIndependentSuccessAt: now - 40 * 86400000 } },
    'A.3A': { mastery: { status: 'Developing' }, signals: { retention: 'stable' } },
  };
  const report = evaluateStudentRetentionSchedule(profiles, {}, now);
  assert.equal(report.pendingProbes[0].teksCode, 'A.5A');
  assert.equal(report.pendingProbes[0].priority, 1);
  assert.equal(report.schedules['A.3A'], undefined);
});

test('Phase 5B retention probe requires two completed independent successes', () => {
  const passed = evaluateRetentionProbeResult({ teksCode: 'texas:A.5A', probeStepResult: { status: 'passed', completedQuestions: 2, independentSuccesses: 2 }, currentSchedule: { successfulCheckCount: 0 }, now: 1000 });
  const failed = evaluateRetentionProbeResult({ teksCode: 'A.5A', probeStepResult: { status: 'passed', completedQuestions: 2, independentSuccesses: 1 }, currentSchedule: {}, now: 1000 });
  assert.equal(passed.passed, true);
  assert.equal(passed.updatedSchedule.successfulCheckCount, 1);
  assert.equal(failed.passed, false);
  assert.equal(failed.updatedSchedule.status, 'concern');
});

test('Phase 5C legacy dual-write evidence captures canonical TEKS and presented-vs-used support telemetry', () => {
  const event = buildAttemptEvidenceEvent({
    studentId: 'S1042',
    assignment: { id: 'A1', title: 'Linear Equations', assignmentType: 'practice' },
    question: { questionId: 'Q1', type: 'equation', familyId: 'linear-equations', standards: { primary: [{ code: 'A.5A', level: 'assessed' }] }, complexity: { level: 2 }, difficulty: { generatorBand: 3 } },
    questionIndex: 0,
    activityRole: 'practice',
    attemptRecord: { status: 'correct', totalAttempts: 1, variantIndex: 0, partialCredit: 100 },
    attemptResult: { isCorrect: true, partialCredit: 100 },
    supportUsage: { accommodations: ['calculator'], modifications: [], calculatorUsed: true, contextScaffoldUsed: true, isMathematicallyIndependent: true },
    occurredAt: 123456,
  });
  assert.deepEqual(event.masteryEvidenceKeys, ['texas:A.5A']);
  assert.equal(event.performance.isMathematicallyIndependent, true);
  assert.ok(event.supportTelemetry.some((entry) => entry.stage === 'presented' && entry.supportType === 'calculator'));
  assert.ok(event.supportTelemetry.some((entry) => entry.stage === 'used' && entry.supportType === 'contextScaffold' && entry.reducesMathematicalIndependence === false));
});

test('Phase 5C timeline matches canonical/display TEKS and reads nested DOK/band metadata', () => {
  const events = [
    { eventKey: 'newer', occurredAt: 2000, alignmentKeys: ['texas:A.5A'], questionSnapshot: { questionInstanceId: 'qi-2', familyId: 'family-b', dok: 3, difficultyBand: 4 }, source: { activityRole: 'dol', activitySessionId: 's2' }, performance: { score: 0, isCorrect: false, attemptNumber: 1 }, supportTelemetry: [{ stage: 'presented', supportType: 'text-to-speech' }] },
    { eventKey: 'older', occurredAt: 1000, masteryEvidenceKeys: ['A.2A'], questionSnapshot: { questionInstanceId: 'qi-1', familyId: 'family-a', dok: 1, difficultyBand: 2 }, source: { activityRole: 'practice' }, performance: { score: 1, isCorrect: true, attemptNumber: 2 }, supportUsage: { contextScaffoldUsed: true, isMathematicallyIndependent: true } },
  ];
  const report = buildStudentEvidenceTimeline(events, 'A.5A');
  assert.equal(report.totalEvents, 1);
  assert.equal(report.timeline[0].eventKey, 'newer');
  assert.equal(report.timeline[0].score, 0);
  assert.equal(report.timeline[0].dok, 3);
  assert.equal(report.timeline[0].difficultyBand, 4);
});

test('Phase 5C context scaffolds do not reduce mathematical independence', () => {
  const report = buildStudentEvidenceTimeline([{ eventKey: 'ctx', occurredAt: 1, alignmentKeys: ['texas:A.5A'], source: { activityRole: 'practice' }, performance: { score: 1, isCorrect: true, attemptNumber: 1 }, supportUsage: { contextScaffoldUsed: true, isMathematicallyIndependent: true } }]);
  assert.equal(report.timeline[0].classification.isIndependent, true);
  assert.deepEqual(report.timeline[0].supportsUsed, ['contextScaffold']);
});

test('Phase 5D sanitizer strips grading answers while preserving renderable fields', () => {
  const authored = {
    familyId: 'linear-two-step', questionType: 'number', prompt: 'Solve 2x + 4 = 12', dok: 2, difficultyBand: 3,
    responseFields: [{ id: 'x', label: 'x =', inputProfile: 'number', expected: 4 }],
    grading: { numericTolerance: 0.01, secret: 'do-not-send' },
    context: { scenario: 'A safe scenario', interpretation: { prompt: 'Interpret.', expectedMeaning: 'secret meaning' } },
  };
  const safe = mathPath.buildSanitizedQuestion(authored, { questionInstanceId: 'qi-1', attemptsAllowed: 3, attemptsUsed: 0 });
  assert.equal(safe.responseFields[0].expected, undefined);
  assert.equal(safe.grading, undefined);
  assert.equal(safe.context.interpretation.expectedMeaning, undefined);
  assert.equal(safe.prompt, authored.prompt);
});

// `gradeResponse` is async: scalar equivalence lives in a shared ESM module that
// this CommonJS bridge loads lazily. Calling it without awaiting returns a
// promise whose `.isCorrect` is undefined — falsy, so the caller silently marks
// correct work wrong. Two production call sites did exactly that.
test('Phase 5D server grader handles numeric tolerance and partial multi-field credit', async () => {
  const authored = { responseFields: [{ id: 'x', expected: 4, numericTolerance: 0.01 }, { id: 'label', expected: 'meters' }] };
  const grading = mathPath.privateGradingDefinition(authored);
  const partial = await mathPath.gradeResponse(grading, { responses: { x: '4.005', label: 'feet' } });
  const correct = await mathPath.gradeResponse(grading, { responses: { x: 4, label: 'METERS' } });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, 0.5);
  assert.equal(correct.isCorrect, true);
});

test('Phase 5D runtime UUIDs are not stable IDs reused across submissions', () => {
  assert.notEqual(generateRuntimeUUID(), generateRuntimeUUID());
});

test('every server call into the async graders is awaited', async () => {
  // The defect this catches shipped: `gradeResponse` became async, two call
  // sites in the secure-exam path kept calling it synchronously, and
  // `grading.isCorrect` read undefined off the promise. Every answer would have
  // been marked wrong and an undefined score written to the session.
  //
  // Checked against the source rather than by exercising the callables, because
  // the callables need Firestore and this is a syntactic mistake.
  const source = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const ASYNC_BRIDGES = ['gradeResponse', 'gradePathToolResponse', 'buildIssuePlan'];
  const unawaited = [];
  ASYNC_BRIDGES.forEach((name) => {
    const pattern = new RegExp(`(\\w+\\s+)?mathPath\\.${name}\\(`, 'g');
    source.split('\n').forEach((line, index) => {
      if (!new RegExp(`mathPath\\.${name}\\(`).test(line)) return;
      if (/await\s+mathPath\./.test(line)) return;
      unawaited.push(`functions/index.js:${index + 1} — ${line.trim().slice(0, 100)}`);
    });
    pattern.lastIndex = 0;
  });
  assert.deepEqual(unawaited, [], `these read a promise instead of a verdict:\n${unawaited.join('\n')}`);
});
