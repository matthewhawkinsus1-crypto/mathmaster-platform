import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('QuestionEngine owns one in-place Work View around the complete interaction', () => {
  const source = read('src/QuestionEngine.jsx');
  const start = source.indexOf('<WorkViewCapabilityProvider capabilities=');
  const end = source.indexOf('</WorkViewCapabilityProvider>', start);
  const boundary = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(boundary, /<EnlargeableFigure[\s\S]*className="mathmaster-question-tool-workspace"[\s\S]*\{renderModule\(\)\}[\s\S]*<\/EnlargeableFigure>/);
  assert.match(boundary, /primaryActions:[\s\S]*workspaceActions\.submit/);
  assert.match(boundary, /secondaryActions:[\s\S]*workspaceActions\.reset[\s\S]*workspaceActions\.scratchpad[\s\S]*workspaceActions\.calculator/);
});

test('QuestionEngine exposes a universal reset that remounts the current tool without erasing attempts', () => {
  const source = read('src/QuestionEngine.jsx');
  assert.match(source, /resetQuestionDraftFamily\(draftKey\)/);
  assert.match(source, /forgetToolDrafts\(draftKey\)/);
  assert.match(source, /setQuestionResetVersion\(\(current\) => current \+ 1\)/);
  assert.match(source, /Your recorded attempts and grade history will not be erased/);
  assert.match(source, /↺ Reset Question/);
  assert.match(source, /QuestionModuleBoundary[\s\S]*reset-\$\{questionResetVersion\}/);
});

test('nested fixture figures publish capabilities instead of opening another shell', () => {
  const source = read('src/components/common/EnlargeableFigure.jsx');
  assert.match(source, /const nestedWorkView = useHasParentWorkView\(\)/);
  assert.match(source, /usePublishWorkViewCapabilities\([\s\S]*nestedWorkView \? capabilities : null/);
  assert.match(source, /if \(nestedWorkView\)[\s\S]*data-work-view-nested="true"[\s\S]*\{children\}/);
  assert.match(source, /shouldForceClose = forceClosed \|\| questionTerminal \|\| nestedWorkView/);
});

test('assignment chrome suppression is not guarded by a viewport breakpoint', () => {
  const css = read('src/components/common/WorkViewShell.css');
  const selector = 'html[data-work-view-open="true"] .mathmaster-section-tabs';
  const start = css.indexOf(selector);
  const end = css.indexOf('}', start);
  const rule = css.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(rule, /mathmaster-question-number-strip/);
  assert.match(rule, /mathmaster-assignment-header/);
  assert.match(rule, /display: none !important/);
  assert.equal(css.lastIndexOf('@media', start) < css.lastIndexOf('}', start), true);
});
