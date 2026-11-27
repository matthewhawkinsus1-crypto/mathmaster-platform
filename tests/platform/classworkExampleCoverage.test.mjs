/*
 * WE-B: EVERY CLASSWORK QUESTION'S WORKED EXAMPLE, COUNTED.
 *
 * docs/platform/WORKED_EXAMPLES.md section 6: a Classwork question is covered
 * by its own `example`, by an earlier Classwork question on the same skill
 * that is covered, or by a built-in sibling (buildSimilarWorkedExample or
 * buildNumericVariant); `"example": { "none": … }` says it needs none. The
 * module (src/platform/supports/workedExample/classworkCoverage.js) says which
 * for each question and what would cover the rest; Pre-Flight shows it
 * (ClassworkExampleCoveragePanel.jsx: a warning on a new assignment,
 * information on an existing one, never a readiness finding); the report
 * script lists it for the real lessons.
 *
 * The real-lessons numbers are the spec's measurement (section 8). A new
 * built-in generator (WE-I) or a lesson that gains Classwork moves them on
 * purpose: update them here and in section 8 together.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import {
  EXAMPLE_COVERAGE_STATUS as STATUS,
  EXAMPLE_FILL_WITH as FILL,
  RICH_TOOL_ACTIONS,
  builtInExampleSource,
  classworkExampleCoverage,
  coverageHeadline,
  exampleSkillOf,
  isCoveredStatus,
  summarizeClassworkExampleCoverage,
} from '../../src/platform/supports/workedExample/classworkCoverage.js';
import { workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { asQuestionEngineReceivesIt, lessonFiles, measureClassworkExampleCoverage } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { chainTo, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';

/* --------------------------------------------------------------- fixtures */

// A small lesson, compiled by the real compiler. `example` and
// `lessonSupports` are set on the compiled package, the shape Pre-Flight reads,
// so the module is held to them whether or not the compiler passes them yet.
const classworkOf = (relative) => compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, relative), 'utf8')))
  .package.sections.filter((section) => section.role === 'classwork').flatMap((section) => section.questions);
// A rich tool with no example yet: an inequality whose model the student
// writes first, which the plane replay does not play (WORKED_EXAMPLES.md,
// slice E, "Not played").
let inequalityModel = null;
const realInequalitySystem = () => {
  if (inequalityModel) return inequalityModel;
  inequalityModel = classworkOf('teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json')
    .find((question) => question.questionId === 'm3t2l4-cw-15');
  assert.equal(inequalityModel?.studentActions?.[0], 'solveInequalitySystem', 'the lesson has a Classwork inequality to model first');
  return inequalityModel;
};
// One the plane replay plays (WE-E): its first Classwork inequality system.
const replayedInequalitySystem = () => classworkOf('teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json')
  .find((question) => question.studentActions?.[0] === 'solveInequalitySystem');

const compileLesson = () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Coverage fixture', courseId: 'algebra2', instructionalPurpose: 'lesson' },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [
        { standard: 'A2.7G', prompt: 'Warm up: simplify the expression.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Value', answer: '3' }] },
      ] },
      { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [
        // 1 builtIn: a linear equation the linearEquations family works a sibling for.
        { standard: 'A.5A', prompt: 'Solve 3x + 5 = 20.', studentActions: ['solveStepByStep'], equation: '3x + 5 = 20', answer: 'x = 5' },
        // 2 own: names ex-simplify.
        { standard: 'A2.7G', prompt: 'Simplify the first expression.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Value', answer: '4' }] },
        // 3 earlierSameSkill: same action and standard as 2.
        { standard: 'A2.7G', prompt: 'Simplify the second expression.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Value', answer: '9' }] },
        // 4 exempt: a context-setting question.
        { standard: 'A.3B', prompt: 'Read the situation and name the two quantities.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Quantity', answer: 'cost' }] },
        // 5 uncovered: same skill as 4, but an exempt question covers nothing.
        { standard: 'A.3B', prompt: 'Which quantity depends on the other?', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Quantity', answer: 'cost' }] },
        // 6 uncovered: names an example the lesson does not have.
        { standard: 'A2.7C', prompt: 'Name the remainder.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Remainder', answer: '6' }] },
        // 7 excluded by the teacher: never delivered, so never judged.
        { standard: 'A2.7D', prompt: 'Name the quotient.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Quotient', answer: '2' }] },
      ] },
      { id: 'dol', role: 'dol', title: 'DOL', questions: [
        { standard: 'A2.7G', prompt: 'Exit ticket: simplify the expression.', studentActions: ['multipleResponses'], responses: [{ id: 'a', label: 'Value', answer: '5' }] },
      ] },
    ],
  });
  const lesson = structuredClone(compiled.package);
  lesson.lessonSupports = { examples: [{ id: 'ex-simplify', source: 'authored', problem: 'Simplify 4x + 3 - x + 5.', steps: [{ show: 'Combine like terms.', why: 'They are the same kind of term.' }] }] };
  const classwork = lesson.sections.find((section) => section.role === 'classwork').questions;
  classwork[1].example = 'ex-simplify';
  classwork[3].example = { none: 'setup' };
  classwork[5].example = 'ex-not-in-the-lesson';
  classwork[6].teacherExcluded = true;
  // A rich tool with no sibling today: a real lesson's inequality system.
  classwork.push(structuredClone(realInequalitySystem()));
  return lesson;
};

