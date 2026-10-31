/*
 * NV14: THE SCREENS INSIDE A SCREEN HAVE ENTRIES OF THEIR OWN.
 *
 * A Recovery opens over its result page, Corrections and the Test review
 * inside the Test Cycle card, a practice test inside Tests & Exams. None had a
 * history entry, so browser Back left the whole page or card and a reload lost
 * the student's place. These pin the route model
 * (src/platform/student/browserHistory.js, testCycleViewHistory.js,
 * openSecureExamMemory.js), the arrival a reload makes, and how App and the
 * screens use them. tests/browser/teacherWorkflow/innerScreenBackJourneys.mjs
 * drives Back, Forward and a reload through them in the real App.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSIGNMENTS_VIEW_STATE_KEY,
  RECOVERY_ROUTE_SECTIONS,
  ROUTE_OWNER_STATE_KEY,
  SECURE_EXAMS_VIEW_STATE_KEY,
  STUDENT_ROUTE_STATE_KEY,
  TEST_CYCLE_VIEW_STATE_KEY,
  normalizeStudentRoute,
  readStudentRouteState,
  recoveryModeToRestore,
  recoveryResultPageRoute,
  studentRouteKey,
  writeStudentRouteState,
} from '../../src/platform/student/browserHistory.js';
import {
  TEST_CYCLE_VIEW,
  readTestCycleView,
  testCycleModeFor,
  testCycleViewFor,
  testCycleViewOffered,
  writeTestCycleView,
} from '../../src/platform/student/testCycleViewHistory.js';
import { readOpenSecureExam, withOpenTestFirst, writeOpenSecureExam } from '../../src/platform/student/openSecureExamMemory.js';
import { planStudentArrival, readUrlArrival } from '../../src/app/routes/urlArrival.js';
import { studentPathFor } from '../../src/app/routes/appUrl.js';
import { RECOVERY_SECTIONS } from '../../functions/shared/recoveryPolicy.mjs';
import { resolveTestCycleStage } from '../../functions/shared/testCycleStages.mjs';
import { normalizeTestCyclePolicy } from '../../functions/shared/testCyclePolicy.mjs';
import { buildStudentRecoverySummary } from '../../src/platform/recovery/studentRecoveryModel.js';
import {
  CROSS_DEVICE_STUDENT_ID,
  EXCLUDED_STUDENT_ID,
  HELD_STUDENT_ID,
  RECOVERY_ASSIGNMENT_ID,
  RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID,
  RECOVERY_SHARED_ASSIGNMENT_ID,
  addRecoveryHoldScenario,
} from '../browser/teacherWorkflow/recoveryFixture.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

/*
 * One browser tab: entries, the one on show, and the address. The modules
 * read `window.history` and `window.location` when called, so each test hands
 * them a fresh tab.
 */
const openTab = ({ state = null, url = 'https://mathmaster.test/' } = {}) => {
  const entries = [{ state, url }];
  let at = 0;
  const tab = {
    entries,
    get at() { return at; },
    back() { at = Math.max(0, at - 1); return entries[at].state; },
    history: {
      get state() { return entries[at].state; },
      pushState(next, _title, href) { entries.splice(at + 1); entries.push({ state: next, url: String(href ?? entries[at].url) }); at += 1; },
      replaceState(next, _title, href) { entries[at] = { state: next, url: String(href ?? entries[at].url) }; },
    },
    location: { get href() { return entries[at].url; }, pathname: new URL(url).pathname, search: '' },
  };
  globalThis.window = tab;
  return tab;
};
test.afterEach(() => { delete globalThis.window; });

const STUDENT_UID = 'uid-harper';

// ----------------------------------------------------------------- Recovery

