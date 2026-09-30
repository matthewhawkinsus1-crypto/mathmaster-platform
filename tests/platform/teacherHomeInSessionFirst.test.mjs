/*
 * WHILE A CLASS IS IN SESSION, HOME LEADS WITH THAT CLASS.
 *
 * On a 1024×768 Chromebook the class in session — its Warm-Up / Classwork /
 * DOL controls — started at the bottom of the screen, pushed down by the
 * needs-attention panel, which in the light live roster is usually only a
 * note saying academic history is not loaded. During class the controls and
 * the live room come first and the queue follows them; outside class the
 * queue still leads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { executableSource } from './helpers/sourceContract.mjs';

const home = executableSource(readFileSync(new URL('../../src/TeacherHome.jsx', import.meta.url), 'utf8'));

test('teaching now: class controls, then the live room, then the attention queue', () => {
  assert.match(home, /const teachingNow = Boolean\(currentClass\?\.isNow\);/);
  const beforeClass = home.indexOf('{!teachingNow && attentionQueue}');
  const classCard = home.indexOf('aria-labelledby="home-class-now"');
  const liveRoom = home.indexOf('id="home-live-class"');
  const afterLive = home.indexOf('{teachingNow && attentionQueue}');
  assert.ok(beforeClass > 0 && classCard > beforeClass, 'outside class the queue leads');
  assert.ok(liveRoom > classCard && afterLive > liveRoom, 'during class it follows the class and the live room');
  // The queue is rendered exactly twice, on mutually exclusive conditions.
  assert.equal(home.match(/\{!?teachingNow && attentionQueue\}/g).length, 2);
  assert.equal(home.match(/<NeedsAttentionQueue/g).length, 1);
});
