// THE SAVE LINE IS SEEN ON A PHONE (pass 3, wave 7, W7-8).
//
// On a phone the question stage clips, and the question was as tall as the
// stage, so "Draft saved.", "Not saved · …" and the draft-save problem notice
// sat below the stage's box: at 390×844 the line was drawn at 851–874, and no
// sighted student saw it. Measured in the browser by
// tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs (every phone layout,
// 200% text, text spacing); this pins the layout that does it, so CI's fast
// suite notices too:
//
//   - App.jsx renders the lines under the question in one status element,
//     inside the stage, after the question;
//   - on a phone, upright and on its side, the stage is a column: the question
//     takes what the lines leave (and still has a definite height, so its
//     columns scroll), and the lines never take more than 30% of it — at 200%
//     text the notice alone once cut the question's action bar in half;
//   - upright, the task panel gives way before the action bar does (review B1);
//   - a phone draws only the save lines that need the student: the routine
//     "Draft saved." and its kind are not drawn there (the owner, 2026-10-20).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import { describeRuntimeSaveLine, initialSaveSubject, saveLineIsRoutine } from '../../src/platform/student/saveStatusModel.js';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');

/** One rule's declarations, comments left out, within a media block. */
const rule = (media, selector) => {
  const start = media.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing ${selector}`);
  return executableSource(media.slice(start + selector.length + 2, media.indexOf('}', start)));
};

const PHONE_LAYOUTS = [
  ['upright', region(read('src/App.css'), '@media (max-width: 768px) and (orientation: portrait) {\n  /* One phone viewport = one question.', '\n}\n', 'the phone portrait assignment block')],
  ['on its side', region(read('src/components/student/MathToolMobileLayout.css'), '@media (orientation: landscape) and (max-height: 500px) {\n  .mathmaster-question-container.mode-landscape {', '\n}\n', 'the phone landscape assignment block')],
];

test('the save line and the problem notice are in the status element, inside the stage, after the question', () => {
  const stage = region(app, '<main ref={assignmentQuestionStageRef} className="mathmaster-question-stage"', '</main>', 'the question stage');
  const engine = stage.indexOf('<QuestionEngine');
  const status = region(stage, '<div className="mathmaster-question-stage-status">', '\n            </div>\n', 'the status element');
  assert.ok(engine >= 0 && stage.indexOf('<div className="mathmaster-question-stage-status">') > engine, 'the status element follows the question');
  assert.match(status, /\{!preview && studentSaveLineShown && \(\s*<p data-save-line=""/, 'the save line is in it');
  assert.match(status, /\{!preview && studentDraftSaveProblem && \(\s*<p role="alert" data-draft-save-problem=/, 'the problem notice is in it');
});

test('a routine save line is marked as such; a line that needs the student never is', () => {
  const answer = { ...initialSaveSubject(), lastRecorded: 'answer' };
  const routine = [
    ['capturing', initialSaveSubject(), 'Saving…'],
    ['queued', initialSaveSubject(), 'Draft saved on this device. You may keep working.'],
    ['syncing', { ...initialSaveSubject(), pendingAnswer: true }, 'Answer saved on this device · sending it to MathMaster. You may keep working.'],
    ['durable', initialSaveSubject(), 'Draft saved.'],
    ['submitted', answer, 'Answer recorded by MathMaster.'],
  ];
  for (const [persistenceStatus, subject, words] of routine) {
    assert.equal(describeRuntimeSaveLine({ persistenceStatus, subject }), words);
    assert.equal(saveLineIsRoutine({ persistenceStatus }), true, persistenceStatus);
  }
  // Offline, needs review, refused and not stored: the lines App also
  // announces, or that ask the student to keep the tab open.
  for (const persistenceStatus of ['offline', 'needs-review', 'rejected', 'volatile', 'idle', undefined, 'something new']) {
    assert.equal(saveLineIsRoutine({ persistenceStatus }), false, String(persistenceStatus));
  }
  const status = region(app, '<div className="mathmaster-question-stage-status">', '\n            </div>\n', 'the status element');
  assert.match(status, /<p data-save-line="" data-save-line-routine=\{studentSaveLineRoutine \? '' : undefined\}/);
  assert.match(app, /const studentSaveLineRoutine = saveLineIsRoutine\(\{ persistenceStatus: studentPersistenceStatus \}\);/);
});

for (const [layout, media] of PHONE_LAYOUTS) {
  test(`${layout}: a routine save line is not drawn, and the next line takes the first line's margin`, () => {
    assert.match(rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage-status > [data-save-line-routine]'), /^\s*display: none;\s*$/);
    assert.match(rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage-status > [data-save-line-routine]:first-child + *'), /margin-top: 4px !important;/);
    // Only the routine line: the problem notice and the other lines are never hidden here.
    assert.doesNotMatch(media, /\[data-draft-save-problem\][^{]*\{[^}]*display: none/);
    assert.doesNotMatch(media, /\.mathmaster-question-stage-status > (?:p|\*)\s*\{[^}]*display: none/);
  });

  test(`${layout}: the stage clips, and is a column the question fills under the lines' own height`, () => {
    const stage = rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage');
    // The clip stays: it is what keeps one question to one phone screen.
    assert.match(stage, /overflow: hidden !important;/);
    assert.match(stage, /display: flex;/);
    assert.match(stage, /flex-direction: column;/);
    assert.match(rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage > *'), /flex: 0 0 auto;/);
    assert.match(rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage > .mathmaster-question-engine'), /flex: 1 1 auto;/);
  });

  test(`${layout}: the lines never take more than 30% of the stage, and scroll in place past it`, () => {
    const status = rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage > .mathmaster-question-stage-status');
    assert.match(status, /max-height: 30%;/);
    assert.match(status, /overflow-y: auto;/);
    // Inside the cap the first line's margin is 4px, not 8px: at 200% text
    // on its side the cap is 53px and "Draft saved." is 46px (review, S1).
    assert.match(rule(media, '.mathmaster-assignment-screen .mathmaster-question-stage-status > :first-child'), /margin-top: 4px !important;/);
  });
}

// Upright, once the work area is gone the task panel gives way before the
// action bar does (review, B1): at 200% text on a 360×640 phone the lines
// under the question otherwise cut the bar until no button could be pressed.
test('upright: the task panel shrinks to one row before the action bar is cut', () => {
  const [, media] = PHONE_LAYOUTS[0];
  const panel = rule(media, '.mathmaster-assignment-screen .mathmaster-question-container.mode-portrait > .question-prompt-panel');
  assert.match(panel, /flex-shrink: 1;/);
  assert.match(panel, /min-height: 44px;/);
});
