/*
 * "SWAP A SKILL" WIRING (student push D, item 3).
 *
 * The rule itself — what a frozen weekly slot permits — is behaviour-tested in
 * weeklyPathSlotAuthority.test.mjs. These contracts pin that every caller goes
 * through it: the server freeze and launch, the live session service, the
 * session container, the student's Path screen and the Teacher Path Simulator.
 * Each assertion is bound to the region that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the server freezes a week, alternatives included, through the shared rule', () => {
  const source = executableSource(read('functions/index.js'));
  const tools = region(source, 'const WEEKLY_SLOT_TEKS_TOOLS', 'async function sanitizeWeeklyPathGoalProposal', 'weekly slot TEKS tools');
  assert.match(tools, /canonicalTeks: mathPath\.canonicalAlignmentKey/);
  assert.match(tools, /displayTeks: mathPath\.displayAlignmentKey/);
  assert.match(tools, /normalizeFramework: normalizePathAssessmentFramework/);

  const freeze = region(source, 'async function sanitizeWeeklyPathGoalProposal', 'exports.resolveWeeklyPathGoalSnapshot', 'freeze');
  assert.match(freeze, /await import\("\.\/shared\/weeklyPathSlotAuthority\.mjs"\)/);
  assert.match(freeze, /slotAuthority\.freezeWeeklyPathGoalProposal\(goal, \{[\s\S]*?\.\.\.WEEKLY_SLOT_TEKS_TOOLS/);
  assert.match(freeze, /throw new HttpsError\(error\.code, error\.message\)/, 'a malformed proposal is still refused as an HttpsError');

  const resolve = region(source, 'exports.resolveWeeklyPathGoalSnapshot', 'exports.getStudentWeeklyPathGoalSnapshot', 'resolve callable');
  // The freeze is async now. Without the await, `proposed.weekKey` is undefined
  // and every student's week would be written to `${studentId}__undefined`.
  assert.match(resolve, /const proposed = await sanitizeWeeklyPathGoalProposal\(/);
  assert.match(resolve, /doc\(`\$\{studentId\}__\$\{proposed\.weekKey\}`\)/);
  // First freeze still wins: a week already frozen (with or without
  // alternatives) is returned untouched, never backfilled.
  assert.match(resolve, /if \(existing\.exists\) return existing\.data\(\);/);
});

test('a weekly launch is authorized by the shared rule and records the swap', () => {
  const source = executableSource(read('functions/index.js'));
  const start = region(source, 'exports.startMyMathPathSession', 'exports.issueNextQuestion', 'start callable');
  const weekly = region(start, 'const requestedWeeklySlotKey', 'const coursePracticeIntent', 'weekly authority block');

  assert.match(weekly, /slotAuthority\.authorizeWeeklySlotLaunch\(\{/);
  assert.match(weekly, /goal: snapshot\.exists \? \(snapshot\.data\(\) \|\| \{\}\) : null/);
  assert.match(weekly, /weeklySlotKey: requestedWeeklySlotKey/);
  assert.match(weekly, /targetAlignmentKey,/);
  assert.match(weekly, /requestedFramework: assessmentFramework/);
  assert.match(weekly, /chosenSkillId: String\(request\.data\?\.chosenSkillId/);
  assert.match(weekly, /classId: studentClass\?\.classId \|\| null/);
  assert.match(weekly, /\.\.\.WEEKLY_SLOT_TEKS_TOOLS/);
  assert.match(weekly, /if \(!authorization\.ok\) throw new HttpsError\(authorization\.code, authorization\.message/);
  assert.match(weekly, /weeklySlot = authorization\.slot;/);
  // The slot's framework, never the browser's.
  assert.match(weekly, /assessmentFramework = authorization\.assessmentFramework;/);
  // The old exact-standard comparison is gone; it is what refused every swap.
  assert.doesNotMatch(start, /assignedTarget !== targetAlignmentKey/);

  const record = region(start, 'const next = {', 'transaction.set(proposedSessionRef, next);', 'new session document');
  assert.match(record, /weeklySlotKey: requestedWeeklySlotKey,/, 'a swap keeps the slot key, so completion fills the same slot');
  assert.match(record, /intendedDok: weeklySlot\?\.dok \|\| null/, 'rigor comes from the frozen slot');
  assert.match(record, /swappedFromTeks: weeklySwap\?\.swappedFromTeks \|\| null/);
  assert.match(record, /chosenAlternative: weeklySwap\?\.chosenAlternative \|\| null/);
  assert.match(weekly, /weeklySwap = authorization\.swapped\s*\?\s*\{ swappedFromTeks: authorization\.swappedFromTeks, chosenAlternative: authorization\.chosenAlternative \}/);
});

test('the live service and the session container carry the chosen skill to the server', () => {
  const service = executableSource(read('src/services/pathSessionService.js'));
  const start = region(service, 'export const startOrResumePathSession', 'export const fetchMyMathPathSkillProgress', 'live start');
  assert.match(start, /weeklySlot = null, chosenSkillId = null \}\) =>/);
  // Only a weekly launch names a chosen alternative.
  assert.match(start, /const weeklyChosenSkillId = weeklySlotKey && chosenSkillId \? String\(chosenSkillId\) : null;/);
  const payload = region(start, "invokePathCallable('startMyMathPathSession'", '});', 'callable payload');
  assert.match(payload, /chosenSkillId: weeklyChosenSkillId,/);

  const container = executableSource(read('src/components/student/MyMathPathProductionContainer.jsx'));
  const props = region(container, 'export const MyMathPathProductionContainer = ({', '}) => {', 'container props');
  assert.match(props, /chosenSkillId = null,/);
  const launch = region(container, 'const sessionLaunchConfig = useMemo(() => ({', '}), [', 'launch config');
  assert.match(launch, /chosenSkillId,/);
  const deps = region(container, 'const sessionLaunchConfig = useMemo(', 'const contentRefreshNotice', 'launch config deps');
  assert.match(deps, /\}\), \[[^\]]*\bchosenSkillId\b[^\]]*\]\);/);
});

test('the Path screen offers only frozen swaps and launches what was chosen', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  // Imported where it is called: App-level .jsx has no no-undef safety net.
  assert.match(app, /import \{[^}]*\bapplyWeeklySlotChoices\b[^}]*\bmergeWeeklyGoalSnapshot\b[^}]*\bresolveWeeklySlotChoices\b[^}]*\} from '..\/..\/platform\/path\/weeklyPathChoice\.js';/);

  const freeze = region(app, 'const [assignedWeeklyGoal, setAssignedWeeklyGoal]', 'const weeklyGoal = ', 'weekly freeze effect');
  assert.match(freeze, /setAssignedWeeklyGoal\(mergeWeeklyGoalSnapshot\(\{ proposed: proposedWeeklyGoal, snapshot \}\)\)/,
    'a live student\'s swaps come from the server\'s frozen week');
  assert.match(freeze, /sessionProvider\.freezeWeeklyPathGoal\(proposedWeeklyGoal\)/, 'the simulator freezes by the same rule');
  assert.match(freeze, /mergeWeeklyGoalSnapshot\(\{ proposed: proposedWeeklyGoal, snapshot: simulatedSnapshot, assignmentState: 'simulation' \}\)/);
  assert.doesNotMatch(freeze, /\.\.\.snapshot,/, 'the raw spread kept the proposal\'s swaps on a frozen week');
  assert.match(app, /const unfrozenWeeklyGoal = useMemo\(\(\) => mergeWeeklyGoalSnapshot\(\{ proposed: proposedWeeklyGoal \}\)/);
  assert.match(app, /const weeklyGoal = assignedWeeklyGoal \|\| unfrozenWeeklyGoal;/);

  const choices = region(app, 'const weeklyGoalWithChoices = useMemo(', '}, [weeklyGoal,', 'weekly choices');
  // Raw completions: each carries the slot key its session was launched with.
  assert.match(choices, /resolveWeeklySlotChoices\(\{[\s\S]*?choices: weeklyChoices,[\s\S]*?inProgress: weeklyInProgress,[\s\S]*?completions: weeklyCompletions,/);
  assert.match(choices, /applyWeeklySlotChoices\(\{[\s\S]*?isLaunchable: coverageLoaded \? weeklyAlternativeLaunchable : null,/);
  assert.match(app, /const weeklyMatchedCompletions = useMemo\(\(\) => \(weeklyGoal && weeklyCompletions\s*\? matchWeeklyGoalCompletions\(\{ goal: weeklyGoal, completions: weeklyCompletions \}\)\.matched/);
  const launchable = region(app, 'const weeklyAlternativeLaunchable = useCallback(', '}, [coverage]);', 'swap coverage');
  assert.match(launchable, /frameworkCoverageKnown\(coverage, framework\) && isFrameworkSkillLaunchable\(coverage, teksCode, framework\)/);
  assert.match(launchable, /: isSkillLaunchable\(coverage, teksCode\)/);

  const weeklyStart = region(app, 'const startWeeklySession = (session) => {', 'const chooseWeeklySlotAlternative', 'weekly start');
  assert.match(weeklyStart, /chosenSkillId: chosen\?\.studentChose \? \(chosen\.chosenSkillId \|\| null\) : null,/);
  const sessionStart = region(app, 'const startSession = (teksCode, options = {}) => {', 'const launchedRef = useRef(null);', 'session start');
  assert.match(sessionStart, /chosenSkillId: options\.weeklySlotKey \? \(options\.chosenSkillId \|\| null\) : null,/);

  assert.match(app, /goal=\{weeklyGoalWithChoices\}/);
  assert.match(app, /onChooseAlternative=\{chooseWeeklySlotAlternative\}/);
  assert.match(app, /<MyMathPathDashboard[^>]*weeklyGoal=\{weeklyGoalWithChoices\}/s);
  assert.match(app, /<MyMathPathProductionContainer \{\.\.\.sessionConfig\}/);
});

test('the teacher weekly table shows which slots a student swapped', () => {
  const controls = executableSource(read('src/components/teacher/WeeklyPathControls.jsx'));
  // Rows come from buildTeacherWeeklyView, which carries `swaps`.
  assert.match(controls, /const rows = useMemo\(\(\) => buildTeacherWeeklyView\(/);
  const studentCell = region(controls, '<StudentNameLink', '</td>', 'student cell');
  assert.match(studentCell, /row\.swaps\?\.length > 0 &&/);
  assert.match(studentCell, /row\.swaps\.map\(\(swap\) => swap\.sentence\)/);
});

test('the weekly panel promises a swap only where a card offers one', () => {
  const panel = executableSource(read('src/components/student/WeeklyPathGoalPanel.jsx'));
  assert.match(panel, /import \{[^}]*\bweeklyGoalOffersSwap\b[^}]*\} from '..\/..\/platform\/path\/weeklyPathChoice\.js';/);
  // ...and only once the week's sessions are known: the swap control is
  // hidden until then (see the launch-gate contract below).
  assert.match(panel, /const swapOffered = !launchBlocked && weeklyGoalOffersSwap\(\{ goal, completedSlots, inProgress \}\);/);
  // The compact summary (Mastery Overview) renders no session cards, so it
  // must not point at a control on "a card".
  const compactBranch = region(panel, 'if (compact) {', '\n  }\n', 'compact panel');
  assert.match(compactBranch, /swapOffered\s*\?\s*'[^']*\bswap\b[^']*'/, 'the compact copy still mentions swapping when it is offered');
  assert.doesNotMatch(compactBranch, /'[^'\n]*\bswap\b[^'\n]*\bcard\b[^'\n]*'/i, 'the compact summary has no cards to point at');
  // Every sentence that mentions swapping sits behind swapOffered.
  const swapSentences = panel.match(/'[^'\n]*\bswap[^'\n]*'/gi) || [];
  assert.ok(swapSentences.length >= 2);
  swapSentences.forEach((sentence) => {
    const at = panel.indexOf(sentence);
    assert.match(panel.slice(Math.max(0, at - 160), at), /swapOffered\s*\?\s*$/, `unconditional swap promise: ${sentence}`);
  });
  // A card without frozen options renders no swap control at all.
  const slotChoice = region(panel, 'function SlotChoice(', 'export const inProgressForSlot', 'swap control');
  assert.match(slotChoice, /if \(!choice\.canChoose\) return null;/);
});

// FIX PASS, finding 1. After a reload the panel rendered with Start enabled
// before the student's own sessions for the week had loaded (and for good if
// that load failed). A swapped slot then showed its recommendation, and Start
// opened a second session beside the open swap. The server now resumes a
// slot's open session whatever the launch names
// (weeklyPathSlotOneOpenSession.test.mjs); the screen also waits until it
// knows, and resumes on the open session's standard.
test('weekly launches wait until the week\'s sessions are known, and resume what is open', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  // Imported where it is called: App-level .jsx has no no-undef safety net.
  assert.match(app, /import \{[^}]*\bweeklyLaunchSession\b[^}]*\} from '..\/..\/platform\/path\/weeklyPathChoice\.js';/);

  const facts = region(app, 'const [weeklySessionFacts, setWeeklySessionFacts]', 'const weeklyProgress = useMemo(', 'weekly session facts');
  assert.match(facts, /useState\(\{ weekKey: null, completions: null, inProgress: \[\], status: 'loading' \}\)/, 'unsettled until the first load answers');
  const effect = region(facts, 'useEffect(() => {', '}, [weeklyGoalWeekKey,', 'facts effect');
  // Every (re)load unsettles the facts BEFORE it starts reading.
  const unsettle = effect.indexOf("setWeeklySessionFacts((current) => (current.status === 'loading' ? current : { ...current, status: 'loading' }));");
  assert.ok(unsettle > -1 && unsettle < effect.indexOf('const load ='), 'a reload marks the facts loading before it reads');
  assert.match(region(effect, '.then((facts) => {', '.catch(', 'facts loaded'), /status: 'ready'/);
  assert.match(region(effect, '.catch((caught) => {', 'return () =>', 'facts failed'), /status: 'failed'/);
  // Facts for another week are not this week's.
  assert.match(facts, /const weeklyFactsStatus = weeklySessionFacts\.weekKey === weeklyGoalWeekKey \? weeklySessionFacts\.status : 'loading';/);
  assert.match(facts, /const retryWeeklyFacts = useCallback\(\(\) => setWeeklyRefreshKey\(\(value\) => value \+ 1\), \[\]\);/);

  const weeklyStart = region(app, 'const startWeeklySession = (session) => {', 'const chooseWeeklySlotAlternative', 'weekly start');
  const gate = weeklyStart.indexOf("if (weeklyFactsStatus !== 'ready') {");
  assert.ok(gate > -1, 'startWeeklySession refuses until the facts are ready');
  assert.match(region(weeklyStart, "if (weeklyFactsStatus !== 'ready') {", '}\n', 'gate body'), /\breturn;/);
  assert.ok(gate < weeklyStart.indexOf('startSession('), 'the gate comes before the launch');
  // An opened slot is relaunched on the standard it was opened with.
  assert.match(weeklyStart, /const chosen = weeklyLaunchSession\(\{ session, inProgress: weeklyInProgress \}\);/);

  const panelElement = region(app, '<WeeklyPathGoalPanel', '/>', 'Path weekly panel');
  assert.match(panelElement, /factsStatus=\{weeklyFactsStatus\}/);
  assert.match(panelElement, /onRetryFacts=\{retryWeeklyFacts\}/);

  const panel = executableSource(read('src/components/student/WeeklyPathGoalPanel.jsx'));
  assert.match(panel, /const launchBlocked = factsStatus !== 'ready';/);
  const nextButton = region(panel, 'onClick={() => onStartSession?.(next)}', '</button>', '"do this next" button');
  assert.match(nextButton, /disabled=\{busy \|\| launchBlocked\}/);
  assert.match(nextButton, /blockedLabel \|\| weeklyStartLabel\(next/);
  const cards = region(panel, '<SessionCard', '/>', 'session cards');
  assert.match(cards, /disabled=\{busy \|\| launchBlocked\}/);
  assert.match(cards, /swapHidden=\{launchBlocked\}/);
  assert.match(panel, /\{!done && !active && !swapHidden && <SlotChoice/);
  // A failed load says so and offers a retry, instead of a silent dead button.
  const failed = region(panel, "{factsStatus === 'failed' && (", '</div>\n      )}', 'facts failed notice');
  assert.match(failed, /role="alert"/);
  assert.match(failed, /onClick=\{\(\) => onRetryFacts\(\)\}/);
  assert.match(failed, /Start is paused/);
});
