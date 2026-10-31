import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { invitedCountFor } from '../../src/platform/liveChallenge/challengePresenceModel.js';

test('LC18: "Joined X / N" counts the invited players once the host roster has loaded', () => {
  const roster = [{ playerKey: 'p1', name: 'Ana' }, { playerKey: 'p2', name: 'Ben' }, { playerKey: 'p3', name: 'Cy' }];
  // eligibleCount ran one ahead (a roster change between the pointer claim and the player batch).
  assert.equal(invitedCountFor({ roster, eligibleCount: 4 }), 3);
  assert.equal(invitedCountFor({ roster, eligibleCount: 3 }), 3);
  // Before the roster arrives (null) or when it is empty, the room's own count.
  assert.equal(invitedCountFor({ roster: null, eligibleCount: 4 }), 4);
  assert.equal(invitedCountFor({ roster: [], eligibleCount: 4 }), 4);
  assert.equal(invitedCountFor({ roster: null, eligibleCount: undefined }), 0);
});

test('the console shows that count beside "Joined"', () => {
  const teacher = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
  assert.match(teacher, /\{joinedCount\} \/ \{invitedCountFor\(\{ roster: rosterNames, eligibleCount: room\.eligibleCount \}\)\}/);
  assert.doesNotMatch(teacher, /\{joinedCount\} \/ \{room\.eligibleCount/);
});
