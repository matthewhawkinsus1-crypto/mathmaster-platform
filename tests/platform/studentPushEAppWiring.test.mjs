// src/App.jsx wiring for student push E (Live Challenge & Rewards). Nothing
// imports App.jsx, so a call with no import would be a runtime ReferenceError
// that passes every other gate (AGENTS.md): each call is asserted beside its import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
// The module's import block: everything before the first top-level component.
const imports = region(app, 'import ', '\nfunction ', 'App.jsx imports');

test('the growth-reward sync is imported and called once, with the account and the real student id', () => {
  assert.match(imports, /import \{ useGrowthRewardSync \} from '\.\/platform\/rewards\/useGrowthRewardSync\.js';/);
  // user.id IS the student's id (setUser({ id: studentId, uid: session.uid, role: 'student', … })).
  const setUser = region(app, 'setUser({\n          id: studentId,', "role: 'student',", 'the student user object');
  assert.match(setUser, /uid: session\.uid,/);
  const calls = app.match(/useGrowthRewardSync\(user\?\.id, \{ uid: user\?\.uid, enabled: user\?\.role === 'student' && Boolean\(user\?\.classId\) \}\);/g) || [];
  assert.equal(calls.length, 1);
});

test('the teacher class-reward panels are imported and mounted for the active class', () => {
  assert.match(imports, /import ClassRewardCatalogEditor from '\.\/components\/rewards\/ClassRewardCatalogEditor\.jsx';/);
  assert.match(imports, /import ClassRewardRequestsPanel from '\.\/components\/rewards\/ClassRewardRequestsPanel\.jsx';/);
  const block = region(app, "{teacherTab === 'classesWorkspace' && activeClass.classId && (", '</section>', 'the class rewards section');
  assert.match(block, /<ClassRewardRequestsPanel\s+classId=\{activeClass\.classId\}\s+teacherEmail=\{user\.email\}/);
  assert.match(block, /<ClassRewardCatalogEditor\s+classId=\{activeClass\.classId\}/);
});

test('a Warm-Up game gets the student\'s support profile and the rewards card, without a second way out', () => {
  const gate = region(app, '<WarmupChallengeGate\n', 'onExitToAssignment=', 'the Warm-Up game mount');
  // The whole profile, not just a name: Read aloud reads it. The id is the real one.
  assert.match(gate, /studentProfile=\{\{ \.\.\.\(user\?\.profile \|\| \{\}\), studentId: user\?\.id, name: user\?\.name \}\}/);
  assert.match(gate, /renderMatchRewards=\{\(roomId, match = \{\}\) => \(\s*<ChallengeRewardsEarned/);
  // Mid-Warm-Up the one way on is Back to Warm-Up (it records the game and
  // keeps the assignment's exit): no "Open My Rewards" link in this slot.
  assert.match(gate, /onOpenRewards=\{null\}/);
  assert.match(imports, /import ChallengeRewardsEarned from '\.\/components\/student\/rewards\/ChallengeRewardsEarned\.jsx';/);
});