test('a Recovery is an entry of its own over its result page; the address stays the page\'s', () => {
  const page = { surface: 'assignmentResult', assignmentId: 'a1', sectionKey: 'whole', origin: 'grades' };
  const recovery = { ...page, recoverySection: 'dol' };
  assert.deepEqual(normalizeStudentRoute(recovery), { ...page, recoverySection: 'dol' });
  assert.notEqual(studentRouteKey(recovery), studentRouteKey(page), 'opening a Recovery pushes an entry');
  assert.notEqual(studentRouteKey(recovery), studentRouteKey({ ...page, recoverySection: 'warmup' }));
  // Only a section that has a Recovery, and nothing about the work: no mode,
  // so a practice that turns into the second try stays one entry.
  assert.equal('recoverySection' in normalizeStudentRoute({ ...page, recoverySection: 'classwork' }), false);
  assert.deepEqual(normalizeStudentRoute({ ...recovery, mode: 'assessment', answers: { q1: '7' } }), normalizeStudentRoute(recovery));
  assert.equal(studentPathFor(recovery), '/assignments/a1/results');
  assert.equal(studentPathFor(recovery), studentPathFor(page));
  assert.deepEqual(readStudentRouteState({ [STUDENT_ROUTE_STATE_KEY]: recovery }), normalizeStudentRoute(recovery));
  // The page underneath, which App writes first for a Recovery opened elsewhere.
  assert.deepEqual(recoveryResultPageRoute(recovery), normalizeStudentRoute(page));
  assert.equal(recoveryResultPageRoute(page), null);
  assert.equal(recoveryResultPageRoute({ surface: 'dashboard', dashboardMode: 'grades', recoverySection: 'dol' }), null);
});

test('the Recovery sections in an entry are the ones with a Recovery', () => {
  assert.deepEqual([...RECOVERY_ROUTE_SECTIONS], [...RECOVERY_SECTIONS]);
});

test('a restored Recovery opens as its result page\'s panel would open it now, or not at all', () => {
  // The harness school's real Recovery records, built by the shared server
  // code, read by the summary the result page's panel shows.
  const fixture = {};
  const now = Date.now();
  addRecoveryHoldScenario({ fixture, now, teacherEmail: 'teacher@example.test' });
  const panelEntry = (studentId, assignmentId, { withoutRecord = false } = {}) => {
    const grade = fixture[`grades/${studentId}`];
    const [entry] = buildStudentRecoverySummary({
      assignment: { id: assignmentId, ...fixture[`assignments/${assignmentId}`] },
      tracker: grade.gradesByAssignment?.[assignmentId] || {},
      recoveryForAssignment: withoutRecord ? null : grade.sectionRecoveryByAssignment?.[assignmentId] || null,
      studentId,
      classId: grade.classId,
      classPeriod: grade.classPeriod,
      schedule: null,
      nowValue: now,
    });
    return entry;
  };
  const underWay = panelEntry(CROSS_DEVICE_STUDENT_ID, RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID);
  assert.equal(underWay.state, 'inProgress');
  assert.equal(recoveryModeToRestore(underWay), 'assessment', 'a second try under way: Continue');
  const practising = panelEntry(CROSS_DEVICE_STUDENT_ID, RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID, { withoutRecord: true });
  assert.equal(practising.state, 'locked');
  assert.equal(recoveryModeToRestore(practising), 'practice', 'locked: its practice');
  assert.equal(recoveryModeToRestore({ ...practising, state: 'unlocked', canStart: true }), 'practice', 'unlocked: still its practice, never a Start');
  for (const [studentId, assignmentId, state] of [[HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID, 'held'], [EXCLUDED_STUDENT_ID, RECOVERY_SHARED_ASSIGNMENT_ID, 'completed']]) {
    const entry = panelEntry(studentId, assignmentId);
    assert.equal(entry.state, state);
    assert.equal(recoveryModeToRestore(entry), null, `${state}: the result page, whose panel says where it stands`);
  }
  assert.equal(recoveryModeToRestore(null), null, 'no Recovery for that section any more');
  assert.equal(recoveryModeToRestore({ canContinue: 'yes' }), null, 'only the panel\'s own flags');
});

