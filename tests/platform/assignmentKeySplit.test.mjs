/*
 * D10 PHASE 1, P1-1: THE ANSWER-KEY SPLIT (functions/shared/assignmentKeySplit.mjs;
 * docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §1.1 and §3; SI02).
 *
 * The design's proofs for the split, before anything is built on it:
 *   - mergeQuestion(splitQuestion(q)) is q, for EVERY fixture: every object in
 *     every JSON file under teacher-import-jsons/, docs/assignments/, seed/ and
 *     SAMPLE_*.json is split as if it were a question and merged back (same
 *     values, same key order), and every lesson that compiles is split and
 *     merged as the stored V5 sections it becomes;
 *   - the public question holds none of the declared fields at any depth.
 *     That is checked against lists this test does NOT take from the module,
 *     so a field dropped from the module's list turns it red: the design's own
 *     §1.1 table (typed below), the secure-mode assistance keys
 *     (questionRuntimePolicy.mjs), what secureExam.js strips from a released
 *     review (found by running it), the Phase 0 exposure report's classifier,
 *     and the teacher's printed answer key.
 * The coverage gate (every key-bearing field a grader reads is on the list) is
 * tests/platform/assignmentKeySplitCoverageGate.test.mjs; the shadow trigger
 * that stores the split is tests/platform/assignmentKeyShadow.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { repairKnownFirestoreNestedArrays } from '../../src/platform/persistence/firestoreAssignmentSafety.js';
import { answerLinesFromResolvedQuestion, solutionLinesFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { ASSISTANCE_PAYLOAD_KEYS } from '../../functions/shared/questionRuntimePolicy.mjs';
import { classifyQuestionExposure } from '../../scripts/report-assignment-key-exposure.mjs';
import {
  AssignmentKeyError, mergeAssignment, mergeQuestion, splitAssignment, splitQuestion,
} from '../../functions/shared/assignmentKeySplit.mjs';

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const roundTrip = (question) => {
  const { publicQuestion, privatePart } = splitQuestion(question);
  return mergeQuestion(publicQuestion, privatePart);
};

// --- what moves, and what stays ---------------------------------------------------

test('a typed answer, the correct choice and the worked solution move; the options and the prompt stay', () => {
  const question = {
    questionId: 'q1', type: 'multiAnswer', prompt: 'Which slope?',
    answerFields: [{ id: 'f1', label: 'Slope', options: ['1', '2'], answer: '2', acceptedAnswers: ['2'] }],
    hints: ['Rise over run'], solutionReview: { headline: 'Two' }, scaffold: { prompt: 'First step?', options: ['a', 'b'], correct: 'a' },
  };
  const { publicQuestion, privatePart } = splitQuestion(question);
  assert.deepEqual(publicQuestion, {
    questionId: 'q1', type: 'multiAnswer', prompt: 'Which slope?',
    answerFields: [{ id: 'f1', label: 'Slope', options: ['1', '2'] }],
    scaffold: { prompt: 'First step?', options: ['a', 'b'] },
  });
  assert.deepEqual(privatePart.fields.map((field) => field.path), [
    ['answerFields', 0, 'answer'], ['answerFields', 0, 'acceptedAnswers'], ['hints'], ['solutionReview'], ['scaffold', 'correct'],
  ]);
  assert.deepEqual(roundTrip(question), question);
});

test('a generic name is a key on a question, a variant and a band profile, and is left alone deeper down', () => {
  const question = {
    type: 'literal', answer: '5',
    variants: [{ prompt: 'v', answer: '6', xIntercepts: [{ x: 1, y: 0 }] }],
    differentiation: { mode: 'auto', bandProfiles: { 2: { answer: '7', prompt: 'easier' } } },
    sets: [{ id: 'line-a', yIntercept: [0, 20] }],
    stimulus: { answer: 'a label the screen prints', behavior: 'drawn' },
  };
  const { publicQuestion } = splitQuestion(question);
  assert.equal('answer' in publicQuestion, false);
  assert.deepEqual(publicQuestion.variants, [{ prompt: 'v' }]);
  assert.deepEqual(publicQuestion.differentiation, { mode: 'auto', bandProfiles: { 2: { prompt: 'easier' } } });
  assert.deepEqual(publicQuestion.sets, question.sets, 'a card the student sorts keeps what it shows');
  assert.deepEqual(publicQuestion.stimulus, question.stimulus);
  assert.deepEqual(roundTrip(question), question);
});

test('an unambiguous name, and a key at a named place, move at every depth: stages, steps, variants of variants', () => {
  const question = {
    type: 'workflow',
    stages: [{ question: { correctRange: '[0, inf)', steps: [{ workedSolution: 'deep', feedback: { wrong: 'no' } }] } }],
    variants: [{ variants: [{ correctDomain: 'all reals', options: [{ label: 'A', explanation: 'because' }] }] }],
    workflow: [{ id: 's1', answerFields: [{ id: 'f', answer: '3' }], table: { rows: [1], answers: { '0:1': '2' } } }],
  };
  const { publicQuestion, privatePart } = splitQuestion(question);
  assert.deepEqual(publicQuestion, {
    type: 'workflow', stages: [{ question: { steps: [{}] } }], variants: [{ variants: [{ options: [{ label: 'A' }] }] }],
    workflow: [{ id: 's1', answerFields: [{ id: 'f' }], table: { rows: [1] } }],
  });
  assert.equal(privatePart.fields.length, 7);
  assert.deepEqual(roundTrip(question), question);
});

test("a number line's target is its key; a transformation's target draws the item and stays", () => {
  assert.equal('target' in splitQuestion({ type: 'numberLine', target: 4 }).publicQuestion, false);
  assert.deepEqual(splitQuestion({ type: 'transformationsLab', target: { a: 1, h: -2, k: 3 } }).publicQuestion.target, { a: 1, h: -2, k: 3 });
});

test('the merge puts every field back in its place: same keys, same order, nothing shared with the inputs', () => {
  const question = JSON.parse('{"z":1,"answer":"x","a":{"y":2,"correctAnswer":"c","b":3},"10":"ten","hints":[],"m":null}');
  const { publicQuestion, privatePart } = splitQuestion(question);
  const merged = mergeQuestion(publicQuestion, privatePart);
  assert.equal(JSON.stringify(merged), JSON.stringify(question));
  assert.deepEqual(Object.keys(merged), Object.keys(question));
  assert.deepEqual(Object.keys(merged.a), Object.keys(question.a));
  // Neither half, nor the merge, is the input itself.
  publicQuestion.a.y = 'changed';
  privatePart.fields.find((field) => field.path.join('.') === 'hints').value.push('leak');
  merged.a.b = 'changed';
  assert.equal(question.a.y, 2);
  assert.deepEqual(question.hints, []);
  assert.equal(question.a.b, 3);
  privatePart.fields[0].value = 'changed';
  assert.deepEqual(mergeQuestion(publicQuestion, privatePart).answer, 'changed', 'the merge uses the part it is given');
  assert.equal(question.answer, 'x');
});

test('a field JSON.parse names __proto__ round-trips as a field, and changes no prototype', () => {
  const question = JSON.parse('{"type":"x","__proto__":{"answer":"5","label":"kept"},"hints":["h"]}');
  const merged = roundTrip(question);
  assert.equal(JSON.stringify(merged), JSON.stringify(question));
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal({}.answer, undefined);
});

test('values that are not plain data (a timestamp, a date) are kept as they are', () => {
  class Timestamp { constructor(seconds) { this.seconds = seconds; } }
  const stamp = new Timestamp(5);
  const date = new Date(0);
  const question = { type: 'x', createdAt: stamp, grading: { at: date } };
  const { publicQuestion, privatePart } = splitQuestion(question);
  assert.equal(publicQuestion.createdAt, stamp);
  assert.equal(privatePart.fields[0].value.at, date);
  assert.deepEqual(roundTrip(question), question);
});

test('a public question has nothing left to split, and a question with no keys has no private part', () => {
  const { publicQuestion } = splitQuestion({ type: 'multiAnswer', answerFields: [{ id: 'a', answer: '1' }], hints: ['h'] });
  assert.equal(splitQuestion(publicQuestion).privatePart, null);
  assert.equal(splitQuestion({ type: 'graph', functionSpec: { m: 2, b: -1 } }).privatePart, null);
  assert.deepEqual(mergeQuestion({ type: 'graph' }, null), { type: 'graph' });
  assert.equal(splitQuestion(null).privatePart, null);
});

test('a merge that does not fit refuses, with a reason, rather than build a question that is neither', () => {
  const { publicQuestion, privatePart } = splitQuestion({ type: 'x', answerFields: [{ id: 'a', answer: '1' }] });
  const refuses = (part, target, code) => assert.throws(() => mergeQuestion(target, part), (error) => error instanceof AssignmentKeyError && error.code === code);
  refuses(privatePart, { type: 'x' }, 'private-part-does-not-fit');
  refuses(privatePart, { type: 'x', answerFields: [{ id: 'a', answer: 'already here' }] }, 'private-part-does-not-fit');
  refuses({ fields: [{ path: ['answer'], at: 9, value: 1 }] }, { type: 'x' }, 'private-part-does-not-fit');
  refuses({ fields: [{ path: ['answer'], at: 0, value: 1 }, { path: ['hints'], at: 0, value: [] }] }, { type: 'x' }, 'private-part-does-not-fit');
  refuses({ fields: [{ path: ['__proto__', 'polluted'], at: 0, value: 1 }] }, {}, 'malformed-private-part');
  refuses({ fields: [{ path: [], at: 0, value: 1 }] }, {}, 'malformed-private-part');
  refuses({ fields: [{ path: ['answer'], at: 0 }] }, {}, 'malformed-private-part');
  refuses({ answer: 1 }, {}, 'malformed-private-part');
  refuses(privatePart, 'not a question', 'private-part-without-question');
  assert.deepEqual(mergeQuestion(publicQuestion, privatePart), { type: 'x', answerFields: [{ id: 'a', answer: '1' }] });
});

test('an assignment is split question by question, filed under each questionId; sections keep their own fields', () => {
  const sections = [
    { id: 'dol', role: 'dol', title: 'Exit Ticket', attemptsAllowed: 1, questions: [
      { questionId: 'd1', type: 'literal', acceptedAnswers: ['2'] },
      { questionId: 'd2', type: 'graph', functionSpec: { m: 1 } },
    ] },
    { id: 'notes', role: 'classwork', title: 'Notes' },
  ];
  const { publicSections, keysByQuestionId } = splitAssignment(sections);
  assert.deepEqual(Object.keys(keysByQuestionId), ['d1'], 'a question with no keys has no entry');
  assert.deepEqual(publicSections, [
    { id: 'dol', role: 'dol', title: 'Exit Ticket', attemptsAllowed: 1, questions: [{ questionId: 'd1', type: 'literal' }, sections[0].questions[1]] },
    { id: 'notes', role: 'classwork', title: 'Notes' },
  ]);
  assert.deepEqual(mergeAssignment(publicSections, keysByQuestionId), sections);
});

test('a split refuses keys it could not file under one question, and a merge refuses keys that match no question', () => {
  const refuses = (fn, code) => assert.throws(fn, (error) => error instanceof AssignmentKeyError && error.code === code);
  refuses(() => splitAssignment([{ questions: [{ type: 'literal', acceptedAnswers: ['1'] }] }]), 'question-without-id');
  refuses(() => splitAssignment([{ questions: [{ questionId: 'a', answer: '1' }] }, { questions: [{ questionId: 'a', prompt: 'same id' }] }]), 'duplicate-question-id');
  refuses(() => splitAssignment([{ questions: [{ questionId: '__reserved__', answer: '1' }] }]), 'question-id-not-storable');
  // Two questions may share an id when neither carries a key: there is nothing to file.
  assert.deepEqual(splitAssignment([{ questions: [{ questionId: 'a' }, { questionId: 'a' }] }]).keysByQuestionId, {});
  const { publicSections, keysByQuestionId } = splitAssignment([{ questions: [{ questionId: 'a', answer: '1' }] }]);
  refuses(() => mergeAssignment(publicSections, { ...keysByQuestionId, gone: { fields: [{ path: ['answer'], at: 0, value: '2' }] } }), 'unused-keys');
  refuses(() => mergeAssignment([{ questions: [{ questionId: 'a' }, { questionId: 'a' }] }], keysByQuestionId), 'duplicate-question-id');
  refuses(() => mergeAssignment(publicSections, ['not', 'a', 'map']), 'malformed-keys');
});

// --- every fixture ----------------------------------------------------------------

const jsonFilesUnder = (relative) => {
  const files = [];
  const visit = (target) => {
    if (statSync(target).isDirectory()) readdirSync(target).sort().forEach((name) => visit(path.join(target, name)));
    else if (target.endsWith('.json')) files.push(path.relative(repo, target));
  };
  visit(path.join(repo, relative));
  return files;
};
const FIXTURE_FILES = [
  ...jsonFilesUnder('teacher-import-jsons'),
  ...jsonFilesUnder('docs/assignments'),
  ...jsonFilesUnder('seed'),
  ...readdirSync(repo).filter((name) => /^SAMPLE_.*\.json$/.test(name)).sort(),
];

// Every object in every fixture file, split as a question root (computed once).
let fixtureRun = null;
const everyFixtureObject = () => {
  if (fixtureRun) return fixtureRun;
  const run = { files: 0, objects: 0, keyed: 0, mismatches: [], publics: [] };
  FIXTURE_FILES.forEach((file) => {
    const document = JSON.parse(readFileSync(path.join(repo, file), 'utf8'));
    run.files += 1;
    // The whole file, as one question: every name that is a key anywhere, at every depth.
    const whole = roundTrip(document);
    try { assert.deepStrictEqual(whole, document); } catch { run.mismatches.push(`${file} (whole file)`); }
    if (JSON.stringify(whole) !== JSON.stringify(document)) run.mismatches.push(`${file} (whole file, key order)`);
    const visit = (node, where) => {
      if (Array.isArray(node)) { node.forEach((child, index) => visit(child, `${where}[${index}]`)); return; }
      if (!isPlainObject(node)) return;
      run.objects += 1;
      const { publicQuestion, privatePart } = splitQuestion(node);
      if (privatePart) run.keyed += 1;
      if (JSON.stringify(mergeQuestion(publicQuestion, privatePart)) !== JSON.stringify(node)) run.mismatches.push(`${file} ${where}`);
      run.publics.push({ file, where, original: node, publicQuestion });
      Object.entries(node).forEach(([key, child]) => visit(child, `${where}.${key}`));
    };
    visit(document, '$');
  });
  fixtureRun = run;
  return run;
};

// Every lesson that compiles, as the V5 sections a save stores.
let lessonRun = null;
const compiledLessons = () => {
  if (lessonRun) return lessonRun;
  lessonRun = FIXTURE_FILES.flatMap((file) => {
    try {
      const { assignmentV5 } = parseAssignmentBlueprintText(readFileSync(path.join(repo, file), 'utf8'));
      return Array.isArray(assignmentV5?.sections) ? [{ file, assignment: assignmentV5 }] : [];
    } catch {
      return [];
    }
  });
  return lessonRun;
};

test('the fixtures are all there: every source the design names contributes files', () => {
  for (const source of ['teacher-import-jsons/', 'docs/assignments/', 'seed/', 'SAMPLE_']) {
    assert.ok(FIXTURE_FILES.some((file) => file.startsWith(source)), `${source} contributes fixtures`);
  }
  for (const file of [
    'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json',
    'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json',
    'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
    'seed/pathQuestionBank/legacy/grade8_pathQuestionBank_seed.json',
    'SAMPLE_QUESTION_FAMILY_RECOVERY.json',
  ]) assert.ok(FIXTURE_FILES.includes(file), `${file} is a fixture`);
});

test('mergeQuestion(splitQuestion(q)) is q for every object in every fixture file, each split as a question', () => {
  const run = everyFixtureObject();
  assert.deepEqual(run.mismatches, []);
  assert.equal(run.files, FIXTURE_FILES.length);
  // Not vacuous: tens of thousands of objects, thousands of them carrying keys.
  assert.ok(run.objects > 50_000, `${run.objects} objects`);
  assert.ok(run.keyed > 5_000, `${run.keyed} objects carried keys`);
});

test('every lesson that compiles splits and merges back exactly, as compiled and as Firestore stores it', () => {
  const lessons = compiledLessons();
  assert.ok(lessons.length >= 40, `${lessons.length} lessons compiled`);
  let questions = 0;
  let keyed = 0;
  lessons.forEach(({ file, assignment }) => {
    // As stored: the save path's nested-array repair, then what JSON (and Firestore) keeps.
    const stored = JSON.parse(JSON.stringify(repairKnownFirestoreNestedArrays(assignment).value));
    [assignment.sections, stored.sections].forEach((sections) => {
      const { publicSections, keysByQuestionId } = splitAssignment(sections);
      const merged = mergeAssignment(publicSections, keysByQuestionId);
      assert.deepStrictEqual(merged, sections, file);
      assert.equal(JSON.stringify(merged), JSON.stringify(sections), `${file}: key order`);
    });
    const { keysByQuestionId } = splitAssignment(stored.sections);
    stored.sections.forEach((section) => { questions += section.questions.length; });
    keyed += Object.keys(keysByQuestionId).length;
  });
  assert.ok(questions > 1_000, `${questions} questions`);
  assert.ok(keyed > 900, `${keyed} questions carried keys`);
});

// --- the public question holds none of the declared fields ------------------------

/*
 * The design's own list (ANSWER_KEY_SERVER_SIDE_DESIGN.md §1.1), transcribed
 * here and NOT read from the module, so a field the module stops moving shows
 * up as a field left in a public question. Its family-template row is kept
 * public on purpose: the device builds each student's version from
 * `questionFamily` and `generator.parameters`/`constraints` (design R10), so
 * only the answer templates (answerFields[].answer) and generator.derived are
 * listed. The design names `context.*.value` beside choices; the module moves
 * it wherever it is, which this list cannot see past.
 */