test('each Classwork question is given its status, in the order a student meets them', () => {
  const lesson = compileLesson();
  const { questions, summary } = classworkExampleCoverage(lesson);
  const statuses = questions.map(({ status }) => status);
  assert.deepEqual(statuses, [STATUS.BUILT_IN, STATUS.OWN, STATUS.EARLIER_SAME_SKILL, STATUS.EXEMPT, STATUS.UNCOVERED, STATUS.UNCOVERED, STATUS.UNCOVERED],
    'Warm-Up and DOL are not Classwork, and the excluded question is not judged');
  const [builtIn, own, earlier, exempt, afterExempt, missing, richTool] = questions;
  assert.equal(builtIn.builtIn, 'family');
  assert.equal(builtIn.skill, 'solveStepByStep A.5A');
  assert.equal(own.exampleId, 'ex-simplify');
  assert.equal(earlier.coveredBy, own.questionId, 'covered by the earlier question on its skill');
  assert.equal(earlier.skill, own.skill);
  assert.equal(exempt.reason, 'setup');
  assert.equal(afterExempt.skill, exempt.skill, 'the same skill as the exempt question');
  assert.equal(afterExempt.fillWith, FILL.AUTHORED_EXAMPLE, 'an answer box no family claims needs an authored example');
  assert.equal(missing.missingExample, 'ex-not-in-the-lesson', 'an example the lesson does not have covers nothing');
  assert.equal(missing.fillWith, FILL.AUTHORED_EXAMPLE);
  assert.equal(richTool.fillWith, FILL.GENERATOR, 'a rich tool could get a generator');
  assert.equal(richTool.skill, `solveInequalitySystem ${richTool.standard}`);
  assert.equal(richTool.kind, 'solveInequalitySystem');
  // Numbered as Pre-Flight numbers its other findings: across the whole
  // assignment, the excluded question keeping its place.
  assert.deepEqual(questions.map(({ questionNumber }) => questionNumber), [2, 3, 4, 5, 6, 7, 9]);

  assert.deepEqual(summary.byStatus, { own: 1, earlierSameSkill: 1, builtIn: 1, exempt: 1, uncovered: 3 });
  assert.equal(summary.total, 7);
  assert.equal(summary.covered, 3);
  assert.equal(summary.uncovered, 3);
  assert.deepEqual(summary.byKind, { multipleResponses: 2, solveInequalitySystem: 1 });
  assert.deepEqual(summary.byFill, { generator: 1, authoredExample: 2 });
  assert.equal(coverageHeadline(summary), 'Worked examples: 3 of 6 classwork questions covered', 'an exempt question needs none, so it is not counted');
});

test('without the new fields every question is judged on its built-in example and its skill alone', () => {
  const lesson = compileLesson();
  delete lesson.lessonSupports;
  lesson.sections.forEach((section) => section.questions.forEach((question) => { delete question.example; }));
  const { questions } = classworkExampleCoverage(lesson);
  assert.deepEqual(questions.map(({ status }) => status), [STATUS.BUILT_IN, STATUS.UNCOVERED, STATUS.UNCOVERED, STATUS.UNCOVERED, STATUS.UNCOVERED, STATUS.UNCOVERED, STATUS.UNCOVERED]);
  // The compile result itself, a V5 package and a Pre-Flight model are all read.
  assert.deepEqual(classworkExampleCoverage({ package: lesson }).summary, classworkExampleCoverage(lesson).summary);
  assert.deepEqual(classworkExampleCoverage(null).summary.total, 0);
  assert.deepEqual(classworkExampleCoverage({ sections: [{ role: 'classwork', questions: [null, 'x', {}] }] }).questions.map(({ status }) => status), [STATUS.UNCOVERED]);
});

