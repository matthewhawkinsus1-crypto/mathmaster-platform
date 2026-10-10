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
import { MASTERY_STATUS, classifyMasteryStatus, masteryChecklist } from '../../functions/shared/masteryRule.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { createRequire } from 'node:module';
import { buildAttemptSupportPayload, buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';

const { mathematicalIndependence, pathAttemptSupport } = createRequire(import.meta.url)('../../functions/lib/mathPath.js');

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
  assert.match(trigger, /masteryRule\.classifyMasteryStatus\(\{[^}]*\bindependentSuccesses\s*[,}]/,
    'the server Mastered gate must be given the independent successes, not only a high estimate');
  // The count it is given is of answers that were right AND unaided.
  assert.match(
    trigger,
    /const independentSuccesses = Number\(accumulator\.independentSuccesses \|\| 0\)\s*\+ \(evidence\.performance\?\.isCorrect && independent && weight > 0 \? 1 : 0\);/,
    'only a correct answer the student produced without support may count toward Mastered',
  );
  // ...and the rule refuses Mastered without two of them, however high the
  // estimate and however broad the evidence.
  const strong = { estimate: 100, eligibleEvents: 6, effectiveWeight: 6, dokRepresented: [2, 3] };
  assert.notEqual(classifyMasteryStatus({ ...strong, independentSuccesses: 0 }), MASTERY_STATUS.MASTERED,
    'a top label assembled entirely from supported successes is a claim the evidence does not support');
  assert.notEqual(classifyMasteryStatus({ ...strong, independentSuccesses: 1 }), MASTERY_STATUS.MASTERED);
  assert.equal(classifyMasteryStatus({ ...strong, independentSuccesses: 2 }), MASTERY_STATUS.MASTERED);
  assert.ok(serverSource.includes('const weight = modified ? 0 : roleWeight;'),
    'the support discount must NOT be folded back into the weight');
  assert.ok(serverSource.includes('SUPPORTED_CREDIT'),
    'the support discount must be applied to credit');
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
  // Hint and review use come from what the server released before this
  // answer, never from the request; what this response releases is carried to
  // the next attempt (behaviour below).
  const handler = region(executableSource(serverSource), 'exports.submitPathResponse = onCall(', 'const independent = mathPath.mathematicalIndependence(supportUsage);', 'submitPathResponse support usage');
  assert.match(handler, /const \{ used: supportBeforeAttempt, released: supportReleased \} = mathPath\.pathAttemptSupport\(\{\s*priorSupport: currentQuestion\.supportReleased \|\| \{\},\s*attemptSupport,\s*\}\);/);
  assert.match(handler, /hintUsed: supportBeforeAttempt\.hintUsed,\s*workedExampleUsed: supportBeforeAttempt\.workedExampleUsed,\s*scaffoldUsed: supportBeforeAttempt\.scaffoldUsed,/);
  assert.doesNotMatch(handler, /(hintUsed|workedExampleUsed|scaffoldUsed): (claimed|request)/);
  assert.ok(serverSource.includes('attemptsUsed: attemptNumber,\n      supportReleased,\n'),
    'support must stay recorded across attempts on the same question');
});

// What each Path attempt is told and released, from the shared ladder.
const respond = ({ attemptNumber = 1, attemptsAllowed = 1, isCorrect }) => buildAttemptSupportPayload({
  support: buildPrivateSupport({ supportHints: ['Undo the addition first.'], solutionReview: { headline: 'Undo in reverse.', reasoning: ['Subtract 3.', 'Divide by 2.'] } }),
  attemptNumber,
  attemptsAllowed,
  isCorrect,
  questionFinalized: isCorrect || attemptNumber >= attemptsAllowed,
});

test('the review shown after an answer never marks that answer as helped (QA R2-M2)', () => {
  // The QA repro: five one-attempt items, right, wrong, right, wrong, right,
  // no hints. Every one closes its item, so every response releases the review.
  const events = [true, false, true, false, true].map((isCorrect) => {
    const attemptSupport = respond({ isCorrect });
    assert.ok(attemptSupport.solutionReview, 'the review is released when the item closes');
    const { used, released } = pathAttemptSupport({ priorSupport: {}, attemptSupport });
    assert.equal(released.reviewReleased, true, 'and recorded as released, for anything after it');
    assert.deepEqual(used, { hintUsed: false, workedExampleUsed: false, scaffoldUsed: false });
    return { score: isCorrect ? 1 : 0, independent: mathematicalIndependence(used) };
  });
  const result = aggregate(events);
  assert.equal(result.independentSuccesses, 3);
  assert.equal(result.estimate, 60, '3 of 5 right, not 45');
  const onYourOwn = masteryChecklist({ accumulator: { independentSuccesses: result.independentSuccesses } }).items.find((item) => item.key === 'independent');
  assert.equal(onYourOwn.progress, '2 of 2');
});

test('help released before an answer still marks it, and stays on later attempts', () => {
  // Three attempts: the hint arrives with the second miss's response.
  const first = pathAttemptSupport({ priorSupport: {}, attemptSupport: respond({ attemptNumber: 1, attemptsAllowed: 3, isCorrect: false }) });
  assert.equal(first.used.hintUsed, false);
  const secondResponse = respond({ attemptNumber: 2, attemptsAllowed: 3, isCorrect: false });
  assert.ok(secondResponse.support?.hint, 'the second miss releases the hint');
  const second = pathAttemptSupport({ priorSupport: first.released, attemptSupport: secondResponse });
  assert.equal(second.used.hintUsed, false, 'the hint it released came after attempt two');
  assert.equal(second.released.hintReleased, true);
  const third = pathAttemptSupport({ priorSupport: second.released, attemptSupport: respond({ attemptNumber: 3, attemptsAllowed: 3, isCorrect: true }) });
  assert.deepEqual(third.used, { hintUsed: true, workedExampleUsed: false, scaffoldUsed: true }, 'the hint was on screen before attempt three');
  assert.equal(mathematicalIndependence(third.used), false);
  // A review released before an answer is a worked example for it.
  const reviewed = pathAttemptSupport({ priorSupport: { reviewReleased: true }, attemptSupport: respond({ isCorrect: true }) });
  assert.equal(reviewed.used.workedExampleUsed, true);
  assert.equal(mathematicalIndependence(reviewed.used), false);
});

// --- Retention evidence is distinguishable ------------------------------------

test('a retention probe is not recorded as ordinary practice', () => {
  assert.ok(serverSource.includes('session.sessionKind === "retentionProbe" ? "retention" : "practice"'),
    '"has this stayed with you?" and "are you learning this?" are different evidence');
  assert.ok(/retention:\s*1\.15/.test(serverSource),
    'the retention role needs its own weight, or the distinction has no effect downstream');
});
