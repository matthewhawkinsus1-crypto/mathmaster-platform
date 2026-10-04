// MUTATION TESTING OF THE MISCONCEPTION CLASSIFIERS.
//
// A classifier that names a misconception wrongly puts a diagnosis in a
// teacher's mouth, so the fixtures (helpers/misconceptionFixtures.mjs) must be
// able to catch a classifier that is subtly wrong — not merely run it. Each
// mutant below is a single realistic slip in functions/shared/
// misconceptionClassifiers.mjs: a dropped guard, a flipped formula, an
// ambiguity rule weakened. The mutated module is written to a temporary
// directory (its imports pointed back at the real shared code), loaded, and
// run over every fixture. A mutant SURVIVES if every fixture still gets its
// expected codes — and a survivor fails this suite: either the fixtures are
// missing a case, or the guard the mutant removed does nothing and should go.
//
// Every mutation must apply exactly once, so a refactor that moves the code
// fails loudly here ("mutation no longer applies") instead of silently
// testing nothing: update the needle to the new code, keep the slip.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { classifyMisconceptions } from '../../functions/shared/misconceptionClassifiers.mjs';
import { MISCONCEPTION_FIXTURES, MISCONCEPTION_PROBES, classifiedCodes } from './helpers/misconceptionFixtures.mjs';

const SOURCE_URL = new URL('../../functions/shared/misconceptionClassifiers.mjs', import.meta.url);
const SHARED_URL = new URL('../../functions/shared/', import.meta.url).href;
const SOURCE = readFileSync(SOURCE_URL, 'utf8');

