import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import constraintFunctionGrader from '../../functions/shared/serverGrading/tools/constraintFunctionBuilder.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/constraintFunctionBuilder.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  BUILDER_FAMILIES,
  builderEquation,
  effectiveBuilderConstraints,
  initialBuilderModel,
  normalizeBuilderModel,
  scoreConstraintModel,
} from '../../functions/shared/toolMath/constraintFunctionBuilder/constraintFunctionMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { applyStudentSupportToQuestion } from '../../src/studentSupport.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * THE CONSTRAINT-BASED FUNCTION BUILDER IS MARKED BY ONE SHARED GRADER.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts — and that verdict is
 * the screen's own: one part per constraint, correct only when all hold,
 * score = satisfied / total.
 */

const COMPONENT = 'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'constraintFunctionBuilder';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(constraintFunctionGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};

const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

// The builder's own work: its normalized model, whether the student has made a
// choice yet, and the equation it shows.
const built = (fields, hasEdited = true) => {
  const model = normalizeBuilderModel(fields);
  return { model, hasEdited, equation: builderEquation(model) };
};

const DECAY = [
  { kind: 'family', value: 'exponential' },
  { kind: 'continuity', value: 'continuous' },
  { kind: 'behavior', value: 'decreasing' },
];

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

test('the builder\'s single view is declared shared-server, contract v1', () => {
  assert.equal(GRADING_MANIFEST.constraintFunctionBuilder, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.deepEqual(Object.keys(declaration.modes), ['default']);
  assert.equal(declaration.modes.default.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(declaration.modes.default.blocker, null);
  assert.deepEqual(Object.keys(constraintFunctionGrader.modeGraders), ['default']);
  assert.deepEqual([...constraintFunctionGrader.problems], []);
});

test('every question renders the one builder view, whatever its mode says', () => {
  // The screen never reads a mode.
  const body = region(code, 'export default function ConstraintFunctionBuilder', '\n  return (', 'component');
  assert.doesNotMatch(body, /\.mode\b/, 'ConstraintFunctionBuilder.jsx does not route on question.mode');
  for (const mode of [undefined, '', 'default', 'compare', ' default ', 5, ['default'], 'constructor', 'toString', '__proto__']) {
    assert.equal(resolveToolMode(declaration, q({ mode })), 'default', JSON.stringify(mode));
  }
  const result = grade(q({ mode: 'constructor', constraints: DECAY }), built({ family: 'exponential', a: 3, base: 0.5 }));
  assert.equal(result.mode, 'default');
  assert.equal(result.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

test('the builder grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import constraintFunctionGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/constraintFunctionBuilder\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const body = region(code, 'export default function ConstraintFunctionBuilder', '\n  return (', 'component');
  assert.match(body, /const work = useMemo\(\(\) => \(\{ model, hasEdited, equation: builderEquation\(model\) \}\), \[model, hasEdited\]\);/);
  assert.match(body, /useReportToolWork\(work\);/);
  const check = region(body, 'const check = () => {', '\n  };', 'check');
  assert.match(check, /if \(!hasEdited\) return;/, 'an untouched model still cannot be submitted');
  assert.match(check, /const result = gradeToolCheck\(constraintFunctionGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'default', parts: result\.parts \}\);/);
  assert.doesNotMatch(check, /scoreConstraintModel|effectiveConstraints|evaluateConstraint/, 'the Check computes no verdict of its own');
});

test('the screen sets itself up from the same shared definitions the grader reads', () => {
  const body = region(code, 'export default function ConstraintFunctionBuilder', '\n  return (', 'component');
  assert.match(body, /const allowedFamilies = builderAllowedFamilies\(questionData\);/);
  assert.match(body, /const initial = initialBuilderModel\(questionData\);/);
  // The live checklist reads those constraints; no inline copy of the rewrite.
  assert.match(body, /const liveScore = scoreConstraintModel\(model, effectiveConstraints\);/);
  assert.doesNotMatch(body, /quadrant\\s\*|BUILDER_FAMILIES\.includes/, 'no second copy of the quadrant rewrite or the family filter');
});

/*
 * The question the checklist is built from, exactly as the component builds
 * it: the argument the screen passes to effectiveBuilderConstraints, read from
 * its source and evaluated against a question. Asserting what that expression
 * PRODUCES (not how it is spelled) is what keeps a translated student's
 * checklist on the authored wording.
 */
const checklistQuestion = (() => {
  const body = region(code, 'export default function ConstraintFunctionBuilder', '\n  return (', 'component');
  const memo = region(body, 'const effectiveConstraints = useMemo(', '\n  );', 'checklist constraints');
  const open = memo.indexOf('effectiveBuilderConstraints(');
  assert.notEqual(open, -1, 'the checklist is built by the shared effectiveBuilderConstraints');
  let depth = 0;
  let end = -1;
  for (let index = open + 'effectiveBuilderConstraints'.length; index < memo.length; index += 1) {
    if (memo[index] === '(') depth += 1;
    if (memo[index] === ')') depth -= 1;
    if (depth === 0) { end = index; break; }
  }
  assert.notEqual(end, -1, 'the effectiveBuilderConstraints call closes');
  const argument = memo.slice(open + 'effectiveBuilderConstraints('.length, end).trim();
  // eslint-disable-next-line no-new-func
  const build = new Function('questionData', `return (${argument});`);
  build.argument = argument;
  build.deps = memo.slice(memo.lastIndexOf('['));
  return build;
})();

test('the checklist recomputes whenever a field it reads changes', () => {
  const fields = [...checklistQuestion.argument.matchAll(/questionData\.(\w+)/g)].map(([, field]) => field);
  assert.ok(fields.includes('authoredPrompt'), 'the checklist reads the authored wording');
  for (const field of fields) {
    assert.match(checklistQuestion.deps, new RegExp(`questionData\\.${field}\\b`), `the memo depends on ${field}`);
  }
});

/* ------------------------------------------------------------------ */
/* grading                                                             */
/* ------------------------------------------------------------------ */

test('there is no one secret equation: many different models satisfy the constraints', () => {
  for (const fields of [
    { family: 'exponential', a: 3, base: 0.5, h: 0, k: 0, domainMode: 'continuous' },
    { family: 'exponential', a: -2, base: 3, h: 1, k: 4, domainMode: 'continuous' },
    { family: 'exponential', a: 0.25, base: 0.1, h: -6, k: -5 },
  ]) {
    const result = grade(q({ constraints: DECAY }), built(fields));
    assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: true, isComplete: true, score: 1 }, JSON.stringify(fields));
    assert.deepEqual(result.parts.map((part) => part.id), ['family', 'continuity', 'behavior']);
  }
});

test('a model that misses constraints earns the share it satisfies', () => {
  const growth = grade(q({ constraints: DECAY }), built({ family: 'exponential', a: 3, base: 2 }));
  assert.equal(growth.isCorrect, false);
  assert.equal(growth.score, 2 / 3);
  assert.deepEqual(failedIds(growth), ['behavior']);

  const line = grade(q({ constraints: DECAY }), built({ family: 'linear', a: -1, k: 2, domainMode: 'discrete' }));
  assert.equal(line.score, 1 / 3);
  assert.deepEqual(failedIds(line), ['family', 'continuity']);

  // A zero leading coefficient is not the family the dropdown says.
  const flat = grade(q({ constraints: [{ kind: 'family', value: 'quadratic' }] }), built({ family: 'quadratic', a: 0, h: 2, k: 4 }));
  assert.equal(flat.isCorrect, false);
  assert.equal(flat.score, 0);
});

test('a discrete quadratic minimum, a vertical line, and equivalent point forms', () => {
  const discrete = [
    { kind: 'family', value: 'quadratic' },
    { kind: 'continuity', value: 'discrete' },
    { kind: 'extremum', value: 'minimum' },
    { kind: 'isFunction', value: true },
  ];
  assert.equal(grade(q({ constraints: discrete }), built({ family: 'quadratic', a: 2, h: -1, k: 7, domainMode: 'discrete' })).isCorrect, true);
  assert.equal(grade(q({ constraints: discrete }), built({ family: 'quadratic', a: -2, h: -1, k: 7, domainMode: 'discrete' })).score, 0.75);

  const vertical = [
    { kind: 'continuity', value: 'continuous' },
    { kind: 'straightLine', value: true },
    { kind: 'isFunction', value: false },
    { kind: 'xIntercept', value: 3 },
  ];
  assert.equal(grade(q({ constraints: vertical }), built({ family: 'verticalLine', verticalX: 3 })).isCorrect, true);
  assert.equal(grade(q({ constraints: vertical }), built({ family: 'verticalLine', verticalX: 2.9 })).score, 0.75);

  for (const point of [{ x: 2, y: 5 }, [2, 5]]) {
    const result = grade(q({ constraints: [{ kind: 'passesThrough', point }] }), built({ family: 'linear', a: 2, k: 1 }));
    assert.equal(result.isCorrect, true, JSON.stringify(point));
  }
  // within the constraint's tolerance (0.05 unless authored)
  assert.equal(grade(q({ constraints: [{ kind: 'passesThrough', point: [2, 5.04] }] }), built({ family: 'linear', a: 2, k: 1 })).isCorrect, true);
  assert.equal(grade(q({ constraints: [{ kind: 'passesThrough', point: [2, 5.2] }] }), built({ family: 'linear', a: 2, k: 1 })).isCorrect, false);
  assert.equal(grade(q({ constraints: [{ kind: 'passesThrough', point: [2, 5.2], tolerance: 0.25 }] }), built({ family: 'linear', a: 2, k: 1 })).isCorrect, true);
  for (const value of ['IV', 'iv', 4, '4']) {
    assert.equal(grade(q({ constraints: [{ kind: 'vertexQuadrant', value }] }), built({ family: 'absolute', a: 1, h: 2, k: -1 })).isCorrect, true, JSON.stringify(value));
  }
});

test('a task that only names a quadrant checks the quadrant, not a hidden exact vertex', () => {
  const constraints = [{ kind: 'vertex', point: { x: 4, y: -3 } }];
  const quadrantOnly = q({ prompt: 'Build a parabola whose vertex is in Quadrant IV.', constraints });
  const anywhereInIV = grade(quadrantOnly, built({ family: 'quadratic', a: 1, h: 2, k: -1 }));
  assert.equal(anywhereInIV.isCorrect, true);
  assert.equal(anywhereInIV.parts[0].label, 'Vertex in Quadrant IV');
  assert.equal(grade(quadrantOnly, built({ family: 'quadratic', a: 1, h: -2, k: -1 })).isCorrect, false, 'Quadrant III is not IV');

  // A task that names the point means the point.
  const exact = q({ prompt: 'Build a parabola with vertex (4, -3) in quadrant IV.', constraints });
  assert.equal(grade(exact, built({ family: 'quadratic', a: 1, h: 2, k: -1 })).isCorrect, false);
  assert.equal(grade(exact, built({ family: 'quadratic', a: 1, h: 4, k: -3 })).isCorrect, true);
  // No quadrant at all: the authored vertex.
  assert.equal(grade(q({ constraints }), built({ family: 'quadratic', a: 1, h: 2, k: -1 })).isCorrect, false);
});

/*
 * SUPPORT INVARIANCE: A TRANSLATED STUDENT IS MARKED ON THE AUTHORED WORDING.
 *
 * A translation support replaces `prompt` on the device and keeps the
 * authored text as `authoredPrompt` (src/studentSupport.js). The server only
 * holds the authored question. The quadrant rewrite must read the authored
 * text on BOTH sides, or a Spanish-reading student's "cuadrante IV" would keep
 * the exact hidden vertex the English task never gave anyone.
 */
const QUADRANT_TASK = q({
  prompt: 'Build a parabola that opens upward with its vertex in Quadrant IV.',
  constraints: [{ kind: 'vertex', point: { x: 4, y: -3 } }, { kind: 'extremum', value: 'minimum' }],
  translations: { es: { prompt: 'Construye una parábola que abra hacia arriba con su vértice en el cuadrante IV.' } },
});
const translatedFor = (question, translationLanguage = 'es') => applyStudentSupportToQuestion(question, { translationLanguage }).question;

test('a Spanish-translated quadrant question grades exactly like the English one, on the device and on the server', () => {
  const spanish = translatedFor(QUADRANT_TASK);
  assert.match(spanish.prompt, /cuadrante IV/, 'the device shows the translation');
  assert.equal(spanish.authoredPrompt, QUADRANT_TASK.prompt, 'and keeps the authored wording beside it');
  for (const fields of [
    { family: 'quadratic', a: 1, h: 2, k: -1 }, // anywhere in Quadrant IV, not the hidden (4, -3)
    { family: 'quadratic', a: 1, h: 4, k: -3 },
    { family: 'quadratic', a: 1, h: -2, k: -1 }, // Quadrant III
    { family: 'quadratic', a: -1, h: 2, k: -1 }, // opens downward
    { family: 'absolute', a: 2, h: 0.5, k: -0.5 },
  ]) {
    const work = built(fields);
    const english = grade(QUADRANT_TASK, work);
    // The browser grades the translated instance it shows…
    const device = gradeToolCheck(constraintFunctionGrader, spanish, work);
    // …and the server grades the authored question from the bytes it sent.
    const server = gradeServerResponse({ question: QUADRANT_TASK, response: JSON.parse(JSON.stringify(device.toolResponse)) });
    for (const result of [device, server]) {
      assert.deepEqual(
        { isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score, parts: result.parts },
        { isCorrect: english.isCorrect, isComplete: english.isComplete, score: english.score, parts: english.parts },
        JSON.stringify(fields),
      );
    }
    // The live checklist the translated student sees is the same one.
    assert.deepEqual(
      scoreConstraintModel(work.model, effectiveBuilderConstraints(checklistQuestion(spanish))).parts.map((part) => [part.label, part.isCorrect]),
      english.parts.map((part) => [part.label, part.isCorrect]),
      `checklist ${JSON.stringify(fields)}`,
    );
  }
  assert.equal(grade(QUADRANT_TASK, built({ family: 'quadratic', a: 1, h: 2, k: -1 })).isCorrect, true, 'the quadrant, not the hidden point');

  // DISCRIMINATION: reading the translated wording instead would keep the
  // exact vertex and mark the same model wrong — what this test exists to stop.
  const translationOnly = { ...spanish, authoredPrompt: undefined };
  assert.equal(gradeToolCheck(constraintFunctionGrader, translationOnly, built({ family: 'quadratic', a: 1, h: 2, k: -1 })).isCorrect, false);
});

test('an authored question with no prompt is never marked on a translation\'s wording', () => {
  // The authored task has no prompt at all; only its French translation names
  // a quadrant ("quadrant IV" — which the rewrite WOULD match). The exact
  // authored vertex is what is checked, on the device and on the server.
  const authored = q({ constraints: [{ kind: 'vertex', point: [4, -3] }], translations: { fr: { prompt: 'Le sommet est dans le quadrant IV.' } } });
  const french = translatedFor(authored, 'fr');
  assert.equal(french.authoredPrompt, null, 'the authored question had no prompt');
  const work = built({ family: 'quadratic', a: 1, h: 2, k: -1 });
  const device = gradeToolCheck(constraintFunctionGrader, french, work);
  const server = gradeServerResponse({ question: authored, response: JSON.parse(JSON.stringify(device.toolResponse)) });
  assert.equal(server.isCorrect, false, 'the server checks the authored exact vertex');
  assert.equal(device.isCorrect, false, 'and so does the device');
  assert.deepEqual(device.parts, server.parts);
  assert.deepEqual(effectiveBuilderConstraints(checklistQuestion(french)), effectiveBuilderConstraints(authored));
  // DISCRIMINATION: the French wording alone would be rewritten to the quadrant.
  assert.equal(effectiveBuilderConstraints({ ...french, authoredPrompt: undefined })[0].kind, 'vertexQuadrant');
});

test('the grader marks exactly what the live checklist shows for a constructed model', () => {
  const question = q({
    prompt: 'Vertex in quadrant 2, opening downward, crossing the y-axis at 3.',
    constraints: [
      { kind: 'vertex', point: [-1, 4] },
      { kind: 'extremum', value: 'maximum' },
      { kind: 'yIntercept', value: 3 },
      { id: 'through', kind: 'passesThrough', point: { x: 1, y: 0 } },
    ],
  });
  for (const fields of [
    { family: 'quadratic', a: -1, h: -1, k: 4 },
    { family: 'quadratic', a: -0.5, h: -2, k: 5 },
    { family: 'absolute', a: 1, h: -1, k: 4 },
    { family: 'linear', a: 2, k: 3 },
  ]) {
    const work = built(fields);
    const checklist = scoreConstraintModel(work.model, effectiveBuilderConstraints(checklistQuestion(question)));
    const result = grade(question, work);
    assert.deepEqual(result.parts.map((part) => part.isCorrect), checklist.parts.map((part) => part.isCorrect), JSON.stringify(fields));
    assert.equal(result.isCorrect, checklist.isCorrect);
    assert.equal(result.score, checklist.isCorrect ? 1 : checklist.score);
  }
});

test('untouched work is incomplete and earns nothing, even when the opening model fits', () => {
  // The builder opens on a continuous model; this question asks only for that.
  const question = q({ constraints: [{ kind: 'continuity', value: 'continuous' }] });
  const opening = { model: initialBuilderModel(question), equation: builderEquation(initialBuilderModel(question)) };
  const untouched = grade(question, { ...opening, hasEdited: false });
  assert.deepEqual({ isCorrect: untouched.isCorrect, isComplete: untouched.isComplete, score: untouched.score }, { isCorrect: false, isComplete: false, score: 0 });
  // One real choice makes it the student's model.
  const chosen = grade(question, { ...opening, hasEdited: true });
  assert.deepEqual({ isCorrect: chosen.isCorrect, isComplete: chosen.isComplete, score: chosen.score }, { isCorrect: true, isComplete: true, score: 1 });
  // Only a real `true` counts.
  for (const hasEdited of ['true', 1, null, undefined]) {
    assert.equal(grade(question, { ...opening, hasEdited }).isComplete, false, JSON.stringify(hasEdited));
  }
  // No part of an untouched model is the student's either: the recorded part
  // grades say "not done", never a tick for a constraint the opening model
  // happens to meet.
  assert.deepEqual(untouched.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['continuity', false, false]]);
  assert.deepEqual(chosen.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['continuity', true, true]]);
});

