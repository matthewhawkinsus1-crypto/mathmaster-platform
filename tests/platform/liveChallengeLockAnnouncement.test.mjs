/*
 * LOCKING AN ANSWER IN IS ANNOUNCED ONCE (AX21).
 *
 * A field question's Lock In press moves focus to its own "Your answer is
 * locked in." note, so focus never falls to <body>; a screen reader reads that
 * note as focus lands. The line under the round ("Answer locked in · checking
 * it…") was an assertive live region as well, so a student heard two
 * announcements in the same breath. The browser proof is
 * tests/browser/liveChallengeChoiceKeyboard.mjs (no live region repeats the
 * note); these tests pin the decision and what the round does with it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCKED_ANSWER_WORDS, lockedAnswerLine } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

test('after a field question\'s Lock In press the plain lock is not announced again', () => {
  const line = lockedAnswerLine({ noteHasFocus: true });
  assert.equal(line.text, LOCKED_ANSWER_WORDS.checking, 'the words stay on screen');
  assert.equal(line.announce, false, 'the note that has focus already said it');
});

test('where no note has focus (an engine question, a screen that opened locked) the lock is announced', () => {
  assert.equal(lockedAnswerLine({ noteHasFocus: false }).announce, true);
  assert.equal(lockedAnswerLine().announce, true);
});

test('a lock that has become a wait is always announced, note or not: it is news', () => {
  for (const noteHasFocus of [true, false]) {
    const go = lockedAnswerLine({ waitingForGo: true, noteHasFocus });
    assert.equal(go.announce, true);
    assert.match(go.text, /send at GO/);
    const paused = lockedAnswerLine({ waitingForResume: true, noteHasFocus });
    assert.equal(paused.announce, true);
    assert.match(paused.text, /paused/);
  }
  assert.match(lockedAnswerLine({ waitingForGo: true, waitingForResume: true }).text, /send at GO/, 'GO first, as before');
});

test('no wording tells a student whether the answer is right', () => {
  Object.values(LOCKED_ANSWER_WORDS).forEach((words) => assert.doesNotMatch(words, /correct|wrong|incorrect|right answer/i, words));
});

const source = executableSource(componentSource('src/components/liveChallenge/LiveChallengeStudent.jsx'));
const round = region(source, 'export function ChallengeRound(', 'export default function LiveChallengeStudent', 'ChallengeRound');

test('the round marks the note as having focus only when a field question\'s answer is sent', () => {
  const submit = region(round, 'const submit = async', 'const retryPending', 'submit');
  assert.match(submit, /if \(!secureQuestion\) setLockNoteHasFocus\(true\);/, 'an engine question has no such note');
  assert.equal((round.match(/setLockNoteHasFocus\(true\)/g) || []).length, 1, 'a retry or a reload never claims it');
  assert.match(round, /const \[lockNoteHasFocus, setLockNoteHasFocus\] = useState\(false\);/, 'a fresh screen starts without it');
});

test('the line speaks only when the decision says so, and is a new node when it starts to', () => {
  const line = region(round, '{lockedLine && (', ')}', 'the locked answer line');
  assert.match(line, /aria-live=\{lockedLine\.announce \? 'assertive' : undefined\}/);
  assert.match(line, /key=\{lockedLine\.announce \? 'announced' : 'quiet'\}/);
  assert.match(line, /\{lockedLine\.text\}/, 'everyone who can see it still reads it');
  assert.match(round, /const lockedLine = pending && !result\s*\? lockedAnswerLine\(\{ waitingForGo, waitingForResume, noteHasFocus: lockNoteHasFocus \}\)\s*: null;/);
  assert.doesNotMatch(round, /aria-live="assertive"/, 'no assertive line that ignores the decision');
});