test('a reload inside a Recovery reopens it; a fresh link opens the result page only', () => {
  const assignments = [{ id: 'a1', title: 'Lesson 1' }];
  const arrival = readUrlArrival({ pathname: '/assignments/a1/results' });
  const reload = planStudentArrival({ arrival, assignments, historyRoute: { surface: 'assignmentResult', assignmentId: 'a1', recoverySection: 'dol', origin: 'grades' } });
  assert.equal(reload.action, 'result');
  assert.equal(reload.recoverySection, 'dol');
  assert.equal(reload.origin, 'grades');
  assert.equal('recoverySection' in planStudentArrival({ arrival, assignments }), false, 'a link in a new tab: the result page');
  assert.equal('recoverySection' in planStudentArrival({ arrival, assignments, historyRoute: { surface: 'assignmentResult', assignmentId: 'b2', recoverySection: 'dol' } }), false, 'another assignment\'s Recovery is not this one\'s');
  assert.equal('recoverySection' in planStudentArrival({ arrival, assignments, historyRoute: { surface: 'assignmentResult', assignmentId: 'a1' } }), false);
  // The hook opens it through the result page's own door.
  const hook = executableSource(read('src/app/routes/useUrlArrival.js'));
  assert.match(hook, /student\.openStudentAssignmentResult\(plan\.assignmentId, \{\s*sectionKey: plan\.sectionKey,\s*origin: plan\.origin,\s*\.\.\.\(plan\.recoverySection \? \{ recoverySection: plan\.recoverySection \} : \{\}\),\s*\}\);/);
});

// ------------------------------------------------------------ App's wiring

const app = executableSource(read('src/App.jsx'));

test('App: the open Recovery is in the route, and one opened elsewhere sits on its result page\'s entry', () => {
  const route = region(app, 'const studentBrowserRoute = useMemo(() => {', '}, [user?.role, activeView', 'the student route');
  assert.match(route, /const resultAssignmentId = assignmentResultRoute\?\.assignmentId \|\| activeAssignmentId \|\| '';/);
  assert.match(route, /\.\.\.\(recoverySession\?\.assignmentId === resultAssignmentId \? \{ recoverySection: recoverySession\.section \} : \{\}\),/);
  assert.match(app, /\}, \[user\?\.role, activeView, [^\]]*recoverySession\?\.assignmentId, recoverySession\?\.section\]\);/, 'a Recovery opening or closing changes the route');
  const writer = region(app, 'useEffect(() => {\n    if (!studentBrowserRoute) {', '}, [studentBrowserRoute, urlArrival]);', 'student writer');
  const push = region(writer, 'if (currentKey !== targetKey) {', '\n    }', 'the push');
  const page = push.indexOf('if (resultPage && studentRouteKey(resultPage) !== currentKey) writeStudentRouteState(resultPage, { url, owner: user?.uid });');
  assert.ok(page > 0, 'the result page is written under a Recovery opened from another screen, stamped with the account');
  assert.match(push, /const resultPage = recoveryResultPageRoute\(studentBrowserRoute\);/);
  assert.ok(page < push.indexOf('writeStudentRouteState(studentBrowserRoute, { url, owner: user?.uid });'), 'before the Recovery\'s own entry');
});