test('the builder opens on a collapsed model unless the question authors one', () => {
  // An open-construction question never opens on a valid answer: a zero
  // leading coefficient is not yet any family the student must build.
  const families = [{ kind: 'family', value: 'quadratic' }];
  const opening = initialBuilderModel(q({ allowedFamilies: ['quadratic'], constraints: families }));
  assert.deepEqual([opening.family, opening.a, opening.h, opening.k], ['quadratic', 0, 0, 0]);
  assert.equal(scoreConstraintModel(opening, families).isCorrect, false);
  assert.equal(initialBuilderModel(q()).family, 'linear');
  assert.equal(initialBuilderModel(q()).a, 0);
  // An authored opening model is used as written.
  const authored = initialBuilderModel(q({ allowedFamilies: ['quadratic'], initialModel: { family: 'absolute', a: 2, h: 1 } }));
  assert.deepEqual([authored.family, authored.a, authored.h, authored.k], ['absolute', 2, 1, 0]);
});

test('a model in a family the question never offered is not the student\'s work', () => {
  const question = q({ allowedFamilies: ['quadratic', 'absolute'], constraints: [{ kind: 'extremum', value: 'minimum' }, { kind: 'isFunction', value: true }] });
  assert.equal(grade(question, built({ family: 'quadratic', a: 1 })).isCorrect, true);
  const forged = grade(question, built({ family: 'linear', a: 1, k: 0 }));
  assert.deepEqual({ isCorrect: forged.isCorrect, isComplete: forged.isComplete, score: forged.score }, { isCorrect: false, isComplete: false, score: 0 });
  // A line IS a function, but a forged model earns no part either.
  assert.deepEqual(forged.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['extremum', false, false], ['isFunction', false, false]]);
  const unknown = grade(question, { ...built({ family: 'quadratic', a: 1 }), model: { ...built({ family: 'quadratic', a: 1 }).model, family: 'cubic' } });
  assert.equal(unknown.isComplete, false);
  // The family an authored initialModel opens on is on screen too.
  const opensElsewhere = q({ allowedFamilies: ['quadratic'], initialModel: { family: 'absolute', a: 0 }, constraints: [{ kind: 'extremum', value: 'minimum' }] });
  assert.equal(grade(opensElsewhere, built({ family: 'absolute', a: 2 })).isCorrect, true);
  assert.equal(grade(opensElsewhere, built({ family: 'exponential', a: 2 })).isComplete, false);
  // Unauthored allowedFamilies offers every family.
  for (const family of BUILDER_FAMILIES) {
    assert.equal(grade(q({ constraints: [{ kind: 'family', value: family }] }), built({ family, a: 1 })).isCorrect, true, family);
  }
});

