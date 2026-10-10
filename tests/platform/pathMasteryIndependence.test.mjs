// Mastery has to mean the student did the mathematics.
//
// THE BUG THESE TESTS EXIST FOR. The support discount used to be folded into
// the evidence WEIGHT:
//
//     weight   = roleWeight * (independent ? 1 : 0.85)
//     estimate = Σ(score × weight) / Σ(weight)
//
// The 0.85 sat in both the numerator and the denominator, so for a correct
// answer it divided straight back out. A student who took a hint on every
// question reached an estimate of 100 and was labelled Mastered. The discount
// looked present in the code and was arithmetically inert.
//
// The repair separates two questions that were being answered with one number:
// how much an event counts as EVIDENCE (weight, denominator) and what the
// student actually DEMONSTRATED (credit, numerator).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SUPPORTED_CREDIT, estimateInstructionalPerformanceLevel,
} from '../../src/masteryEngine.js';
import { MASTERY_STATUS, classifyMasteryStatus } from '../../functions/shared/masteryRule.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { ROLE_WEIGHT, applyMasteryEvent, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';
import { createRequire } from 'node:module';

const mathPathHelpers = createRequire(import.meta.url)('../../functions/lib/mathPath.js');

const serverSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

// --- The arithmetic actually discounts ---------------------------------------

/** The server aggregator's estimate, reproduced exactly as it is written. */
const aggregate = (events) => {
  let effectiveWeight = 0;
  let weightedScoreSum = 0;
  let independentSuccesses = 0;
  events.forEach(({ score, independent }) => {
    const weight = 1; // roleWeight for 'practice', not modified
    const creditedScore = independent ? score : score * SUPPORTED_CREDIT;
    effectiveWeight += weight;
    weightedScoreSum += creditedScore * weight;
    if (score === 1 && independent) independentSuccesses += 1;
  });
  return {
    estimate: effectiveWeight > 0 ? Math.round((weightedScoreSum / effectiveWeight) * 100) : null,
    eligibleEvents: events.length,
    independentSuccesses,
  };
};

test('a fully supported student does not score the same as an independent one', () => {
  const supported = aggregate(Array.from({ length: 4 }, () => ({ score: 1, independent: false })));
  const independent = aggregate(Array.from({ length: 4 }, () => ({ score: 1, independent: true })));

  assert.equal(independent.estimate, 100);
  assert.ok(supported.estimate < independent.estimate,
    `supported success must be worth less than independent success (${supported.estimate} vs ${independent.estimate})`);
  // The specific number matters: it has to land below the Mastered threshold,
  // or the discount is decorative.
  assert.ok(supported.estimate < 85,
    `no quantity of supported successes may reach the Mastered threshold (got ${supported.estimate})`);
});

test('the discount does not cancel out however many events there are', () => {
  // The old bug was scale-invariant, so the test has to be too.
  [2, 4, 8, 40].forEach((count) => {
    const supported = aggregate(Array.from({ length: count }, () => ({ score: 1, independent: false })));
    assert.ok(supported.estimate < 100, `${count} supported successes still reached 100`);
  });
});

test('mixed evidence lands between the two, not at the top', () => {
  const mixed = aggregate([
    { score: 1, independent: true }, { score: 1, independent: true },
    { score: 1, independent: false }, { score: 1, independent: false },
  ]);
  assert.ok(mixed.estimate > 75 && mixed.estimate < 100, `expected a middle value, got ${mixed.estimate}`);
});

// --- The label requires independent evidence ---------------------------------