test('an inline example is the question\'s own; an id must be one the lesson has', () => {
  const lesson = compileLesson();
  const classwork = lesson.sections.find((section) => section.role === 'classwork').questions;
  classwork[5].example = { id: 'inline', steps: ['Divide.', 'Read the remainder.'] };
  classwork[4].example = { id: 'ex-simplify' };
  const { questions } = classworkExampleCoverage(lesson);
  assert.equal(questions[5].status, STATUS.OWN);
  assert.equal(questions[4].status, STATUS.OWN, 'an object naming a lesson example');
  lesson.lessonSupports.examples = [];
  assert.equal(classworkExampleCoverage(lesson).questions[1].status, STATUS.UNCOVERED, 'its example removed from the lesson, the question is no longer covered');
});

test('the skill is the familyId, or the first student action with the primary standard', () => {
  assert.equal(exampleSkillOf({ familyId: 'linear.twoStepEquation', studentActions: ['solveStepByStep'], standard: 'A.5A' }), 'linear.twoStepEquation');
  assert.equal(exampleSkillOf({ studentActions: ['solveStepByStep', 'checkSolution'], alignments: [{ code: 'A.5B', role: 'secondary' }, { code: 'A.5A', role: 'primary' }], standard: 'A.5B' }), 'solveStepByStep A.5A');
  assert.equal(exampleSkillOf({ studentActions: ['constructLine'], standard: { A: 1, B: 2, C: 3 } }), 'constructLine', 'a tool\'s own standard object is not a curriculum code');
  assert.equal(exampleSkillOf({ prompt: 'no actions' }), null);
  // Two questions of the same family share a skill whatever their actions.
  const lesson = { sections: [{ role: 'classwork', questions: [
    { questionId: 'a', familyId: 'fam.one', studentActions: ['multipleResponses'], example: 'ex' },
    { questionId: 'b', familyId: 'fam.one', studentActions: ['completeTable'] },
  ] }], lessonSupports: { examples: [{ id: 'ex' }] } };
  assert.deepEqual(classworkExampleCoverage(lesson).questions.map(({ status }) => status), [STATUS.OWN, STATUS.EARLIER_SAME_SKILL]);
});

test('the built-in check is kept per question, so Pre-Flight can ask again on every edit', () => {
  const question = compileLesson().sections.find((section) => section.role === 'classwork').questions[0];
  assert.equal(builtInExampleSource(question), 'family');
  // The same content in a new object (a rebuilt Pre-Flight model) is not worked again.
  const copy = structuredClone(question);
  let reads = 0;
  const watched = new Proxy(copy, { get(target, key, receiver) { reads += 1; return Reflect.get(target, key, receiver); } });
  JSON.stringify(watched);
  const serialising = reads;
  reads = 0;
  assert.equal(builtInExampleSource(watched), 'family');
  assert.ok(reads <= serialising + 2, `answered from the cache by its content (${reads} reads; serialising alone is ${serialising})`);
  // A changed question is judged afresh.
  assert.equal(builtInExampleSource({ ...copy, equation: undefined, prompt: 'Explain your thinking.', studentActions: ['multipleResponses'], type: 'multiAnswer', answerFields: [{ id: 'a', answer: 'why' }] }), null);
});

/* ------------------------------------------------------------ real lessons */

let measured = null;
const realMeasurement = () => {
  measured ||= measureClassworkExampleCoverage({ root: repo });
  return measured;
};

/*
 * WORKED_EXAMPLES.md section 8 measures the lessons that existed when the
 * coverage rule was decided. They are not back-filled, so the measurement holds
 * for them as long as they write no example. A lesson written since writes its
 * own (the Algebra I Thanksgiving Break Packet is the first): it is not part
 * of that baseline, and is held separately below.
 */
