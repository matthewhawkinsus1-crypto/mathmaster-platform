/*
 * STUDENT POLISH: one Log Out, a warning before Log Out throws away unsent
 * work, a save-status line in a student's words, and a page that is called
 * MathMaster in the browser tab.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describeLogoutRisk, LOGOUT_RISK_MESSAGE } from '../../src/platform/student/logoutGuard.js';
import { SAVE_STATUS_TEXT, SAVE_TONE, describeSaveStatus } from '../../src/platform/student/saveStatusModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* ---- 1. one Log Out ------------------------------------------------------ */

test('the shared navigation no longer draws a Log Out button; the identity bar does', () => {
  const nav = executableSource(read('src/components/student/StudentGlobalNav.jsx'));
  assert.doesNotMatch(nav, /Log Out/, 'a second Log Out a few pixels under the identity bar');
  assert.doesNotMatch(nav, /onClick=\{onLogout\}/);
  const bar = region(executableSource(read('src/components/student/StudentIdentityBar.jsx')), '<aside', '</aside>', 'the identity bar');
  assert.equal((bar.match(/>\s*Log Out\s*</g) || []).length, 1, 'exactly one Log Out, in the bar');
});

/* ---- 2. Log Out warns when work is unsent ------------------------------- */

test('nothing queued: Log Out does not ask', () => {
  assert.equal(describeLogoutRisk({}), null);
  for (const persistenceStatus of ['idle', 'durable', 'submitted', 'rejected']) {
    assert.equal(describeLogoutRisk({ persistenceStatus }), null, persistenceStatus);
  }
});

test('queued work makes Log Out ask, more firmly when a grade is at stake', () => {
  assert.deepEqual(describeLogoutRisk({ outboxDepth: 2, persistenceStatus: 'queued' }), { message: LOGOUT_RISK_MESSAGE, severity: 'low' });
  for (const persistenceStatus of ['capturing', 'queued', 'syncing', 'offline']) {
    assert.equal(describeLogoutRisk({ persistenceStatus })?.severity, 'low', persistenceStatus);
  }
  assert.equal(describeLogoutRisk({ outboxDepth: 1, pendingGradeCount: 1 })?.severity, 'high');
  assert.equal(describeLogoutRisk({ needsReviewCount: 1 })?.severity, 'high');
  assert.equal(describeLogoutRisk({ persistenceStatus: 'needs-review' })?.severity, 'high');
  assert.equal(describeLogoutRisk({ persistenceStatus: 'volatile' })?.severity, 'high');
  // Garbage counts are nothing, not NaN risk.
  assert.equal(describeLogoutRisk({ outboxDepth: 'x', pendingGradeCount: -1, needsReviewCount: null }), null);
  assert.equal(LOGOUT_RISK_MESSAGE, "You have work that hasn't been sent yet. If you log out now, it may be lost.");
});

