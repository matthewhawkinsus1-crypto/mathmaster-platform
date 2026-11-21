// NO GRADE, ATTEMPT OR MASTERY PATH READS THE TEACHER SIGNALS
// (docs/platform/SHOWING_THE_PROCESS.md, section 7; build plan SP-2).
//
// The signals are facts for a teacher's conversation. This suite proves they
// cannot reach a score by reading every path that could carry them there:
//
//   1. every source file of the web app and of both backends. Only the files
//      named below may mention the signals at all, and none of them grades;
//   2. the files on that list that an attempt also passes through (the
//      question engine, the assignment screen, App, the presence payload),
//      statement by statement: the signals leave through their own callback
//      and are never an argument of a grade call, a part of its result or a
//      field of the attempt;
//   3. the grade, attempt and mastery paths by name, so a renamed folder
//      cannot empty the walk in 1 without this suite saying so;
//   4. the stored record's rules: no rule of the grade document, its response
//      detail or its evidence reads the signals collection.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { functionsBackendPaths } from './helpers/functionsBackendSource.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(repo, file), 'utf8');

// Any spelling of the signals: the collection, the kinds, the count on the
// heartbeat, the modules and the teacher's panel.
const SIGNAL_WORDS = /attempt[-_ ]?signals?|leftThenRight|hardFirstTry|WorthAConversation|worth[-_ ]a[-_ ]conversation/i;

const SOURCE_ROOTS = ['src', 'functions', 'functions-path-admin'];
const walk = (dir, found = []) => {
  for (const entry of readdirSync(path.join(repo, dir))) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const relative = `${dir}/${entry}`;
    if (statSync(path.join(repo, relative)).isDirectory()) walk(relative, found);
    else if (/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(entry)) found.push(relative);
  }
  return found;
};
const sourceFiles = SOURCE_ROOTS.flatMap((root) => walk(root));

// Who may mention the signals, and why none of it is a grade.
const MAY_MENTION = new Map([
  ['src/platform/signals/attemptSignalFacts.js', 'the facts and the stored record'],
  ['src/platform/signals/attemptSignalWriter.js', "the student's one write"],
  ['src/platform/signals/useAttemptSignals.js', "the engine's tracker hook"],
  ['src/platform/teacher/attemptSignalsView.js', 'what a teacher reads'],
  ['src/platform/teacher/attemptSignalsStore.js', "the teacher's read and dismissal"],
  ['src/components/teacher/WorthAConversation.jsx', "the teacher's panel"],
  ['src/components/teacher/StudentProfileDrawer.jsx', "the panel in a student's results"],
  ['src/components/teacher/LiveClassMonitor.jsx', 'the panel on a Live tile'],
  ['src/app/teacher/teacherPanels.js', "fetches the tile's panel on demand"],
  ['src/app/teacher/teacherPanelPrefetch.js', 'fetches it while the browser is idle'],
  ['src/QuestionEngine.jsx', 'raises the facts beside the attempt'],
  ['src/app/student/assignmentWorkspaceView.jsx', 'hands the facts to the writer'],
  ['src/App.jsx', 'puts the count on the heartbeat'],
  ['src/livePresence.js', 'the count on the heartbeat'],
]);

test('the walk reaches the app and both backends (so an absence below means something)', () => {
  assert.ok(sourceFiles.length > 1500, `only ${sourceFiles.length} source files were read`);
  for (const file of ['src/App.jsx', 'src/QuestionEngine.jsx', 'functions/index.js', 'functions/gradingFunctions.js', 'functions/shared/attemptPolicy.mjs', 'functions/lib/mathPath.js']) {
    assert.ok(sourceFiles.includes(file), `${file} was not read: the walk or the layout changed`);
  }
  for (const file of functionsBackendPaths()) assert.ok(sourceFiles.includes(file), `${file} was not read`);
});

test('only the signal modules, the teacher screens and four hand-off points mention the signals', () => {
  const mentioning = sourceFiles.filter((file) => SIGNAL_WORDS.test(read(file)));
  const unexpected = mentioning.filter((file) => !MAY_MENTION.has(file));
  assert.deepEqual(unexpected, [], 'a file outside the signal modules mentions the teacher signals. If it grades, records an attempt or computes mastery it must not read them; if it is a new teacher screen, add it to MAY_MENTION with its reason.');
  // And the list is not padded: each file on it still does.
  for (const file of MAY_MENTION.keys()) assert.ok(mentioning.includes(file), `${file} no longer mentions the signals: take it off MAY_MENTION`);
});