test('App: Back, Forward and a reload reopen a Recovery only where its panel offers it', () => {
  const restore = region(app, 'const restoreFromBrowserHistory = (event) => {', "window.addEventListener('popstate', restoreFromBrowserHistory)", 'student popstate');
  const result = region(restore, "if (route.surface === 'assignmentResult') {", "setActiveView('assignmentResult');", 'result entry');
  assert.match(result, /setRecoverySession\(\(current\) => \{\s*if \(!route\.recoverySection\) return null;/, 'onto the page itself, the Recovery closes');
  assert.match(result, /return \{ assignmentId: route\.assignmentId, section: route\.recoverySection, mode: null \};/, 'onto a Recovery\'s entry: reopened, its mode left to the panel');
  // The foreign-account check still comes first (NV09's rule).
  assert.ok(restore.indexOf('if (readRouteOwner(event.state) !== historyAccountRef.current) {') < restore.indexOf('setRecoverySession('));
  const open = region(app, 'const openStudentAssignmentResult = (assignmentId, options = {}) => {', '\n  };', 'openStudentAssignmentResult');
  assert.match(open, /if \(options\.recoverySection\) setRecoverySession\(\{ assignmentId: id, section: options\.recoverySection, mode: null \}\);/, 'a reload: the same');
  const check = region(app, 'useEffect(() => {\n    if (!recoverySession || recoverySession.mode || !studentRecoveryKit', '}, [recoverySession, studentRecoveryKit, recoveryAssignmentId, studentRecoverySummary, user?.uid]);', 'the restore check');
  assert.match(check, /recoverySession\.assignmentId !== recoveryAssignmentId\) return;/, 'judged on this result page\'s own panel');
  assert.match(check, /const mode = recoveryModeToRestore\(studentRecoverySummary\.find\(\(entry\) => entry\.section === recoverySession\.section\)\);/);
  assert.match(check, /if \(mode\) \{\s*setRecoverySession\(\{ \.\.\.recoverySession, mode \}\);\s*return;\s*\}/);
  // Not offered: this Recovery's entry becomes the page's (replace, the account's), then it closes.
  assert.match(check, /if \(entry\?\.surface === 'assignmentResult' && entry\.assignmentId === recoverySession\.assignmentId && entry\.recoverySection\) \{\s*writeStudentRouteState\(\{ \.\.\.entry, recoverySection: '' \}, \{ replace: true, owner: user\?\.uid \}\);\s*\}\s*setRecoverySession\(null\);/);
  // The runner draws only with a mode: the student's own, or the panel's.
  const branch = region(app, "if (user.role === 'student' && activeView === 'assignmentResult' && assignmentResultRoute) {", '<StudentAssignmentResult', 'result branch');
  assert.match(branch, /const openRecoveryMode = recoverySession\?\.mode \|\| recoveryModeToRestore\(openRecoveryEntry\);/);
  assert.match(branch, /if \(recoveryAssignment && openRecoveryEntry && openRecoveryMode\) \{/);
  assert.match(branch, /<SectionRecoveryRunner\s+mode=\{openRecoveryMode\}/);
  // Leaving the page, for another screen or another result, closes it.
  assert.match(app, /setRecoverySession\(\(current\) => \(current && current\.assignmentId !== recoveryAssignmentId \? null : current\)\);/);
});

test('App: the Test Cycle card and Tests & Exams are told whose entries they write', () => {
  const card = region(app, '<TestCycleCard', '/>', 'Test Cycle card');
  assert.match(card, /historyOwner=\{user\.uid\}/, 'the same owner every App entry carries');
  assert.match(card, /key=\{activeTestCycleAssignmentId\}/, 'another test is another card, reading its own entry');
  assert.match(region(app, '<StudentSecureExamDashboard', '/>', 'Tests & Exams'), /studentId=\{user\.id\}/);
});

// --------------------------------------------------------- the Test Cycle card

const POLICY = normalizeTestCyclePolicy({ mode: 'testCycle' });
const released = (examSessionId, rawScore) => ({ examSessionId, state: 'released', rawScore, releasedAt: 1 });
const PLAN = { planId: 'plan-1', targets: [{ correctionId: 'c1', label: 'Solving linear equations', complete: false }] };
// The card as getStudentTestCycle sends it: the server's own stage for the
// record, with its two review ids (functions/index.js) and the plan.
const cardFor = (record, { corrections = null } = {}) => {
  const full = { assignmentId: 'tc1', studentId: 's1', ...record };
  const state = resolveTestCycleStage({ policy: POLICY, record: full, reviewProgress: { attempted: 9, total: 9, complete: true } });
  const retestOpen = ['assigned', 'inProgress'].includes(full.retest?.state);
  return {
    ...state,
    reviewExamSessionId: full.retest?.state === 'released' ? full.retest.examSessionId : full.test?.state === 'released' ? full.test.examSessionId : null,
    testReviewExamSessionId: full.test?.state === 'released' && !retestOpen ? full.test.examSessionId : null,
    corrections,
  };
};
const CARDS = {
  corrections: cardFor({ review: { complete: true }, test: released('course-test', 52), corrections: { required: true, planId: 'plan-1', total: 2, completedTargets: 1 } }, { corrections: PLAN }),
  preparing: cardFor({ review: { complete: true }, test: released('course-test', 52), corrections: { required: true, planId: null, total: 2, completedTargets: 0 } }),
  retest: cardFor({ review: { complete: true }, test: released('course-test', 52), corrections: { required: true, complete: true, planId: 'plan-1', total: 2, completedTargets: 2 }, retest: { examSessionId: 'course-retest', state: 'assigned' } }),
  passed: cardFor({ review: { complete: true }, test: released('course-test', 84) }),
  complete: cardFor({ review: { complete: true }, test: released('course-test', 52), corrections: { required: true, complete: true, planId: 'plan-1', total: 2, completedTargets: 2 }, retest: released('course-retest', 88) }),
};

test('each of the card\'s screens is an entry; the secure sitting never is', () => {
  for (const view of Object.values(TEST_CYCLE_VIEW)) {
    assert.equal(testCycleViewFor(testCycleModeFor(view)), view, `${view} round-trips`);
  }
  assert.equal(testCycleViewFor({ mode: 'secure' }), TEST_CYCLE_VIEW.CARD, 'the Test or Retest is the card\'s entry');
  assert.equal(testCycleViewFor({ mode: 'testReview', testReviewReturn: 'corrections' }), TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW, 'opened from Corrections, Back returns to them');
  assert.equal(testCycleViewFor({ mode: 'testReview', testReviewReturn: 'card' }), TEST_CYCLE_VIEW.TEST_REVIEW);
  assert.equal(testCycleViewFor(), TEST_CYCLE_VIEW.CARD);
});

test('an entry opens a screen only where the card\'s own button would, on the server\'s latest card', () => {
  assert.equal(CARDS.corrections.stage, 'corrections');
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, CARDS.corrections), true);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.TEST_REVIEW, CARDS.corrections), true, '"Review my Test" beside Corrections');
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW, CARDS.corrections), true);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.REVIEW, CARDS.corrections), false, 'Review Test is a finished cycle\'s button');
  // Corrections being prepared: the server turns the card's button off, so
  // the entry opens the card — whatever else the card carries.
  assert.equal(CARDS.preparing.canEnter, false);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, CARDS.preparing), false);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, { ...CARDS.preparing, corrections: PLAN }), false);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, { ...CARDS.corrections, corrections: null }), false, 'no plan, no Corrections');
  // A Retest opened since: neither Corrections nor the released Test (the server holds it while a Retest can be answered).
  for (const view of [TEST_CYCLE_VIEW.CORRECTIONS, TEST_CYCLE_VIEW.TEST_REVIEW, TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW, TEST_CYCLE_VIEW.REVIEW]) {
    assert.equal(testCycleViewOffered(view, CARDS.retest), false, `${view} after a Retest opened`);
  }
  // A finished cycle: its Review Test / Review Retest.
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.REVIEW, CARDS.passed), true);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.REVIEW, CARDS.complete), true);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.TEST_REVIEW, CARDS.complete), true, 'the original Test beside a released Retest');
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, CARDS.complete), false);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.REVIEW, { ...CARDS.passed, canEnter: false }), false);
  // The card itself always; nothing without a card.
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CARD, null), true);
  assert.equal(testCycleViewOffered(TEST_CYCLE_VIEW.CORRECTIONS, null), false);
  assert.equal(testCycleViewOffered('somethingElse', CARDS.corrections), false);
});

