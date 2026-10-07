import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RESULT_STEP,
  TRY_AGAIN_LABEL,
  describeResultNextStep,
  describeSectionStatus,
  tryAgainLabel,
} from '../../src/platform/student/studentResultNextStep.js';
import { LEVEL, resolveBack } from '../../src/platform/student/navigationModel.js';
import { SECTION_STATE } from '../../src/platform/student/lessonSections.js';
import { NOW, buildScreens } from './fixtures/studentTodayScreens.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * THE RESULT PAGE IS WHERE "NOTHING OPEN NOW" LANDS — SO IT SAYS WHAT TO DO.
 *
 * App's startAssignment opens this page when nothing in an assignment can be
 * worked this minute. Its next step comes from the one "Today" rule (the
 * dashboard entry) and resolveUpNext, through describeResultNextStep; the
 * component renders that decision. Fixtures are the real models.
 */

const screens = buildScreens();
const stepFor = (id, extra = {}) => describeResultNextStep({
  entry: screens.gradeEntryOf(id),
  todayEntry: screens.todayEntryOf(id),
  upNext: screens.upNextAfter(id),
  nowValue: NOW,
  formatTime: () => '2:15 PM',
  ...extra,
});

const resultSource = executableSource(readFileSync(new URL('../../src/components/student/StudentAssignmentResult.jsx', import.meta.url), 'utf8'));

