/*
 * PRE-FLIGHT FOR QUESTION FAMILIES AND RECOVERY.
 *
 * What a teacher is told before publishing: whether every family-backed
 * question generates, whether its answer key grades, whether there are enough
 * distinct versions for the class, whether a "different versions" DOL really
 * varies, and whether a Recovery can be generated — in the words the brief
 * asks for ("Recovery generation unavailable: DOL Q3 does not reference a
 * generator-backed Question Family."). A Live Challenge Warm-Up is reported as
 * such, never as a Warm-Up students will be missing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { answerKeyResponse, auditAssignmentQuestionGeneration, REFERENCE_CLASS_SIZE } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import { componentSource, region } from './helpers/sourceContract.mjs';

const alignment = (code) => [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }];

const assignmentWith = (dolQuestions, overrides = {}) => ({
  schemaVersion: 5,
  assignment: { title: 'Pre-Flight families', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  variantPolicy: { mode: 'personalized', sectionModes: { dol: 'personalized' } },
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [
      { questionId: 'w1', type: 'multiAnswer', prompt: 'Find both intercepts of {{equation}}.', questionFamily: { id: 'functions.identifyIntercepts' }, alignments: alignment('A.3C') },
    ] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: dolQuestions },
  ],
  ...overrides,
});

const familyDol = [
  { questionId: 'd1', type: 'stepAlgebra', prompt: 'Solve {{equation}} for $x$.', questionFamily: { id: 'linear.twoStepEquation' }, alignments: alignment('A.5A') },
  { questionId: 'd2', type: 'system', prompt: 'Solve the system.', questionFamily: { id: 'systems.elimination' }, alignments: alignment('A.5C') },
];

test('a family-backed assignment passes Pre-Flight, and both Recoveries are reported ready', () => {
  const model = buildAssignmentV5PreflightModel(assignmentWith(familyDol), { classSize: 28 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.questionGeneration.recovery.dol.status, 'ready');
  assert.equal(model.questionGeneration.recovery.warmup.status, 'ready');
  assert.deepEqual(model.questionGeneration.warnings, []);
  assert.ok(model.questionGeneration.notes.some((note) => /3 questions generate a different version for each student/.test(note)));
  assert.ok(model.questionGeneration.notes.some((note) => /DOL Recovery ready: each of the 2 DOL questions/.test(note)));
  const slot = model.questionGeneration.slots.find((entry) => entry.familyId === 'linear.twoStepEquation');
  assert.ok(slot.capacity >= 1000);
});

test('a static question in a family-backed DOL blocks Recovery, in the words teachers act on', () => {
  const dol = [
    ...familyDol,
    { questionId: 'd3', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', label: 'Answer', inputProfile: 'number', answer: '7' }], alignments: alignment('A.5A') },
  ];
  const model = buildAssignmentV5PreflightModel(assignmentWith(dol), { classSize: 28 });
  assert.ok(
    model.warnings.includes('Recovery generation unavailable: DOL Q3 does not reference a generator-backed Question Family. (Question 4)'),
    model.warnings.join('\n'),
  );
  assert.ok(model.warnings.some((warning) => /DOL is set to give students different versions, but Q3 does not vary/.test(warning)));
  assert.equal(model.questionGeneration.recovery.dol.status, 'unavailable');
  // It links to the question that needs work.
  const diagnostic = model.diagnostics.find((entry) => /Recovery generation unavailable/.test(entry.message));
  assert.equal(diagnostic.questionNumber, 4);
  assert.equal(diagnostic.questionId, 'd3');
});

test('a legacy DOL is told Recovery is not configured — a note, not an error', () => {
  const legacyDol = [
    { questionId: 'l1', type: 'multiAnswer', prompt: 'What is 2 + 2?', answerFields: [{ id: 'a', label: 'Answer', inputProfile: 'number', answer: '4' }], alignments: alignment('A.5A') },
    { questionId: 'l2', type: 'multiAnswer', prompt: 'What is 5 + 2?', answerFields: [{ id: 'a', label: 'Answer', inputProfile: 'number', answer: '7' }], alignments: alignment('A.5A') },
  ];
  const assignment = assignmentWith(legacyDol, { variantPolicy: { mode: 'personalized', sectionModes: { dol: 'shared' } } });
  assignment.sections[0].questions = [];
  assignment.sections = assignment.sections.filter((section) => section.questions.length);
  const model = buildAssignmentV5PreflightModel(assignment);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.questionGeneration.recovery.dol.status, 'notConfigured');
  assert.ok(model.questionGeneration.notes.some((note) => /DOL Recovery is not available: none of its 2 questions reference a generator-backed Question Family/.test(note)));
  assert.equal(model.questionGeneration.warnings.length, 0, 'a shared legacy DOL raises nothing to fix');
});

test('a family reference that cannot generate blocks publishing everywhere semantic validation runs', () => {
  const broken = { questionId: 'd9', type: 'stepAlgebra', prompt: 'Solve.', questionFamily: { id: 'linear.doesNotExist' }, alignments: alignment('A.5A') };
  const semantic = validateQuestionSemantics(broken, { label: 'Question 1' });
  assert.match(semantic.errors[0], /references a Question Family that cannot generate questions \(family_unknown\)/);
  const model = buildAssignmentV5PreflightModel(assignmentWith([broken]));
  assert.equal(model.isValid, false);
  // A platform family slot is judged by the question it generates, so a
  // template without answer fields of its own is not "missing" them.
  assert.deepEqual(validateQuestionSemantics(familyDol[1], { label: 'Question 1' }).errors, []);
});

test('an answer key the grader cannot accept is blocking; an unresolvable template never reaches students', () => {
  const template = (answer) => ({
    questionId: 'p1',
    type: 'multiAnswer',
    activityRole: 'practice',
    prompt: 'What is {{a}} + {{b}}?',
    generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } }, derived: { sum: 'a+b' } },
    answerFields: [{ id: 'sum', label: 'Sum', inputProfile: 'number', answer }],
    questionFamily: { scope: 'assignment' },
  });
  assert.deepEqual(auditAssignmentQuestionGeneration({ id: 'a1' }, [template('{{sum}}')]).errors, []);
  // Every sampled version's key is checked through the server grading contract.
  const blank = auditAssignmentQuestionGeneration({ id: 'a1' }, [template('')]);
  assert.match(blank.errors[0], /^Question 1 \(Practice Q1\): the generated answer key does not grade as correct for 6 of 6 sampled versions/);
  // A placeholder with no value cannot become a family at all: the slot is
  // unresolvable and semantic validation blocks it on every publish path.
  const unresolved = template('{{missingValue}}');
  assert.equal(auditAssignmentQuestionGeneration({ id: 'a1' }, [unresolved]).slots[0].error, 'template_invalid');
  assert.match(validateQuestionSemantics(unresolved, { label: 'Question 1' }).errors[0], /cannot generate questions \(template_invalid/);
  // The key responder speaks each tool's response shape.
  assert.deepEqual(answerKeyResponse({ type: 'multiAnswer', answerFields: [{ id: 'sum', answer: '5' }] }).fields, [{ id: 'sum', value: '5', isComplete: true }]);
  assert.equal(answerKeyResponse({ type: 'stepAlgebra', variable: 'n', generatedAnswer: -3 }).value, 'n=-3');
  assert.equal(answerKeyResponse({ type: 'system', solution: [2, -1] }).value, '(2, -1)');
});

test('too few distinct versions for the class is a warning that names the class size', () => {
  const tiny = {
    questionId: 'd1',
    type: 'multiAnswer',
    activityRole: 'dol',
    prompt: 'What is {{a}} + 1?',
    generator: { parameters: { a: { type: 'int', min: 1, max: 6 } }, derived: { ans: 'a+1' } },
    answerFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', answer: '{{ans}}' }],
    questionFamily: { scope: 'assignment' },
  };
  const withRoster = auditAssignmentQuestionGeneration({ id: 'a1' }, [tiny], { classSize: 24 });
  assert.ok(withRoster.warnings.some((warning) => /can produce only 6 distinct questions — fewer than this class of 24/.test(warning)), withRoster.warnings.join('\n'));
  const withoutRoster = auditAssignmentQuestionGeneration({ id: 'a1' }, [tiny]);
  assert.ok(withoutRoster.warnings.some((warning) => new RegExp(`fewer than a class of ${REFERENCE_CLASS_SIZE}`).test(warning)));
  assert.ok(withoutRoster.warnings.some((warning) => /very few distinct questions/.test(warning)), 'Recovery is warned that Practice may run out of fresh questions');
  const shared = auditAssignmentQuestionGeneration({ id: 'a1', variantPolicy: { sectionModes: { dol: 'shared' } } }, [tiny], { classSize: 24 });
  assert.ok(!shared.warnings.some((warning) => /fewer than/.test(warning)), 'a shared section needs only one question');
});

test('a Live Challenge Warm-Up is reported as such: its result is the Warm-Up grade, and no Recovery is generated', () => {
  const model = buildAssignmentV5PreflightModel(assignmentWith(familyDol, { warmup: { liveChallenge: { enabled: true } } }), { classSize: 20 });
  assert.equal(model.questionGeneration.recovery.warmup.status, 'liveChallenge');
  assert.ok(model.questionGeneration.notes.some((note) => /Warm-Up is delivered by Live Challenge: each student's result \(rounds correct out of the rounds they could play\) is their Warm-Up grade, and MathMaster will not generate a Warm-Up Recovery/.test(note)));
  assert.ok(!model.warnings.some((warning) => /Warm-Up/.test(warning)));
});

test('a teacher who turned Recovery off is told so, and nothing about readiness', () => {
  const model = buildAssignmentV5PreflightModel(assignmentWith(familyDol, { gradingPolicy: { recovery: { enabled: false } } }));
  assert.equal(model.questionGeneration.recovery.dol.status, 'off');
  assert.ok(model.questionGeneration.notes.includes('DOL Recovery is turned off for this assignment.'));
});

test('the representative sample assignment is family-backed end to end and passes Pre-Flight', () => {
  const sample = JSON.parse(readFileSync(new URL('../../SAMPLE_QUESTION_FAMILY_RECOVERY.json', import.meta.url), 'utf8'));
  const model = buildAssignmentV5PreflightModel(sample, { classSize: 30 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.deepEqual(model.questionGeneration.warnings, []);
  assert.equal(model.questionGeneration.recovery.dol.status, 'ready');
  assert.equal(model.questionGeneration.recovery.warmup.status, 'ready');
  assert.ok(model.questionGeneration.slots.every((slot) => slot.familyBacked && !slot.error));
});

test('the ALEKS bridge template keeps its Question Family opt-in through the authoring compiler', () => {
  const source = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json', import.meta.url), 'utf8'));
  const compiled = compileAuthoringIntentV5(source).package;
  const template = compiled.sections.flatMap((section) => section.questions).find((question) => question.generator?.parameters);
  assert.deepEqual(template.questionFamily, { scope: 'assignment' });
  assert.equal(template.familyId, 'mathmaster:sat:A2.2A:absolute-value-interval-maximum', 'the CCMR bank family id is untouched');
  const model = buildAssignmentV5PreflightModel(compiled, { classSize: 30 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.ok(model.questionGeneration.slots.some((slot) => slot.familyBacked && slot.scope === 'assignment' && slot.capacity === 72));
});

test('an AuthoringIntent DOL that names platform families compiles to a Recovery-ready assignment', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Intent families', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    variantPolicy: { mode: 'personalized', sectionModes: { dol: 'personalized' } },
    sections: [{ role: 'dol', title: 'DOL', questions: [
      { prompt: 'Solve {{equation}} for x.', studentActions: ['solveStepByStep'], questionFamily: { id: 'linear.twoStepEquation' }, alignments: alignment('A.5A') },
      { prompt: 'Find the zeros of the function.', studentActions: ['multipleResponses'], questionFamily: { id: 'functions.identifyZeros' }, alignments: alignment('A.8A') },
    ] }],
  }).package;
  const model = buildAssignmentV5PreflightModel(compiled, { classSize: 25 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.questionGeneration.recovery.dol.status, 'ready');
});

test('the authoring contract documents questionFamily from the live registry, with a personalized DOL', () => {
  const contract = buildAuthoringContract({ generatedAt: new Date('2026-10-01T00:00:00Z') });
  const section = region(contract, '## Question Families', '## Common studentActions', 'Question Families contract section');
  allRegisteredQuestionFamilies().filter((family) => family.scope !== 'assignment').forEach((family) => {
    assert.ok(section.includes(`\`${family.id}\` (v${family.version})`), `${family.id} is listed`);
  });
  assert.match(section, /"questionFamily": \{ "scope": "assignment" \}/);
  assert.match(section, /never solution steps, hints or worked solutions/);
  assert.match(contract, /"dol": "personalized"/);
});

test('the Pre-Flight modal shows the panel, uses the runtime default mode and passes the class size', () => {
  const modal = componentSource('src/components/teacher/LessonPreflightModal.jsx');
  const modeFallback = region(modal, 'const sectionVariantMode = (role) => (', ');', 'section mode fallback');
  assert.match(modeFallback, /\|\| 'personalized'\s*$/);
  assert.doesNotMatch(modeFallback, /'shared'/);
  assert.match(modal, /data-question-generation-panel="true"/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5, \{ classSize: preflightClassSize \}\)/);
  const app = componentSource('src/App.jsx');
  assert.match(app, /rosterSizesByClassId=\{preflightRosterSizesByClassId\}/);
  assert.match(region(app, 'const preflightRosterSizesByClassId = useMemo(', '}, [teacherRosterSummaries]);', 'roster size memo'), /sizes\[student\.classId\] = \(sizes\[student\.classId\] \|\| 0\) \+ 1/);
});

test('Pre-Flight names every static question whose grade will rely on the student\'s device, from the grading registry', () => {
  const questions = [
    // Marked by the server from the raw answer: not mentioned.
    { questionId: 's1', type: 'literal', prompt: 'Solve A = bh for h.', equation: 'A = bh', solveFor: 'h', acceptedAnswers: ['A/b'], activityRole: 'classwork' },
    // Generated in the browser from a seed the server does not re-run.
    { questionId: 's2', type: 'literal', prompt: 'Solve for x.', generator: { kind: 'literalEquation' }, activityRole: 'classwork' },
    // Graded by a dedicated server subsystem: not mentioned.
    { questionId: 's3', type: 'modelingLab', prompt: 'Model the data.', labDefinition: { labId: 'lab-1' }, activityRole: 'classwork' },
  ];
  const audit = auditAssignmentQuestionGeneration({ id: 'A1' }, questions);
  const note = audit.notes.find((entry) => /graded on the student's device/.test(entry));
  assert.ok(note, audit.notes.join('\n'));
  assert.match(note, /^1 question is graded on the student's device/);
  assert.match(note, /Question 2 \(it is generated in the student's browser/);
  assert.doesNotMatch(note, /Question 1|Question 3/);
  assert.deepEqual(audit.slots.map((slot) => slot.gradedOn), ['server', 'device', 'server']);
  // A notice, not a warning: an existing assignment is not newly flagged.
  assert.equal(audit.warnings.some((entry) => /student's device/.test(entry)), false);
});