const writesItsOwnExamples = (lesson) => lesson.summary.byStatus[STATUS.OWN] > 0;
const baselineMeasurement = () => {
  const lessons = realMeasurement().lessons.filter((lesson) => !writesItsOwnExamples(lesson));
  return {
    lessons,
    summary: summarizeClassworkExampleCoverage(lessons.flatMap((lesson) => lesson.questions)),
    lessonsWithClasswork: lessons.length,
    lessonsWithNoBuiltIn: lessons.filter((lesson) => lesson.summary.byStatus[STATUS.BUILT_IN] === 0).length,
  };
};

test('the lessons written before the rule: 137 of 496 Classwork questions have a built-in sibling, and 14 of 41 lessons have none (WORKED_EXAMPLES.md section 8)', () => {
  const { lessons, lessonsWithClasswork } = baselineMeasurement();
  assert.equal(lessonsWithClasswork, 41);
  // Section 8 checked each question for a sibling from its family or its own
  // numbers (a replay on its tool came later, WE-C to WE-E: the next test).
  const sibling = ({ builtIn }) => builtIn === 'family' || builtIn === 'numericVariant';
  const entries = lessons.flatMap((lesson) => lesson.questions);
  assert.equal(entries.length, 496);
  assert.equal(entries.filter(sibling).length, 137);
  assert.equal(lessons.filter((lesson) => !lesson.questions.some(sibling)).length, 14);
  // The 359 without one, by kind, as section 8 lists them.
  const without = {};
  entries.filter((entry) => !sibling(entry))
    .forEach(({ kind }) => { without[kind] = (without[kind] || 0) + 1; });
  assert.equal(Object.values(without).reduce((sum, count) => sum + count, 0), 359);
  const named = { multipleResponses: 247, solveInequalitySystem: 30, matchFigures: 10, syntheticDivision: 10, sortIntoCategories: 10, solveRadicalEquation: 10, analyzeTransformations: 9 };
  for (const [kind, count] of Object.entries(named)) assert.equal(without[kind], count, kind);
  const rest = Object.entries(without).filter(([kind]) => !(kind in named));
  assert.equal(rest.length, 12, '12 other kinds');
  assert.equal(rest.reduce((sum, [, count]) => sum + count, 0), 33, '33 more questions');
});

test('a question the example player plays a replay for is covered: the same lessons since WE-C to WE-E', () => {
  const { lessons, summary, lessonsWithNoBuiltIn } = baselineMeasurement();
  const replays = {};
  lessons.flatMap((lesson) => lesson.questions).filter(({ builtIn }) => builtIn === 'replay')
    .forEach(({ kind }) => { replays[kind] = (replays[kind] || 0) + 1; });
  // The plane replay (WE-E) plays 20 of the 30 inequality systems; the Step
  // Algebra replay (WE-C) 3 equations no family has a sibling for.
  assert.deepEqual(replays, { solveInequalitySystem: 20, solveStepByStep: 3 });
  // None of these lessons writes an example or an exemption (existing lessons
  // are not back-filled), so the rest of the rule is the same-skill one: 49
  // more questions follow an earlier covered question on their skill.
  assert.deepEqual(summary.byStatus, { own: 0, earlierSameSkill: 49, builtIn: 160, exempt: 0, uncovered: 287 });
  assert.equal(summary.covered, 209);
  assert.equal(lessonsWithNoBuiltIn, 9);
});

test('the report counts a question as covered whenever workedExampleFor plays a replay for it, on every real lesson', () => {
  // The student's own player, on each Classwork question as QuestionEngine
  // receives it: where it plays a replay, the report counts the question as
  // covered; where it does not, the report never says 'replay'.
  let played = 0;
  for (const lesson of realMeasurement().lessons) {
    const byId = new Map(classworkOf(lesson.file).map((question) => [question.questionId, question]));
    for (const entry of lesson.questions) {
      const question = byId.get(entry.questionId);
      if (!question || entry.status === STATUS.OWN || entry.status === STATUS.EXEMPT) continue;
      const replay = workedExampleFor(asQuestionEngineReceivesIt(question))?.format === 'replay';
      if (replay) played += 1;
      if (replay) assert.ok(isCoveredStatus(entry.status), `${lesson.file} ${entry.questionId} is played as a replay but reported ${entry.status}`);
      // (A family's sibling may be played as a replay too: it is 'family'.)
      if (entry.builtIn === 'replay') assert.ok(replay, `${lesson.file} ${entry.questionId} is reported as a replay the player does not play`);
    }
  }
  assert.ok(played >= 29, `${played} questions are played as a replay`);
  // No inequality system the player plays is left uncovered: the four left are
  // models to write first, which the replay does not play.
  const left = realMeasurement().lessons.flatMap((lesson) => lesson.questions.map((entry) => ({ ...entry, file: lesson.file })))
    .filter(({ status, kind }) => status === STATUS.UNCOVERED && kind === 'solveInequalitySystem');
  assert.deepEqual(left.map(({ questionId }) => questionId).sort(), ['m3t2l4-cw-15', 'm3t2l4-cw-2', 'm3t2l4h-cw-15', 'm3t2l4h-cw-2']);
  // And the replayed fixture question is built-in by replay.
  assert.equal(builtInExampleSource(asQuestionEngineReceivesIt(replayedInequalitySystem())), 'replay');
});

