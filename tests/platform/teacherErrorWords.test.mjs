import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TEACHER_ERROR_GENERIC, teacherErrorSentence } from '../../src/platform/teacher/teacherErrorWords.js';

const callable = (code, message) => Object.assign(new Error(message), { code: `functions/${code}`, name: 'FirebaseError' });

test('a sentence our server wrote reaches the teacher', () => {
  const error = callable('failed-precondition', 'This class already has a Live Challenge running.');
  assert.equal(teacherErrorSentence(error, 'Live Challenge action failed.'), 'This class already has a Live Challenge running.');
});

test('Firestore, SDK and program errors are replaced by the screen\'s own sentence', () => {
  const firestore = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied', name: 'FirebaseError' });
  assert.equal(teacherErrorSentence(firestore, 'Could not load the Live Challenge.'), 'Could not load the Live Challenge.');
  assert.equal(teacherErrorSentence(new TypeError('e.map is not a function'), 'Could not load Live Challenge players.'), 'Could not load Live Challenge players.');
  assert.equal(teacherErrorSentence(new SyntaxError('Unexpected token } in JSON at position 5'), 'That JSON file could not be read.'), 'That JSON file could not be read.');
});

test('our own check\'s sentence is kept (the question import explains what to fix)', () => {
  assert.equal(
    teacherErrorSentence(new Error('Paste valid JSON before importing questions.'), 'Those questions could not be imported.'),
    'Paste valid JSON before importing questions.',
  );
});

test('with no screen sentence the last resort asks for a retry, never "tell your teacher"', () => {
  const text = teacherErrorSentence(new TypeError('x is undefined'));
  assert.equal(text, TEACHER_ERROR_GENERIC);
  assert.doesNotMatch(text, /teacher/i);
});

test('the teacher Live Challenge screens show no raw error message', () => {
  for (const file of ['LiveChallengeTeacher.jsx', 'ChallengeQuestionLibrary.jsx', 'ChallengeDryRun.jsx']) {
    const source = readFileSync(new URL(`../../src/components/liveChallenge/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /set(?:Message|Error)\(\s*\w*[Ee]rror\?\.message/, file);
    assert.doesNotMatch(source, /\$\{\s*\w*[Ee]rror\?\.message/, `${file} folds an error's own text into a sentence`);
    assert.match(source, /teacherErrorSentence\(/, file);
  }
});
