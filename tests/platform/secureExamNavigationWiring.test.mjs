/*
 * THE SECURE SCREENS ARE WIRED TO THE NAVIGATION CONTRACT.
 *
 * Node cannot render React, so the wiring between the secure container, its
 * header, question list, review screen, the shared runtime and the student's
 * list of tests is asserted on their source — each assertion bound to the
 * region that must do the work (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md).
 * Everything importable (the navigation model, the sandbox) is tested by
 * behaviour in secureExamNavigationModel.test.mjs and
 * secureExamSandboxContract.test.mjs, and the screens themselves are driven in
 * a browser by tests/browser/secureExamNavigation.mjs.
 *
 * What is protected, in words:
 *   - the navigation client never records an answer question by question: it
 *     saves drafts, and saves what is pending before every move and Submit;
 *   - in navigation mode a field item has no record/"Answer to continue"
 *     button, and a Rich Tool's final action saves a draft and hands the
 *     engine nothing back, so no verdict can appear and nothing locks — and
 *     the secure player in between really passes the mode on;
 *   - "Back to questions" from a review brings the question back with the
 *     answer as the student left it, not as it was when it opened;
 *   - "Question N of M" is the question on screen; marking for review saves a
 *     flag without the answer; the question list opens from the header;
 *   - every call that can meet a pause or the end of time hands its failure
 *     to the one handler that shows the pause (in its own catch), with its
 *     own words for a teacher's pause and an integrity pause; resuming
 *     reopens the question the student was on; a teacher's pause reaches a
 *     student who is only reading; time up finishes the test as timed out;
 *   - the pause covers everything, takes focus, and leaves nothing behind it
 *     to type into; the question list keeps focus; Tab never leaves the test;
 *   - the event before an integrity pause warns, naming everything that
 *     counts, with a way back to full screen;
 *   - the start screen states the new rules and the student's own time —
 *     extended time before Start, time left on a resumed test;
 *   - the student's list shows plain statuses, and released results open from
 *     the finished screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const container = componentSource('src/components/assessment/SecureExamContainer.jsx');
const header = read('src/components/assessment/ExamPrepHeader.jsx');
const navigatorSource = read('src/components/assessment/SecureExamNavigator.jsx');
const reviewSource = read('src/components/assessment/SecureExamSubmitReview.jsx');
const playerSource = read('src/components/assessment/SecureExamQuestionPlayer.jsx');
const runtime = read('src/components/question/RichQuestionRuntime.jsx');
const dashboard = componentSource('src/components/assessment/StudentSecureExamDashboard.jsx');
const workView = read('src/components/common/WorkViewShell.css');

const indexIn = (source, pattern, label) => {
  const match = source.match(pattern);
  assert.ok(match, `${label}: ${pattern}`);
  return match.index;
};

// The handlers, by the statement that starts each one.
const handlers = {
  // The send itself; saveDraftNow queues it one save at a time (serialDraftSaves.test.mjs).
  saveDraftNow: region(container, 'const sendPendingDraft = useCallback(', 'const refreshSession = useCallback(', 'sendPendingDraft'),
  handleProblem: region(container, 'const handleProblem = useCallback(', 'const runAutosave = useCallback(', 'handleProblem'),
  runAutosave: region(container, 'const runAutosave = useCallback(', 'const openPosition = useCallback(', 'runAutosave'),
  openPosition: region(container, 'const openPosition = useCallback(', 'const move = useCallback(', 'openPosition'),
  move: region(container, 'const move = useCallback(', 'const start = async () => {', 'move'),
  start: region(container, 'const start = async () => {', '  useEffect(() => {', 'start'),
  checkStatus: region(container, 'const checkStatus = useCallback(', 'const resumeAfterPause = useCallback(', 'status check'),
  resume: region(container, 'const resumeAfterPause = useCallback(', 'const previousStatusRef', 'resumeAfterPause'),
  autosave: region(container, 'const autosaveDraft = useCallback(', 'const saveItemNow', 'autosaveDraft'),
  toggleFlag: region(container, 'const toggleFlag = useCallback(', 'const openNavigator = useCallback(', 'toggleFlag'),
  backToQuestion: region(container, 'const backToQuestion = useCallback(', 'const returnToFullscreen', 'backToQuestion'),
  focusEdge: region(container, 'const focusEdge = useCallback(', '}, []);', 'focusEdge'),
  finish: region(container, 'const finish = useCallback(', 'finishRef.current = finish;', 'finish'),
};

test('the navigation client never records an answer one question at a time', () => {
  const code = executableSource(container);
  assert.doesNotMatch(code, /submitSecureExamResponse/, 'answers are drafts until the test is submitted');
  // What it uses instead: drafts for any open question, opened by position.
  assert.match(handlers.openPosition, /issueSecureExamQuestion\(\{\s*examSessionId: activeSessionId,\s*\.\.\.\(Number\.isInteger\(target\) \? \{ position: target \} : \{\}\),\s*\.\.\.\(closeModule \? \{ closeModule: true \} : \{\}\),/);
  // An answer the older runtime locked is shown as locked, not as a failed load.
  assert.match(handlers.openPosition, /\n\s*setRecordedHere\(issued\.recorded === true\);/);
  // Starting (or coming back) opens where the server says the student is.
  assert.match(handlers.start, /\n\s*await openPosition\(started\.examSessionId, readNavigation\(started\)\.cursor\);/);
});

test('every move and Submit saves what is pending first, and stays put when it could not', () => {
  const { move, finish } = handlers;
  const savedAt = indexIn(move, /const saved = await saveDraftNow\(\);/, 'move saves first');
  assert.ok(savedAt < indexIn(move, /await openPosition\(active\.examSessionId, target\.position/, 'then opens'));
  assert.ok(savedAt < indexIn(move, /setView\(\{ kind: 'review' \}\)/, 'and before the review'));
  assert.match(move, /if \(!saved\.ok\) \{\s*if \(!handleProblem\(saved\.problem\)\) setError\(unsavedMessage\(saved\.problem\)\);\s*return;\s*\}/);

  const finishSave = indexIn(finish, /const saved = await saveDraftNow\(\);/, 'submit saves first');
  assert.ok(finishSave < indexIn(finish, /await finalizeSecureExam\(\{ examSessionId: active\.examSessionId, reason \}\)/, 'then finalizes'));
  // At the deadline the test ends whether or not the last save landed.
  assert.match(finish, /if \(!saved\.ok && reason !== 'timeExpired'\) \{/);
  // A question that no longer takes answers (closed module) does not hold a move back.
  assert.match(region(handlers.saveDraftNow, "if (problem.kind === 'itemClosed') {", 'setSaveState(navigator.onLine', 'item closed'), /\n\s*return \{ ok: true \};\s*\}\s*$/);
});

test('field items lose the record button in navigation mode; a Rich Tool\'s "Save answer" saves a draft and returns nothing', () => {
  const fieldItem = region(runtime, 'const FieldItem = (', 'const ToolItem = (', 'field item');
  assert.match(fieldItem, /\{!navigationMode && <button type="submit"/, 'no per-question button to gate on');
  assert.match(fieldItem, /if \(navigationMode \|\| !complete \|\| locked\) return;/, 'Enter records nothing');

  const toolItem = region(runtime, 'const ToolItem = (', 'export default function RichQuestionRuntime(', 'tool item');
  assert.match(toolItem, /submitLabel=\{policy\.secure \? \(navigationMode \? 'Save answer' : 'Record answer'\) : null\}/);
  const saveBranch = region(toolItem, 'if (navigationModeRef.current) {', 'return (await onSubmitRef.current', 'navigation-mode save');
  assert.match(saveBranch, /workspaceDrafts: draftKey \? readQuestionDraftFamily\(draftKey\) : \[\]/, 'the construction travels with the draft');
  // null is the engine feedback that shows nothing and locks nothing.
  assert.match(saveBranch, /\n\s*return null;\s*\}\s*$/);
  assert.doesNotMatch(executableSource(saveBranch), /isCorrect|status:|expired|blocked/);
  // The router hands the mode to both renderers.
  const router = region(runtime, 'export default function RichQuestionRuntime(', null, 'router');
  assert.equal((router.match(/navigationMode=\{navigationMode\}/g) || []).length, 2);

  // The secure player between the container and the runtime passes it on —
  // without this the container's mode never reached a student.
  assert.match(region(playerSource, 'export const SecureExamQuestionPlayer = ({', '}) => (', 'player props'), /\n\s*navigationMode = false,\n/);
  assert.match(region(playerSource, '<RichQuestionRuntime', '/>', 'player runtime element'), /\n\s*navigationMode=\{navigationMode\}\n/);

  // The container: the player runs in navigation mode, its onSubmit only saves.
  const player = region(container, '<SecureExamQuestionPlayer', '/>', 'player');
  assert.match(player, /\n\s*navigationMode\n/);
  assert.match(player, /onSubmit=\{saveItemNow\}/);
  assert.match(player, /onDraftChange=\{autosaveDraft\}/);
  const saveItemNow = region(container, 'const saveItemNow = useCallback(', '}, [autosaveDraft, runAutosave]);', 'saveItemNow');
  assert.match(saveItemNow, /autosaveDraft\(responsePayload, supportUsage\);\s*await runAutosave\(\);\s*return null;/);
});

test('"Back to questions" brings the question back as the student left it, not as it opened', () => {
  // The review screens replace the question; going back mounts it again.
  const body = region(container, '{reviewing ? (', ') : (', 'review branch');
  assert.match(body, /\n\s*onBack=\{backToQuestion\}\n/);
  // From the latest copy of the answer, for that question…
  assert.match(handlers.backToQuestion, /setQuestion\(\(current\) => \(\s*current\?\.questionInstanceId && latestDraftsRef\.current\.has\(current\.questionInstanceId\)\s*\? \{ \.\.\.current, _draftResponse: latestDraftsRef\.current\.get\(current\.questionInstanceId\) \}\s*: current\s*\)\);/);
  assert.match(handlers.backToQuestion, /\n\s*setView\(\{ kind: 'question' \}\);/);
  // …which is every change the student made…
  assert.match(handlers.autosave, /\n\s*latestDraftsRef\.current\.set\(question\.questionInstanceId, responsePayload\);/);
  // …starting from the copy the question opened with.
  assert.match(handlers.openPosition, /\n\s*latestDraftsRef\.current\.set\(instance\.questionInstanceId, restored\);\s*setQuestion\(\{ \.\.\.instance, _draftResponse: restored \}\);/);
  // The player mounts from the question's own copy, which the above keeps current.
  assert.match(region(container, '<SecureExamQuestionPlayer', '/>', 'player'), /initialResponsePayload=\{question\?\._draftResponse\}/);
});

test('the header numbers the question on screen, marks it for review, and opens the question list', () => {
  const headerProps = region(container, '<ExamPrepHeader', '/>', 'header props');
  assert.match(headerProps, /questionOrdinal=\{\(current \?\? navigation\.cursor\) \+ 1\}/);
  assert.doesNotMatch(headerProps, /completedQuestions/, 'not a count of answers');
  assert.match(headerProps, /onToggleReviewFlag=\{!reviewing && question && !pause \? toggleFlag : null\}/);
  // The question button opens the list, and closes it again: a disclosure.
  assert.match(headerProps, /onOpenNavigator=\{navigation\.total \? \(navigatorOpen \? \(\) => setNavigatorOpen\(false\) : openNavigator\) : null\}/);
  assert.match(headerProps, /navigatorId="secure-question-list"/);
  assert.match(header, /const position = `Question \$\{questionOrdinal\} of \$\{total\}`;/);
  const toggle = region(header, '{onOpenNavigator', ': <div', 'navigator toggle');
  assert.match(toggle, /<button type="button" onClick=\{onOpenNavigator\} aria-expanded=\{navigatorOpen\} aria-controls=\{navigatorOpen && navigatorId \? navigatorId : undefined\}/);
  assert.doesNotMatch(toggle, /aria-haspopup/, 'it expands a panel on the page; it does not open a dialog');
  assert.match(region(header, '{onToggleReviewFlag && (', ')}', 'flag button'), /aria-pressed=\{reviewFlagged\}/);

  // A flag is saved on its own: the answer is not sent with it.
  assert.match(handlers.toggleFlag, /saveSecureExamDraft\(\{ examSessionId: active\.examSessionId, questionInstanceId, flagged \}\)/);
  assert.doesNotMatch(handlers.toggleFlag, /responsePayload/);
  assert.match(handlers.toggleFlag, /setSession\(\(current\) => withReviewFlag\(current, questionInstanceId, !flagged\)\);/, 'a flag that did not save is taken back');

  const list = region(container, '{navigatorOpen && !pause && (', '        />\n      )}', 'question list');
  assert.match(list, /<SecureExamNavigator\s+id="secure-question-list"/);
  assert.match(list, /onJump=\{\(cell\) => move\(cell\.target\)\}/);
  assert.match(list, /onReview=\{\(\) => move\(\{ kind: 'review' \}\)\}/);
});

test('every call that can meet a pause or the end of time hands its failure to handleProblem, in its own catch', () => {
  // Bound to each catch block: a handleProblem call elsewhere in the same
  // handler (the save before the move) does not stand in for it.
  const moveCatch = region(handlers.move, '} catch (moveError) {', '} finally {', 'move catch');
  assert.match(moveCatch, /\n\s*if \(!handleProblem\(problem\)\) \{/);
  const resumeCatch = region(handlers.resume, '} catch (resumeError) {', '} finally {', 'resume catch');
  assert.match(resumeCatch, /\n\s*if \(!handleProblem\(problem\)\) setError\(/);
  const startCatch = region(handlers.start, '} catch (startError) {', '} finally {', 'start catch');
  assert.match(startCatch, /\n\s*if \(!started \|\| !handleProblem\(problem\)\) setError\(/);
  const flagCatch = region(handlers.toggleFlag, '} catch (flagError) {', '}, [', 'flag catch');
  assert.match(flagCatch, /\n\s*if \(!handleProblem\(problem\)\) setError\(/);
  const finishCatch = region(handlers.finish, '} catch (finishError) {', '} finally {', 'finish catch');
  assert.match(region(finishCatch, '} else {', null, 'student submit refused'), /\n\s*if \(!handleProblem\(problem\)\) setError\(/);
  assert.match(handlers.runAutosave, /\n\s*if \(!result\.ok\) handleProblem\(result\.problem\);/);
  // The save before resuming, too.
  assert.match(handlers.resume, /\n\s*if \(!saved\.ok && handleProblem\(saved\.problem\)\) return;/);

  // What it does with each.
  const locked = region(handlers.handleProblem, "if (problem.kind === 'locked') {", 'return true;', 'locked');
  assert.match(locked, /setSession\(\(current\) => \(current \? \{ \.\.\.current, status: pausedStatusAfterRefusal\(problem\.status, current\.status\) \} : current\)\);/);
  assert.match(locked, /\n\s*if \(!problem\.status\) refreshSession\(\);/, 'a refusal that does not say which pause asks the server');
  assert.match(region(handlers.handleProblem, "if (problem.kind === 'expired') {", 'return true;', 'expired'), /finishRef\.current\?\.\('timeExpired'\)/);
  const navigationRefusal = region(handlers.handleProblem, "if (problem.kind === 'navigation') {", 'return true;', 'navigation refusal');
  assert.match(navigationRefusal, /const moduleEnd = problem\.reason === 'module_end' \? pendingModuleEnd\(readNavigation\(sessionRef\.current\)\) : null;/);
  assert.match(navigationRefusal, /if \(moduleEnd\) setView\(\{ kind: 'moduleEnd', target: moduleEnd \}\);\s*else setNotice\(problem\.message\);/);
});

test('a pause covers everything, takes focus, leaves nothing to type into, and resuming reopens the same question', () => {
  const resume = handlers.resume;
  assert.match(resume, /const target = Number\.isInteger\(positionRef\.current\) \? positionRef\.current : readNavigation\(active\)\.cursor;\s*await openPosition\(active\.examSessionId, target\);/);
  assert.doesNotMatch(executableSource(resume), /!question\b|\bquestion\s*(\?|&&|\|\|)|\(question\b/, 'not only when no question was showing');
  assert.match(container, /if \(status === EXAM_RUNTIME_STATES\.IN_PROGRESS && locked\.has\(previous\)\) resumeAfterPause\(\);/);

  const overlay = region(container, '{pause && (', '</Dialog>\n    )}', 'pause overlay');
  const teacher = region(overlay, "{pause === 'teacher' ? (", ') : (', 'teacher pause');
  assert.match(teacher, /<h1 id="secure-pause-title" style=\{pauseTitle\}>Your teacher paused the test<\/h1>/);
  assert.match(teacher, /Your answers are saved\. Wait here — it will continue when your teacher resumes it\./);
  const integrity = overlay.slice(overlay.indexOf(') : (', overlay.indexOf("{pause === 'teacher' ? (")));
  assert.match(integrity, /<h1 id="secure-pause-title" style=\{pauseTitle\}>Your test is paused<\/h1>/);
  assert.match(integrity, /\{integrityPauseText\(threshold\)\}/);
  assert.doesNotMatch(integrity, /Wait here/);
  // A title that wraps on a phone has a line height of its own, and on the
  // dark pause screen the screen's own light colour rather than the page's
  // (dark) heading colour.
  assert.match(region(container, 'const screenTitle = {', '};', 'screen title'), /lineHeight: 1\.2/);
  assert.match(container, /const pauseTitle = \{ \.\.\.screenTitle, color: 'inherit' \};/);
  assert.match(overlay, /data-secure-pause=\{pause\} style=\{\{[^}]*color: '#fff'/);

  // Above Work View ("Enlarge question"), a fixed modal layer, and its tools.
  const pauseLayer = Number(container.match(/const PAUSE_LAYER = (\d+);/)?.[1]);
  const workViewLayer = Number(workView.match(/\.mathmaster-work-view-host\[data-open="true"\] \{[\s\S]*?z-index: (\d+);/)?.[1]);
  const highestWorkViewTool = Math.max(...[...workView.matchAll(/z-index: (\d+) !important;/g)].map((match) => Number(match[1])));
  assert.ok(workViewLayer > 0 && pauseLayer > Math.max(workViewLayer, highestWorkViewTool), `pause ${pauseLayer} must be above Work View ${workViewLayer} and its tools ${highestWorkViewTool}`);
  assert.match(overlay, /zIndex: PAUSE_LAYER/);

  // It takes focus; the test behind it (Work View included) is inert; the
  // answer boxes are read-only while it shows. It is the shared Dialog (job F)
  // with Escape off, and its own focus return off: the container's record of
  // where the student was (lastFocusRef) gives focus back.
  assert.match(container, /^import Dialog from '\.\.\/\.\.\/ui\/Dialog\.jsx';$/m);
  assert.match(overlay, /<Dialog ref=\{pauseRef\} role="alertdialog" closeOnEscape=\{false\} returnFocus=\{false\} aria-labelledby="secure-pause-title"/);
  assert.match(region(container, 'const paused = pauseKind(session?.status);', '}, [paused]);', 'pause focus return'), /const last = lastFocusRef\.current;\s*if \(last\?\.isConnected && typeof last\.focus === 'function' && !last\.closest\('\[inert\]'\)\) last\.focus\(\);/);
  assert.match(region(container, 'const paused = pauseKind(session?.status);', '}, [paused]);', 'pause focus'), /if \(!paused\) return undefined;\s*pauseRef\.current\?\.focus\(\);/);
  // Only a pause makes the test inert. The question list is a panel on the
  // page (not a modal), so nothing has to be shut off behind it.
  assert.match(container, /const surfaceInert = Boolean\(pause\);/);
  const surfaceAt = indexIn(container, /<div inert=\{surfaceInert \|\| undefined\} data-secure-exam-surface=""/, 'the inert surface');
  const surfaceEnd = indexIn(container.slice(surfaceAt), /\n {4}<\/div>\n {4}\{pause && \(/, 'the surface ends before the pause');
  for (const [label, pattern] of [['header', /<ExamPrepHeader/], ['question list', /<SecureExamNavigator/], ['question', /<SecureExamQuestionPlayer/], ['review', /<SecureExamSubmitReview/], ['move bar', /<nav aria-label="Move between questions"/]]) {
    assert.ok(indexIn(container.slice(surfaceAt), pattern, label) < surfaceEnd, `${label} is inside the inert surface`);
  }
  assert.match(region(container, '<SecureExamQuestionPlayer', '/>', 'player'), /busy=\{busy \|\| Boolean\(pause\)\}/);
});

test('a teacher\'s pause reaches a student who is only reading', () => {
  const check = handlers.checkStatus;
  assert.match(check, /await startSecureExamSession\(\{ examSessionId: active\.examSessionId, examType: active\.examType \}\)/);
  // A change of status is taken whole (the pause, the resume, the finished test)…
  assert.match(check, /\n\s*if \(fresh\.status !== current\.status\) return fresh;/);
  // …otherwise only the clock, so a slow answer cannot undo a newer save or flag.
  assert.match(check, /\n\s*return \{ \.\.\.current, expiresAt: fresh\.expiresAt, timeLimitSeconds: fresh\.timeLimitSeconds, addedTimeSeconds: fresh\.addedTimeSeconds \};/);
  assert.doesNotMatch(executableSource(check), /navigation/);
  const poll = region(container, '  useEffect(() => {\n    if (!session?.examSessionId || session.status !== EXAM_RUNTIME_STATES.IN_PROGRESS) return undefined;\n    const id = window.setInterval(', '}, [session?.examSessionId, session?.status, checkStatus]);', 'status poll');
  assert.match(poll, /if \(busyRef\.current \|\| finishingRef\.current \|\| document\.visibilityState === 'hidden'\) return;\s*checkStatus\(\);/);
  assert.match(poll, /\}, STATUS_CHECK_MS\);/);
  assert.ok(Number(container.match(/const STATUS_CHECK_MS = (\d+) \* 1000;/)?.[1]) <= 60, 'at most a minute between checks');
});

test('time up finishes the test, and the messages say what actually went wrong', () => {
  const timeUp = region(handlers.finish, "if (reason === 'timeExpired') {", '} else {', 'time up refused');
  // Offline: reconnect. Online with a server clock a moment behind: wait, quietly.
  assert.match(timeUp, /if \(!fresh\) \{\s*setError\(TIME_UP_OFFLINE\);\s*window\.setTimeout\(\(\) => finishRef\.current\?\.\('timeExpired'\), \d+\);/);
  assert.match(timeUp, /\} else if \(!terminal\.has\(fresh\.status\) && Number\.isFinite\(deadline\) && deadline > 0 && Date\.now\(\) >= deadline\) \{\s*setNotice\(TIME_UP_WAITING\);\s*window\.setTimeout\(\(\) => finishRef\.current\?\.\('timeExpired'\), \d+\);/);
  assert.match(container, /const TIME_UP_OFFLINE = '[^']*Reconnect[^']*';/);
  assert.doesNotMatch(container.match(/const TIME_UP_WAITING = '[^']*';/)?.[0] || 'missing', /connect|offline|internet/i, 'an online student is not told to reconnect');
  // A move whose save landed but whose question did not open says the answers are saved.
  assert.match(region(handlers.move, '} catch (moveError) {', '} finally {', 'move catch'), /setError\(problem\.kind === 'network' \? OPEN_FAILED : /);
  assert.match(container, /const OPEN_FAILED = '(?:[^'\\]|\\.)*Your answers are saved(?:[^'\\]|\\.)*';/);
});

test('the event before an integrity pause warns, naming everything that counts, with a way back to full screen', () => {
  const logger = region(container, 'onEvent: async (event) => {', 'logger.startListening();', 'integrity logger');
  assert.match(logger, /if \(integrityWarningDue\(\{ status: EXAM_RUNTIME_STATES\.IN_PROGRESS, violationCount: result\.violationCount, lockThreshold: result\.lockThreshold, warning: result\.warning \}\)\) \{\s*setIntegrityNotice\(true\);/);
  const warning = region(container, '{integrityNotice && session.status === EXAM_RUNTIME_STATES.IN_PROGRESS && (', '    )}', 'warning');
  assert.match(warning, /<span><strong>Stay in the test window\.<\/strong> \{INTEGRITY_WARNING_TEXT\}<\/span>/);
  assert.match(warning, /<button type="button" onClick=\{returnToFullscreen\}[^>]*>Return to full screen<\/button>/);
  assert.match(region(container, 'const returnToFullscreen = () => {', '};', 'full screen'), /document\.documentElement\?\.requestFullscreen\?\.\(\)/);
});

test('keyboard focus never leaves the test: the question list is a panel, and Tab comes round', () => {
  // The question list is a panel on the page, named by its heading — not a
  // hand-rolled modal (the platform's one accessible Dialog is the place for
  // a modal). Focus starts on Close, Escape inside it closes it, and focus
  // goes back to whatever opened it.
  const listExec = executableSource(navigatorSource);
  assert.doesNotMatch(listExec, /aria-modal|role="dialog"|role="presentation"/);
  assert.match(navigatorSource, /<section\s+id=\{id\}\s+aria-labelledby="secure-navigator-title"/);
  assert.match(navigatorSource, /onKeyDown=\{\(event\) => \{ if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); onClose\?\.\(\); \} \}\}/);
  assert.match(region(navigatorSource, 'useEffect(() => {', '}, []);', 'list focus'), /closeRef\.current\?\.focus\(\);[\s\S]*opener\.focus\(\)/);

  // The whole test: a guard first and last sends Tab round to the other end.
  const guards = [...executableSource(container).matchAll(/<span tabIndex=\{0\} data-secure-focus-guard="(start|end)" onFocus=\{\(\) => focusEdge\('(first|last)'\)\}/g)].map((match) => `${match[1]}:${match[2]}`);
  assert.deepEqual(guards, ['start:last', 'end:first']);
  const root = region(container, '<div ref={rootRef} data-secure-exam-status', '  </div>;\n};', 'the test screen');
  assert.match(root, /^<div ref=\{rootRef\}[^\n]*\n\s*<span tabIndex=\{0\} data-secure-focus-guard="start"/, 'the first thing in the test');
  assert.match(root, /<span tabIndex=\{0\} data-secure-focus-guard="end"[^\n]*\n$/, 'the last thing in the test');
  // Only controls that can really take focus: not the guards, nothing inert.
  assert.match(handlers.focusEdge, /!element\.hasAttribute\('data-secure-focus-guard'\)\s*&& !element\.closest\('\[inert\]'\)/);
  assert.match(handlers.focusEdge, /if \(edge !== 'first'\) reachable\.reverse\(\);/);
  // The first control that really takes focus; with none, the pause screen.
  assert.match(handlers.focusEdge, /const target = reachable\.find\(\(element\) => \{ element\.focus\(\); return document\.activeElement === element; \}\);\s*if \(!target\) pauseRef\.current\?\.focus\(\);/);
});

test('the start screen states the new rules and the student\'s own time, and none of the one-way rules or jargon remain', () => {
  const startScreen = region(container, 'if (!session) {', 'if (terminal.has(session.status)) {', 'start screen');
  assert.match(startScreen, /const rules = startScreenRules\(\{/);
  assert.match(startScreen, /allowance: startScreenTime\(\{ session: startPreview, delivery, courseTest \}\),/);
  assert.match(startScreen, /\{rules\.map\(\(rule\) => <li key=\{rule\}>\{rule\}<\/li>\)\}/);
  // The session as the list knows it — passed in, or asked for when it was not.
  assert.match(container, /const startPreview = sessionPreview && typeof sessionPreview === 'object' \? sessionPreview : loadedPreview;/);
  const ask = region(container, 'if (sessionPreview || !examSessionId || session) return undefined;', '}, [sessionPreview, examSessionId, session]);', 'preview request');
  assert.match(ask, /listStudentSecureExamSessions\(\)/);
  assert.match(ask, /\.find\(\(entry\) => entry\?\.examSessionId === examSessionId\)/);
  assert.match(ask, /if \(!cancelled && found\) setLoadedPreview\(found\);/);
  assert.doesNotMatch(executableSource(container), /One attempt per question|cannot go back|monitored web delivery|lockdown browser/i);
});

test('the review before Submit and the module review are the screens Next and the question list lead to', () => {
  const body = region(container, '{reviewing ? (', ') : (', 'review branch');
  assert.match(body, /mode=\{view\.kind === 'moduleEnd' \? 'moduleEnd' : 'submit'\}/);
  assert.match(body, /onSubmit=\{\(\) => finish\('studentSubmit'\)\}/);
  assert.match(body, /onContinue=\{\(\) => move\(\{ kind: 'open', position: view\.target\.next\.start, closeModule: true \}\)\}/);
  assert.match(container, /onClick=\{\(\) => move\(next\)\}/);
  assert.match(container, /\{nextActionLabel\(next\)\} →/);
  // Neither the list nor the review can say whether an answer is right.
  for (const [name, source] of [['question list', navigatorSource], ['review', reviewSource]]) {
    assert.doesNotMatch(executableSource(source), /isCorrect|grading|score|solution/i, `${name} holds no verdict`);
  }
  assert.match(reviewSource, /Questions left blank count as zero\./);
  assert.match(reviewSource, /You won't be able to return to module \$\{finishing\.number\} after you start module \$\{next\.number\}\./);
});

test('the device copy of each answer survives moving around, and outranks the server only when the server lacks it', () => {
  const open = handlers.openPosition;
  assert.match(open, /const local = readLocalDraft\(activeSessionId, instance\.questionInstanceId\);/);
  assert.match(open, /const deviceWins = Boolean\(local && !local\.synced\);/);
  // `restored` keeps the server's workspace drafts; it is what is re-sent.
  assert.match(open, /request: \{ examSessionId: activeSessionId, questionInstanceId: instance\.questionInstanceId, responsePayload: restored, supportUsage: \{\}, \.\.\.nextDraftStamp\(\) \}/);
  const savedAt = indexIn(handlers.saveDraftNow, /await saveSecureExamDraft\(pending\.request\);/, 'saves');
  assert.ok(savedAt < indexIn(handlers.saveDraftNow, /markLocalDraftSynced\(pending\.request\.examSessionId, pending\.request\.questionInstanceId, pending\.localAt\);/, 'marks the copy synced only after the save'));
  assert.match(handlers.autosave, /const localAt = writeLocalDraft\(active\.examSessionId, question\.questionInstanceId, responsePayload\);/);
});

test('the student\'s list shows plain statuses, and released results open from the finished screen', () => {
  assert.doesNotMatch(executableSource(dashboard), /Status: \{session\.status\}/);
  const row = region(dashboard, '{group.rows.map((session) => {', '</article>', 'row');
  assert.match(row, /const status = studentSessionStatus\(session\);/);
  assert.match(row, /\{status\.label\}/);
  assert.match(row, /\{canReview \? 'See your results' : done \? 'Waiting for results'/);
  const active = region(dashboard, 'if (active) return (', '  );', 'active test');
  assert.match(active, /onOpenResults=\{\(finished\) => \{ setActive\(null\); setReviewing\(finished\?\.examSessionId \? finished : active\); \}\}/);
  assert.match(active, /sessionPreview=\{active\}/);

  const finished = region(container, 'if (terminal.has(session.status)) {', 'const current = Number.isInteger(position)', 'finished screen');
  assert.match(finished, /const showResults = summary\.canSeeResults && typeof onOpenResults === 'function';/);
  assert.match(finished, /\{showResults && <button type="button" onClick=\{\(\) => onOpenResults\(session\)\}[^>]*>See your results<\/button>\}/);
  assert.match(finished, /<h1 style=\{screenTitle\}>\{summary\.title\}<\/h1>/);
});