test('a lesson written since the rule writes its own examples, and leaves no Classwork question uncovered', () => {
  const lessons = realMeasurement().lessons.filter(writesItsOwnExamples);
  assert.ok(lessons.length >= 2, 'the Thanksgiving packet and its Honors file');
  lessons.forEach((lesson) => {
    assert.equal(lesson.summary.uncovered, 0, `${lesson.file}: ${JSON.stringify(lesson.questions.filter(({ status }) => status === STATUS.UNCOVERED))}`);
    assert.equal(lesson.summary.covered + lesson.summary.exempt, lesson.summary.total, lesson.file);
    // Every example it names is one it has: a missing example is not coverage.
    assert.ok(lesson.questions.every((entry) => !entry.missingExample), lesson.file);
  });
  // The whole measurement is the baseline and these together.
  const { summary } = realMeasurement();
  const baseline = baselineMeasurement().summary;
  assert.equal(summary.total, baseline.total + lessons.reduce((sum, lesson) => sum + lesson.summary.total, 0));
  assert.equal(summary.uncovered, baseline.uncovered, 'the new lessons add no uncovered question');
});

test('the real lessons: every uncovered question has a fill hint, and generator means a rich tool or a family', () => {
  const entries = realMeasurement().lessons.flatMap((lesson) => lesson.questions).filter(({ status }) => status === STATUS.UNCOVERED);
  assert.ok(entries.length > 0);
  assert.ok(entries.every(({ fillWith }) => fillWith === FILL.GENERATOR || fillWith === FILL.AUTHORED_EXAMPLE));
  const generator = entries.filter(({ fillWith }) => fillWith === FILL.GENERATOR);
  assert.ok(generator.some(({ kind }) => kind === 'solveInequalitySystem'));
  // An answer box is a generator's only where a support family claims it (and
  // has no sibling for it yet); otherwise the lesson writes the example.
  const questionsById = new Map();
  for (const file of lessonFiles(repo)) {
    compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8'))).package.sections
      .forEach((section) => section.questions.forEach((question) => questionsById.set(`${file}#${question.questionId}`, question)));
  }
  realMeasurement().lessons.forEach((lesson) => lesson.questions.filter(({ status, kind }) => status === STATUS.UNCOVERED && !RICH_TOOL_ACTIONS.includes(kind)).forEach((entry) => {
    const claimed = Boolean(familyFor(asQuestionEngineReceivesIt(questionsById.get(`${lesson.file}#${entry.questionId}`))));
    assert.equal(entry.fillWith, claimed ? FILL.GENERATOR : FILL.AUTHORED_EXAMPLE, `${lesson.file} ${entry.questionId}`);
  }));
  assert.deepEqual(realMeasurement().summary.byFill, { generator: 71, authoredExample: 216 });
});

test('Pre-Flight\'s view of a question gives the same answer as the student\'s screen', () => {
  // The coverage report checks each question as QuestionEngine receives it;
  // Pre-Flight checks the compiled, runtime-repaired question it already has.
  // They agree for every real Classwork question, so the panel and the report
  // never disagree.
  const byFile = new Map(realMeasurement().lessons.map((lesson) => [lesson.file, lesson.questions]));
  for (const file of lessonFiles(repo)) {
    if (!byFile.has(file)) continue;
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8')));
    assert.deepEqual(classworkExampleCoverage(compiled).questions, byFile.get(file), file);
  }
  // And through the Pre-Flight model itself, for two lessons (one built-in
  // heavy, one with none).
  for (const file of ['teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json', 'teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json']) {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8')));
    const model = buildAssignmentV5PreflightModel(compiled.package);
    assert.deepEqual(classworkExampleCoverage({ sections: model.sections, lessonSupports: model.assignmentV5.lessonSupports }).questions, byFile.get(file), file);
  }
});