const DESIGN_KEYS = Object.freeze({
  anywhere: [
    'acceptedAnswers', 'accepted', 'correctMatches', 'correctIndependentId', 'correctDependentId', 'correctionAnswerId',
    'correctDomain', 'correctRange', 'correctEquation', 'grading', 'tableAnswers', 'expectedStepPoints', 'expectedModel',
    'expectedConstraints', 'solutionKey', 'generatedAnswer', 'solutionReview', 'workedSolution', 'solutionExplanation',
    'explanation', 'solutionSteps', 'solutionRepresentations', 'attemptFeedback', 'misconceptions', 'hints', 'supportHints',
  ],
  // On the question and on each of its variants.
  onQuestion: [
    'answer', 'solution', 'tolerance', 'targetValue', 'targetRoot', 'targetN', 'xIntercepts', 'yIntercept', 'extreme',
    'axisOfSymmetry', 'asymptote', 'behavior', 'continuity',
  ],
  onQuestionWhenScalar: ['target'],
  at: [
    'answerFields[].answer', 'answerFields[].numericTolerance', 'responseFields[].expected', 'responseFields[].answer',
    'responses[].answer', 'scaffold.correct', 'table.answers', 'task.expected', 'generator.derived',
    'targets[].classification', 'context.*.value', 'guidedNotes.steps',
  ],
});