const MUTANTS = [
  // The ambiguity rule — the heart of "no false diagnosis".
  { name: 'a blocker match no longer blocks', find: 'if (codes.size !== 1 || codes.has(null)) return null;\n  return [...codes][0];', replace: 'if (codes.size < 1) return null;\n  return [...codes].filter(Boolean)[0] || null;' },
  { name: 'two whole-response patterns no longer cancel', find: "if (codes.size !== 1 || codes.has(null)) return null;\n  return held[0];", replace: 'if (!held.length) return null;\n  return held[0];' },
  { name: 'a strategy whose value is the answer counts', find: 'filter((candidate) => finite(candidate.value) && !close(candidate.value, correct) && close(value, candidate.value))', replace: 'filter((candidate) => finite(candidate.value) && close(value, candidate.value))' },
  // Only wrong parts may carry a code.
  { name: 'a correct part counts as wrong', find: "part.isComplete === true && part.isCorrect !== true ? part : null", replace: 'part.isComplete === true ? part : null' },
  // Formulas: each strategy's value.
  { name: 'run over rise computed as rise over run', find: "{ code: 'slope-run-over-rise', value: ratio(run, rise) }", replace: "{ code: 'slope-run-over-rise', value: ratio(rise, run) }" },
  { name: 'the both-errors blocker removed', find: '{ code: null, value: ratio(-run, rise) },', replace: '' },
  { name: 'partial division adds b', find: "value: finite(c / a) ? c / a - b : null", replace: "value: finite(c / a) ? c / a + b : null" },
  { name: 'the −x blocker removed (two-step)', find: '{ code: null, value: -x },\n      { code: null, value: c - b },', replace: '{ code: null, value: c - b },' },
  { name: 'multi-step variable term keeps its sign', find: "{ code: 'inverse-operation-sign', value: ratio(d - b, a + cc) },", replace: "{ code: 'inverse-operation-sign', value: ratio(d - b, a - cc) }," },
  { name: 'partial distribution multiplies nothing', find: 'const partialX = ratio(c - k, a + b * m);', replace: 'const partialX = ratio(c - k, a + m);' },
  { name: '"on one line" also said of a point on neither line', find: "return onLines === 1 ? [finding('system-point-on-one-line-only', partIds)] : [];", replace: "return onLines <= 1 ? [finding('system-point-on-one-line-only', partIds)] : [];" },
  { name: 'vertex sign mutant reads h as written', find: "holds: h !== 0 && (nearPair(P, -h, k) || nearPair(P, -h, valueAtNegatedH))", replace: "holds: h !== 0 && (nearPair(P, h, k) || nearPair(P, -h, valueAtNegatedH))" },
  { name: 'absolute value: −t no longer required to be a non-solution', find: '.some((t) => !isSolution(-t) && sameSet(t, -t))', replace: '.some((t) => sameSet(t, -t))' },
  { name: 'zeros: opposite zeros not excluded', find: "return !opposites && sameSet(-low, -high)", replace: "return sameSet(-low, -high)" },
  { name: 'intercepts: the (y, x) reading forgotten', find: "{ code: 'ordered-pair-reversed', holds: nearPair(X, 0, p) && nearPair(Y, q, 0) },", replace: '' },
  // Tools.
  { name: 'line features: a swap that is also a slope error is named', find: 'if (swapped && slopeCode) return [];', replace: '' },
  { name: 'inequalities: style judged on a wrong boundary', find: "if (!index || part.isCorrect !== true) continue;", replace: 'if (!index) continue;' },
  { name: 'number line: the complement read as a reversed ray', find: "sameEndpoint(want.min, got.max) && want.minClosed === got.maxClosed", replace: 'sameEndpoint(want.min, got.max)' },
  { name: 'number line: inclusion never compared', find: "return inclusionDiffers ? 'endpoint-inclusion-error' : null;", replace: 'return null;' },
  { name: 'relationship model: only the independent choice checked', find: 'values.independentId === dependent && values.dependentId === independent', replace: 'values.independentId === dependent' },
  // --- Phase 2 -----------------------------------------------------------------------
  // Table workbench.
  { name: 'table: the student\'s own Δx and Δy no longer checked', find: 'const ownDifferences = (close(dx, truth.dx) && close(dy, truth.dy)) || (close(dx, -truth.dx) && close(dy, -truth.dy));', replace: 'const ownDifferences = true;' },
  { name: 'table: click order (both differences negated) refused', find: ' || (close(dx, -truth.dx) && close(dy, -truth.dy));', replace: ';' },
  { name: 'table: a second wrong rate no longer blocks', find: 'if (inverted > 0 && !otherWrongRate)', replace: 'if (inverted > 0)' },
  { name: 'table: inverted rate computed as Δy/Δx', find: 'if (close(rate, truth.dx / truth.dy)) inverted += 1;', replace: 'if (close(rate, truth.dy / truth.dx)) inverted += 1;' },
  { name: 'table: the sign error working back no longer blocks', find: '...rows.map((row) => row.y + fit.m * row.x),', replace: '' },
  { name: 'table: "subtracted x instead of m·x" no longer blocks', find: '...rows.map((row) => row.y - row.x),', replace: '' },
  { name: 'table: the starting value named with a wrong slope', find: "if (fit && finite(fit.m) && finite(fit.b) && parts.get('slope')?.isCorrect === true", replace: 'if (fit && finite(fit.m) && finite(fit.b)' },
  { name: 'table: an earlier reading counts as a later one', find: 'rows.some((row) => row.x > 0 && close(row.y, typedB))', replace: 'rows.some((row) => row.x !== 0 && close(row.y, typedB))' },
  // Composition lab.
  { name: 'composition: one exchanged box is enough', find: "if (!close(typedFog, gof) || !close(typedGof, fog)) return [];", replace: "if (!close(typedFog, gof) && !close(typedGof, fog)) return [];" },
  { name: 'composition: other strategies no longer block', find: 'if (others.some((value) => close(value, typedFog) || close(value, typedGof))) return [];', replace: '' },
  { name: 'composition: near-equal compositions read', find: 'Math.abs(fog - gof) <= 2 * COMPOSITION_TOLERANCE) return [];', replace: 'Math.abs(fog - gof) <= 0) return [];' },
  // Relation mapping.
  { name: 'relation: only the domain box checked', find: 'return sameSet(typedDomain, range) && sameSet(typedRange, domain)', replace: 'return sameSet(typedDomain, range)' },
  { name: 'relation: a non-number token silently dropped', find: 'return numbers.every((number) => Number.isFinite(number)) ? numbers : null;', replace: 'return numbers.filter((number) => Number.isFinite(number));' },
  // Constructed graphs.
  { name: 'graph: the anchor no longer required', find: 'if (!anchors.some(({ point }) => Array.isArray(point) && onStudentLine(point.map(Number)))) return [];', replace: '' },
  { name: 'graph: a third point off the line ignored', find: 'if (!distinct.every(onStudentLine)) return [];', replace: '' },
  { name: 'graph: the −1/m blocker removed', find: "    { code: 'slope-sign-reversed', value: -m },\n    { code: null, value: ratio(-1, m) },", replace: "    { code: 'slope-sign-reversed', value: -m }," },
  // Data modeling.
  { name: 'data: a borderline association read', find: 'if (opposite && Math.abs(r) >= 0.2 &&', replace: 'if (opposite &&' },
  { name: 'data: a pre-selected direction read as chosen', find: "if (ownChoices && work.direction === opposite) {", replace: "if (work.direction === opposite) {" },
  { name: 'data: a correct chosen direction no longer contradicts a flipped r', find: ' && !(ownChoices && work.direction === key.direction)) {', replace: ') {' },
  { name: 'data: causation named where the key supports it', find: " && question?.causationSupported !== true && wrongPart(parts, 'association')", replace: " && wrongPart(parts, 'association')" },
  // Student-build inequalities.
  { name: 'build: style judged on a wrong boundary', find: 'if (!wrongPart(parts, id) || !status.rewriteVerified || !status.boundaryCorrect) return;', replace: 'if (!wrongPart(parts, id) || !status.rewriteVerified) return;' },
  { name: 'build: a shading point on the boundary read as a side', find: 'distanceToBoundaryLine(constraint, point[0], point[1]) > SHADE_CLEARANCE', replace: 'distanceToBoundaryLine(constraint, point[0], point[1]) > 0' },
  // Representations board.
  { name: 'representations: the reading-line blocker removed', find: '...(story ? [-values.readAmount / values.readTime, values.readAmount / values.readTime] : []),', replace: '' },
  { name: 'representations: the −d/n blocker removed', find: '      const blockers = [\n        -d / n,', replace: '      const blockers = [' },
  { name: 'representations: the later reading named with a wrong rate', find: "if (story && yWrong && parts.get('slope')?.isCorrect === true) {", replace: 'if (story && yWrong) {' },
  { name: 'representations: a reading equal to another story number named', find: ' && !others.some((value) => near(value, values.readAmount))', replace: '' },
  { name: 'representations: only the independent choice checked', find: "      && validateContextField(work.contextDependent, context.independentQuantity).valid) {", replace: ') {' },
  // The gate in front of everything.
  { name: 'correct work is classified', find: "if (!grading || grading.graded !== true || grading.isCorrect === true) return NONE;", replace: "if (!grading || grading.graded !== true) return NONE;" },
];

