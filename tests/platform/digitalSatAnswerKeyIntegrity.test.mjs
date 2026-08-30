import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../../functions/shared/pathQuestionGeneration.mjs';
import { analyzeAnswerKeyBias, RANK_TOLERANCE, EXTREME_TOLERANCE } from '../../functions/shared/asvabFidelity.mjs';

const compiled = () => JSON.parse(readFileSync(new URL('../../drafts/digitalSAT.v2.1.json', import.meta.url), 'utf8')).documents;

// Every Digital SAT multiple-choice family used to key its correct option with
// the literal id `sat-correct`. Choice ORDER is shuffled at generation, but the
// id travels with the option, and `buildSanitizedQuestion` copies ids straight
// through to the browser — it strips `expected`, not `id`. So the answer was
// readable from the DOM on all 498 multiple-choice families without doing any
// mathematics. Nothing in the suite caught it, which is why this file exists.
const NAMES_THE_KEY = /(correct|answer|key|right|true|false)/i;

test('no Digital SAT choice id names the answer', () => {
  const offenders = [];
  for (const question of compiled()) {
    for (const choice of question.choices || []) {
      if (NAMES_THE_KEY.test(String(choice.id))) offenders.push(`${question.id}: ${choice.id}`);
    }
  }
  assert.deepEqual(offenders, [], `choice ids leak the answer to the browser:\n  ${offenders.slice(0, 10).join('\n  ')}`);
});

test('the Digital SAT answer key is spread across choice ids rather than pinned to one', () => {
  const keyed = compiled()
    .filter((q) => q.assessmentItemFormat === 'multipleChoice')
    .map((q) => (q.responseFields || [])[0]?.expected)
    .filter(Boolean);
  assert.ok(keyed.length > 400, `expected the multiple-choice bank, saw ${keyed.length} keyed families`);
  const counts = keyed.reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
  const worst = Math.max(...Object.values(counts)) / keyed.length;
  // Four ids, so a perfectly even spread is 25%. Anything approaching a
  // majority means the id is a tell again, whatever it is called.
  assert.ok(worst < 0.4, `one choice id carries ${(worst * 100).toFixed(0)}% of the answer keys: ${JSON.stringify(counts)}`);
});

test('every Digital SAT multiple-choice family keys a choice that exists', () => {
  const orphans = [];
  for (const question of compiled()) {
    if (question.assessmentItemFormat !== 'multipleChoice') continue;
    const ids = new Set((question.choices || []).map((c) => c.id));
    for (const field of question.responseFields || []) {
      if (field.expected && !ids.has(field.expected)) orphans.push(`${question.id}: ${field.expected}`);
    }
  }
  assert.deepEqual(orphans, [], `expected answers naming no choice:\n  ${orphans.join('\n  ')}`);
});

// A key that sits at one end of the four in nearly every draw is answerable by
// magnitude alone: read nothing, pick the biggest number, score. This is the
// gate the ASVAB rebuild added after 476 of 730 families were found building
// every distractor as key + 1, + 2, + 3.
// The certification sweep found 177 families answerable this way. Geometry and
// Trigonometry has been repaired and is asserted clean outright. The other three
// domains are pinned to their exact remaining counts so the number can only fall:
// repairing families fails this test and forces the ceiling down, and any new
// family that regresses fails it too. See DIGITAL_SAT_V2_1_CERTIFICATION_AUDIT.md.
const MAGNITUDE_ANSWERABLE_CEILING = Object.freeze({
  geometryTrigonometry: 0,
  advancedMath: 91,
  algebra: 37,
  problemSolvingData: 28,
});

test('no Digital SAT family is answerable by the size of its options alone', () => {
  const flagged = {};
  for (const question of compiled()) {
    if (question.assessmentItemFormat !== 'multipleChoice') continue;
    // 400 draws, matching scripts/audit-digital-sat-certification.mjs. Generation
    // is deterministic, so a fixed count gives the same verdict every run; a
    // DIFFERENT count moves borderline families, which is why the two agree.
    const instances = samplePathInstances(question, 400).map((s) => s.question).filter(Boolean);
    if (!instances.length) continue;
    if (!analyzeAnswerKeyBias(instances).issues.length) continue;
    const domain = question.assessmentContext?.domainId || '(none)';
    (flagged[domain] = flagged[domain] || []).push(question.id);
  }
  const counts = Object.fromEntries(Object.keys(MAGNITUDE_ANSWERABLE_CEILING).map((d) => [d, (flagged[d] || []).length]));
  for (const [domain, ceiling] of Object.entries(MAGNITUDE_ANSWERABLE_CEILING)) {
    assert.ok(counts[domain] <= ceiling,
      `${domain}: ${counts[domain]} families answerable by magnitude, above the recorded ${ceiling} (rank tolerance ${RANK_TOLERANCE}, extreme ${EXTREME_TOLERANCE})\n  ${(flagged[domain] || []).slice(0, 15).join('\n  ')}`);
  }
  assert.deepEqual(counts, MAGNITUDE_ANSWERABLE_CEILING,
    'the recorded magnitude-answerable counts have fallen - lower MAGNITUDE_ANSWERABLE_CEILING to the new numbers');
  assert.deepEqual(Object.keys(flagged).filter((d) => !(d in MAGNITUDE_ANSWERABLE_CEILING)), [],
    'a domain outside the recorded list is now answerable by magnitude');
});

test('every Digital SAT family generates on every seed', () => {
  const failures = [];
  for (const question of compiled()) {
    const samples = samplePathInstances(question, 400);
    const failed = samples.filter((s) => !s.question).length;
    if (failed) failures.push(`${question.id}: ${((failed / samples.length) * 100).toFixed(2)}%`);
  }
  assert.deepEqual(failures, [], `families that fail to produce an instance on some seeds:\n  ${failures.join('\n  ')}`);
});

test('no Digital SAT family renders duplicate choice labels', () => {
  const offenders = [];
  for (const question of compiled()) {
    if (question.assessmentItemFormat !== 'multipleChoice') continue;
    for (const { question: instance } of samplePathInstances(question, 120)) {
      if (!instance) continue;
      const labels = (instance.choices || []).map((c) => String(c.label));
      if (new Set(labels).size !== labels.length) {
        offenders.push(`${question.id}: ${labels.join(' | ')}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `families rendering a repeated option:\n  ${offenders.join('\n  ')}`);
});