/*
 * Design-listed fields still present in a public question: an independent
 * walk. The `anywhere` names and the `at` paths are looked for under every
 * object at every depth; the generic names only on the question and its
 * variants, as the design lists them.
 */
const designKeysLeft = (question) => {
  const left = [];
  const atPaths = DESIGN_KEYS.at.map((pattern) => pattern.split('.'));
  const reachFrom = (start, where) => atPaths.forEach((segments) => {
    const reach = (node, index, trail) => {
      if (index === segments.length) { left.push(trail); return; }
      let segment = segments[index];
      const many = segment.endsWith('[]');
      if (many) segment = segment.slice(0, -2);
      const names = segment === '*' ? (isPlainObject(node) ? Object.keys(node) : []) : [segment];
      names.forEach((name) => {
        if (!isPlainObject(node) || !Object.hasOwn(node, name)) return;
        if (!many) { reach(node[name], index + 1, `${trail}.${name}`); return; }
        (Array.isArray(node[name]) ? node[name] : []).forEach((child, at) => reach(child, index + 1, `${trail}.${name}[${at}]`));
      });
    };
    reach(start, 0, where);
  });
  const checkQuestion = (root, where) => {
    if (!isPlainObject(root)) return;
    DESIGN_KEYS.onQuestion.forEach((name) => { if (Object.hasOwn(root, name)) left.push(`${where}.${name}`); });
    DESIGN_KEYS.onQuestionWhenScalar.forEach((name) => {
      if (Object.hasOwn(root, name) && (root[name] === null || typeof root[name] !== 'object')) left.push(`${where}.${name}`);
    });
    (Array.isArray(root.variants) ? root.variants : []).forEach((variant, index) => checkQuestion(variant, `${where}.variants[${index}]`));
  };
  checkQuestion(question, '$');
  const anywhere = new Set(DESIGN_KEYS.anywhere);
  const walk = (node, where) => {
    if (Array.isArray(node)) { node.forEach((child, index) => walk(child, `${where}[${index}]`)); return; }
    if (!isPlainObject(node)) return;
    reachFrom(node, where);
    Object.entries(node).forEach(([key, child]) => {
      if (anywhere.has(key)) left.push(`${where}.${key}`);
      walk(child, `${where}.${key}`);
    });
  };
  walk(question, '$');
  return left;
};