const fixtureFailures = (classify) => [
  ...MISCONCEPTION_FIXTURES.filter((fixture) => {
    try {
      return JSON.stringify(classifiedCodes(classify, fixture)) !== JSON.stringify([...fixture.expected].sort());
    } catch {
      return true;
    }
  }).map((fixture) => fixture.name),
  ...MISCONCEPTION_PROBES.filter((probe) => {
    try {
      return probe.holds(classify) !== true;
    } catch {
      return true;
    }
  }).map((probe) => probe.name),
];

test('the unmutated classifiers pass every fixture (the baseline the mutants are measured against)', () => {
  assert.deepEqual(fixtureFailures(classifyMisconceptions), []);
});

test('every mutant of the classifiers is killed by at least one fixture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-misconception-mutants-'));
  const survivors = [];
  const killedBy = {};
  try {
    for (const [index, mutant] of MUTANTS.entries()) {
      const occurrences = SOURCE.split(mutant.find).length - 1;
      assert.equal(occurrences, 1, `mutation no longer applies exactly once: ${mutant.name}`);
      const mutated = SOURCE.replace(mutant.find, mutant.replace).replace(/from '\.\//g, `from '${SHARED_URL}`);
      const file = join(dir, `mutant-${index}.mjs`);
      writeFileSync(file, mutated);
      const module = await import(pathToFileURL(file).href);
      const failures = fixtureFailures(module.classifyMisconceptions);
      if (!failures.length) survivors.push(mutant.name);
      killedBy[mutant.name] = failures;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(survivors, [], `surviving mutants: ${survivors.join('; ')}`);
  assert.equal(Object.keys(killedBy).length, MUTANTS.length);
});