test('the generated question and the stored one agree on a built-in example', () => {
  // asQuestionEngineReceivesIt is the path the spec measured on.
  const file = 'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json';
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(repo, file), 'utf8')));
  const classwork = compiled.package.sections.filter((section) => section.role === 'classwork').flatMap((section) => section.questions);
  const generated = classwork.map(asQuestionEngineReceivesIt);
  assert.ok(generated.every((question, index) => question.questionId === classwork[index].questionId));
  assert.ok(classwork.some((question) => familyFor(question)), 'a family claims some of them');
});

test('the report script is read-only and local: it reads teacher-import-jsons and writes nothing', () => {
  for (const file of ['scripts/report-classwork-example-coverage.mjs', 'scripts/lib/classworkExampleCoverageReport.mjs']) {
    const source = executableSource(readFileSync(path.join(repo, file), 'utf8'));
    assert.doesNotMatch(source, /firebase|firestore|fetch\(|https?:|writeFile|appendFile|mkdir|rmSync|unlink|child_process/i, `${file} reads local files only`);
  }
  const lib = executableSource(readFileSync(path.join(repo, 'scripts/lib/classworkExampleCoverageReport.mjs'), 'utf8'));
  assert.match(lib, /export const LESSONS_DIRECTORY = 'teacher-import-jsons';/);
  assert.match(region(lib, 'export const measureClassworkExampleCoverage', '\n};', 'the measurement'), /classworkExampleCoverage\(compiled, \{ prepareQuestion \}\)/, 'it applies the module\'s rules');
});

test('the rich tools named for a generator are V5 student actions', () => {
  const core = readFileSync(path.join(repo, 'src/platform/contract/authoringIntentV5Core.js'), 'utf8');
  const actions = region(core, 'export const AUTHORING_INTENT_V5_ACTIONS = Object.freeze([', ']);', 'the V5 actions');
  for (const action of RICH_TOOL_ACTIONS) assert.match(actions, new RegExp(`'${action}'`), action);
  for (const kind of ['multipleResponses', 'completeTable', 'sortIntoCategories', 'matchGraphsToStories']) assert.ok(!RICH_TOOL_ACTIONS.includes(kind), `${kind} is an answer box, table, sort or match`);
});

/* ------------------------------------------------------------ Pre-Flight */

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const PANEL = '/src/components/teacher/ClassworkExampleCoveragePanel.jsx';
const panelMarkup = async (props) => renderToStaticMarkup(React.createElement((await vite.ssrLoadModule(PANEL)).default, props));

test('the panel on a new assignment: a warning, the count, and each uncovered question with what would cover it', async () => {
  const html = await panelMarkup({ coverage: classworkExampleCoverage(compileLesson()), isNew: true });
  assert.match(html, /^<section data-classwork-example-coverage-panel="true" data-coverage-tone="warning" data-coverage-scope="new" aria-labelledby="([^"]+)"/);
  const headingId = html.match(/aria-labelledby="([^"]+)"/)[1];
  assert.match(html, new RegExp(`<h5 id="${headingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*><span>Warning: </span>Worked examples: 3 of 6 classwork questions covered</h5>`), 'a heading names the panel');
  assert.match(html, /This never stops you creating the assignment\./);
  assert.match(html, /<li data-coverage-status="builtIn">1 question covered by a built-in example<\/li>/);
  assert.match(html, /<li data-coverage-status="earlierSameSkill">1 question covered by an earlier question on the same skill<\/li>/);
  assert.match(html, /<li data-coverage-status="own">1 question covered by its own example<\/li>/);
  assert.match(html, /<li data-coverage-status="exempt">1 question needs no example<\/li>/);
  assert.match(html, /<details open=""><summary[^>]*>3 questions not covered<\/summary><ul data-coverage-uncovered="true"/, 'the list is open on a new assignment, and a list');
  assert.match(html, /<li data-fill-with="authoredExample">Question 6 \(multipleResponses, A\.3B\): needs a worked example written in the lesson\.<\/li>/);
  assert.match(html, /<li data-fill-with="authoredExample">Question 7 \(multipleResponses, A2\.7C\): needs a worked example written in the lesson\. It names the example &quot;ex-not-in-the-lesson&quot;, which the lesson does not have\.<\/li>/);
  assert.match(html, /<li data-fill-with="generator">Question 9 \(solveInequalitySystem, A\.\d+[A-Z]\): a built-in generator could cover it \(platform work\)\.<\/li>/);
});