test('the walk this test uses finds every design-listed field in an unsplit question (it can fail)', () => {
  const question = {
    answer: 1, target: 3, variants: [{ solution: 's' }], deep: { inner: { hints: ['h'], scaffold: { correct: 'a' } } },
    answerFields: [{ id: 'a', answer: '1' }], context: { slope: { value: 'v', choices: ['v'] } }, task: { expected: [1] },
    stimulus: { answer: 'not on a question', target: 4 },
  };
  assert.deepEqual(designKeysLeft(question).sort(), [
    '$.answer', '$.answerFields[0].answer', '$.context.slope.value', '$.deep.inner.hints', '$.deep.inner.scaffold.correct',
    '$.target', '$.task.expected', '$.variants[0].solution',
  ]);
});

test('no public question in any fixture keeps a field the design lists, at any depth or in any variant', () => {
  const left = everyFixtureObject().publics.flatMap(({ file, where, publicQuestion }) => (
    designKeysLeft(publicQuestion).map((field) => `${file} ${where}: ${field}`)
  ));
  assert.deepEqual(left.slice(0, 20), []);
  const lessonsLeft = compiledLessons().flatMap(({ file, assignment }) => splitAssignment(assignment.sections).publicSections
    .flatMap((section) => section.questions.flatMap((question) => designKeysLeft(question).map((field) => `${file} ${question.questionId}: ${field}`))));
  assert.deepEqual(lessonsLeft.slice(0, 20), []);
});

