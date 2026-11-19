/*
 * THE GRADER FUZZ AND PARITY HARNESS: THE SLICE EVERY PULL REQUEST RUNS.
 *
 * The bugs that reached students in November 2026 were values a student could
 * type that no test had typed: MathLive's `\frac12` in a box whose reader took
 * plain text (PR #553), `Pr` and `2πr` read as one name (PR #551), an authored
 * `x(x - 5) = 0` read as a call, a half-written equation. scripts/lib/graderFuzz
 * types them: seeded inputs of every such class, against every question the
 * banks and the Question Families can give, through every grader, held to
 * what the platform promises (docs/architecture/GRADER_FUZZ.md):
 *
 *   a typed value never throws           the screen's verdict is the server's
 *   an unfinished answer is not right    a saved draft reads back and reopens
 *   one verdict takes under two seconds
 *
 * This file runs a fixed seed (the same cases on every machine) in a few
 * seconds. The Grader Fuzz Nightly workflow runs a new seed and a hundred
 * times the cases every night.
 *
 * A finding fails this test unless scripts/grader-fuzz-known-findings.json
 * lists its signature, with the reason it is left. That list cannot rot: each
 * entry carries a repro, replayed here, and an entry that no longer reproduces
 * fails until it is deleted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { formatFinding, readKnownFindings, summarizeFindings } from '../../scripts/lib/graderFuzz/findings.mjs';
import { TARGET_IDS, loadTarget, replayCase, runGraderFuzz } from '../../scripts/lib/graderFuzz/index.mjs';
import { FREE_CLASSES, INPUT_CLASSES, breakOf, isUnfinished, typedInput } from '../../scripts/lib/graderFuzz/inputs.mjs';
import { createRng } from '../../scripts/lib/graderFuzz/prng.mjs';
import { PATH_TOOL_QUESTIONS } from './fixtures/pathToolQuestions.mjs';

// The slice: sized so the whole file runs in well under a minute on CI.
const SLICE = Object.freeze({
  seed: 'pull-request',
  counts: { typedFields: 500, structuredWork: 2500, questionResponses: 1200, drafts: 1200, readers: 600 },
  caseOptions: { maxLength: 600 },
});

const KNOWN = readKnownFindings();

test('the slice meets no finding that is not listed as known', async (t) => {
  const result = await runGraderFuzz({ ...SLICE, known: KNOWN });
  for (const row of result.perTarget) {
    t.diagnostic(`${row.target}: ${row.cases} cases in ${row.ms} ms`);
    assert.equal(row.cutShort, false);
    assert.ok(row.cases >= SLICE.counts[row.target] * 0.5, `${row.target} ran only ${row.cases} cases: its corpus or its generator broke`);
  }
  assert.deepEqual(result.perTarget.map((row) => row.target), [...TARGET_IDS], 'every target ran');
  const { failures, known, reports } = result.summary;
  t.diagnostic(`${result.cases} cases, ${known.length} known finding(s) met, ${reports.length} reported difference(s)`);
  assert.equal(failures.length, 0, [
    `${failures.length} new finding(s). Fix the grader, or (only for one that cannot be fixed safely here) list its`,
    'signature in scripts/grader-fuzz-known-findings.json with the reason. Run one again with',
    '`node scripts/fuzz-graders.mjs --replay <file holding its repro JSON>`.',
    '',
    ...failures.map(formatFinding),
  ].join('\n'));
});

test('a seed names its cases: the same seed builds the same cases, another seed others', async () => {
  for (const targetId of TARGET_IDS) {
    const target = await loadTarget(targetId);
    const build = (seed) => JSON.stringify([...target.cases({ rng: createRng(`${seed}/${targetId}`), count: 40, maxLength: 600 })]);
    const first = build('determinism');
    assert.equal(build('determinism'), first, `${targetId} is not deterministic`);
    assert.notEqual(build('another seed'), first, `${targetId} ignores its seed`);
    // A case is plain JSON, so a finding's repro replays with nothing else.
    assert.doesNotThrow(() => JSON.parse(first));
  }
});

test('every known finding is explained, tracked, and still reproduces from its own repro', async () => {
  for (const [signature, entry] of Object.entries(KNOWN)) {
    for (const key of ['what', 'whyLeft', 'tracked']) assert.ok(String(entry[key] || '').trim().length > 8, `${signature}: no ${key}`);
    assert.match(entry.tracked, /issues\/\d+|#\d+/, `${signature}: 'tracked' names an issue`);
    assert.equal(entry.repro?.target, signature.split('/')[0], `${signature}: its repro is a case of its own target`);
    // A finding that depends on the machine's speed is replayed by hand.
    if (entry.replay === 'timed') continue;
    const found = await replayCase(entry.repro);
    assert.ok(found.some((finding) => finding.signature === signature && finding.severity === 'fail'), [
      `${signature} no longer reproduces from its repro.`,
      'If it was fixed, delete its entry from scripts/grader-fuzz-known-findings.json.',
      `The repro now meets: ${found.map((finding) => finding.signature).join(', ') || 'nothing'}`,
    ].join(' '));
  }
});

test('found and fixed: malformed work never throws out of the My Math Path tool grader', async () => {
  // `intervals: [null]` passed the number line's validator and threw in its
  // grader, so the callable marking it answered "internal". The harness met it
  // (structuredWork, path-contract); it is refused now, like any malformed work.
  const question = PATH_TOOL_QUESTIONS.intervalNumberLine;
  const privateGrading = buildPrivateToolGrading(question);
  const right = { intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }], notation: '[-3, 5)', inequality: '' };
  assert.equal(gradePathResponse({ privateGrading, raw: right }).isCorrect, true, 'right work is still right');
  for (const intervals of [[null], [undefined], [null, { min: -3, max: 5, minClosed: true, maxClosed: false }], [7], ['x']]) {
    let result;
    assert.doesNotThrow(() => { result = gradePathResponse({ privateGrading, raw: { ...right, intervals } }); }, `intervals ${JSON.stringify(intervals)}`);
    assert.equal(result.isCorrect, false);
    assert.equal(typeof result.rejected, 'boolean');
  }
  const refused = gradePathResponse({ privateGrading, raw: { ...right, intervals: [null] } });
  assert.equal(refused.rejected, true);
  assert.equal(refused.reason, 'malformed_response');
  // And the harness's own case for it is clean.
  const found = await replayCase({ target: 'structuredWork', source: 'captured:path:intervalNumberLine', question, work: { intervals: [null], notation: '[-3, 5)', inequality: '' }, change: 'shape', at: 'intervals.#.min', given: null });
  assert.deepEqual(found.filter((finding) => finding.severity === 'fail').map((finding) => finding.signature), []);
});

test('the generators build every class, and know an unfinished answer from a finished one', () => {
  const rng = createRng('generators');
  for (const inputClass of INPUT_CLASSES) {
    const seen = new Set();
    for (let index = 0; index < 60; index += 1) {
      const input = typedInput(rng, inputClass, { key: 'y=2x+3', field: { inputProfile: 'equation' }, maxLength: 600 });
      assert.equal(typeof input.text, 'string');
      // A class with nothing to build from this key says which class it built instead.
      assert.ok(INPUT_CLASSES.includes(input.inputClass), `${inputClass} built a value of class ${input.inputClass}`);
      assert.ok(input.text.length <= 1200, `${inputClass} built ${input.text.length} characters with maxLength 600`);
      seen.add(input.text);
    }
    if (inputClass !== 'key') assert.ok(seen.size >= 5, `${inputClass} built only ${seen.size} distinct values in 60 draws`);
  }
  for (const inputClass of FREE_CLASSES) assert.equal(typeof typedInput(rng, inputClass).text, 'string', `${inputClass} needs no key`);
  // The classes the incidents were made of are in the corpus by name.
  const drawn = (inputClass) => new Set(Array.from({ length: 4000 }, () => typedInput(rng, inputClass).text));
  for (const value of ['Pr', 'x(x-5)', '2πr']) assert.ok(drawn('implicit').has(value), `implicit products include ${value}`);
  for (const value of ['1e999', '0x10', '1,000']) assert.ok(drawn('oddNumber').has(value), `odd numbers include ${value}`);
  for (const value of ['2x +', '(', '1/', '=']) assert.ok(drawn('partial').has(value), `partial entries include ${value}`);
  assert.ok([...drawn('latex')].some((value) => /\\frac\d\d/.test(value)), 'the editor\'s short \\frac12');
  assert.ok([...drawn('latex')].some((value) => /\\sqrt\[3\]\{/.test(value)), '\\sqrt[3]{}');

  for (const value of ['12 +', '2x -', '(x+1', 'x=', '3*', '1/', '\\frac{1}{', ')4', '2^', 'x\\cdot', '5,']) assert.equal(isUnfinished(value), true, value);
  for (const value of ['12', '2x-3', '(x+1)', 'x=4', '(2, 5]', '[-3, 5)', '\\left(x-5\\right)', '5.', '-7', '', 'x\\le 3']) assert.equal(isUnfinished(value), false, value);
  assert.equal(breakOf('12 +', 12), 'sign-after');
  assert.equal(breakOf('12\\times', '12'), 'product-sign-after');
  assert.equal(breakOf('*12', '12'), 'product-sign-before');
  assert.equal(breakOf('12^{', '12'), 'after:^{');
});

test('findings fold by signature, keep the smallest repro, and only an unlisted failure fails', () => {
  const finding = (signature, severity, repro) => ({ target: 'typedFields', property: 'p', severity, signature, message: signature, repro });
  const summary = summarizeFindings([
    finding('typedFields/p/new', 'fail', { text: 'a long repro of the same cause' }),
    finding('typedFields/p/new', 'fail', { text: 'short' }),
    finding('typedFields/p/listed', 'fail', {}),
    finding('typedFields/p/differ', 'report', {}),
  ], { 'typedFields/p/listed': {}, 'typedFields/p/gone': {} });
  assert.deepEqual(summary.failures.map((entry) => [entry.signature, entry.count, entry.repro.text]), [['typedFields/p/new', 2, 'short']]);
  assert.deepEqual(summary.known.map((entry) => entry.signature), ['typedFields/p/listed']);
  assert.deepEqual(summary.reports.map((entry) => entry.signature), ['typedFields/p/differ']);
  assert.deepEqual(summary.unmet, ['typedFields/p/gone']);
});