test('the panel on an existing assignment: information only, folded, and never a warning', async () => {
  const html = await panelMarkup({ coverage: classworkExampleCoverage(compileLesson()), isNew: false, headingLevel: 4 });
  assert.match(html, /data-coverage-tone="info" data-coverage-scope="existing"/);
  assert.doesNotMatch(html, /Warning/);
  assert.match(html, /<h4 id="[^"]+"[^>]*>Worked examples: 3 of 6 classwork questions covered<\/h4>/, 'the heading level the screen asks for');
  assert.match(html, /For information only\. This assignment already exists, and existing assignments are not changed to add worked examples\. This never stops you saving the assignment\./);
  assert.match(html, /<details><summary[^>]*>3 questions not covered<\/summary>/, 'folded, but there');
  // A new assignment with nothing uncovered is not a warning either.
  const lesson = compileLesson();
  lesson.sections.find((section) => section.role === 'classwork').questions.splice(4);
  const covered = await panelMarkup({ coverage: classworkExampleCoverage(lesson), isNew: true });
  assert.match(covered, /data-coverage-tone="info"/);
  assert.doesNotMatch(covered, /not covered|Warning/);
  // No Classwork: no panel.
  assert.equal(await panelMarkup({ coverage: classworkExampleCoverage({ sections: [{ role: 'dol', questions: [{}] }] }), isNew: true }), '');
  assert.equal(await panelMarkup({ coverage: null, isNew: true }), '');
});

test('the panel draws in theme tokens only, and sizes its text from the page so it grows to 200%', () => {
  const panel = executableSource(readFileSync(path.join(repo, 'src/components/teacher/ClassworkExampleCoveragePanel.jsx'), 'utf8'));
  assert.doesNotMatch(panel, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/i, 'no hard-coded colour: dark mode and forced colours follow the tokens');
  assert.match(panel, /var\(--mm-\$\{tone\}-bg\)/);
  for (const size of panel.match(/fontSize: '[^']+'/g) || []) assert.match(size, /calc\([\d.]+ \* var\(--mm-px\)\)/, size);
  assert.doesNotMatch(panel, /\bwidth: \d|minWidth: \d|whiteSpace: 'nowrap'/, 'nothing fixes its width, so it fits a 390px phone');
});

test('Pre-Flight\'s Check step draws the panel, a warning only for a new assignment, and readiness never reads it', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  assert.match(modal, /^import ClassworkExampleCoveragePanel from '\.\/ClassworkExampleCoveragePanel\.jsx';$/m);
  assert.match(modal, /^import \{ classworkExampleCoverage \} from '\.\.\/\.\.\/platform\/supports\/workedExample\/classworkCoverage\.js';$/m);
  const memo = region(modal, 'const classworkExamples = useMemo(', ');', 'the coverage memo');
  assert.match(memo, /classworkExampleCoverage\(\{ sections: preflightModel\.sections, lessonSupports: effectiveAssignmentV5\?\.lessonSupports \}\)/, 'judged on the runtime view students are given');
  const check = region(modal, 'const renderCheck = () => (', '\n  );\n', 'the Check step');
  assert.match(check, /<ClassworkExampleCoveragePanel coverage=\{classworkExamples\} isNew=\{!isUpdateMode\} headingLevel=\{isNarrow \? 4 : 5\} \/>/);
  assert.match(modal, /const isUpdateMode = reviewMode === 'update';/, 'an existing assignment is reviewed in update mode');
  // Never a readiness finding: neither the model, the blockers nor the
  // publish path reads it.
  for (const file of ['src/platform/preflight/assignmentV5PreflightModel.js', 'src/components/teacher/preflightSteps.js', 'src/platform/preflight/preflightDiagnostics.js', 'src/platform/preflight/assignmentAuthoringState.js']) {
    if (!existsSync(path.join(repo, file))) continue;
    assert.doesNotMatch(executableSource(readFileSync(path.join(repo, file), 'utf8')), /classworkCoverage|ClassworkExampleCoverage|classworkExamples/, `${file} does not read the coverage`);
  }
  assert.equal((modal.match(/classworkExamples\b/g) || []).length, 2, 'computed once and only drawn');
});