test('the identity bar asks before logging out when logoutRisk is set, and never blocks', () => {
  const source = executableSource(read('src/components/student/StudentIdentityBar.jsx'));
  assert.match(source, /export default function StudentIdentityBar\(\{[^)]*logoutRisk = null[^)]*\}\)/);
  // Pressing Log Out with risk opens the question; without it, logs out.
  const press = region(source, 'const handleLogoutPress = () => {', '};', 'Log Out press');
  assert.match(press, /if \(logoutRisk\) setConfirmingLogout\(true\);\s*else onLogout\?\.\(\);/);
  const bar = region(source, '<aside', '</aside>', 'the identity bar');
  assert.match(bar, /onClick=\{handleLogoutPress\}[\s\S]*?>\s*Log Out\s*</);
  // The question: an alertdialog with both ways out.
  // It sits outside the <aside> (a fixed popover under the bar), so the bar's
  // one-line phone layout is untouched.
  const guard = '{!preview && onLogout && confirmingLogout && logoutRisk && (';
  const dialog = region(source, guard, '</>', 'the logout question');
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /position: 'fixed', top: `calc\(var\(\$\{STUDENT_IDENTITY_STACK_OFFSET\}, 38px\)/);
  assert.match(dialog, /\{logoutRisk\.message \|\| LOGOUT_RISK_MESSAGE\}/);
  // Stay (and Escape) close the question AND hand focus back to Log Out, so a
  // keyboard user is not dropped at the top of the page.
  assert.match(dialog, /onClick=\{stayLoggedIn\}[\s\S]*Stay and let it send/);
  // The shared Dialog (src/ui/Dialog.jsx): Escape calls onClose = Stay, focus
  // starts on Stay, and the alertdialog is named by its message.
  assert.match(dialog, /<Dialog\s+role="alertdialog"\s+onClose=\{stayLoggedIn\}\s+initialFocusRef=\{stayRef\}/);
  assert.match(source, /import Dialog from '\.\.\/\.\.\/ui\/Dialog\.jsx';/);
  const stay = region(source, 'const stayLoggedIn = () => {', '};', 'Stay');
  assert.match(stay, /setConfirmingLogout\(false\);\s*logoutRef\.current\?\.focus\(\);/);
  assert.match(bar, /ref=\{logoutRef\}[\s\S]*?onClick=\{handleLogoutPress\}/);
  assert.match(dialog, /onClick=\{confirmLogout\}[\s\S]*Log out anyway/);
  assert.equal((dialog.match(/minHeight: MIN_TOUCH_TARGET_PX/g) || []).length, 2, 'both answers are thumb-sized');
  const confirm = region(source, 'const confirmLogout = () => {', '};', 'Log out anyway');
  assert.match(confirm, /onLogout\?\.\(\);/);
  // Teacher preview never gets a student logout question (the guard above
  // starts with !preview), and the question closes once nothing is at risk.
  assert.match(source, /useEffect\(\(\) => \{\s*if \(!logoutRisk\) setConfirmingLogout\(false\);\s*\}, \[logoutRisk\]\);/);
});

/* ---- 3. save status ------------------------------------------------------ */

test('every persistence status has a line a student can read', () => {
  const cases = [
    ['idle', SAVE_TONE.SAVED],
    ['durable', SAVE_TONE.SAVED],
    ['submitted', SAVE_TONE.SAVED],
    ['capturing', SAVE_TONE.SAVING],
    ['queued', SAVE_TONE.SAVING],
    ['syncing', SAVE_TONE.SAVING],
    ['offline', SAVE_TONE.OFFLINE],
    ['needs-review', SAVE_TONE.ATTENTION],
    ['volatile', SAVE_TONE.ATTENTION],
    ['rejected', SAVE_TONE.ATTENTION],
  ];
  for (const [persistenceStatus, tone] of cases) {
    const status = describeSaveStatus({ persistenceStatus });
    assert.equal(status.tone, tone, persistenceStatus);
    assert.ok(status.text && !/undefined|NaN|outbox|queue|durable|volatile|sync/i.test(status.text), `${persistenceStatus}: "${status.text}"`);
  }
  assert.equal(describeSaveStatus({}).text, 'All work saved');
  assert.equal(describeSaveStatus({ persistenceStatus: 'queued' }).text, 'Saving…');
  assert.equal(describeSaveStatus({ persistenceStatus: 'offline' }).text, 'Offline — your work is saved on this device and will send when you reconnect');
  assert.equal(describeSaveStatus({ persistenceStatus: 'needs-review' }).text, 'Some work needs attention — keep this tab open');
  assert.equal(describeSaveStatus({ persistenceStatus: 'rejected' }).text, SAVE_STATUS_TEXT.rejected);
});

test('never "All work saved" while anything is still owed a delivery', () => {
  assert.equal(describeSaveStatus({ persistenceStatus: 'durable', outboxDepth: 1 }).tone, SAVE_TONE.SAVING);
  assert.equal(describeSaveStatus({ persistenceStatus: 'idle', pendingGradeCount: 1 }).tone, SAVE_TONE.SAVING);
  assert.equal(describeSaveStatus({ persistenceStatus: 'submitted', outboxDepth: 2, online: false }).tone, SAVE_TONE.OFFLINE);
  assert.equal(describeSaveStatus({ persistenceStatus: 'syncing', online: false }).tone, SAVE_TONE.OFFLINE);
  // Offline with nothing owed is still saved.
  assert.equal(describeSaveStatus({ persistenceStatus: 'durable', online: false }).tone, SAVE_TONE.SAVED);
  // Attention outranks offline: the device itself could not hold the work.
  assert.equal(describeSaveStatus({ persistenceStatus: 'volatile', online: false, outboxDepth: 3 }).tone, SAVE_TONE.ATTENTION);
});

/* ---- 4. the browser tab --------------------------------------------------- */

test('the page is titled MathMaster and uses the MathMaster icon', () => {
  const html = read('index.html');
  assert.match(html, /<title>MathMaster<\/title>/);
  assert.doesNotMatch(html, /Vite \+ React/);
  const icon = html.match(/<link rel="icon" type="image\/svg\+xml" href="\/([^"]+)" \/>/);
  assert.ok(icon, 'an SVG icon link');
  assert.equal(icon[1], 'mathmaster-icon.svg');
  // Vite copies public/ into dist/ verbatim, and Hosting serves dist/.
  const file = new URL(`../../public/${icon[1]}`, import.meta.url);
  assert.ok(existsSync(file), 'the icon file is in public/');
  const svg = readFileSync(file, 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox=/);
  assert.match(svg, /aria-label="MathMaster"/);
  assert.doesNotMatch(read('vite.config.js'), /publicDir:\s*false|copyPublicDir:\s*false/, 'public/ must reach the build');
});
