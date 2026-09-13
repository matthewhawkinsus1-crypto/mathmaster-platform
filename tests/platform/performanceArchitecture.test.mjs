import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  clearPerformanceDiagnostics,
  getPerformanceDiagnostics,
  installPerformanceDiagnostics,
  recordPerformanceSample,
  startPerformanceSpan,
} from '../../src/platform/performance/performanceTelemetry.js';

test('performance telemetry calculates bounded p50/p95 aggregates without accepting sensitive dimensions', () => {
  clearPerformanceDiagnostics();
  for (let duration = 1; duration <= 100; duration += 1) {
    recordPerformanceSample('grading_ms', duration, {
      flow: 'ordinary', answer: 'secret answer', questionText: 'private prompt', userId: 'student-1',
    });
  }
  const diagnostics = getPerformanceDiagnostics().grading_ms;
  assert.equal(diagnostics.count, 100);
  assert.equal(diagnostics.p50, 50);
  assert.equal(diagnostics.p95, 95);
  assert.deepEqual(diagnostics.latest.dimensions, { flow: 'ordinary' });
});

test('spans finish once and diagnostics surface only exposes snapshots', async () => {
  clearPerformanceDiagnostics();
  const span = startPerformanceSpan('route_transition_ms');
  await Promise.resolve();
  assert.ok(span.finish().durationMs >= 0);
  assert.equal(span.finish(), null);
  const target = {};
  installPerformanceDiagnostics(target);
  assert.deepEqual(Object.keys(target.__MATHMASTER_PERFORMANCE__), ['snapshot']);
});

test('student performance architecture keeps tools lazy, secure prefetch guarded, and acknowledgement ahead of server work', async () => {
  const [registry, app, engine, firebase] = await Promise.all([
    readFile(new URL('../../src/tools/toolRegistry.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/firebase.js', import.meta.url), 'utf8'),
  ]);
  assert.match(registry, /dataModelingLab:\s*\(\) => import\(/);
  assert.doesNotMatch(registry, /import DataModelingLab from/);
  assert.match(app, /secure: isTestCycleAssignment\(activeAssignmentData\)/);
  const submitRegion = app.slice(app.indexOf('const handleGradeSubmit'), app.indexOf('const handleStepGrade'));
  const durableSubmitRegion = submitRegion.slice(submitRegion.indexOf('const assignment = localAssignment'));
  assert.ok(durableSubmitRegion.indexOf('setTracker(updatedTracker)') >= 0);
  assert.ok(durableSubmitRegion.indexOf('setTracker(updatedTracker)') < durableSubmitRegion.indexOf('getLiveAssignment(activeAssignmentId)'));
  assert.ok(engine.indexOf("startPerformanceSpan('submit_local_ack_ms'") < engine.indexOf('await onGrade('));
  assert.match(firebase, /persistentLocalCache\(\{ tabManager: persistentMultipleTabManager\(\) \}\)/);
});