test('every secure-mode assistance key (hints, worked examples, feedback ...) leaves the public question at any depth', () => {
  assert.ok(ASSISTANCE_PAYLOAD_KEYS.length >= 18);
  ASSISTANCE_PAYLOAD_KEYS.forEach((name) => {
    const question = { type: 'x', stimulus: { panel: [{ [name]: 'help' }] }, variants: [{ [name]: 'help' }] };
    const { publicQuestion } = splitQuestion(question);
    assert.deepEqual(publicQuestion, { type: 'x', stimulus: { panel: [{}] }, variants: [{}] }, name);
  });
});

/*
 * What a released secure-Test review strips from a question (secureExam.js,
 * stripReviewSecrets) is found by running it on a probe that carries every
 * field name this test can think of, so the list is the code's, not ours.
 */
const strippedFromAReleasedReview = (names) => {
  const probe = Object.fromEntries(names.map((name) => [name, 'probe']));
  const review = secureExam.publicReview({
    status: 'submitted', feedbackReleased: true,
    responses: { r1: { questionInstanceId: 'r1', questionSnapshot: probe } },
  });
  const kept = new Set(Object.keys(review.items[0].questionSnapshot));
  return names.filter((name) => !kept.has(name));
};

test('everything a released secure-Test review strips from a question also leaves the public question', () => {
  const names = [...new Set([
    ...DESIGN_KEYS.anywhere, ...DESIGN_KEYS.onQuestion, ...ASSISTANCE_PAYLOAD_KEYS,
    'expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading', 'privateSupport',
    'generatorParameters', 'gradingDefinition', 'solutionKey', 'prompt', 'options', 'type',
    ...everyFixtureObject().publics.flatMap(({ original }) => Object.keys(original)),
  ])];
  const stripped = strippedFromAReleasedReview(names);
  assert.ok(stripped.length >= 9, `the review stripped ${stripped.join(', ')}`);
  assert.ok(!stripped.includes('prompt'), 'the probe is real: a review keeps the prompt');
  stripped.forEach((name) => {
    const { publicQuestion } = splitQuestion({ type: 'x', stimulus: { [name]: 'secret' } });
    assert.deepEqual(publicQuestion.stimulus, {}, `${name} is stripped from a released review but stays public`);
  });
});