const cardEntry = (extra = {}, testCycleAssignmentId = 'tc1') => ({
  [STUDENT_ROUTE_STATE_KEY]: { surface: 'dashboard', dashboardMode: 'testCycle', testCycleAssignmentId, origin: 'assignments' },
  [ROUTE_OWNER_STATE_KEY]: STUDENT_UID,
  ...extra,
});

test('the card reads only its own entry: this test, this account', () => {
  const who = { assignmentId: 'tc1', owner: STUDENT_UID };
  assert.equal(readTestCycleView(cardEntry(), who), TEST_CYCLE_VIEW.CARD, 'the card\'s own entry names no screen');
  assert.equal(readTestCycleView(cardEntry({ [TEST_CYCLE_VIEW_STATE_KEY]: { assignmentId: 'tc1', view: 'corrections' } }), who), TEST_CYCLE_VIEW.CORRECTIONS);
  assert.equal(readTestCycleView(cardEntry({ [TEST_CYCLE_VIEW_STATE_KEY]: { assignmentId: 'tc2', view: 'corrections' } }), who), TEST_CYCLE_VIEW.CARD, 'a screen recorded for another test');
  assert.equal(readTestCycleView(cardEntry({ [TEST_CYCLE_VIEW_STATE_KEY]: { assignmentId: 'tc1', view: 'secure' } }), who), TEST_CYCLE_VIEW.CARD, 'never the secure sitting');
  assert.equal(readTestCycleView(cardEntry({}, 'tc2'), who), null, 'another test\'s card');
  assert.equal(readTestCycleView({ ...cardEntry(), [ROUTE_OWNER_STATE_KEY]: 'uid-previous-student' }, who), null, 'another account\'s entry (a shared Chromebook)');
  assert.equal(readTestCycleView({ [STUDENT_ROUTE_STATE_KEY]: { surface: 'dashboard', dashboardMode: 'grades' }, [ROUTE_OWNER_STATE_KEY]: STUDENT_UID, [TEST_CYCLE_VIEW_STATE_KEY]: { assignmentId: 'tc1', view: 'corrections' } }, who), null, 'not a Test Cycle entry');
  assert.equal(readTestCycleView(cardEntry(), { assignmentId: 'tc1', owner: null }), null, 'no account, no entry (a teacher\'s preview)');
  assert.equal(readTestCycleView(null, who), null);
});

