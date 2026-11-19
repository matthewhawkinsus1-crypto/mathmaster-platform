import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { positionalHookSeam, positionalHookSource } from './helpers/appScreens.mjs';

test('teacher needs-attention dependencies are initialized before use', () => {
  // Since the App split, useTeacherAnalytics owns both memos: the order that
  // matters is theirs inside the hook, and App takes both from its one call.
  const source = positionalHookSource('useTeacherAnalytics');
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const { returned } = positionalHookSeam('useTeacherAnalytics');
  for (const name of ['studentsInActiveClass', 'needsAttentionQueue']) {
    assert.ok(returned.includes(name), `App takes ${name} from useTeacherAnalytics`);
    assert.doesNotMatch(app, new RegExp(`const ${name} = `), `${name} has one declaration, the hook's`);
  }
  const studentsDeclaration = source.indexOf('const studentsInActiveClass = useMemo');
  const needsAttentionDeclaration = source.indexOf('const needsAttentionQueue = useMemo');
  assert.notEqual(studentsDeclaration, -1);
  assert.notEqual(needsAttentionDeclaration, -1);
  assert.ok(studentsDeclaration < needsAttentionDeclaration);
});
