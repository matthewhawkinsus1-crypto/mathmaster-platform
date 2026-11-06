// TEACHER SCREENS AT 200% TEXT, AT 320 PX, AND AT TARGET SIZE (TT27).
//
// The large-text sweep (tests/browser/studentShellLargeText.mjs --teacher) opens
// every teacher scene of the accessibility certification and found: a grid whose
// default (auto) track grew to its widest child and pushed a screen past the
// edge, a long word in a card that clips, and pointer targets 16 to 23 CSS px
// tall. The browser job is the proof; this file keeps the fixes from being
// undone by reading the rules they depend on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = read('src/components/teacher/teacherWorkspace.css');
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} has a rule`);
  return css.slice(start, css.indexOf('}', start));
};

test('a stack, a pill, a link and a select on a teacher screen can shrink to a phone at 200% text', () => {
  assert.match(rule('.tw-stack'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'one shrinkable column, not an auto track as wide as the widest child');
  assert.match(rule('.tw-select'), /max-width:\s*100%/, 'a select with a long option stays inside its row');
  const narrow = css.slice(css.indexOf('@media (max-width: 640px)'));
  assert.match(narrow, /\.tw-pill\s*\{[^}]*white-space:\s*normal/, 'a long pill wraps on a phone');
  assert.match(rule('.tw-pill'), /white-space:\s*nowrap/, 'and stays on one line elsewhere');
});

test('the administrator screen gives long words and a narrow screen room', () => {
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  const admin = region(workspace, "if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {", 'id={ADMIN_PANEL_ID}', 'the administrator screen');
  assert.match(admin, /overflowWrap:\s*'anywhere'/, 'a long word (Administration at 200% text) breaks instead of being cut by the card');
  assert.match(admin, /padding:\s*'22px clamp\(14px, 4vw, 28px\)'/, 'the header gives up side padding on a phone');
  assert.match(admin, /<main [^>]*style=\{\{ padding: 'clamp\(14px, 4vw, 28px\)' \}\}>\s*<div\s*$/, 'and so does the main');
});

// Targets: WCAG 2.5.8 asks 24 x 24 CSS px (or room around). These are the ones the sweep found, as numbers.
const MIN_TARGET = 24;
const numberAfter = (source, pattern) => Number((source.match(pattern) || [])[1]);

test('a link-style button, a student name, a small action button and a disclosure summary are 24 CSS px tall', () => {
  assert.ok(numberAfter(rule('.tw-link'), /min-height:\s*(\d+)px/) >= MIN_TARGET, '.tw-link');
  assert.ok(numberAfter(read('src/components/common/StudentNameLink.jsx'), /minHeight:\s*(\d+)/) >= MIN_TARGET, 'a student name that opens the profile');
  assert.ok(numberAfter(read('src/components/teacher/LiveClassMonitor.jsx'), /const smallButtonStyle = \{ minHeight: (\d+)/) >= MIN_TARGET, 'the Live Class tile buttons (+ Points)');
  for (const file of ['src/components/teacher/LessonPreflightModal.jsx', 'src/components/teacher/NeedsAttentionQueue.jsx', 'src/AssignmentIntakeBase.jsx', 'src/components/teacher/RepresentationAudit.jsx', 'src/components/teacher/SectionBalanceRigorAudit.jsx']) {
    const summaries = read(file).match(/<summary style=\{\{ cursor: 'pointer'[^>]*>/g) || [];
    assert.ok(summaries.length > 0, `${file} has plain disclosure summaries`);
    for (const summary of summaries) assert.ok(numberAfter(summary, /minHeight:\s*(\d+)/) >= MIN_TARGET, `${file}: ${summary.slice(0, 70)}`);
  }
});

test('the assignment list checkbox and the accommodation review fields are 24 CSS px', () => {
  const list = read('src/app/teacher/TeacherWorkspace.jsx');
  const checkbox = list.match(/style=\{\{ flex: '0 0 auto', width: '(\d+)px', height: '(\d+)px', cursor: 'pointer' \}\}/);
  assert.ok(checkbox && Number(checkbox[1]) >= MIN_TARGET && Number(checkbox[2]) >= MIN_TARGET, 'the "Select <assignment>" checkbox');
  const review = read('src/components/teacher/RetroactiveAccommodationReview.jsx');
  const fields = review.match(/<input style=\{\{ minHeight: (\d+) \}\}/g) || [];
  assert.equal(fields.length, 5, 'reduction, source, and the three dates');
  for (const field of fields) assert.ok(numberAfter(field, /minHeight: (\d+)/) >= MIN_TARGET);
});

test('CI runs the large-text and target-size sweeps over the teacher scenes, in a job of its own', () => {
  const workflow = read('.github/workflows/accessibility-certification.yml');
  const job = workflow.slice(workflow.indexOf('  browser-teacher-large-text:'));
  assert.notEqual(workflow.indexOf('  browser-teacher-large-text:'), -1, 'the job exists');
  assert.match(job, /studentShellLargeText\.mjs --check=text,targetsize --teacher/);
  const driver = read('tests/browser/studentShellLargeText.mjs');
  assert.match(driver, /process\.argv\.includes\('--teacher'\)/, 'the driver takes the flag');
  assert.match(driver, /TEACHER_SWEEP \? TEACHER_SCREENS : LARGE_TEXT_SCREENS/, 'and swaps the scenes for the teacher\'s');
  assert.match(driver, /parentElement\.open/, 'content of a closed disclosure is not read as on screen');
});
