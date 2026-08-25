import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/components/student/MyMathPathProductionContainer.jsx', import.meta.url), 'utf8');

const has = (fragment, message) => {
  assert.notEqual(source.indexOf(fragment), -1, message || `Expected production Path container to contain: ${fragment}`);
};

test('production Path container imports the release rollover helper', () => {
  assert.match(source, /import\s*\{\s*fetchQuestionWithContentReleaseRollover\s*\}\s*from\s*['"]\.\.\/\.\.\/platform\/path\/sessionContentReleaseRollover\.js['"]/);
});

test('one canonical launch config preserves weekly and assessment context for rollover', () => {
  has('const sessionLaunchConfig = useMemo(() => ({', 'container must build one canonical session launch config');
  has('assessmentFramework,', 'launch config must preserve the assessment framework');
  has('weekKey,', 'launch config must preserve the frozen week');
  has('weeklySlotKey,', 'launch config must preserve the frozen weekly slot key');
  has('weeklySlot,', 'launch config must preserve the weekly slot number');
});

test('initial question loading is protected against a release change race', () => {
  const initializeStart = source.indexOf('const initializeSession = useCallback');
  assert.notEqual(initializeStart, -1);
  const helperUse = source.indexOf('fetchQuestionWithContentReleaseRollover({', initializeStart);
  assert.notEqual(helperUse, -1, 'initializeSession must use the release rollover helper');
  has('sessionConfig: sessionLaunchConfig', 'initializeSession must restart with the exact launch config');
});

test('continue-to-next-question also uses the release rollover helper', () => {
  const advanceStart = source.indexOf('const advanceToNextQuestion = useCallback');
  assert.notEqual(advanceStart, -1);
  const helperUse = source.indexOf('fetchQuestionWithContentReleaseRollover({', advanceStart);
  assert.notEqual(helperUse, -1, 'advanceToNextQuestion must use the release rollover helper');
});

test('a successful rollover replaces session state and explains the refresh to the student', () => {
  has('setSession(next.session);', 'container must replace stale session state with the new session');
  has('if (next.rolledOver)', 'container must recognize when a rollover happened');
  assert.match(source, /assessment.*updated|practice.*updated|fresh session/i);
});
