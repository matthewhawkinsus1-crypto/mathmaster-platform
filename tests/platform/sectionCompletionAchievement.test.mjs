import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');

test('gold achievement state only requires every question to be correct', () => {
  assert.match(app, /allCorrect: section\.entries\.length > 0 && section\.entries\.every\(\(entry\) => sectionQuestionIsCorrect\(entry\.index\)\)/);
  assert.match(app, /section\.allCorrect \? ' is-complete'/);
  assert.match(app, /sectionComplete=\{Boolean\(currentNavigationSection\?\.allCorrect\)\}/);
});

test('completed section tabs communicate completion without color alone', () => {
  assert.match(app, /mathmaster-section-complete-medallion/);
  assert.match(app, /section\.allCorrect \? 'Complete'/);
  assert.match(css, /\.mathmaster-section-tab\.is-complete/);
  assert.match(css, /border: 3px solid #c58a00/);
  assert.match(css, /background: #fff4ce/);
});

test('finishing a section shows a milestone card and next available section action', () => {
  assert.match(engine, /mathmaster-section-completion-card/);
  assert.match(engine, /SECTION.*COMPLETE/i);
  assert.match(engine, /Continue to \{continueSectionLabel \|\| 'next section'\}/);
  assert.match(app, /nextAvailableIncompleteSection/);
  assert.match(app, /onContinueSection=\{nextAvailableSectionTarget/);
});

test('section celebration is transition based and respects reduced motion', () => {
  assert.match(engine, /previousSectionCompleteRef/);
  assert.match(engine, /setSectionCompletionCelebrating\(true\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