test('a question with no constraints can never be correct, exactly as on screen', () => {
  const result = grade(q(), built({ family: 'linear', a: 1 }));
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  assert.deepEqual(result.parts, []);
});

test('two constraints of the same kind get distinct part ids', () => {
  const question = q({ constraints: [
    { kind: 'passesThrough', point: [0, 1] },
    { kind: 'passesThrough', point: [1, 3] },
    { kind: 'passesThrough', point: [2, 6] },
    { id: 'passesThrough-2', kind: 'yIntercept', value: 1 },
  ] });
  const result = grade(question, built({ family: 'linear', a: 2, k: 1 }));
  const ids = result.parts.map((part) => part.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['passesThrough', 'passesThrough-2', 'passesThrough-3', 'passesThrough-2-2']);
  assert.equal(result.score, 0.75);
  assert.deepEqual(failedIds(result), ['passesThrough-3']);
});

/* ------------------------------------------------------------------ */
/* tampered and malformed work                                         */
/* ------------------------------------------------------------------ */

test('injected verdicts and answer keys are dropped and change nothing', () => {
  const wrong = built({ family: 'linear', a: 1 });
  const injected = { ...wrong, isCorrect: true, score: 1, checks: [true, true, true], expected: { family: 'exponential' }, answerKey: 'f(x)=0.5^x', feedback: 'All constraints satisfied' };
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['answerKey', 'checks', 'expected', 'feedback', 'isCorrect', 'score']);
  const clean = grade(q({ constraints: DECAY }), wrong);
  const tampered = grade(q({ constraints: DECAY }), injected);
  assert.equal(tampered.isCorrect, false);
  assert.deepEqual({ ...tampered, toolResponse: null }, { ...clean, toolResponse: null });
  // The display equation is never read: a lying one changes nothing.
  const lying = grade(q({ constraints: DECAY }), { ...wrong, equation: 'f(x) = 3(0.5)^(x)' });
  assert.equal(lying.isCorrect, false);
});