test('no backend code mentions the signals: nothing a server grades, finalizes, archives or syncs can read them', () => {
  const backend = sourceFiles.filter((file) => file.startsWith('functions/') || file.startsWith('functions-path-admin/'));
  assert.ok(backend.length > 300, `only ${backend.length} backend files were read`);
  assert.deepEqual(backend.filter((file) => SIGNAL_WORDS.test(read(file))), []);
});

// 3. The grade, attempt and mastery paths, by name.
const GRADE_PATHS = [
  // The attempt on the device: recorded, queued, sent.
  'src/app/student/gradingControls.js', 'src/app/student/studentOutbox.js', 'src/attemptPolicy.js',
  'src/questionDraftStorage.js', 'src/platform/supports/AttemptContext.js',
  // Marking, on the device and shared with the server.
  'src/MultiAnswerGrader.jsx', 'src/grading', 'src/platform/grading', 'src/platform/grades',
  'functions/shared/attemptPolicy.mjs', 'functions/shared/ordinaryResponseGrading.mjs',
  'functions/shared/answerEquivalence.mjs', 'functions/shared/legacyFieldGrading.mjs',
  'functions/shared/responseCheckpointSchema.mjs', 'functions/shared/attemptEvidenceEvent.mjs',
  'functions/shared/gradeEntryStorage.mjs', 'functions/shared/gradeDocumentAuthority.mjs',
  // Grades on the server, and where they go.
  'functions/gradingFunctions.js', 'functions/classroomFunctions.js', 'functions/testCycleFunctions.js',
  'functions/lib/gradeDetailStore.js', 'functions/lib/classroomGradeRuntime.js', 'functions/lib/sectionRecoveryGrades.js',
  'functions/lib/studentSessionSummary.js', 'src/platform/gradeTransfer',
  // Mastery.
  'src/masteryEngine.js', 'src/platform/mastery', 'functions/shared/masteryRule.mjs',
  'functions/shared/masteryScoring.mjs', 'functions/shared/masteryHistory.mjs', 'functions/shared/practiceMastery.mjs',
  'functions/mathPathFunctions.js', 'functions/lib/mathPath.js', 'functions/lib/favourableMastery.js',
];

test('every grade, attempt and mastery path is read, and none mentions the signals', () => {
  for (const entry of GRADE_PATHS) {
    const files = sourceFiles.filter((file) => file === entry || file.startsWith(`${entry}/`));
    assert.ok(files.length > 0, `${entry} was not found: name the path that replaced it`);
    for (const file of files) {
      // The answer boxes name their part for the paste fact, in an attribute
      // that says nothing of the signals; nothing else is allowed either.
      assert.doesNotMatch(read(file), SIGNAL_WORDS, `${file} is a grade path and mentions the teacher signals`);
    }
  }
});

// 2. The hand-off points, statement by statement.
const engine = executableSource(read('src/QuestionEngine.jsx'));

