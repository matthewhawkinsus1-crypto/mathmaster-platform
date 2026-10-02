import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNANSWERED, isAnswered, yesNoAnswerMatches } from '../../src/tools/shared/judgmentChoices.js';
import {
  builderAsksGraphType, evaluateConstraint, normalizeBuilderModel, scoreConstraintModel,
} from '../../src/tools/constraintFunctionBuilder/constraintFunctionMath.js';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { TOOL_GRADING_DECLARATIONS } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A JUDGMENT THE STUDENT IS ASKED TO MAKE STARTS UNANSWERED, AND UNANSWERED IS
// NEVER CREDITED — by the tool's own check, by its server grader, anywhere.
//
// Several tools opened a choice on one of its own options: the systems
// workspace on "Exactly one solution", the data-modeling lab on "Positive" /
// "Moderate" / "association" / "linear" / "interpolation", the polynomial and
// parabola labs on "Yes", "crosses", "up", "Hole"… A student who never chose
// was credited whenever the default happened to be the answer, which for
// "Exactly one solution" is most systems. And three yes / no checks read a
// blank as "no". tests/browser/unansweredChoiceGates.mjs drives every one of
// them in a browser; this file holds the rule, the graders and the source.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

// --- The rule ----------------------------------------------------------------

test('unanswered is neither yes nor no', () => {
  for (const blank of [UNANSWERED, undefined, null, '  ', 'maybe']) {
    assert.equal(yesNoAnswerMatches(blank, true), false, `${JSON.stringify(blank)} read as yes`);
    assert.equal(yesNoAnswerMatches(blank, false), false, `${JSON.stringify(blank)} read as no`);
  }
  assert.equal(yesNoAnswerMatches('yes', true), true);
  assert.equal(yesNoAnswerMatches('no', false), true);
  assert.equal(yesNoAnswerMatches('yes', false), false);
  assert.equal(yesNoAnswerMatches('no', true), false);
  assert.equal(isAnswered(UNANSWERED), false);
  assert.equal(isAnswered(' '), false);
  assert.equal(isAnswered('one'), true);
});

// --- The constraint builder's graph type -------------------------------------

test('the builder graph type is unanswered when the question asks it, and an unanswered type meets no continuity constraint', () => {
  const continuity = { id: 'continuity', kind: 'continuity', value: 'continuous', label: 'Continuous graph' };
  assert.equal(builderAsksGraphType([continuity]), true);
  assert.equal(builderAsksGraphType([{ kind: 'domainMode', value: 'discrete' }]), true);
  assert.equal(builderAsksGraphType([{ kind: 'yIntercept', value: 2 }]), false);

  // Unanswered survives normalisation (every edit and every Undo runs through it)…
  const unanswered = normalizeBuilderModel({ family: 'linear', a: 1, k: 2, domainMode: UNANSWERED });
  assert.equal(unanswered.domainMode, UNANSWERED);
  assert.equal(evaluateConstraint(unanswered, continuity).isCorrect, false);
  assert.equal(evaluateConstraint(unanswered, { kind: 'domainMode', value: 'discrete' }).isCorrect, false);
  // …a chosen type is graded as before…
  assert.equal(evaluateConstraint({ ...unanswered, domainMode: 'continuous' }, continuity).isCorrect, true);
  assert.equal(scoreConstraintModel({ ...unanswered, domainMode: 'continuous' }, [continuity]).isCorrect, true);
  // …and a stored model from before the graph type was a question still reads
  // as continuous: nothing already saved changes meaning.
  assert.equal(normalizeBuilderModel({ family: 'linear', a: 1 }).domainMode, 'continuous');
  assert.equal(normalizeBuilderModel({ domainMode: 'discrete' }).domainMode, 'discrete');
});

// --- The server graders: an unanswered choice earns nothing --------------------

const dataModeling = (mode, extra = {}) => buildPrivateToolGrading({
  type: 'dataModelingLab', prompt: 'p', mode, points: [[1, 3], [2, 5], [3, 7], [4, 9]], correlationTolerance: 0.02, ...extra,
});
const grade = (privateGrading, raw) => gradePathResponse({ privateGrading, raw });

