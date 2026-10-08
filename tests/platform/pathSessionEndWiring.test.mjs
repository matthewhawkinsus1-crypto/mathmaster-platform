/*
 * THE SESSION END SCREEN, WIRED (student push D, item 4).
 *
 * The rules are tested as behaviour in pathSessionEnd.test.mjs and
 * pathSessionRecap.test.mjs. These contracts bind the screen to them: the
 * container asks for the recap only once the session is completed, leads with
 * the next weekly session from the counted week, freezes mastery when the
 * session opens, and My Math Path hands it the week, the launcher and the live
 * server profile. Nothing renders React here, so these read source — anchored
 * to the statement that does the work, never to a name anywhere in the file.
 * Browser proof: tests/browser/pathSessionEnd.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const container = read('src/components/student/MyMathPathProductionContainer.jsx');
const containerCode = executableSource(container);

test('the container asks for the recap only once the session is completed', () => {
  assert.match(containerCode, /const completedSessionId = sessionCompleted \? session\?\.sessionId \|\| null : null;/);
  assert.match(containerCode, /const sessionCompleted = session\?\.status === 'completed';/);
  const effect = region(containerCode, 'useEffect(() => {\n    if (!completedSessionId', '}, [completedSessionId, fetchPathSessionRecap, recapRequest]);', 'recap effect');
  assert.match(effect, /fetchPathSessionRecap\(\{ sessionId: completedSessionId \}\)/);
  assert.equal(containerCode.split('fetchPathSessionRecap({').length - 1, 1, 'no other code path asks for a recap');
  assert.match(containerCode, /fetchPathSessionRecap = null,\n  \} = provider;/, 'the recap comes from the injected runtime, so the simulator never calls production');
  assert.match(containerCode, /<MyMathPathSessionRecap recap=\{recap\} onRetry=/);
});

test('the end screen leads with the next weekly session, from the counted week, and keeps the way back', () => {
  const end = region(containerCode, 'if (sessionOver && !awaitingContinue) {', 'return (\n    <>\n      {submissionError', 'session end view');
  assert.match(end, /const nextStep = chooseSessionEndNextStep\(\{\s*session,\s*weeklyEnd: weeklySessionEnd,\s*completesWeeklyGoal,\s*canStartNext: typeof onStartNextWeeklySession === 'function',\s*\}\);/);
  assert.match(end, /const weeklyTargetReached = nextStep\.kind === SESSION_END_STEP\.WEEKLY_GOAL_COMPLETE;/);
  assert.doesNotMatch(end, /completesWeeklyGoal && !paused/, 'the celebration is not decided by the launch-time flag alone');
  assert.match(end, /<SessionEndActions nextStep=\{nextStep\} onStartNext=\{onStartNextWeeklySession\} onReturnToDashboard=\{onReturnToDashboard\} \/>/);
  assert.match(end, /<MyMathPathSkillsMoved skillsMoved=\{skillsMoved\} \/>/);
  const actions = region(containerCode, 'function SessionEndActions(', '\n}\n', 'end actions');
  assert.match(actions, /onClick=\{\(\) => onStartNext\(next\)\}/);
  // The panel's own label, so "Start session 3 of 4" / "Resume session 3" can
  // never disagree with the card the student would otherwise have pressed.
  assert.match(actions, /weeklyStartLabel\(next, nextStep\.nextInProgress, nextStep\.required\)/);
  assert.match(actions, /onClick=\{onReturnToDashboard\}[^>]*>Back to My Math Path</);
  for (const [name, path] of [
    ['chooseSessionEndNextStep', '../../platform/path/pathSessionEnd.js'],
    ['weeklyStartLabel', './WeeklyPathGoalPanel.jsx'],
    ['describeSessionSkillsMoved', '../../platform/mastery/sessionSkillMovement.js'],
  ]) {
    assert.match(container, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '${path.replace(/[.]/g, '\\.')}';`), `${name} must be imported`);
  }
  assert.match(container, /import MyMathPathSessionRecap from '\.\/MyMathPathSessionRecap\.jsx';/);
  assert.match(container, /import MyMathPathSkillsMoved from '\.\/MyMathPathSkillsMoved\.jsx';/);
});

test('mastery is frozen when the session opens and compared with the live profile it is handed', () => {
  assert.match(containerCode, /const \[masteryAtStart\] = useState\(\(\) => snapshotMasteryAtSessionStart\(\{\s*masteryProfilesByTEKS,\s*serverProfiles: liveServerMasteryProfiles,\s*\}\)\);/);
  const memo = region(containerCode, 'const skillsMoved = useMemo(() => describeSessionSkillsMoved({', '}), [', 'skills moved');
  assert.match(memo, /start: masteryAtStart,/);
  assert.match(memo, /liveServerProfiles: liveServerMasteryProfiles,/);
  assert.match(memo, /simulated: Boolean\(sessionProvider\),/);
});

test('the review shows the answer once: the key only where the worked solution has no answer line', () => {
  const recap = executableSource(read('src/components/student/MyMathPathSessionRecap.jsx'));
  const item = region(recap, 'function RecapItem(', '\n}\n', 'recap item');
  assert.match(item, /const correct = review\?\.answerSummary \? \[\] : \(item\.correctAnswer \|\| \[\]\);/);
  assert.match(item, /<PathSolutionReview review=\{review\} wasCorrect=\{false\} \/>/);
  assert.match(item, /<PathQuestionStimulus stimulus=\{item\.question\?\.stimulus \|\| null\} \/>/);
});

test('My Math Path keys the container per launch and hands it the week, the launcher and the live mastery', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.match(app, /import \{ describeWeeklySessionEnd, sessionLaunchKey \} from '\.\.\/\.\.\/platform\/path\/pathSessionEnd\.js';/);
  const element = region(app, '<MyMathPathProductionContainer', '/>}', 'session container');
  assert.match(element, /key=\{sessionLaunchKey\(sessionConfig\)\}/);
  assert.match(element, /onStartNextWeeklySession=\{readOnly \? null : startWeeklySession\}/, 'a read-only teacher view never gets a launcher');
  assert.match(element, /liveServerMasteryProfiles=\{sessionProvider \? null : serverMasteryProfiles\}/);
  assert.match(element, /masteryProfilesByTEKS=\{masteryData\.masteryProfilesByTEKS\}/);
  assert.match(element, /weeklySessionEnd=\{weeklySessionEnd\}/);
  assert.match(element, /onSessionComplete=\{\(finished\) => \{ setFinishedSession\(finished \|\| null\);/);
  assert.match(app, /const weeklySessionEnd = useMemo\(\(\) => describeWeeklySessionEnd\(\{\s*goal: weeklyGoalWithChoices, completions: weeklyCompletions, inProgress: weeklyInProgress, finishedSession,/);

  // The live app hands over its existing subscription, by value.
  const shell = executableSource(read('src/App.jsx'));
  const mathPath = region(shell, '<MyMathPathApp', '/>', 'MyMathPathApp element');
  assert.match(mathPath, /serverMasteryProfiles=\{studentServerMasteryProfiles\}/);
  assert.match(shell, /const \[studentServerMasteryProfiles, setStudentServerMasteryProfiles\] = useState\(null\);/);
});

test('no student-facing copy says free practice is locked or unlocked', () => {
  for (const file of [
    'src/components/student/MyMathPathProductionContainer.jsx',
    'src/components/student/MyMathPathApp.jsx',
    'src/components/student/WeeklyPathGoalPanel.jsx',
    'src/components/student/MyMathPathSessionRecap.jsx',
    'src/components/student/MyMathPathSkillsMoved.jsx',
    'src/components/student/StudentLearningPath.jsx',
  ]) {
    assert.doesNotMatch(executableSource(read(file)), /free[- ]choice paths are (?:un)?locked|unlocked for the rest of the week|free practice is (?:un)?locked|finish your weekly target first/i, file);
  }
  assert.match(containerCode, /Anything else you practise this week is extra\./);
});