test('the Phase 0 exposure report finds no stored key, choice label, solution, hint or help in any public question', () => {
  const clean = { storedKeyFields: [], choiceLabelKey: false, workedSolution: false, hints: false, answerBearingHelp: false };
  const exposed = [
    ...everyFixtureObject().publics.map(({ file, where, publicQuestion }) => [`${file} ${where}`, publicQuestion]),
    ...compiledLessons().flatMap(({ file, assignment }) => splitAssignment(assignment.sections).publicSections
      .flatMap((section) => section.questions.map((question) => [`${file} ${question.questionId}`, question]))),
  ].filter(([, question]) => JSON.stringify(classifyQuestionExposure(question)) !== JSON.stringify(clean))
    .map(([where, question]) => `${where}: ${JSON.stringify(classifyQuestionExposure(question))}`);
  assert.deepEqual(exposed.slice(0, 10), []);
  // And the same classifier does see the keys before the split.
  const before = compiledLessons().flatMap(({ assignment }) => assignment.sections.flatMap((section) => section.questions))
    .filter((question) => classifyQuestionExposure(question).storedKeyFields.length > 0);
  assert.ok(before.length > 500, `${before.length} compiled questions carried a stored key before the split`);
});

/*
 * The teacher's printed answer key prints nothing from a public question,
 * except where its answer is COMPUTED from what the student is shown (design
 * R9): a matrix item's result and a polynomial division's quotient from the
 * matrices and polynomials on screen, and a Graphing2 item's line, which the
 * tool's own instruction states ("Graph y = -2").
 */
const COMPUTED_FROM_THE_STIMULUS = new Set(['matrixLab', 'polynomialWorkshop', 'graphing2']);

test('the printed answer key finds no answer and no solution in a public question (beyond what the stimulus shows)', () => {
  const printed = [];
  let before = 0;
  compiledLessons().forEach(({ file, assignment }) => {
    const { publicSections } = splitAssignment(assignment.sections);
    publicSections.forEach((section, sectionIndex) => section.questions.forEach((question, index) => {
      const original = assignment.sections[sectionIndex].questions[index];
      if (answerLinesFromResolvedQuestion(original).length || solutionLinesFromResolvedQuestion(original).length) before += 1;
      const solutions = solutionLinesFromResolvedQuestion(question);
      const answers = COMPUTED_FROM_THE_STIMULUS.has(question.type) ? [] : answerLinesFromResolvedQuestion(question);
      if (solutions.length || answers.length) printed.push(`${file} ${question.questionId}: ${[...answers, ...solutions].join(' | ')}`);
    }));
  });
  assert.deepEqual(printed.slice(0, 10), []);
  assert.ok(before > 500, `${before} compiled questions printed an answer or a solution before the split`);
});