test('the data-modeling grader credits no unanswered judgment', () => {
  const correlation = dataModeling('correlation');
  for (const raw of [
    { r: 1, direction: UNANSWERED, strength: UNANSWERED },
    { r: 1 },
    { r: 1, direction: 'positive', strength: UNANSWERED },
    { r: 1, direction: UNANSWERED, strength: 'strong' },
  ]) {
    const result = grade(correlation, raw);
    assert.equal(result.rejected, false);
    assert.equal(result.parts.correlationInterpretation, false, JSON.stringify(raw));
    assert.equal(result.isCorrect, false, JSON.stringify(raw));
  }
  assert.equal(grade(correlation, { r: 1, direction: 'positive', strength: 'strong' }).isCorrect, true, 'answered right is credited');

  // r near zero: "No clear direction" / "None" are real answers, blank is not.
  const flat = buildPrivateToolGrading({ type: 'dataModelingLab', prompt: 'p', mode: 'correlation', points: [[1, 1], [2, 3], [3, 2], [4, 3], [5, 1]] });
  assert.equal(flat.definition.descriptor.direction, 'none');
  assert.equal(grade(flat, { r: flat.definition.r, direction: UNANSWERED, strength: UNANSWERED }).parts.correlationInterpretation, false);

  const full = dataModeling('full', { expectedModel: 'linear', predictionX: 2.5 });
  const right = { m: 2, b: 1, r: 1, direction: 'positive', strength: 'strong', causation: 'association', modelChoice: 'linear', predictionX: 2.5, predictionY: 6, predictionType: 'interpolation' };
  assert.equal(grade(full, right).isCorrect, true, 'the control: every judgment answered right');
  for (const [field, part] of [['causation', 'association'], ['modelChoice', 'modelChoice'], ['predictionType', 'prediction']]) {
    for (const blank of [UNANSWERED, undefined]) {
      const result = grade(full, { ...right, [field]: blank });
      assert.equal(result.parts[part], false, `${field} ${JSON.stringify(blank)} earned ${part}`);
      assert.equal(result.isCorrect, false);
    }
  }
});

test('the systems grader never grades an unclassified response, or a blank inequality choice', () => {
  const linear = buildPrivateToolGrading({ type: 'systemsWorkspace', mode: 'linear', prompt: 'p', system: { m1: 2, b1: 1, m2: -1, b2: 7 } });
  const matrix3 = buildPrivateToolGrading({ type: 'systemsWorkspace', mode: 'matrix3', prompt: 'p', matrix: { rows: [[1, 1, 1, 6], [1, -1, 1, 2], [2, 1, -1, 1]] } });
  for (const [privateGrading, raw] of [
    [linear, { x: '2', y: '5', classification: UNANSWERED }],
    [linear, { x: '2', y: '5' }],
    [matrix3, { classification: UNANSWERED, x: 1, y: 2, z: 3, technologyUsed: true }],
  ]) {
    const result = grade(privateGrading, raw);
    assert.equal(result.rejected, true, `${JSON.stringify(raw)} was graded`);
    assert.equal(result.isCorrect, false);
  }
  assert.equal(grade(linear, { x: '2', y: '5', classification: 'one' }).isCorrect, true);
  assert.equal(grade(matrix3, { classification: 'one', x: 1, y: 2, z: 3, technologyUsed: true }).isCorrect, true);

  // The marked point (5, 1) is outside y ≥ x, y < -x + 4, so "no" is right.
  const analyze = buildPrivateToolGrading({ type: 'systemsWorkspace', mode: 'inequalities', prompt: 'p', inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }], testPoint: { x: 5, y: 1 } });
  assert.equal(grade(analyze, { testChoice: UNANSWERED, candidate: { x: 0, y: 2 } }).rejected, true, 'a blank test-point answer is not "no"');
  assert.equal(grade(analyze, { testChoice: 'no', candidate: { x: 0, y: 2 } }).isCorrect, true);
  const construct = buildPrivateToolGrading({ type: 'systemsWorkspace', mode: 'inequalities', prompt: 'p', interaction: 'construct', inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }] });
  const built = [
    { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], boundaryStyle: 'solid', shade: 'above' },
    { points: [{ x: 0, y: 4 }, { x: 1, y: 3 }], boundaryStyle: 'dashed', shade: 'below' },
  ];
  assert.equal(grade(construct, { construction: built }).isCorrect, true);
  for (const field of ['boundaryStyle', 'shade']) {
    const blank = built.map((entry, index) => (index === 1 ? { ...entry, [field]: UNANSWERED } : entry));
    assert.equal(grade(construct, { construction: blank }).rejected, true, `a blank ${field} was graded`);
  }
});