test('an uncovered Classwork question changes nothing about readiness', () => {
  const lesson = compileLesson();
  const classwork = lesson.sections.find((section) => section.role === 'classwork').questions;
  // Start from a lesson the authoring rules accept (lessonSupportsV5.js refuses
  // an example id the lesson does not have), so the only change below is
  // questions losing the examples that covered them.
  classwork.forEach((question) => { if (question.example === 'ex-not-in-the-lesson') delete question.example; });
  const before = buildAssignmentV5PreflightModel(lesson);
  assert.deepEqual(before.errors, [], 'the starting lesson passes the authoring rules');
  classwork.forEach((question) => { delete question.example; });
  const after = buildAssignmentV5PreflightModel(lesson);
  assert.ok(classworkExampleCoverage({ sections: after.sections }).summary.uncovered > classworkExampleCoverage({ sections: before.sections, lessonSupports: lesson.lessonSupports }).summary.uncovered);
  assert.deepEqual(after.errors, before.errors);
  assert.deepEqual(after.warnings, before.warnings);
  assert.equal(after.authoringState?.state, before.authoringState?.state);
});

/* ----------------------------------------------------------- teacher only */

// Every static import, from each module a student can load: the first load,
// the question player, and every student screen and panel loaded on demand.
const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
const resolve = (from, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};
const importsOf = (file) => [...readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
const studentGraph = (entries) => {
  const parent = new Map(entries.map((entry) => [entry, null]));
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    if (!/\.(m?jsx?)$/.test(file)) continue;
    for (const specifier of importsOf(file)) {
      const resolved = resolve(file, specifier);
      if (resolved && !parent.has(resolved)) { parent.set(resolved, file); queue.push(resolved); }
    }
  }
  return parent;
};
const filesUnder = (relative) => {
  const directory = path.join(repo, relative);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true }).map((name) => path.join(directory, name)).filter((file) => /\.(m?jsx?)$/.test(file) && statSync(file).isFile());
};

test('no student-side entry loads the coverage module or its panel', () => {
  const lazy = readFileSync(path.join(repo, 'src/app/lazyScreens.js'), 'utf8');
  const onDemand = [...lazy.matchAll(/^export const \w+ = (?:studentScreen|studentPanel)\(\(\) => import\('([^']+)'\)/gm)]
    .map((match) => path.resolve(path.join(repo, 'src/app'), match[1]));
  assert.ok(onDemand.length >= 4, 'the student screens loaded on demand are found');
  const entries = [
    path.join(repo, 'src/main.jsx'), path.join(repo, 'src/App.jsx'), path.join(repo, 'src/QuestionEngine.jsx'),
    ...onDemand, ...filesUnder('src/components/student'), ...filesUnder('src/app/student'),
  ].filter((file) => existsSync(file));
  const graph = studentGraph(entries);
  assert.ok(graph.has(path.join(repo, 'src/platform/supports/workedExample/similarProblem.js')), 'the walk reaches the student\'s own worked example');
  for (const file of ['src/platform/supports/workedExample/classworkCoverage.js', 'src/components/teacher/ClassworkExampleCoveragePanel.jsx']) {
    const key = path.join(repo, file);
    const chain = [];
    for (let node = key; node && graph.has(node); node = graph.get(node)) chain.unshift(path.relative(repo, node));
    assert.ok(!graph.has(key), `${file} is reached by a student: ${chain.join(' -> ')}`);
  }
  // Nor a teacher's first load: it comes with the Pre-Flight review, on demand.
  const teacher = teacherFirstLoadGraph();
  const coverage = path.join(repo, 'src/platform/supports/workedExample/classworkCoverage.js');
  assert.ok(!teacher.has(coverage), `in the teacher's first load: ${teacher.has(coverage) ? chainTo(teacher, coverage) : ''}`);
  assert.match(lazy, /^export const LessonPreflightModal = lazy\(\(\) => import\('\.\.\/components\/teacher\/LessonPreflightModal\.jsx'\)\);$/m);
});
