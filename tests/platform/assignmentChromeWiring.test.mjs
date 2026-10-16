// Pass 3, Batches 5 and 7: the assignment chrome is wired to the navigator
// model and the time-left warnings. The behaviour itself is unit-tested
// (assignmentNavigator, timeLeftAlerts) and driven in a browser
// (tests/browser/teacherWorkflow/assignmentChromeJourneys.mjs); these bind the
// screens to it. App.jsx is .jsx: a call with no import passes every other
// check, so each import is asserted beside its use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const appCode = executableSource(app);
const timeLeft = read('src/components/student/SectionTimeLeft.jsx');
const examHeader = read('src/components/assessment/ExamPrepHeader.jsx');
const engine = read('src/QuestionEngine.jsx');
const css = read('src/App.css');
const nav = region(app, '<nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)}', '</nav>', 'the navigator');

test('App imports what the navigator calls', () => {
  assert.match(app, /import SectionTimeLeft from '\.\/components\/student\/SectionTimeLeft\.jsx';/);
  const navigatorImport = region(app, 'import {\n  QUESTION_STATUS,', "} from './platform/student/assignmentNavigator.js';", 'the navigator import');
  for (const name of ['SECTION_ACCESS', 'describeNavigatorQuestion', 'describeNavigatorSectionProgress', 'describeSectionAccess', 'sectionLandingEntry']) {
    assert.match(navigatorImport, new RegExp(`\\n {2}${name},\\n`), name);
    assert.match(appCode, new RegExp(`\\b${name}\\b[.(]?`), `${name} is used`);
  }
  assert.match(app, /import \{ SR_ONLY_STYLE \} from '\.\/ui\/srOnly\.js';/);
});