// The assignment server grades a registry tool's raw work with the tool's
// shared grader (functions/shared/serverGrading/tools/) — the same function
// the tool's own Check runs. An unanswered judgment must earn nothing there
// either: not complete (a deadline never submits it as an answer) and not
// right, even where the choice it used to open on is the answer.
const serverGrade = (question, work) => gradeServerResponse({
  question,
  response: JSON.parse(JSON.stringify(buildToolResponse({
    question,
    toolId: question.type,
    contractVersion: TOOL_GRADING_DECLARATIONS[question.type].contractVersion,
    work,
  }))),
});

test('the shared graders the assignment server runs credit no unanswered judgment', () => {
  const cases = [
    // Positive, moderate data: "positive" / "moderate" / "association" were the old defaults and the answer.
    ['data modeling association', { type: 'dataModelingLab', mode: 'association', points: [[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 3], [7, 5]] },
      { direction: 'positive', strength: 'moderate', causation: 'association' }, ['direction', 'strength', 'causation']],
    ['data modeling model family', { type: 'dataModelingLab', mode: 'modelCompare', points: [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]] },
      { modelChoice: 'linear' }, ['modelChoice']],
    // A linear f needs no restriction: the old hidden default was the answer.
    ['inverse restriction', { type: 'inverseCompositionLab', mode: 'restriction' },
      { x: 2, inverseAnswer: '2', restrictionChoice: 'none' }, ['restrictionChoice']],
    // P = (3, 4) is off the parabola x² = 4y: "no" is right, and a blank used to read as "no".
    ['parabola on the curve', { type: 'parabolaGeometryLab', mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 4] },
      { focusDistance: '4.243', directrixDistance: '5', onCurve: 'no' }, ['onCurve']],
    ['parabola opening', { type: 'parabolaGeometryLab', mode: 'equation' }, { coefficient: '6', opening: 'up' }, ['opening']],
    // (x − 4) is not a factor of x² − 5x + 6: "no" is right, and a blank used to read as "no".
    ['polynomial factor', { type: 'polynomialWorkshop', mode: 'factorZero', candidateRoot: 4 }, { value: '2', factorChoice: 'no' }, ['factorChoice']],
    ['polynomial graph', { type: 'polynomialWorkshop', mode: 'graphConnection', roots: [{ root: 1, multiplicity: 1 }, { root: 2, multiplicity: 1 }] },
      { behavior: 'crosses', end: 'both ends rise' }, ['behavior', 'end']],
    ['polynomial rational feature', { type: 'polynomialWorkshop', mode: 'rationalFeatures', targetValue: 2 }, { choice: 'hole' }, ['choice']],
  ];
  for (const [label, question, answered, judgments] of cases) {
    assert.equal(serverGrade(question, answered).isCorrect, true, `${label}: the control, answered, is right`);
    for (const field of judgments) {
      const result = serverGrade(question, { ...answered, [field]: UNANSWERED });
      assert.equal(result.graded, true, `${label}: graded`);
      assert.equal(result.isCorrect, false, `${label}: an unanswered ${field} was credited`);
      assert.equal(result.isComplete, false, `${label}: an unanswered ${field} is not finished work`);
    }
  }
  // The constraint builder: an unanswered graph type meets no continuity constraint.
  const builder = { type: 'constraintFunctionBuilder', constraints: [{ kind: 'continuity', value: 'continuous' }] };
  const model = (domainMode) => ({ model: { family: 'linear', a: 2, h: 0, k: 1, base: 2, domainMode, domainMin: -4, domainMax: 4, verticalX: 0 }, hasEdited: true });
  assert.equal(serverGrade(builder, model('continuous')).isCorrect, true);
  assert.equal(serverGrade(builder, model(UNANSWERED)).isCorrect, false, 'an unanswered graph type was read as continuous');
});

// --- The tools: every judgment control starts unanswered -----------------------

const TOOL_FILES = (() => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.jsx?$/.test(name)) files.push(path.relative(ROOT, full));
  });
  walk(path.join(ROOT, 'src/tools'));
  return files;
})();

