/*
 * A TEACHER'S CONTROLS REACH APP THROUGH THE TEACHER KIT, AND THE SEAM LINES UP.
 *
 * The handlers behind the teacher's screen left App.jsx for factories under
 * src/app/teacher/controls (helpers/appScreens.mjs explains the seam). Three
 * things keep that move honest, for every factory at once and for the next
 * one written:
 *
 *   - the seam is by position, so App's arguments and the factory's
 *     parameters, and the factory's result and the names App takes from it,
 *     are the same names in the same order;
 *   - a factory is called behind `teacherKit ?`, so it may not call a hook;
 *   - App reaches a factory only through the kit, never by importing it, or
 *     the handlers would be back in every student's first load.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { teacherControlPaths, teacherControlsSeam, teacherControlsSeamProblem, teacherControlsSource } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const controls = teacherControlPaths();

test('the teacher kit exports the control factories, and there are some', () => {
  assert.ok(Object.keys(controls).length >= 13, `only ${Object.keys(controls).length} control factories found in the teacher kit`);
  for (const [name, path] of Object.entries(controls)) {
    assert.match(read(path), new RegExp(`^export function ${name}\\(`, 'm'), `${path} declares ${name}`);
  }
});

test('every factory: App passes its parameters and takes its results, name for name and in order', () => {
  for (const name of Object.keys(controls)) {
    assert.doesNotThrow(() => teacherControlsSource(name));
    const seam = teacherControlsSeam(name);
    assert.ok(seam.returned.length > 0, `${name} returns its handlers`);
    assert.equal(new Set(seam.parameters).size, seam.parameters.length, `${name} names each parameter once`);
  }
});

test('the check sees a seam that is out of order, short or renamed', () => {
  const [name] = Object.keys(controls).filter((candidate) => teacherControlsSeam(candidate).parameters.length > 1 && teacherControlsSeam(candidate).returned.length > 1);
  const seam = teacherControlsSeam(name);
  assert.equal(teacherControlsSeamProblem(name, seam), null);
  const swap = (list) => [list[1], list[0], ...list.slice(2)];
  assert.match(teacherControlsSeamProblem(name, { ...seam, passed: swap(seam.passed) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem(name, { ...seam, passed: seam.passed.slice(1) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem(name, { ...seam, taken: swap(seam.taken) }), /takes .* but .* returns/);
  assert.match(teacherControlsSeamProblem(name, { ...seam, returned: [...seam.returned.slice(0, -1), 'somethingElse'] }), /takes .* but .* returns/);
});

test('no factory calls a hook: it runs only once the kit is there, and React needs the same hooks every render', () => {
  for (const [name, path] of Object.entries(controls)) {
    const code = executableSource(read(path));
    assert.doesNotMatch(code, /\buse[A-Z]\w*\(/, `${name} (${path})`);
    assert.doesNotMatch(code, /from 'react'/, `${name} (${path})`);
  }
});

test('App reaches the controls only through the kit, so they stay out of a student\'s first load', () => {
  const app = read('src/App.jsx');
  assert.doesNotMatch(app, /from '\.\/app\/teacher\/controls\//);
  assert.doesNotMatch(app, /import\('\.\/app\/teacher\/controls\//);
  assert.match(app, /^const NO_TEACHER_CONTROLS = Object\.freeze\(\[\]\);$/m);
  // The teacher's screen is not drawn until the kit is here, so it never reads a missing handler.
  assert.match(executableSource(app), /if \(teacherKitError\) throw teacherKitError;\s*if \(!teacherKit\) \{\s*return <SessionGate/);
});