test('Corrections and a review push entries over the card; Back walks them back; App\'s next screen leaves them behind', () => {
  const tab = openTab({ state: cardEntry(), url: 'https://mathmaster.test/test-cycle/tc1' });
  const who = { assignmentId: 'tc1', owner: STUDENT_UID };
  writeTestCycleView(TEST_CYCLE_VIEW.CORRECTIONS, who);
  writeTestCycleView(TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW, who);
  assert.equal(tab.entries.length, 3, 'card, Corrections, the review opened from them');
  assert.ok(tab.entries.every((entry) => entry.url === 'https://mathmaster.test/test-cycle/tc1'), 'one address: the card\'s');
  assert.ok(tab.entries.every((entry) => entry.state[ROUTE_OWNER_STATE_KEY] === STUDENT_UID), 'every entry is the account\'s');
  assert.ok(tab.entries.every((entry) => readStudentRouteState(entry.state)?.testCycleAssignmentId === 'tc1'), 'each is still this test\'s card');
  assert.equal(readTestCycleView(tab.history.state, who), TEST_CYCLE_VIEW.CORRECTIONS_TEST_REVIEW);
  assert.equal(readTestCycleView(tab.back(), who), TEST_CYCLE_VIEW.CORRECTIONS, 'Back from the review: Corrections');
  assert.equal(readTestCycleView(tab.back(), who), TEST_CYCLE_VIEW.CARD, 'Back from Corrections: the card');
  // A screen no longer offered is rewritten in place, not pushed.
  tab.history.pushState(cardEntry({ [TEST_CYCLE_VIEW_STATE_KEY]: { assignmentId: 'tc1', view: 'corrections' } }), '', tab.location.href);
  const length = tab.entries.length;
  writeTestCycleView(TEST_CYCLE_VIEW.CARD, { ...who, replace: true });
  assert.equal(tab.entries.length, length);
  assert.equal(readTestCycleView(tab.history.state, who), TEST_CYCLE_VIEW.CARD);
  // The next screen App opens starts clean: the card's screen stays on its entry.
  writeTestCycleView(TEST_CYCLE_VIEW.CORRECTIONS, who);
  writeStudentRouteState({ surface: 'dashboard', dashboardMode: 'assignmentsCenter' }, { owner: STUDENT_UID });
  assert.equal(TEST_CYCLE_VIEW_STATE_KEY in tab.history.state, false, 'entry-only, like Assignments\' view');
  assert.equal(readTestCycleView(tab.entries[tab.at - 1].state, who), TEST_CYCLE_VIEW.CORRECTIONS, 'Back onto it still finds Corrections');
  // A reload's first write (replace) keeps it.
  tab.back();
  writeStudentRouteState(readStudentRouteState(tab.history.state), { replace: true, owner: STUDENT_UID });
  assert.equal(readTestCycleView(tab.history.state, who), TEST_CYCLE_VIEW.CORRECTIONS);
  // Without an account nothing is written.
  const before = tab.entries.length;
  writeTestCycleView(TEST_CYCLE_VIEW.CORRECTIONS, { assignmentId: 'tc1', owner: null });
  assert.equal(tab.entries.length, before);
});

