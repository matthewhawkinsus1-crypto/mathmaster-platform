/*
 * THE END OF A PATH SESSION SHOWS THE END SCREEN, AND THE HEADER NAMES THE
 * QUESTION ON SCREEN (release-candidate QA round 2, R2-m1 and R2-m2).
 *
 * R2-m1: on a first session the mastery trigger may not have written a
 * profile when the last answer lands. onSessionComplete reloads the Path's
 * state, and MyMathPathApp's loading gate (`loading && no profiles`) unmounted
 * the session container; its remount started a new session ("Level 2 ·
 * Question 1 of 5", no recap). R2-m2: "Question 2 of 5" over Question 1's
 * review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sessionHeaderQuestionNumber } from '../../src/platform/path/pathProgression.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the loading gate never unmounts a session on screen', () => {
  const app = read('src/components/student/MyMathPathApp.jsx');
  assert.match(app, /const sessionOnScreen = activeTab === 'session' && Boolean\(sessionConfig\);/);
  const gate = region(app, 'const sessionOnScreen', 'return <div', 'loading gate');
  assert.match(gate, /if \(loading && !sessionOnScreen && !Object\.keys\(masteryData\.masteryProfilesByTEKS\)\.length\)/);
  // And the end of a session still reloads (the weekly panel needs it).
  assert.match(app, /onSessionComplete=\{\(finished\) => \{ setFinishedSession\(finished \|\| null\); setWeeklyRefreshKey\(\(value\) => value \+ 1\); onReload\?\.\(\); \}\}/);
});

test('the header names the question on screen: the reviewed one, then the next', () => {
  // Question 1 open; Question 1 closed and reviewed (server counted it);
  // Question 2 open.
  assert.equal(sessionHeaderQuestionNumber({ total: 5, done: 0, reviewing: false }), 1);
  assert.equal(sessionHeaderQuestionNumber({ total: 5, done: 1, reviewing: true }), 1);
  assert.equal(sessionHeaderQuestionNumber({ total: 5, done: 1, reviewing: false }), 2);
  assert.equal(sessionHeaderQuestionNumber({ total: 5, done: 5, reviewing: true }), 5);
  assert.equal(sessionHeaderQuestionNumber({ total: 5, done: 5, reviewing: false }), 5, 'never past the last');
  const player = read('src/components/student/PathSessionPlayer.jsx');
  assert.match(player, /const current = sessionHeaderQuestionNumber\(\{ total, done, reviewing \}\);/);
  assert.equal(player.split('reviewing={gradingClosesQuestion(lastGradingResult)}').length - 1, 2, 'both header call sites say when a review is on screen');
});