test('a malformed model is incomplete, wrong types are normalized as the builder does, and non-object work is not graded', () => {
  for (const model of [null, [], 'exponential', 7]) {
    const result = grade(q({ constraints: DECAY }), { model, hasEdited: true });
    assert.equal(result.graded, true);
    assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: false, isComplete: false, score: 0 }, JSON.stringify(model));
  }
  // Non-numeric parameters fall back exactly as normalizeBuilderModel does on screen.
  const normalized = grade(q({ constraints: DECAY }), { model: { family: 'exponential', a: 'abc', base: 'half', h: null, k: [] }, hasEdited: true });
  assert.equal(normalized.isCorrect, false, 'a = 1, base = 2 is growth, not decay');
  assert.equal(normalized.score, 2 / 3);
  for (const work of [null, [], 'model', 3]) {
    const result = grade(q({ constraints: DECAY }), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
  }
});

test('oversize work is not graded, on either side', () => {
  const work = { ...built({ family: 'exponential', a: 3, base: 0.5 }), padding: Array.from({ length: 40 }, () => 'x'.repeat(900)) };
  const result = grade(q({ constraints: DECAY }), work);
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
});

/* ------------------------------------------------------------------ */
/* discrimination and bounds                                           */
/* ------------------------------------------------------------------ */

test('right work against an altered key is wrong', () => {
  const work = built({ family: 'quadratic', a: -1, h: 2, k: 3 });
  const key = [{ kind: 'vertex', point: [2, 3] }, { kind: 'extremum', value: 'maximum' }, { kind: 'passesThrough', point: [3, 2] }];
  assert.equal(grade(q({ constraints: key }), work).isCorrect, true);
  assert.equal(grade(q({ constraints: [{ ...key[0], point: [2, 4] }, key[1], key[2]] }), work).isCorrect, false, 'another vertex');
  assert.equal(grade(q({ constraints: [key[0], { ...key[1], value: 'minimum' }, key[2]] }), work).isCorrect, false, 'another extremum');
  assert.equal(grade(q({ constraints: [key[0], key[1], { ...key[2], point: [3, 1] }] }), work).isCorrect, false, 'another point');
});

test('realistic maximal work is small, carries nothing that gets dropped, and fits the contract', () => {
  const work = built({ family: 'exponential', a: -123456.789, base: 0.000123, h: 98765.4321, k: -1e15, domainMode: 'discrete', domainMin: -99999, domainMax: 99999, verticalX: 1e-7 });
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 20);
  assert.equal(grade(q({ constraints: DECAY }), work).graded, true);
});