test('the Mastered gate requires successes the student produced unaided', () => {
  // This used to be `serverSource.includes('independentSuccesses >= 2')`. Once
  // the gate moved into the shared rule, the only line in functions/index.js
  // that still matched was the RETENTION CHECK's pass test — so the assertion
  // stood for a behaviour it no longer looked at. It is now bound to the gate:
  // the trigger hands the rule the count of unaided successes...
  const trigger = region(
    executableSource(serverSource),
    'exports.updateMyMathPathMasteryFromEvidence',
    '\nexports.',
    'the server mastery trigger',
  );
  // The trigger scores each question through the shared scorer, which hands
  // the rule its count of unaided successes (functions/shared/masteryScoring.mjs).
  assert.match(trigger, /masteryScoring\.applyMasteryEvent\(profiles\[code\], facts, code,/,
    'the server Mastered gate must run through the shared scorer');
  // The count it is given is of answers that were right AND unaided: six
  // correct answers, each with a hint, reach a high estimate and no success.
  const event = (index, supportUsage) => ({
    eventKey: `e${index}`, occurredAt: 1000 + index, masteryEvidenceKeys: ['texas:A.5A'],
    questionSnapshot: { questionInstanceId: `q${index}`, dok: 3 }, source: { kind: 'path', activityRole: 'practice' },
    performance: { score: 1, isCorrect: true, attemptNumber: 1 }, supportUsage,
  });
  let hinted;
  for (let index = 0; index < 6; index += 1) {
    hinted = applyMasteryEvent(hinted, masteryEventFacts(event(index, { hintUsed: true }), mathPathHelpers), 'A.5A').entry;
  }
  assert.equal(hinted.accumulator.independentSuccesses, 0,
    'only a correct answer the student produced without support may count toward Mastered');
  assert.notEqual(hinted.mastery.status, MASTERY_STATUS.MASTERED);
  let unaided;
  for (let index = 0; index < 6; index += 1) {
    unaided = applyMasteryEvent(unaided, masteryEventFacts(event(index, {}), mathPathHelpers), 'A.5A').entry;
  }
  assert.equal(unaided.accumulator.independentSuccesses, 6);
  assert.equal(unaided.mastery.status, MASTERY_STATUS.MASTERED);
  // ...and the rule refuses Mastered without two of them, however high the
  // estimate and however broad the evidence.
  const strong = { estimate: 100, eligibleEvents: 6, effectiveWeight: 6, dokRepresented: [2, 3] };
  assert.notEqual(classifyMasteryStatus({ ...strong, independentSuccesses: 0 }), MASTERY_STATUS.MASTERED,
    'a top label assembled entirely from supported successes is a claim the evidence does not support');
  assert.notEqual(classifyMasteryStatus({ ...strong, independentSuccesses: 1 }), MASTERY_STATUS.MASTERED);
  assert.equal(classifyMasteryStatus({ ...strong, independentSuccesses: 2 }), MASTERY_STATUS.MASTERED);
  // The discount is on CREDIT, never folded into the weight (where it would
  // divide straight back out): hinted successes keep full weight and earn
  // 75% each, so their estimate is 75, below Mastered however many there are.
  const hintedFacts = masteryEventFacts(event(0, { hintUsed: true }), mathPathHelpers);
  assert.equal(hintedFacts.weight, ROLE_WEIGHT.practice, 'the support discount must NOT be folded back into the weight');
  assert.equal(hinted.mastery.estimate, 75, 'the support discount must be applied to credit');
});

test('the client performance level refuses Masters built entirely on support', () => {
  const strong = { score: 95, itemCount: 6, effectiveEvidence: 6, maxDok: 3, highDokEvidenceCount: 2 };

  const unaided = estimateInstructionalPerformanceLevel({ ...strong, independentSuccesses: 4 });
  assert.equal(unaided.key, 'masters');

  const propped = estimateInstructionalPerformanceLevel({ ...strong, independentSuccesses: 0 });
  assert.notEqual(propped.key, 'masters',
    'a top label assembled entirely from supported successes is a claim the evidence does not support');
  assert.match(propped.ceilingReason, /without mathematical assistance/i);
});

test('not measuring independence does not silently award the top label', () => {
  // A caller that has not measured independence passes null. The ceiling is
  // skipped rather than guessed at — but the DOK ceiling still applies.
  const unmeasured = estimateInstructionalPerformanceLevel({
    score: 95, itemCount: 6, effectiveEvidence: 6, maxDok: 3, highDokEvidenceCount: 2,
  });
  assert.equal(unmeasured.key, 'masters', 'an unmeasured caller keeps its previous behaviour');
});

// --- The browser does not get to declare independence ------------------------

test('support usage is derived from server state, not accepted from the request', () => {
  // The server issues the hint and releases the review, so it knows. Believing
  // a client-supplied supportUsage is the same trust bug as believing a
  // client-supplied isCorrect, one axis over — and it inflates mastery rather
  // than grades.
  assert.ok(!serverSource.includes('supportUsage: { ...supportUsage, isMathematicallyIndependent: independent }')
    || serverSource.includes('const claimed = request.data?.supportUsage'),
    'the request object must not be spread wholesale into the evidence document');
  assert.ok(serverSource.includes('hintUsed: hintReleased'),
    'hint usage must come from what the server actually released');
  assert.ok(serverSource.includes('workedExampleUsed: reviewReleased'),
    'solution-review exposure must be recorded, not assumed absent');
  assert.ok(serverSource.includes('supportReleased: { hintReleased, reviewReleased }'),
    'support must stay recorded across attempts on the same question');
});

test('a hint released on an earlier attempt still counts on the attempt that finalizes', () => {
  // Sticky support: the student who needed a hint on attempt two did not stop
  // needing it because attempt three is the one that closes the question.
  assert.ok(serverSource.includes('Boolean(priorSupport.hintReleased) || Boolean(attemptSupport.support?.hint)'),
    'the hint flag must OR with what was already released');
});

// --- Retention evidence is distinguishable ------------------------------------

test('a retention probe is not recorded as ordinary practice', () => {
  assert.ok(serverSource.includes('session.sessionKind === "retentionProbe" ? "retention" : "practice"'),
    '"has this stayed with you?" and "are you learning this?" are different evidence');
  assert.equal(ROLE_WEIGHT.retention, 1.15,
    'the retention role needs its own weight, or the distinction has no effect downstream');
  assert.notEqual(ROLE_WEIGHT.retention, ROLE_WEIGHT.practice);
});
