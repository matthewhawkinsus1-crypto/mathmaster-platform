// src/App.jsx wiring for student push E (Live Challenge & Rewards). Nothing
// imports App.jsx, so a call with no import would be a runtime ReferenceError
// that passes every other gate (AGENTS.md): each call is asserted beside its import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const imports = app.slice(0, app.indexOf('\nfunction ') > 0 ? app.indexOf('\nfunction ') : 20000);

test('the growth-reward sync is imported and called once, for real students only', () => {
  assert.match(imports, /import \{ useGrowthRewardSync \} from '\.\/platform\/rewards\/useGrowthRewardSync\.js';/);
  const calls = app.match(/useGrowthRewardSync\(user\?\.id, \{ enabled: user\?\.role === 'student' && Boolean\(user\?\.classId\) \}\);/g) || [];
  assert.equal(calls.length, 1);
});

test('the teacher class-reward panels are imported and mounted for the active class', () => {
  assert.match(imports, /import ClassRewardCatalogEditor from '\.\/components\/rewards\/ClassRewardCatalogEditor\.jsx';/);
  assert.match(imports, /import ClassRewardRequestsPanel from '\.\/components\/rewards\/ClassRewardRequestsPanel\.jsx';/);
  const start = app.indexOf("{teacherTab === 'classesWorkspace' && activeClass.classId && (");
  assert.ok(start > 0, 'the class rewards section must be mounted');
  const block = app.slice(start, app.indexOf('</section>', start));
  assert.match(block, /<ClassRewardRequestsPanel\s+classId=\{activeClass\.classId\}\s+teacherEmail=\{user\.email\}/);
  assert.match(block, /<ClassRewardCatalogEditor\s+classId=\{activeClass\.classId\}/);
});

test('a Warm-Up game gets the student\'s support profile and the rewards card a standalone game has', () => {
  const start = app.indexOf('<WarmupChallengeGate\n');
  assert.ok(start > 0);
  const gate = app.slice(start, app.indexOf('/>\n        </div>', start));
  // The whole profile, not just a name: Read aloud reads it.
  assert.match(gate, /studentProfile=\{\{ \.\.\.\(user\?\.profile \|\| \{\}\), studentId: user\?\.studentId, name: user\?\.name \}\}/);
  assert.match(gate, /renderMatchRewards=\{\(roomId, match = \{\}\) => \(\s*<ChallengeRewardsEarned/);
  assert.match(imports, /import ChallengeRewardsEarned from '\.\/components\/student\/rewards\/ChallengeRewardsEarned\.jsx';/);
});
