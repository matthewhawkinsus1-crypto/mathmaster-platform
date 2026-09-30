/*
 * A PANEL THE TEACHER IS USING MUST NOT RESET ON EVERY PARENT RENDER.
 *
 * App passes these panels an inline `onClose`, so its identity changes on
 * every App render — and during class App re-renders about once a second
 * (presence heartbeats, the lesson clock). Effects keyed on `onClose` ran each
 * time: the Find palette cleared what the teacher was typing (reproduced in
 * the teacher-workflow harness: "Subst" became "" within seconds), and the
 * Assignment Hub and student drawer pulled focus back to their Close buttons.
 *
 * Each panel now resets and focuses only when it opens (or shows a different
 * assignment/student) and reads the latest onClose through a ref.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

for (const [name, path] of [
  ['Find palette', 'src/components/teacher/TeacherQuickSearch.jsx'],
  ['Assignment Hub', 'src/components/teacher/AssignmentHub.jsx'],
  ['student drawer', 'src/components/teacher/StudentProfileDrawer.jsx'],
]) {
  test(`${name}: no effect re-runs because the parent re-rendered`, () => {
    const source = read(path);
    assert.doesNotMatch(source, /\}, \[[^\]]*\bonClose\b[^\]]*\]\);/, 'no effect depends on the onClose prop');
    assert.match(source, /const onCloseRef = useRef\(onClose\);/);
    assert.match(source, /onCloseRef\.current\?\.\(\)/, 'Escape uses the latest onClose');
  });
}

test('Find clears its query only when it opens', () => {
  const source = read('src/components/teacher/TeacherQuickSearch.jsx');
  assert.match(source, /setQuery\(''\);[\s\S]{0,400}\}, \[open\]\);/);
});
