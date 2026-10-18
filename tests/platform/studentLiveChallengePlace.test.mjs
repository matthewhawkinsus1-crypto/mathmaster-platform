/*
 * NAV-23 and NAV-25 (student pass 3).
 *
 *  NAV-23: Assignments' category tabs are real tabs (one panel, aria-controls,
 *  roving Tab stop, arrow keys), rows are h2 under the h1, and the Live
 *  Challenge invite and a Spotlight request are said once when they appear.
 *  NAV-25: the lobby invite shows inside an assignment too, and the game's
 *  exit goes back to where the student joined from.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveChallengeExitLabel, liveChallengeReturnPlace, sectionHoldsLobbyInvite } from '../../src/platform/liveChallenge/liveChallengeReturn.js';
import { shouldShowChallengeHandoffBanner, shouldShowChallengeLobbyInvite } from '../../src/platform/liveChallenge/warmupChallengeLink.js';
import { classroomAnnouncement, classroomAnnouncementState } from '../../src/platform/student/classroomAnnouncements.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const app = read('src/App.jsx');

test('NAV-25: the place a student joins from, and the exit named for it', () => {
  const inAssignment = liveChallengeReturnPlace({ activeView: 'assignment', activeAssignmentId: 'a1', currentQuestionIndex: 4, studentDashboardMode: 'grades' });
  assert.deepEqual(inAssignment, { kind: 'assignment', assignmentId: 'a1', questionIndex: 4 });
  assert.equal(liveChallengeExitLabel(inAssignment), 'Back to your assignment');
  const result = liveChallengeReturnPlace({ activeView: 'assignmentResult', assignmentResultRoute: { assignmentId: 'a2', sectionKey: 'dol', origin: 'grades' } });
  assert.deepEqual(result, { kind: 'result', assignmentId: 'a2', sectionKey: 'dol', origin: 'grades' });
  assert.equal(liveChallengeExitLabel(liveChallengeReturnPlace({ activeView: 'dashboard', studentDashboardMode: 'grades' })), 'Back to Grades');
  assert.equal(liveChallengeExitLabel(liveChallengeReturnPlace({ activeView: 'dashboard', studentDashboardMode: 'assignments' })), 'Back to Home');
  // A screen with no way back to it (the game itself) returns Home.
  assert.deepEqual(liveChallengeReturnPlace({ activeView: 'dashboard', studentDashboardMode: 'liveChallenge' }), { kind: 'screen', mode: 'assignments' });
  assert.equal(liveChallengeExitLabel(null), 'Back to Home');
});

test('NAV-25: the lobby invite is offered in an assignment; the running banner keeps its own rule', () => {
  assert.equal(shouldShowChallengeLobbyInvite({ invite: { status: 'invited', roomId: 'r1' } }), true);
  assert.equal(shouldShowChallengeLobbyInvite({ invite: { status: 'joined', roomId: 'r1' } }), true);
  assert.equal(shouldShowChallengeLobbyInvite({ invite: { status: 'running', roomId: 'r1' } }), false, 'running is the hand-off banner');
  assert.equal(shouldShowChallengeLobbyInvite({ invite: { status: 'invited', roomId: 'r1' }, warmupDecision: { roomId: 'r1' } }), false, "this lesson's own Warm-Up game has its own lobby");
  assert.equal(shouldShowChallengeHandoffBanner({ invite: { status: 'invited', roomId: 'r1' } }), false);
  const workspace = region(app, '{!preview && !lobbyInviteHeldHere && shouldShowChallengeLobbyInvite({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && (', '</section>', 'workspace lobby invite');
  assert.match(workspace, /onClick=\{joinLiveChallenge\}/);
  assert.match(app, /!lobbyInviteHeldHere && shouldShowChallengeLobbyInvite\(\{ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision \}\) && \{\s*key: 'liveChallenge',/, 'and the phone status chip');
});

test('NAV-25 review B1: never on an exit ticket, quiz or test whose outcome is withheld', () => {
  // The section the student is on, not only the question on screen (review R1).
  const rule = region(app, 'const studentWorkspaceHoldsOutcome = () => {', '\n  };', 'the workspace rule');
  assert.match(rule, /if \(user\?\.role !== 'student' \|\| activeView !== 'assignment' \|\| !activeAssignmentId\) return false;/);
  assert.match(rule, /\.isPracticeOnly\) return false;/);
  assert.match(rule, /const role = entries\.find\(\(entry\) => entry\.storageIndex === currentQuestionIndex\)\?\.logicalRole/);
  assert.match(rule, /return sectionHoldsLobbyInvite\(\{\s*entries,\s*role,\s*feedbackMode: role \? getEffectiveActivityPolicy\(role\)\.feedback : 'immediate',\s*released: assignmentFeedbackWasReleased\(assignment\),\s*recordOf: \(storageIndex\) => tracker\?\.\[activeAssignmentId\]\?\.\[storageIndex\],\s*\}\);/);
  assert.match(app, /const lobbyInviteHeldHere = studentWorkspaceHoldsOutcome\(\);/);
  // The banner, the phone chip and the announcement all use it; the running
  // hand-off banner (pre-existing, deliberate) does not.
  assert.equal((app.match(/!lobbyInviteHeldHere && shouldShowChallengeLobbyInvite\(/g) || []).length, 2);
  assert.match(app, /invite: user\?\.role === 'student' && !lobbyInviteHeldHere \? liveChallengeInvite : null,/);
  assert.doesNotMatch(app, /lobbyInviteHeldHere && shouldShowChallengeHandoffBanner/);
});

test('NAV-25 review R1: a two-question exit ticket with Q1 submitted still holds the invite until it is all submitted or released', () => {
  const entries = [
    { storageIndex: 0, logicalRole: 'classwork' },
    { storageIndex: 3, logicalRole: 'dol' },
    { storageIndex: 4, logicalRole: 'dol' },
  ];
  const dol = (records, extra = {}) => sectionHoldsLobbyInvite({
    entries, role: 'dol', feedbackMode: 'afterAssignmentSubmit', recordOf: (index) => records[index] || null, ...extra,
  });
  assert.equal(dol({ 3: { status: 'expired' } }), true, 'Q1 out of tries, Q2 unanswered: still held, on Q1 too');
  assert.equal(dol({ 3: { status: 'correct' } }), true, 'Q1 right, Q2 unanswered: still held');
  assert.equal(dol({ 3: { status: 'correct' }, 4: { status: 'expired' } }), false, 'all submitted: nothing left to protect');
  assert.equal(dol({}, { released: true }), false, 'released');
  // Classwork never holds it; a quiz before release holds it even when all answered.
  assert.equal(sectionHoldsLobbyInvite({ entries, role: 'classwork', feedbackMode: 'immediate' }), false);
  assert.equal(sectionHoldsLobbyInvite({ entries, role: 'dol', feedbackMode: 'afterRelease', recordOf: () => ({ status: 'correct' }) }), true);
  assert.equal(sectionHoldsLobbyInvite({ entries, role: null }), false);
});

test('NAV-25: every way into the game keeps the place, and the game\'s exit returns there', () => {
  const join = region(app, 'const joinLiveChallenge = () => {', '};', 'join');
  assert.match(join, /setLiveChallengeReturn\(liveChallengeReturnPlace\(\{\s*activeView, activeAssignmentId, currentQuestionIndex, studentDashboardMode, assignmentResultRoute,\s*\}\)\);/);
  assert.match(join, /flushAssignmentActivity\(activeAssignmentId\)/);
  assert.match(join, /openStudentDashboardMode\('liveChallenge'\);/);
  const leave = region(app, 'const leaveLiveChallenge = () => {', "openStudentDashboardMode(place?.kind === 'screen' ? place.mode : 'assignments');", 'leave');
  assert.match(leave, /startAssignment\(place\.assignmentId, place\.questionIndex, \{ keepRequestedQuestion: true \}\);/);
  assert.match(leave, /openStudentAssignmentResult\(place\.assignmentId, \{ sectionKey: place\.sectionKey, origin: place\.origin \}\);/);
  const game = region(app, '<LiveChallengeStudent', '/>', 'game');
  assert.match(game, /onExit=\{leaveLiveChallenge\}/);
  assert.match(game, /exitLabel=\{liveChallengeExitLabel\(liveChallengeReturn\)\}/);
  // No way into the game skips keeping the place.
  assert.doesNotMatch(app, /setStudentDashboardMode\('liveChallenge'\)/);
  assert.equal((app.match(/openStudentDashboardMode\('liveChallenge'\)/g) || []).length, 1, 'only joinLiveChallenge opens the game');
  assert.match(app, /import \{ liveChallengeExitLabel, liveChallengeReturnPlace, sectionHoldsLobbyInvite \} from '\.\/platform\/liveChallenge\/liveChallengeReturn\.js';/);
});

test('NAV-23: the invite and a Spotlight request are said once, when they newly appear', () => {
  const none = classroomAnnouncementState({});
  const lobby = classroomAnnouncementState({ invite: { status: 'invited', roomId: 'r1' } });
  assert.match(classroomAnnouncement(none, lobby), /^Your teacher opened the Live Challenge lobby\./);
  assert.equal(classroomAnnouncement(lobby, classroomAnnouncementState({ invite: { status: 'joined', roomId: 'r1' } })), '', 'joining is not news');
  assert.match(classroomAnnouncement(lobby, classroomAnnouncementState({ invite: { status: 'running', roomId: 'r1' } })), /^The Live Challenge is running now\./);
  assert.equal(classroomAnnouncement(none, classroomAnnouncementState({ invite: { status: 'invited', roomId: 'r1' }, secureExamActive: true })), '', 'never during a secure exam');
  assert.match(classroomAnnouncement(none, classroomAnnouncementState({ spotlightRequested: true })), /show your work to the class/);
  // Review S3: no Spotlight sentence in a secure exam either.
  assert.equal(classroomAnnouncement(none, classroomAnnouncementState({ spotlightRequested: true, secureExamActive: true })), '');
  // Review S4: the news, without naming a button the screen may call something else.
  assert.equal(classroomAnnouncement(none, lobby), 'Your teacher opened the Live Challenge lobby.');
  assert.doesNotMatch(classroomAnnouncement(lobby, classroomAnnouncementState({ invite: { status: 'running', roomId: 'r1' } })), /button/);
  const shell = region(app, 'const renderStudentIdentityShell = ', 'const renderStudentScreen = ', 'shell');
  assert.match(shell, /<div role="status" aria-live="polite" aria-atomic="true" data-classroom-announcement className="mm-visually-hidden">\s*\{classroomAnnouncementText\}/);
  // The Spotlight request is a labelled region now, not a dialog that never takes focus.
  assert.match(shell, /<section aria-label="Student Spotlight request" data-spotlight-request/);
  assert.doesNotMatch(shell, /role="dialog" aria-label="Student Spotlight request"/);
  const effect = region(app, 'const classroomAnnouncementTimerRef = useRef(null);', '}, [currentClassroomState.challenge, currentClassroomState.spotlight]);', 'announcement effect');
  assert.match(effect, /const text = classroomAnnouncement\(classroomAnnouncementRef\.current, next\);\s*classroomAnnouncementRef\.current = next;/);
  assert.match(effect, /setTimeout\(\(\) => setClassroomAnnouncementText\(''\), 8000\)/);
});

test('NAV-23: Assignments has real tabs over one panel, and rows are h2', () => {
  const center = read('src/components/student/StudentAssignmentsCenter.jsx');
  const tab = region(center, 'role="tab"', 'onClick=', 'a tab');
  assert.match(tab, /aria-selected=\{active\}/);
  assert.match(tab, /aria-controls=\{ASSIGNMENTS_PANEL_ID\}/);
  assert.match(tab, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(center, /id=\{assignmentsTabId\(group\.id\)\}/);
  assert.match(center, /<div role="tablist" aria-label="Assignment categories" onKeyDown=\{moveBetweenTabs\}/);
  assert.match(center, /id=\{ASSIGNMENTS_PANEL_ID\}\s*role=\{isSearching \? undefined : 'tabpanel'\}\s*aria-labelledby=\{isSearching \? undefined : assignmentsTabId\(activeCategory\)\}/);
  const keys = region(center, 'const moveBetweenTabs = (event) => {', '\n  };', 'arrow keys');
  assert.match(keys, /ArrowRight: index \+ 1/);
  assert.match(keys, /ArrowLeft: index - 1/);
  assert.match(keys, /Home: 0, End: last/);
  assert.match(keys, /setCategory\(target\.id\);\s*document\.getElementById\(assignmentsTabId\(target\.id\)\)\?\.focus\(\);/);
  const row = region(center, 'function AssignmentRow(', 'export default function', 'row');
  assert.match(row, /<h2 style=\{\{ margin: 0[^}]*\}\}>\{row\.title\}<\/h2>/);
  assert.doesNotMatch(row, /<h3/);
});