test('the card: its entries are the student\'s only, open on the server\'s answer, and never move a running secure Test', () => {
  const card = executableSource(read('src/components/student/TestCycleCard.jsx'));
  assert.match(card, /const tracksHistory = !previewing && Boolean\(historyOwner\) && typeof window !== 'undefined';/, 'a teacher\'s preview writes no history');
  assert.match(card, /const \[recordedView\] = useState\(\(\) => \(tracksHistory \? readTestCycleView\(window\.history\.state, \{ assignmentId, owner: historyOwner \}\) : null\)\);/);
  // The recorded screen opens with the server's answer, judged as a tap is.
  const load = region(card, 'const load = useCallback(async () => {', '}, [assignmentId, studentId, previewing]);', 'load');
  assert.match(load, /setCard\(next\);[\s\S]*const pending = pendingViewRef\.current;\s*if \(pending\) \{\s*pendingViewRef\.current = null;\s*showViewRef\.current\?\.\(pending, next, \{ focus: false \}\);/);
  const show = region(card, 'showViewRef.current = (wanted, current, { focus = true } = {}) => {', '\n  };', 'showView');
  assert.match(show, /const shown = testCycleViewOffered\(wanted, current\) \? wanted : TEST_CYCLE_VIEW\.CARD;/);
  // A screen no longer offered: the entry says the card — only while it is still this card's.
  assert.match(show, /if \(shown !== wanted && readTestCycleView\(window\.history\.state, historyRef\.current\) !== null\) \{\s*writeTestCycleView\(TEST_CYCLE_VIEW\.CARD, \{ \.\.\.historyRef\.current, replace: true \}\);/);
  // A new screen pushes, once the entry is this card's and nothing waits.
  const writer = region(card, 'useEffect(() => {\n    if (!tracksHistory || pendingViewRef.current) return;', '}, [view, tracksHistory]);', 'the card\'s writer');
  assert.match(writer, /if \(recorded === null \|\| recorded === view\) return;\s*writeTestCycleView\(view, historyRef\.current\);/);
  const restore = region(card, 'const restore = (event) => {', "window.addEventListener('popstate', restore);", 'the card\'s popstate');
  assert.ok(restore.indexOf('if (isSecureExamActive()) return;') >= 0 && restore.indexOf('if (isSecureExamActive()) return;') < restore.indexOf('showViewRef.current('), 'Back during a secure Test is App\'s to refuse');
  assert.match(restore, /if \(recorded === null\) return;/, 'another screen\'s entry is App\'s');
  assert.match(restore, /if \(showViewRef\.current\(recorded, cardRef\.current\) === TEST_CYCLE_VIEW\.CARD\) load\(\);/, 'back on the card, it asks the server again');
});

// ------------------------------------------------------------ Tests & Exams

const testsEntry = (extra = {}) => ({
  [STUDENT_ROUTE_STATE_KEY]: { surface: 'dashboard', dashboardMode: 'secureExams' },
  [ROUTE_OWNER_STATE_KEY]: STUDENT_UID,
  ...extra,
});

test('Tests & Exams remembers the test that was open in its own entry, for its own student', () => {
  const tab = openTab({ state: testsEntry(), url: 'https://mathmaster.test/tests' });
  assert.equal(readOpenSecureExam('910001'), null);
  writeOpenSecureExam('910001', 'sat-session-2');
  assert.equal(tab.entries.length, 1, 'the list\'s own entry, rewritten; the address unchanged');
  assert.equal(tab.location.href, 'https://mathmaster.test/tests');
  assert.equal(readOpenSecureExam('910001'), 'sat-session-2', 'a reload (or Back onto the list) finds it');
  assert.equal(readOpenSecureExam('910002'), null, 'never another student\'s');
  assert.equal(tab.history.state[ROUTE_OWNER_STATE_KEY], STUDENT_UID, 'the entry keeps its owner');
  // Nothing but the id.
  assert.deepEqual(Object.keys(tab.history.state[SECURE_EXAMS_VIEW_STATE_KEY]).sort(), ['examSessionId', 'studentId']);
  // The next screen starts clean; Back onto the list still has it.
  writeStudentRouteState({ surface: 'dashboard', dashboardMode: 'grades' }, { owner: STUDENT_UID });
  assert.equal(SECURE_EXAMS_VIEW_STATE_KEY in tab.history.state, false);
  tab.back();
  assert.equal(readOpenSecureExam('910001'), 'sat-session-2');
  // Finished: forgotten.
  writeOpenSecureExam('910001', null);
  assert.equal(readOpenSecureExam('910001'), null);
  // Only ever on the list's entry.
  const elsewhere = openTab({ state: { [STUDENT_ROUTE_STATE_KEY]: { surface: 'dashboard', dashboardMode: 'grades' } } });
  writeOpenSecureExam('910001', 'sat-session-2');
  assert.equal(SECURE_EXAMS_VIEW_STATE_KEY in elsewhere.history.state, false);
  assert.equal(readOpenSecureExam('910001', { state: { [STUDENT_ROUTE_STATE_KEY]: { surface: 'dashboard', dashboardMode: 'grades' }, [SECURE_EXAMS_VIEW_STATE_KEY]: { studentId: '910001', examSessionId: 'x' } } }), null);
  // Assignments' own view is a different key: neither overwrites the other.
  assert.notEqual(SECURE_EXAMS_VIEW_STATE_KEY, ASSIGNMENTS_VIEW_STATE_KEY);
});

test('the test that was open is listed first; every other row keeps its place', () => {
  const rows = [{ examSessionId: 'act-1' }, { examSessionId: 'tsia-1' }, { examSessionId: 'sat-2' }];
  assert.deepEqual(withOpenTestFirst(rows, 'sat-2').map((row) => row.examSessionId), ['sat-2', 'act-1', 'tsia-1']);
  assert.deepEqual(withOpenTestFirst(rows, 'act-1').map((row) => row.examSessionId), ['act-1', 'tsia-1', 'sat-2']);
  assert.equal(withOpenTestFirst(rows, 'gone'), rows, 'a test no longer listed moves nothing');
  assert.equal(withOpenTestFirst(rows, null), rows);
  assert.deepEqual(withOpenTestFirst(null, 'sat-2'), []);
});

test('Tests & Exams: the test opened is remembered, put first and focused once listed — and never resumed by itself', () => {
  const list = executableSource(read('src/components/assessment/StudentSecureExamDashboard.jsx'));
  assert.match(list, /const \[reopenId, setReopenId\] = useState\(\(\) => readOpenSecureExam\(studentId\)\);/);
  assert.match(region(list, 'const openTest = (session) => {', '\n  };', 'openTest'), /writeOpenSecureExam\(studentId, session\.examSessionId\);\s*setActive\(session\);/);
  assert.match(region(list, 'const testFinished = () => {', '\n  };', 'testFinished'), /writeOpenSecureExam\(studentId, null\);\s*setReopenId\(null\);/);
  const active = region(list, 'if (active) return (', '  );', 'the open test');
  assert.match(active, /onOpenResults=\{\(finished\) => \{ testFinished\(\);/);
  assert.match(active, /onExitAfterFinished=\{\(\) => \{ testFinished\(\); load\(\); \}\}/);
  // Only a practice test still under way: a finished one, or a course Test (resumed from its card), is not put first.
  assert.match(list, /sessions\.find\(\(session\) => session\.examSessionId === reopenId && !terminalStatuses\.has\(session\.status\) && !isCourseTest\(session\)\)/);
  assert.match(list, /rows: withOpenTestFirst\(sessions\.filter\(\(session\) => !isCourseTest\(session\)\), reopenSession\?\.examSessionId\)/);
  assert.match(list, /ref=\{session\.examSessionId === reopenSession\?\.examSessionId \? reopenButtonRef : undefined\}/);
  const focus = region(list, 'useEffect(() => {\n    if (loading || active || reviewing || !reopenSession', '}, [loading, active, reviewing, reopenSession?.examSessionId]);', 'the focus');
  assert.match(focus, /reopenButtonRef\.current\?\.focus\(\);/);
  // Focus, not a start: nothing here calls the secure start, or opens the test.
  assert.doesNotMatch(focus, /setActive|startSecureExamSession|\.click\(\)/);
});
