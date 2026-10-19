import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region } from './helpers/sourceContract.mjs';
import { describeNavigatorQuestion, describeNavigatorSectionProgress } from '../../src/platform/student/assignmentNavigator.js';

const app = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');

test('gold achievement state only requires every question to be correct', () => {
  // Since pass 3 (RUN-5) the tab's allCorrect is the navigator model's: every
  // question correct, and never while feedback is held.
  const progress = region(app, 'navigationSections.forEach((section) => {', 'const findNeighbor', 'section progress');
  assert.match(progress, /questions: section\.entries\.map\(\(entry\) => navigatorQuestionFor\(entry\)\)/);
  assert.match(progress, /feedbackHeld: section\.entries\.some\(\(entry\) => entryFeedbackHeld\(entry\)\)/);
  assert.match(progress, /section\.allCorrect = section\.progress\.allCorrect;/);
  const right = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
  const outOfTries = { status: 'expired', attemptCount: 3, totalAttempts: 3 };
  const states = (records, feedbackHeld = false) => records.map((record) => describeNavigatorQuestion({ record, maximumAttempts: 3, feedbackHeld }));
  assert.equal(describeNavigatorSectionProgress({ questions: states([right, right]) }).allCorrect, true);
  assert.equal(describeNavigatorSectionProgress({ questions: states([right, outOfTries]) }).allCorrect, false);
  assert.equal(describeNavigatorSectionProgress({ questions: states([right, right], true), feedbackHeld: true }).allCorrect, false);
  assert.match(app, /section\.allCorrect \? ' is-complete'/);
  // The gold tab state still requires every question correct (above). The
  // workspace's section-complete signal follows TERMINAL completion instead
  // (decision 4: done at any accuracy), so a student out of tries on the last
  // question still gets the continue/hand-off action.
  assert.match(app, /sectionComplete=\{Boolean\(currentNavigationSection\?\.complete\)\}/);
});

test('completed section tabs communicate completion without color alone', () => {
  assert.match(app, /mathmaster-section-complete-medallion/);
  // The tab's words come from the same progress: "Complete" only when all
  // are right, beside the ✓ medallion.
  const tab = region(app, 'className={`mathmaster-section-tab${', '</button>', 'the section tab');
  assert.match(tab, /\{section\.allCorrect && <span className="mathmaster-section-complete-medallion"/);
  assert.match(tab, /section\.progress\.label/);
  assert.equal(describeNavigatorSectionProgress({ questions: [{ status: 'correct' }] }).label, 'Complete');
  assert.match(css, /\.mathmaster-section-tab\.is-complete/);
  assert.match(css, /border: 3px solid #c58a00/);
  // The warm achievement container, as its themed token.
  assert.match(css, /background: var\(--mm-warning-soft\)/);
});

test('finishing a section shows a milestone card and next available section action', () => {
  assert.match(engine, /mathmaster-section-completion-card/);
  assert.match(engine, /SECTION.*COMPLETE/i);
  assert.match(engine, /Continue to \{continueSectionLabel \|\| 'next section'\}/);
  assert.match(app, /nextAvailableIncompleteSection/);
  // The action continues to the next section with work left, or — with none
  // left — hands off to Up next / results (assignmentHandoff.js); it is wired
  // whenever a hand-off exists, which includes the next-section case.
  assert.match(app, /onContinueSection=\{assignmentHandoff \? continueAfterSection : null\}/);
  assert.match(app, /assignmentHandoff\.kind === 'section'\s*\?\s*\(\) => changeQuestion\(nextAvailableSectionTarget\.index\)/);
});

test('section celebration is transition based and respects reduced motion', () => {
  assert.match(engine, /previousSectionCompleteRef/);
  assert.match(engine, /setSectionCompletionCelebrating\(true\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