test('the question engine: the facts leave through onAttemptSignal and nowhere else', () => {
  // Every use of the tracker is one of these and nothing more.
  const uses = engine.split('\n').filter((line) => /attemptSignals\b/.test(line)).map((line) => line.trim());
  const allowed = [
    /^const attemptSignals = useAttemptSignals\(\{$/,
    /^if \(isComposed\) attemptSignals\.noteToolWork\(\);$/,
    /^attemptSignals\.attemptSubmitted\(\{$/,
    /^if \(list\.length\) attemptSignals\.noteToolWork\(\);$/,
    /onPasteCapture=\{attemptSignals\.onPasteCapture\}/,
  ];
  for (const line of uses) assert.ok(allowed.some((pattern) => pattern.test(line)), `an unexpected use of the signal tracker: ${line}`);
  assert.equal(uses.length, allowed.length, 'the tracker is used exactly where this test knows of');
  // What it returns is never kept: no value of it can reach a grade.
  assert.doesNotMatch(engine, /(?:=|return|await|\(|,)\s*attemptSignals\.(?:attemptSubmitted|noteToolWork)\(/);
  // The host's recorder is handed to the tracker, and only to it.
  const recorderUses = engine.split('\n').filter((line) => /\bonAttemptSignal\b/.test(line)).map((line) => line.trim());
  assert.deepEqual(recorderUses, ['onAttemptSignal = null,', 'onAttemptSignal,']);
});

test('the question engine: no grade call, step grade or support usage carries a signal', () => {
  const calls = [...engine.matchAll(/\bon(?:Grade|StepGrade)\??\.?\(/g)];
  assert.ok(calls.length >= 5, `found only ${calls.length} grade calls in the engine`);
  for (const call of calls) {
    // The call's own arguments: up to the statement's closing ");".
    const args = engine.slice(call.index, engine.indexOf(');', call.index));
    assert.doesNotMatch(args, SIGNAL_WORDS, `a grade call is handed a signal: ${args.slice(0, 120)}`);
  }
  const usage = region(engine, 'const attemptSupportUsage', '};', 'attemptSupportUsage');
  assert.doesNotMatch(usage, SIGNAL_WORDS);
  // The facts are raised only after the attempt is with the host's grading.
  const submit = region(engine, 'const result = await onGrade(', 'const nextFeedback = result ||', 'the answer submit');
  assert.match(submit, /attemptSignals\.attemptSubmitted\(/);
});

test('the tracker is told what was marked; it is never asked what to mark', () => {
  const facts = executableSource(read('src/platform/signals/attemptSignalFacts.js'));
  const hook = executableSource(read('src/platform/signals/useAttemptSignals.js'));
  const writer = executableSource(read('src/platform/signals/attemptSignalWriter.js'));
  // The signal modules import no grader, no attempt policy and no mastery.
  const imports = (source) => [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(imports(facts), ['../../studentSupport.js']);
  assert.deepEqual(imports(hook), ['react', './attemptSignalFacts.js']);
  assert.deepEqual(imports(writer), ['firebase/firestore', './attemptSignalFacts.js']);
  // The student's device writes a signal and never reads one back.
  assert.match(writer, /import \{ doc, serverTimestamp, setDoc \} from 'firebase\/firestore'/);
  assert.doesNotMatch(`${facts}\n${hook}\n${writer}`, /\b(?:getDoc|getDocs|onSnapshot|updateDoc|httpsCallable)\b/);
});

test('the assignment screen and App: one hand-off each, to the writer and to the heartbeat', () => {
  const view = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  const viewUses = view.split('\n').filter((line) => SIGNAL_WORDS.test(line)).map((line) => line.trim());
  assert.equal(viewUses.length, 3, `the assignment screen mentions the signals on ${viewUses.length} lines`);
  assert.match(viewUses[0], /^import \{ recordAttemptSignal \} from '..\/..\/platform\/signals\/attemptSignalWriter\.js';$/);
  assert.match(viewUses[1], /^onAttemptSignal: preview \|\| lifecycle\.isPracticeOnly \|\| user\?\.role !== 'student' \|\| !user\?\.id$/, 'no signal in a preview, on post-deadline practice, or for anyone but the student');
  assert.match(viewUses[2], /^: \(fact\) => \{ void recordAttemptSignal\(\{/, 'the write is fired and forgotten: nothing waits on it or reads its result');

  const app = executableSource(read('src/App.jsx'));
  const appUses = app.split('\n').filter((line) => SIGNAL_WORDS.test(line)).map((line) => line.trim());
  assert.deepEqual(appUses, [
    "import { attemptSignalCount } from './platform/signals/attemptSignalWriter.js';",
    'attemptSignalCount: attemptSignalCount(user.id, activeAssignmentId),',
  ]);
  // That one line is inside the Live heartbeat's payload.
  const heartbeat = region(app, '...buildLiveStatus({', 'pageVisible:', 'the heartbeat payload');
  assert.match(heartbeat, /attemptSignalCount: attemptSignalCount\(/);
});

test('the grade document is not a place a signal is stored, and its rules do not read one', () => {
  const rules = read('firestore.rules');
  const block = region(rules, 'match /attemptSignals/{signalId} {', 'allow delete: if false;', 'the attemptSignals rules');
  assert.match(block, /allow read: if rootAdmin\(\) \|\| teachesPresenceStudent\(studentId\);/, 'teachers only: no student reads a signal');
  assert.doesNotMatch(block, /ownsStudent\(studentId\)[^;]*\n?[^;]*allow read|allow read[^;]*ownsStudent/);
  // Outside its own block, its validators and the heartbeat's count, the
  // rules never name the signals: no grade rule depends on one.
  const elsewhere = rules
    .replace(region(rules, 'TEACHER SIGNALS: one fact about one attempt', 'function attemptSignalDismissalValid', 'the validators'), '')
    .replace(region(rules, 'function attemptSignalDismissalValid', '}\n', 'the dismissal validator'), '')
    .replace(region(rules, 'TEACHER SIGNALS (docs/platform/SHOWING_THE_PROCESS.md', 'allow delete: if false;', 'the match block'), '');
  const stray = executableSource(elsewhere).split('\n').filter((line) => SIGNAL_WORDS.test(line)).map((line) => line.trim());
  assert.deepEqual(stray, [
    "'attemptSignalCount',",
    "&& (!data.keys().hasAny(['attemptSignalCount'])",
    '|| (data.attemptSignalCount is int && data.attemptSignalCount >= 0 && data.attemptSignalCount <= 999));',
  ]);
});