test('RUN-5: the number strip and its spoken names read the masked state', () => {
  const strip = region(nav, 'className="mathmaster-question-number-strip"', '</div>', 'the number strip');
  assert.match(strip, /const shown = navigatorQuestionFor\(entry\);/);
  assert.match(strip, /aria-label=\{`\$\{compactSectionLabel\(entry\)\} question \$\{entry\.sectionPosition \+ 1\}: \$\{shown\.spoken\}/);
  assert.doesNotMatch(strip, /record\.status|needs another try/);
  // navigatorQuestionFor passes the held mask for teacher-released sections.
  const question = region(app, 'const navigatorQuestionFor = (entry) => {', '};', 'navigatorQuestionFor');
  assert.match(question, /feedbackHeld: entryFeedbackHeld\(entry\)/);
  assert.match(question, /sectionClosed: access\.state === SECTION_ACCESS\.READ_ONLY/);
  const held = region(app, 'const entryFeedbackHeld = (entry) =>', ';\n', 'entryFeedbackHeld');
  assert.match(held, /feedback === 'teacherRelease'/);
  assert.match(held, /!assignmentFeedbackWasReleased\(assignment\)/);
});

test('RUN-9: the Overview speaks the same state, never "tries left" for a closed section', () => {
  const overview = region(app, '{assignmentOverviewExpanded && (', '<QuestionAnnouncer', 'the Overview');
  assert.match(overview, /const shown = navigatorQuestionFor\(entry\);/);
  assert.match(overview, />\{shown\.label\}<\/div>/, 'the card shows the state\'s words');
  assert.doesNotMatch(overview, /getQuestionCardState/);
});

test('RUN-8: a closed section is viewable, and a locked one says why', () => {
  const available = region(app, 'const entryIsAvailable = (entry) =>', ';\n', 'entryIsAvailable');
  assert.match(available, /sectionAccessFor\(entry\)\.viewable/);
  const access = region(app, 'const sectionAccessFor = (entry) => {', 'sectionAccessCache.set(', 'sectionAccessFor');
  for (const input of ['warmupState,', 'dolState,', 'hasWork: sectionHasWork(entry?.role),', 'unrestricted: preview || lifecycle.isPracticeOnly,']) {
    assert.ok(access.includes(input), input);
  }
  // Pressing a locked tab puts its reason on screen, in a status line.
  assert.match(nav, /setSectionLockNote\(\{ assignmentId: activeAssignmentId, role: section\.role, text: access\.reason \}\)/);
  assert.match(nav, /<p className="mathmaster-section-lock-note" role="status">/);
});

test('RUN-10: the DOL and the Warm-Up count down to the lifecycle state\'s own end', () => {
  // Never an end computed here: extra time (D7) moves the lifecycle state's.
  assert.match(nav, /<SectionTimeLeft label="Exit ticket \(DOL\)" endsAt=\{dolState\.endsAt\}/);
  assert.match(nav, /<SectionTimeLeft compact label="Warm-Up" endsAt=\{warmupState\.endsAt\}/);
  assert.doesNotMatch(nav, /formatRemainingTime\(dolState/);
});

test('RUN-10: SectionTimeLeft announces through a region that is always mounted', () => {
  const code = executableSource(timeLeft);
  assert.match(code, /import \{ UNFINISHED_WORK_LINE, formatTimeLeft, takeDueTimeAlert \} from '\.\.\/\.\.\/platform\/student\/timeLeftAlerts\.js';/);
  assert.match(code, /takeDueTimeAlert\(\{ key: `\$\{label\}\|\$\{endMs\}`, remainingMs, previousRemainingMs: previousRef\.current \}\)/);
  // The region is rendered whether or not there is a warning yet.
  assert.match(code, /<span role="alert" style=\{SR_ONLY_STYLE\}>\s*\{alert \? `\$\{alert\.words\} on the \$\{label\}\. \$\{UNFINISHED_WORK_LINE\.section\}` : ''\}/);
  assert.doesNotMatch(code, /\{alert && <span role="alert"/);
});

test('RUN-10: a secure test warns at 2:00 and 0:30, never while its clock is stopped', () => {
  const code = executableSource(examHeader);
  assert.match(code, /import \{ UNFINISHED_WORK_LINE, takeDueTimeAlert \} from '\.\.\/\.\.\/platform\/student\/timeLeftAlerts\.js';/);
  const effect = region(code, 'const [timeAlert, setTimeAlert] = useState(null);', 'const timeAlertText', 'the warning effect');
  assert.match(effect, /if \(secondsRemaining == null \|\| clockPaused\) \{ previousRemainingMsRef\.current = null; return; \}/);
  assert.match(effect, /takeDueTimeAlert\(\{ key: `test\|\$\{initialDeadline\}`/);
  assert.match(code, /\$\{timeAlert\.words\} on this test\. \$\{UNFINISHED_WORK_LINE\.test\}/);
  assert.match(code, /<span role="alert" style=\{SR_ONLY_STYLE\}>\{timeAlertText\}<\/span>/);
});

test('RUN-14: inside its lesson the Warm-Up is not a toast, and not a banner on a phone', () => {
  const reminder = region(app, 'const key = `${assignment.id}:${user.classId || user.classPeriod}:${warmupState.instructionDateKey || localDateKey(now)}`;', 'toastWarning(', 'the Warm-Up reminder');
  assert.match(reminder, /if \(activeView === 'assignment' && activeAssignmentId === assignment\.id\) return;/);
  assert.match(app, /className="mathmaster-warmup-banner"/);
  const phone = region(css, '@media (max-width: 768px) and (orientation: portrait), (orientation: landscape) and (max-height: 500px) {', '\n}\n', 'the phone rules');
  assert.match(phone, /\.mathmaster-assignment-screen \.mathmaster-warmup-banner \{\s*display: none !important;/);
  assert.match(phone, /\.mathmaster-assignment-screen \.mathmaster-assignment-status-chip \{\s*display: block;/);
});

test('NAV-5: the phone status chip opens the full lines, and only phones show it', () => {
  assert.match(nav, /aria-expanded=\{assignmentStatusOpen\}/);
  assert.match(nav, /\{assignmentStatusLines\[0\]\.chip\}/);
  assert.match(nav, /assignmentStatusLines\.map\(\(line\) => \(/);
  const lines = region(app, 'const assignmentStatusLines = preview ? [] : [', '].filter(Boolean);', 'the status lines');
  for (const key of ['liveChallenge', 'dol', 'warmup', 'late', 'practice']) assert.match(lines, new RegExp(`key: '${key}'`), key);
  // Hidden by default (wider screens keep the banners).
  assert.match(css, /\.mathmaster-assignment-status-chip,\n\.mathmaster-assignment-status-panel \{\n {2}display: none;/);
});

test('RUN-16: no program words in the assignment chrome', () => {
  const header = region(app, '<header className="mathmaster-assignment-header"', '</header>', 'the assignment header');
  // On time needs no badge; which version a section hands out is for a preview.
  assert.match(app, /: \{ label: '', background: 'transparent', color: 'var\(--mm-text\)' \};/);
  assert.match(header, /\{lifecycleBadge\.label && <span/);
  assert.match(header, /\{preview && <span[^\n]*PERSONALIZED VERSIONS/);
  assert.doesNotMatch(executableSource(app), /'On-time access'|if submitted now/i);
});

test('D9: the enlarged workspace is called Work View where a student opens it', () => {
  const figure = region(engine, '<EnlargeableFigure\n        label="Question Work View"', '>', 'the question Work View');
  assert.match(figure, /enlargeLabel="Open Work View"/);
  assert.doesNotMatch(executableSource(engine), /enlargeLabel="Enlarge question"/);
});