// Controls that LOOK like a judgment but are not one: an operation applied to
// both sides of an equation is a move, judged by the equation it produces;
// choosing it earns nothing on its own. Every entry needs that reason.
const NOT_A_JUDGMENT = new Map([
  ['src/tools/inverseComposition/InverseDerivationLab.jsx:operation', 'a balanced move: graded by the equation it produces'],
  ['src/tools/stepAlgebra2/StepAlgebra2.jsx:operation', 'a balanced move: graded by the equation it produces'],
  ['src/tools/stepAlgebra2/LinearIntercepts.jsx:operation', 'a balanced move: graded by the equation it produces'],
]);

const declaredDefault = (source, name) => {
  const match = source.match(new RegExp(`const \\[${name}, set\\w+\\] = usePersistentToolState\\('\\w+', ([^)]*?)\\)`));
  return match ? match[1].trim() : null;
};
const UNANSWERED_DEFAULTS = new Set(['UNANSWERED', "''", '""', 'null']);

test('every <select> a registry tool binds to its own state starts unanswered', () => {
  const checked = [];
  TOOL_FILES.forEach((file) => {
    const source = executableSource(read(file));
    for (const [, name] of source.matchAll(/<select\b[^>]*?\bvalue=\{(\w+)\}/g)) {
      const fallback = declaredDefault(source, name);
      if (fallback === null) continue; // not tool state (a prop, a derived value)
      checked.push(`${file}:${name}`);
      if (NOT_A_JUDGMENT.has(`${file}:${name}`)) continue;
      assert.ok(UNANSWERED_DEFAULTS.has(fallback), `${file}: the "${name}" choice opens on ${fallback}, not unanswered`);
    }
  });
  // The audit must actually be reading the tools it is about.
  ['dataModeling/DataModelingLab.jsx:direction', 'systemsWorkspace/SystemsWorkspace.jsx:classification',
    'parabolaGeometry/ParabolaGeometryLab.jsx:onCurve', 'polynomialWorkshop/PolynomialWorkshop.jsx:factorChoice',
    'inverseComposition/InverseCompositionLab.jsx:restrictionChoice'].forEach((entry) => {
    assert.ok(checked.includes(`src/tools/${entry}`), `the audit no longer reaches ${entry}`);
  });
  NOT_A_JUDGMENT.forEach((reason, entry) => assert.ok(checked.includes(entry), `stale exemption ${entry}`));
});

test('a model family is not chosen for the student, and neither is a modelling inequality symbol', () => {
  const lab = executableSource(read('src/tools/dataModeling/DataModelingLab.jsx'));
  assert.match(lab, /checked=\{modelChoice===entry\.id\}/, 'the model-family radios read modelChoice');
  assert.equal(declaredDefault(lab, 'modelChoice'), 'UNANSWERED');
  const systems = executableSource(read('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
  assert.match(region(systems, 'const emptyModelingEntry', ';'), /relation: UNANSWERED/);
});

test('no tool reads a blank yes / no answer as "no"', () => {
  TOOL_FILES.filter((file) => !file.endsWith('judgmentChoices.js')).forEach((file) => {
    assert.doesNotMatch(
      executableSource(read(file)),
      /\(\s*[\w.]+\s*===\s*'yes'\s*\)\s*===/,
      `${file} compares (choice === 'yes') with the truth without asking whether the choice was made — use yesNoAnswerMatches`,
    );
  });
});

test('the systems workspace sends no classification-less response, as its grader refuses one', () => {
  const systems = executableSource(read('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
  const linear = region(systems, 'function LinearMode', 'function InequalityMode', 'LinearMode');
  const matrix = region(systems, 'function MatrixMode', 'export default function SystemsWorkspace', 'MatrixMode');
  const classic = region(systems, 'function ClassicInequalityMode', 'function StudentBuildInequalityMode', 'ClassicInequalityMode');
  for (const [label, mode] of [['linear', linear], ['matrix', matrix]]) {
    assert.match(region(mode, 'const check = () => {', 'gradeToolCheck(', `${label} check`), /if \(!classified\b/, `${label}: Check returns before an unclassified response is sent`);
    assert.match(mode, /usePersistentToolState\('classification', UNANSWERED\)/, `${label}: the classification opens unanswered`);
    // Undo back to the start restores "unanswered", not "Exactly one solution".
    assert.match(mode, /setClassification\(value\?\.classification \|\| UNANSWERED\)/, `${label}: Undo restores unanswered`);
  }
  assert.match(region(classic, 'const check = () => {', 'gradeToolCheck(', 'classic check'), /if \(!choicesMade\) return;/);
});
