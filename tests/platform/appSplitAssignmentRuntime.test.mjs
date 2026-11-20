/*
 * THE ASSIGNMENT RUNTIME'S HANDLERS LEFT APP, AND THE SEAMS LINE UP.
 *
 * Slice 6 of the App split moved, verbatim, the functions a student's open
 * assignment calls: grading and Submit, a question's scratchpad, the printable
 * worksheet, moving between questions, writing time on task, and the outbox
 * that sends an answer the device is holding. They are plain functions App
 * builds on every render, as it did when they were inline, each handed what
 * it reads by position (helpers/appScreens.mjs explains the seam).
 *
 * What keeps the move honest:
 *
 *   - position: App's arguments and the module's parameters, and the module's
 *     result and the names App takes from it, are the same names in order;
 *   - a factory holds no hook and no state. Three of them are called a few
 *     statements below where their first function used to sit (below the last
 *     thing they read), which is only the same program if building them has
 *     no effect and nothing reads them during render before that point;
 *   - App keeps the state, the refs, the effects and handleResponseCheckpoint
 *     (a useCallback), so the order of App's hooks is untouched
 *     (scripts/app-hook-ledger.mjs holds it against main).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { planExtraction } from '../../scripts/codemods/extract-app-hook.mjs';
import { appFactoryPaths, appFactorySeam, appFactorySource, teacherControlsSeamProblem } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const FACTORIES = {
  createGradingControls: ['countedQuestionFor', 'countedQuestionKnownFor', 'terminalCountingFor', 'familyDeliveryForQuestion', 'handleGradeSubmit', 'handleStepGrade', 'handleRequestNewQuestion'],
  createScratchpadControls: ['getScratchpadDocumentId', 'loadScratchpadRecord', 'handleLoadScratchpad', 'handleSaveScratchpad'],
  createStudentWorksheetExport: ['exportAssignmentWorksheetPdf'],
  createQuestionNavigation: ['changeQuestion'],
  createAssignmentActivityFlush: ['flushAssignmentActivity'],
  createStudentOutbox: ['drainStudentOutbox', 'reconcileAndReportStudentOutbox'],
};

test('each runtime factory is imported from src/app/student, called once by position, and returns its functions in order', () => {
  for (const [name, returned] of Object.entries(FACTORIES)) {
    assert.match(appFactoryPaths()[name] || '', /^src\/app\/student\/\w+\.js$/, name);
    assert.doesNotThrow(() => appFactorySource(name));
    const seam = appFactorySeam(name);
    assert.deepEqual(seam.returned, returned, `${name} returns what App takes`);
    assert.equal(new Set(seam.parameters).size, seam.parameters.length, `${name} names each parameter once`);
    for (const fn of returned) {
      assert.match(seam.source, new RegExp(`^ {2}(?:const ${fn} = |(?:async )?function ${fn}\\()`, 'm'), `${fn} is defined in ${seam.path}`);
    }
  }
});

test('the check sees a runtime seam that is out of order, short or renamed', () => {
  const seam = appFactorySeam('createGradingControls');
  assert.equal(teacherControlsSeamProblem('x', seam), null);
  const swap = (list) => [list[1], list[0], ...list.slice(2)];
  assert.match(teacherControlsSeamProblem('x', { ...seam, passed: swap(seam.passed) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, passed: seam.passed.slice(0, -1) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, taken: swap(seam.taken) }), /takes .* but .* returns/);
});

test('a runtime factory holds no hook and no state, so where in the render App builds it changes nothing', () => {
  for (const name of Object.keys(FACTORIES)) {
    const code = executableSource(read(appFactoryPaths()[name]));
    assert.doesNotMatch(code, /\buse[A-Z]\w*\(/, `${name} calls no hook`);
    assert.doesNotMatch(code, /from 'react'/, `${name} imports nothing from React`);
  }
});

test('App keeps the runtime\'s state, refs and its one memoised handler', () => {
  const app = executableSource(read('src/App.jsx'));
  for (const owned of [
    /const \[tracker, setTracker\] = useState\(/, /const \[practiceTracker, setPracticeTracker\] = useState\(/,
    /const \[studentOutboxDepth, setStudentOutboxDepth\] = useState\(/, /const studentReportCoordinatorRef = useRef\(/,
    /const loadedScratchpadPageCounts = useRef\(/, /const familyDeliveriesRef = useRef\(/, /const dealtFamilyQuestionsRef = useRef\(/,
    /const pendingAssignmentSecondsRef = useRef\(/, /const handleResponseCheckpoint = useCallback\(/,
  ]) assert.match(app, owned);
  // And defines none of the moved functions itself any more.
  for (const fn of Object.values(FACTORIES).flat()) {
    assert.doesNotMatch(app, new RegExp(`(?:const ${fn} = (?:async )?\\(|function ${fn}\\()`), `App no longer defines ${fn}`);
  }
});

test('nothing reads a runtime factory\'s functions during render above where App builds them', () => {
  // The extraction tool's own reading of App (an AST): were the call statement
  // moved into a module called from the same place, it reports every statement
  // above it that reads one of its results during render.
  for (const name of Object.keys(FACTORIES)) {
    const plan = planExtraction({
      source: 'src/App.jsx', component: 'App', hook: 'useProbe', file: 'src/app/student/useProbe.js', statements: [`~= ${name}(`],
    }, read);
    assert.ok(plan.outputList.length > 0, `${name}: the probe sees what the call declares`);
    assert.deepEqual(plan.problems.filter((problem) => /during render, above the call site/.test(problem)), [], name);
  }
});

test('the order the factories are built in follows what each is handed', () => {
  // A factory's argument is read when App calls it, so what one factory hands the
  // next must already exist: the outbox before the question navigation and the
  // grading that drain and report through it; the activity flush before both.
  const app = executableSource(read('src/App.jsx'));
  const at = (name) => { const index = app.indexOf(`= ${name}(`); assert.ok(index > 0, `${name} is called`); return index; };
  for (const [earlier, later, handed] of [
    ['createStudentOutbox', 'createQuestionNavigation', 'drainStudentOutbox'],
    ['createStudentOutbox', 'createGradingControls', 'reconcileAndReportStudentOutbox'],
    ['createAssignmentActivityFlush', 'createQuestionNavigation', 'flushAssignmentActivity'],
    ['createAssignmentActivityFlush', 'createGradingControls', 'flushAssignmentActivity'],
    ['createGradingControls', 'createStudentNavigation', 'terminalCountingFor'],
  ]) {
    assert.ok(at(earlier) < at(later), `${earlier} is built before ${later}`);
    assert.ok(appFactorySeam(earlier).returned.includes(handed) && appFactorySeam(later).parameters.includes(handed), `${later} is handed ${handed} from ${earlier}`);
  }
});
