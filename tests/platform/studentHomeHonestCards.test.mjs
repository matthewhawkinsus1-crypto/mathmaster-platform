import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * HOME NAMES THE ONE THING TO DO NOW, AND EVERY CARD ON IT TELLS THE TRUTH.
 *
 * Node cannot render .jsx, so these are source contracts, each bound to the
 * region that does the work (the header, renderAssignmentCard, the page's
 * render order, WhatShouldIDoNow's act()). The rendered behaviour is proven in
 * Chromium by tests/browser/studentHomeToday.mjs, which mounts this screen on a
 * dashboard built by the real buildStudentDashboardModel + resolveNextAction.
 */

const read = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const view = read('components/student/StudentDashboardView.jsx');
const card = read('components/student/WhatShouldIDoNow.jsx');
const code = executableSource(view);

const header = region(view, '<header', '</header>', 'Home header');
const assignmentCard = region(view, 'const renderAssignmentCard = (entry) => {', '\n  const nothingElseToDo', 'renderAssignmentCard');
const page = region(view, '  return (\n    <div className', null, 'Home render');
const act = region(card, 'const act = () => {', '\n  };', 'WhatShouldIDoNow act()');

/* 1. PRIVACY. */

test('Home shows only the class period under the name — never a support plan', () => {
  assert.match(header, /<p [^>]*>\{student\.classPeriod\}<\/p>/, 'the header line is the class period alone');
  // Nothing on Home reads or prints a support-plan field; a classmate can read
  // this screen over a shoulder. (Comments may explain the rule.)
  assert.doesNotMatch(code, /inclusionStatus|Inclusion|\bIEP\b|special[ -]?ed|\b504\b/i);
});

/* 2. EACH ACTION APPEARS ONCE. */

test('the next-action card carries the live DOL, Warm-Up or Resume; their own card is not rendered too', () => {
  assert.match(code, /const CARRIED_BY_NEXT_ACTION = new Set\(\['dol', 'warmup', 'resume'\]\)/);
  assert.match(code, /const carriedAssignmentId = nextAction && CARRIED_BY_NEXT_ACTION\.has\(nextAction\.kind\)/);
  assert.match(code, /const secondaryWarmups = activeWarmups\.filter\(\(\{ assignment \}\) => assignment\.id !== carriedAssignmentId\)/);
  assert.match(code, /const secondaryDols = activeDols\.filter\(\(\{ assignment \}\) => assignment\.id !== carriedAssignmentId\)/);
  assert.match(code, /const showResumeCard = Boolean\(resumeAssignment\) && resumeAssignment\.id !== carriedAssignmentId/);
  // The page renders only the secondary lists — never the raw live lists.
  assert.match(page, /\{secondaryWarmups\.map\(/);
  assert.match(page, /\{secondaryDols\.map\(/);
  assert.match(page, /\{showResumeCard && \(/);
  assert.doesNotMatch(executableSource(page), /activeWarmups[^.\n]*\)?\.map\(|activeDols\.map\(|\{resumeAssignment && \(/);
});

test('what the separate cards carried moves into the next-action card', () => {
  const call = region(page, '<WhatShouldIDoNow', '/>', 'WhatShouldIDoNow call');
  assert.match(call, /countdownEndsAt=\{nextActionEndsAt\}/);
  assert.match(call, /hideCountdowns=\{hideCountdowns\}/);
  assert.match(call, /resume=\{nextAction\.kind === 'resume' && resumeAssignment/);
  assert.match(code, /const hideCountdowns = Boolean\(supportPresentation\.hideCountdowns\)/);
  // The countdown is the live window of the SAME assignment the card names.
  const endsAt = region(view, 'const nextActionEndsAt = (() => {', '})();', 'nextActionEndsAt');
  assert.match(endsAt, /nextAction\.kind === 'dol' \? activeDols : nextAction\.kind === 'warmup' \? activeWarmups/);
  assert.match(endsAt, /assignment\.id === nextAction\.assignment\.id\)\?\.state\?\.endsAt/);

  // In the card: the countdown only for a timed kind, and never when the
  // student's plan hides countdowns.
  assert.match(card, /const TIMED_KINDS = new Set\(\['dol', 'warmup'\]\)/);
  assert.match(card, /const showCountdown = TIMED_KINDS\.has\(nextAction\.kind\) && Boolean\(countdownEndsAt\) && !hideCountdowns/);
  assert.match(card, /\{showCountdown && \([\s\S]*?<DOLCountdown endsAt=\{countdownEndsAt\} \/>/);
  // The resume line names the question the way the workspace numbers it
  // ("Classwork Question 2"), from the same address its URL carries.
  assert.match(card, /nextAction\.kind === 'resume' && resume && \([\s\S]*?Continue at \{resume\.questionLabel[\s\S]*?\}\. Your answers are kept as you go\./);
  assert.match(call, /questionLabel: resumeQuestionLabel/);
  assert.match(code, /const resumeQuestionLabel = questionAddressLabel\(resumeQuestionAddress\)/);
  assert.match(card, /resume\.gradeText/);
});

/* 3. ORDER. */

test('order: live challenge, save status, the next action, groups, what changed, rewards, then recommended', () => {
  const at = (needle) => {
    const index = page.indexOf(needle);
    assert.notEqual(index, -1, `${needle} is not rendered`);
    return index;
  };
  const order = [
    '</header>',
    '{saveStatus && saveStatus.text && (',
    '{liveChallengeInvite && ',
    '<WhatShouldIDoNow',
    '{raiseCount > 0 && openGrades && (',
    '{secondaryWarmups.map(',
    'BUCKET_ORDER.map(',
    '{whatChangedPanel}',
    '<RewardsSummaryCard',
    '<ClassPointsCelebrations',
    '<RecommendedSkills',
  ].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Home sections are out of order');
});

/* 4. CARD HONESTY. */

test('finished, closed and excused work is never Late and never offers late or locked buttons', () => {
  assert.match(assignmentCard, /const closed = bucket === 'practice';/);
  assert.match(assignmentCard, /const finished = excused \|\| closed \|\| entry\.finished === true \|\| bucket === 'completed';/);
  assert.match(assignmentCard, /const late = !finished && Boolean\(lifecycle\.isLate\);/);
  // Status: excused, closed and finished are decided before late.
  const status = region(assignmentCard, 'const status = excused', ';\n', 'status chip');
  const position = (label) => status.indexOf(`label: '${label}'`);
  assert.ok(position('Excused') > -1 && position('Closed') > -1 && position('Finished') > -1 && position('Late') > -1);
  assert.ok(position('Excused') < position('Late') && position('Closed') < position('Late') && position('Finished') < position('Late'));
  assert.doesNotMatch(executableSource(assignmentCard), /Continue Late Work|'Locked'|Practice — No Credit/);
});

test('buttons: See results / Try it again — no credit / Open Recovery / Start or Continue at the model\'s question', () => {
  assert.match(assignmentCard, /\{finished && primaryButton\('See results', \(\) => openResult\(assignment\.id\)/);
  assert.match(assignmentCard, /\{closed && primaryButton\('Try it again — no credit', \(\) => onStartAssignment\?\.\(assignment\.id\)/);
  assert.match(assignmentCard, /const actionable = !finished && \(entry\.actionable \?\? !entry\.disabled\) === true;/);
  assert.match(assignmentCard, /const isRecovery = actionable && entry\.action === 'recovery';/);
  assert.match(assignmentCard, /\{isRecovery && primaryButton\('Open Recovery', \(\) => openResult\(assignment\.id\)/);
  assert.match(assignmentCard, /\{actionable && !isRecovery && primaryButton\(\s*questionsAttempted > 0 \? 'Continue' : 'Start',\s*\(\) => onStartAssignment\?\.\(assignment\.id, entry\.nextQuestionIndex \?\? 0\)/);
  // The result page is the new prop, with Start (which lands on the result
  // when nothing is open) only as the fallback for a caller without it.
  const openResult = region(view, 'const openResult = (assignmentId) => {', '\n  };', 'openResult');
  assert.match(openResult, /if \(onOpenResult\) onOpenResult\(assignmentId\);/);
});

test('waiting work says what it is waiting for, with no Start button', () => {
  assert.match(assignmentCard, /const waiting = !finished && !actionable;/);
  assert.match(assignmentCard, /const waitLine = waiting\s*\? entry\.waitText/);
  assert.match(assignmentCard, /\{waitLine && <strong data-wait-line/);
  // The only Start/Continue is gated on `actionable`.
  const starts = [...executableSource(assignmentCard).matchAll(/'Start'|'Continue'/g)];
  assert.equal(starts.length, 2, 'one Start/Continue control, behind `actionable`');
});

test('excused work shows Excused and no grade', () => {
  assert.match(assignmentCard, /const excused = entry\.excused === true;/);
  assert.match(assignmentCard, /const showGrade = !excused && questionsAttempted > 0;/);
  assert.match(assignmentCard, /\{showGrade && \(/);
});

test('the card lists the lesson\'s real sections with progress, not the retired assignmentType', () => {
  assert.match(assignmentCard, /sections\.map\(\(section\) => section\.label\)\.join\(' · '\)/);
  assert.match(assignmentCard, /sectionChip\(section, \{ waitText: entry\.waitText, nextOpening: lesson\?\.nextOpening \}\)/);
  const chip = region(view, 'const sectionChip = ', '\n};', 'sectionChip');
  for (const state of ['DONE', 'EXCUSED', 'OPEN', 'RECOVERY', 'OPENS_LATER', 'LOCKED', 'CLOSED']) {
    assert.match(chip, new RegExp(`case SECTION_STATE\\.${state}:`), `no chip for ${state}`);
  }
  assert.match(chip, /`\$\{label\} \$\{doneCount\}\/\$\{total\} ✓`/);
  assert.match(chip, /`\$\{label\} — Excused`/);
  assert.match(chip, /describeSectionWait\(section\)/);
  assert.doesNotMatch(code, /assignmentType|sectionVariantModes|variantMode/);
});

test('no teacher jargon on Home; Classroom only when the student can see it there', () => {
  assert.doesNotMatch(code, /SECTION-SPECIFIC VERSIONS|SAME CLASS VERSION|teacher draft|checkpoint|meaningful work is underway|if stopped now/i);
  assert.match(assignmentCard, /const showClassroomGrade = !feedbackHeld && Boolean\(classroomReceipt\) && receipt\.studentVisible && receipt\.grade != null;/);
  assert.match(assignmentCard, /'Grade so far'/);
  assert.match(assignmentCard, /'Waiting for your teacher'/);
});

test('group hints and Resume copy do not contradict the rest of the screen', () => {
  const hints = region(view, 'const GROUP_HINTS = {', '};', 'GROUP_HINTS');
  assert.match(hints, /pastDue: 'Late work is still open and still counts\.'/);
  assert.match(hints, /practice: 'These are closed\. Trying them again is for practice and does not change your grade\.'/);
  assert.doesNotMatch(code, /restored from this browser/);
  assert.match(code, /Your answers are kept as you go\./);
});

test('"Nothing waiting" only when the next action is not assigned work', () => {
  assert.match(code, /const NOTHING_ASSIGNED_KINDS = new Set\(\['clear', 'weeklyPath', 'weeklyPathStatus'\]\)/);
  assert.match(code, /const nothingElseToDo = !resumeAssignment && !activeDols\.length && !activeWarmups\.length\s*&& \(!nextAction \|\| NOTHING_ASSIGNED_KINDS\.has\(nextAction\.kind\)\)/);
  assert.match(page, /\{nothingElseToDo && BUCKET_ORDER\.every\([\s\S]*?title="Nothing waiting"/);
});

test('a waiting DOL says its real open time, never "the final N minutes of class"', () => {
  assert.doesNotMatch(code, /final \{[^}]*\} minutes of class|minutesBeforeEnd/);
  assert.match(assignmentCard, /\['waiting', 'beforeClass'\]\.includes\(dol\.status\)\s*\? formatClock\(dol\.opensAt\)/);
  assert.match(assignmentCard, /DOL opens at \{dolOpensAt\}/);
});

/* 5. WhatShouldIDoNow. */

test('a Recovery next action opens the result page; other work starts at the model\'s question', () => {
  const recovery = act.indexOf('nextAction.opensResult');
  const start = act.indexOf('onStartAssignment(nextAction.assignment, nextAction.questionIndex ?? 0)');
  assert.ok(recovery > -1 && start > -1 && recovery < start, 'opensResult is checked before Start');
  assert.match(act, /if \(nextAction\.assignment && nextAction\.opensResult && onOpenResult\) \{\s*onOpenResult\(nextAction\.assignment\.id\);\s*return;/);
  // Waiting (assignedSoon) names no assignment and falls through to My Math Path.
  assert.match(act, /onOpenMathPath\?\.\(\);\s*$/);
  assert.match(region(page, '<WhatShouldIDoNow', '/>', 'call'), /onOpenResult=\{openResult\}/);
});

/* 6. NEW OPTIONAL PROPS. */

test('save status, What changed and ways to raise render only when given', () => {
  assert.match(page, /\{saveStatus && saveStatus\.text && \(\s*<p role="status" aria-live="polite"/);
  assert.match(page, /\n\s*\{whatChangedPanel\}\n/);
  assert.match(code, /const raiseCount = Number\(waysToRaise\?\.count\) \|\| 0;/);
  assert.match(code, /const openGrades = onNavigate \? \(\) => onNavigate\(STUDENT_DESTINATION\.GRADES\) : null;/);
  assert.match(page, /\{raiseCount > 0 && openGrades && \([\s\S]*?onClick=\{openGrades\}[\s\S]*?ways'\} to raise your grade →/);
});
