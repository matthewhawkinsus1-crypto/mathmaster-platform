// THE MASTERED CHECKLIST NAMES ONLY WHAT COUNTS AS HELP (release-candidate QA M5).
//
// "Get 2 right on your own" said "no hints, worked steps or read-aloud of the
// math", but no grading code counts read-aloud against independence: it is an
// accommodation (supportEntitlements.mjs), and telling students it does not
// count steers them off it. The label must name the supports the rule does
// count, and only those.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { masteryChecklist } from '../../functions/shared/masteryRule.mjs';
import { reducesMathematicalIndependence } from '../../functions/shared/supportEntitlements.mjs';
import { classifyAttemptEvidence } from '../../src/platform/mastery/evidenceClassification.js';
import { AttemptContext } from '../../src/platform/supports/AttemptContext.js';

const require = createRequire(import.meta.url);
const { mathematicalIndependence } = require('../../functions/lib/mathPath.js');

const independentLabel = () => masteryChecklist({}).items.find((item) => item.key === 'independent')?.label || '';

test('read-aloud is not help anywhere the rule is computed', () => {
  // Server (Path and assignment evidence), shared entitlement table, client.
  for (const id of ['text-to-speech', 'textToSpeech', 'read-aloud']) {
    assert.equal(mathematicalIndependence({ accommodations: [id] }), true, `${id}: server`);
    assert.equal(reducesMathematicalIndependence(id), false, `${id}: entitlement table`);
    assert.equal(classifyAttemptEvidence({ supportUsage: { accommodations: [id] }, supportTelemetry: [{ stage: 'used', supportType: id, reducesMathematicalIndependence: false }] }).isIndependent, true, `${id}: evidence classification`);
  }
  assert.equal(new AttemptContext().exportState().isMathematicallyIndependent, true);
  // What does count: hints and worked steps.
  assert.equal(mathematicalIndependence({ hintUsed: true }), false);
  assert.equal(mathematicalIndependence({ workedExampleUsed: true }), false);
});

test('the "on your own" item names hints and worked steps, never read-aloud', () => {
  const label = independentLabel();
  assert.match(label, /on your own/);
  assert.match(label, /\bhints?\b/i);
  assert.match(label, /worked steps/i);
  assert.doesNotMatch(label, /read[- ]?aloud|speech|spoken|listen|audio|heard?\b/i);
});