test('open and actionable: the primary is Start/Continue landing on the Today rule\'s question', () => {
  const step = stepFor('actionable');
  assert.equal(step.kind, RESULT_STEP.CONTINUE);
  assert.equal(step.continueLabel, 'Continue');
  assert.equal(step.questionIndex, 1);
  assert.equal(step.questionIndex, screens.todayEntryOf('actionable').nextQuestionIndex);
  assert.equal(stepFor('due-today').continueLabel, 'Start');

  const continueBlock = region(resultSource, 'step.kind === RESULT_STEP.CONTINUE && (', '</button>', 'Continue block');
  assert.match(continueBlock, /onContinue\?\.\(entry\.assignmentId, step\.questionIndex/);
  assert.match(continueBlock, /\{step\.continueLabel\}/);
});

test('open but nothing workable: the wait text and every section\'s status, no Start', () => {
  const step = stepFor('waiting-dol');
  assert.equal(step.kind, RESULT_STEP.WAITING);
  assert.equal(step.continueLabel, null);
  assert.match(step.waitText, /^DOL opens at /);
  assert.deepEqual(
    step.sections.map(({ label, text }) => `${label} — ${text}`),
    ['Classwork — done', 'DOL — opens at 2:15 PM'],
  );

  const locked = stepFor('locked-practice');
  assert.equal(locked.kind, RESULT_STEP.WAITING);
  assert.equal(locked.waitText, 'Practice opens when your teacher starts it in class');
  assert.deepEqual(
    locked.sections.map(({ label, text }) => `${label} — ${text}`),
    ['Classwork — done', 'Practice — opens when your teacher starts it in class'],
  );

  // And what to do instead: Up next is real, actionable work elsewhere.
  assert.equal(step.upNext.assignment.id, 'actionable');
  assert.equal(step.offerHome, false);

  const waiting = region(resultSource, 'step.kind === RESULT_STEP.WAITING && (', '</div>\n        )}', 'waiting block');
  assert.match(waiting, /\{step\.waitText\}/);
  const sections = region(resultSource, 'step.sections.length > 0 && (', '</ul>', 'section list');
  assert.match(sections, /step\.sections\.map/);
  assert.match(sections, /\{section\.label\}/);
  assert.match(sections, /\{section\.text\}/);
});

test('section status lines', () => {
  const base = { label: 'Classwork', role: 'classwork', total: 3, doneCount: 2 };
  assert.equal(describeSectionStatus({ ...base, state: SECTION_STATE.DONE }).text, 'done');
  assert.equal(describeSectionStatus({ ...base, state: SECTION_STATE.OPEN, workable: true }).text, '2 of 3 done · open now');
  assert.equal(describeSectionStatus({ ...base, state: SECTION_STATE.OPEN, workable: true }).open, true);
  assert.equal(describeSectionStatus({ ...base, state: SECTION_STATE.EXCUSED }).text, 'excused');
  assert.equal(describeSectionStatus({ ...base, label: 'DOL', state: SECTION_STATE.RECOVERY }).text, 'closed · a Recovery is ready');
  assert.equal(
    describeSectionStatus({ ...base, label: 'Practice', state: SECTION_STATE.LOCKED, reason: 'teacherLock' }).text,
    'opens when your teacher starts it in class',
  );
  assert.equal(
    describeSectionStatus(
      { ...base, label: 'DOL', state: SECTION_STATE.OPENS_LATER, opensAt: new Date(NOW + 3600e3) },
      { nowValue: NOW, formatTime: () => '2:15 PM' },
    ).text,
    'opens at 2:15 PM',
  );
});

test('finished with Up next: the Up next card leads; without it, Back to Home', () => {
  const finished = stepFor('finished');
  assert.equal(finished.kind, RESULT_STEP.FINISHED);
  assert.equal(finished.upNext.assignment.id, 'actionable');
  assert.equal(finished.upNext.questionIndex, 1);
  assert.equal(finished.offerHome, false);
  assert.deepEqual(finished.sections, [], 'a finished record is broken down by its scores, not by "what opens"');

  const alone = stepFor('finished', { upNext: null });
  assert.equal(alone.offerHome, true);

  const card = region(resultSource, '{step.upNext && (', '</button>', 'Up next card');
  assert.match(card, />Up next</);
  assert.match(card, /step\.upNext\.assignment\?\.title/);
  assert.match(card, /onUpNext\?\.\(step\.upNext\)/);
  assert.match(card, /step\.upNext\.actionLabel/);
  const home = region(resultSource, '{step.offerHome && (', '</button>', 'Home button');
  assert.match(home, /actionStyle\(true\)/);
  assert.match(home, /onBackToHome\?\.\(\)/);
  assert.match(home, /Back to Home/);
});

test('a Recovery: points at the panel on this page, never Start', () => {
  const step = stepFor('recovery');
  assert.equal(step.kind, RESULT_STEP.RECOVERY);
  assert.equal(step.continueLabel, null);
  assert.ok(step.sections.some((section) => section.state === SECTION_STATE.RECOVERY));
});

test('closed: no Start; try again for no credit; excused: results only', () => {
  const closed = stepFor('closed');
  assert.equal(closed.kind, RESULT_STEP.CLOSED);
  assert.equal(closed.continueLabel, null);
  assert.equal(closed.canTryAgain, true);
  const excused = stepFor('excused');
  assert.equal(excused.kind, RESULT_STEP.EXCUSED);
  assert.equal(excused.canTryAgain, false);
  assert.equal(excused.continueLabel, null);
});

test('closed work is never "Practice": "Try it again — no credit" / "Try DOL again — no credit"', () => {
  assert.equal(tryAgainLabel(), TRY_AGAIN_LABEL);
  assert.equal(TRY_AGAIN_LABEL, 'Try it again — no credit');
  assert.equal(tryAgainLabel('DOL'), 'Try DOL again — no credit');
  const retry = region(resultSource, '{entry.practiceAvailable', '</button>', 'retry button');
  assert.match(retry, /tryAgainLabel\(sectionLabel\)/);
  assert.match(retry, /onPractice\?\.\(entry\.assignmentId\)/);
  assert.doesNotMatch(resultSource, /Practice This Skill|`Practice \$\{sectionLabel\}`/);
});

test('a review panel replaces Review My Work and the "not replayed" copy', () => {
  // Without a panel, the old honest copy and button stay.
  const unreplayed = region(resultSource, '{entry.frozen && !reviewPanel && (', '</p>', 'frozen copy without panel');
  assert.match(unreplayed, /not replayed/);
  // With a panel, the "not replayed" claim is not rendered anywhere.
  const withPanel = region(resultSource, '{entry.frozen && reviewPanel && (', '</p>', 'frozen copy with panel');
  assert.doesNotMatch(withPanel, /not replayed/);
  assert.equal((resultSource.match(/not replayed/g) || []).length, 1, 'the claim appears only in the no-panel branch');
  assert.match(resultSource, /\{reviewPanel && <div data-result-review-panel[^>]*>\{reviewPanel\}<\/div>\}/);
  const reviewButton = region(resultSource, '{entry.reviewAvailable', '</button>', 'Review My Work button');
  assert.match(reviewButton, /!reviewPanel/);
});

test('the Back control names its destination: "← Assignments" / "← Grades"', () => {
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT).navLabel, 'Assignments');
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.GRADES }).navLabel, 'Grades');
  assert.match(resultSource, /const backLabel = `← \$\{back\?\.navLabel/);
  // The list the Back control names is not offered a second time beside it.
  const exits = region(resultSource, '{cameFromGrades ? (', '</section>', 'other-list exit');
  assert.match(exits, /cameFromGrades \? \([\s\S]*All Assignments[\s\S]*\) : \([\s\S]*View All Grades/);
});
