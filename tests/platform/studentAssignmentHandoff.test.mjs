import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAssignmentHandoff } from '../../src/platform/student/assignmentHandoff.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

test('a later unfinished section comes first', () => {
  assert.deepEqual(resolveAssignmentHandoff({ nextIncompleteSection: { role: 'dol' }, nextIncompleteSectionLabel: 'DOL', upNext: { assignment: { id: 'b', title: 'B' } } }), { kind: 'section', label: 'DOL' });
});

test('with nothing left in this assignment, hand off to Up next', () => {
  const upNext = { assignment: { id: 'b', title: 'Lesson 5' } };
  assert.deepEqual(resolveAssignmentHandoff({ upNext }), { kind: 'upNext', label: 'Lesson 5', upNext });
});

test('with no Up next, go to the results page — never a finished section', () => {
  assert.deepEqual(resolveAssignmentHandoff({}), { kind: 'results', label: 'your results' });
  assert.equal(resolveAssignmentHandoff({ student: false }), null);
});

const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('App offers only an INCOMPLETE later section, then Up next / results (with its imports)', () => {
  const workspace = region(app, 'const nextAvailableIncompleteSection =', 'const returnsToAssignmentResult', 'section hand-off');
  // The fallback to an already-complete later section ("Continue to Practice"
  // with Practice done) is gone.
  assert.doesNotMatch(workspace, /laterNavigationSections\.find\(\(section\) => sectionNavigationTarget\(section\)\)/);
  assert.match(workspace, /resolveAssignmentHandoff\(\{/);
  assert.match(workspace, /resolveUpNext\(\{\s*dashboard:\s*studentUpNextDashboard\(\)/);
  assert.match(app, /import \{[^}]*\bresolveAssignmentHandoff\b[^}]*\} from '\.\/platform\/student\/assignmentHandoff\.js'/);
  assert.match(app, /import \{[^}]*\bresolveUpNext\b[^}]*\} from '\.\/studentDashboardModel\.js'/);
  const engine = region(app, 'onContinueSection={', 'continueSectionLabel=', 'QuestionEngine hand-off prop');
  assert.match(engine, /assignmentHandoff/);
});

test('the continue button only leads to a question workable NOW — never a closed Warm-Up or ended DOL', () => {
  const workable = region(app, 'const entryIsWorkableNow = (entry) => {', 'const nextAvailableIncompleteSection', 'workable-now gate');
  assert.match(workable, /entry\?\.role === 'warmup' && warmupState\.enabled\) return warmupState\.status === 'active'/);
  assert.match(workable, /entry\?\.isTimedDOLQuestion && dolState\.enabled\) return dolState\.status === 'active'/);
  assert.match(workable, /entryIsWorkableNow\(entry\) && !sectionQuestionIsComplete\(entry\.index\)/);
  const handoff = region(app, 'const nextAvailableIncompleteSection =', 'const nextAvailableSectionMeta', 'section choice');
  assert.match(handoff, /laterNavigationSections\.find\(\(section\) => sectionWorkTarget\(section\)\)/);
  assert.match(handoff, /nextAvailableSection \? sectionWorkTarget\(nextAvailableSection\) : null/);
  assert.doesNotMatch(handoff, /sectionNavigationTarget/);
});

test('the hand-off follows TERMINAL completion (decision 4), not all-correct', () => {
  // A student who used up the tries on the last question has finished the
  // section; they still get next section / Up next / results.
  assert.match(app, /const assignmentHandoff = currentNavigationSection\?\.complete\b/);
  assert.match(app, /sectionComplete=\{Boolean\(currentNavigationSection\?\.complete\)\}/);
  assert.doesNotMatch(app, /sectionComplete=\{Boolean\(currentNavigationSection\?\.allCorrect\)\}/);
  // `complete` means every entry is terminal (correct or expired).
  assert.match(app, /const sectionQuestionIsComplete = \(index\) => \['correct', 'expired'\]\.includes/);
});
