import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const teacherSource = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
const executableSource = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

test('active-session recovery is atomic with the pointer, room, and private-state reads', () => {
  const code = executableSource(serverSource);
  const start = code.indexOf('async function recoverTeacherActiveChallenge');
  const end = code.indexOf('async function requireOwnedChallenge', start);
  const recovery = code.slice(start, end);
  assert.match(recovery, /runTransaction/);
  assert.match(recovery, /transaction\.get\(activePointerRef\)/);
  assert.match(recovery, /transaction\.get\(roomRef\)/);
  assert.match(recovery, /transaction\.get\(privateRef\)/);
  assert.match(recovery, /transaction\.set\(roomRef,[\s\S]*status:\s*challenge\.LIVE_CHALLENGE_STATUS\.CANCELLED/);
  assert.match(recovery, /transaction\.delete\(activePointerRef\)/);
});

test('create returns the active room id and the teacher UI reopens it without a generic error', () => {
  const createStart = teacherSource.indexOf('const create = async');
  const createEnd = teacherSource.indexOf('const control = async', createStart);
  const create = teacherSource.slice(createStart, createEnd);
  assert.match(create, /error\?\.details\?\.roomId/);
  assert.match(create, /failed-precondition/);
  assert.match(create, /setRoomId\(activeRoomId\)/);
  assert.match(create, /You already have an active Live Challenge\. It has been reopened\./);
  assert.doesNotMatch(create, /Internal error/);
});

test('a recovered teacher has explicit resume and escape controls', () => {
  assert.match(teacherSource, />Resume Session</);
  assert.match(teacherSource, />Cancel Session</);
  assert.match(teacherSource, />End Session</);
});

test('missing-private cancellation clears timers and only clears its own current pointer', () => {
  const code = executableSource(serverSource);
  const start = code.indexOf('exports.cancelLiveChallenge');
  const end = code.indexOf('exports.', start + 30);
  const cancel = code.slice(start, end);
  assert.match(cancel, /if\s*\(!privateSnapshot\.exists\)/);
  assert.match(cancel, /currentQuestion:\s*null/);
  assert.match(cancel, /roundEndsAt:\s*null/);
  assert.match(cancel, /activePointer\.data\(\)\?\.roomId === roomId/);
  assert.match(cancel, /transaction\.delete\(activePointerRef\)/);
  assert.match(cancel, /return \{ roomId, status: challenge\.LIVE_CHALLENGE_STATUS\.CANCELLED \}/);
});
