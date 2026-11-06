// A FAILING LAUNCH SCENARIO STILL ENDS THE RUN, AND SAYS WHY (CI run 64).
//
// The launch certification (tests/integration/liveChallengeLaunch/
// liveChallengeLaunchCertification.test.mjs) opens a simulated host console for
// each game (../integration/support/liveChallengeSimHost.mjs): two Firestore
// listeners and a quarter-second tick, which keep the process alive until it is
// closed. The endurance scenario opened one per match inside its loop and closed
// it only when the match passed, so a match that failed left it running: the
// failure was reported, and the CI step then sat until its 12-minute limit.
// Every scenario now holds its console where its `finally` can close it.
//
// The same failure said only "not every screen followed its invite": the
// endurance waits now name each screen they are still waiting for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => executableSource(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const certification = read('integration/liveChallengeLaunch/liveChallengeLaunchCertification.test.mjs');

test('every scenario that opens a host console declares it outside its try and closes it in its finally', () => {
  const scenarios = certification.split(/\n\s*test\(/).slice(1).filter((body) => /openHost\(/.test(body));
  assert.ok(scenarios.length >= 4, `${scenarios.length} scenarios open a console`);
  for (const body of scenarios) {
    const name = body.slice(0, 70);
    const declared = body.indexOf('let host = null;');
    assert.ok(declared >= 0 && declared < body.indexOf('try {'), `${name}: its console is declared before its try, where the finally can see it`);
    assert.doesNotMatch(body, /const host = await openHost\(/, `${name}: never in a block the finally cannot see`);
    assert.match(body, /\} finally \{[\s\S]*closeScenario\(\{ host, farm, label/, `${name}: and the finally closes it`);
  }
});

test('the endurance waits name each screen they are still waiting for, and a device says whether it follows its invites', () => {
  const endurance = region(certification, 'test(`endurance:', '\n});', 'the endurance scenario');
  assert.match(endurance, /not every screen followed its invite into the new lobby \$\{roomId\}\. Not there: \$\{describeScreens\(/);
  assert.match(endurance, /Not joined: \$\{describeScreens\([^\n]*\. Clock not ready: \$\{describeScreens\(/);
  const describe = region(certification, 'const describeScreens = (views) =>', "|| 'none';", 'describeScreens');
  for (const part of ['view.studentId', 'view.roomId', 'view.stage', 'view.inviteListener', 'view.invite?.roomId', 'view.errors']) {
    assert.ok(describe.includes(part), `a screen is described by ${part}`);
  }
  assert.match(read('integration/support/liveChallengeSimStudent.mjs'), /inviteListener: Boolean\(device\.stops\.invite\),/);
});
