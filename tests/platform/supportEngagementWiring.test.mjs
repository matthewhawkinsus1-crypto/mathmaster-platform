// THE ENGAGEMENT CLOCK AND THE IDLE PROMPT ARE DIFFERENT THINGS.
//
// The old IEP report showed "0 min" on scored work. Root cause: the effect that
// runs the 1-second engagement counter returned early whenever the student had
// the "no idle timer" presentation (inclusion, extra-time, disable-idle-timer),
// so the students whose support evidence matters most never accrued time.
//
// These assertions bind to the idle effect itself, and to the ledger hook that
// records server-timed active minutes, so that coupling cannot come back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';
import { appHookSource } from './helpers/appScreens.mjs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../../src/platform/supportEvidence/useEngagementLedger.js', import.meta.url), 'utf8');

// Since the App split, app/student/useActiveTimeClock.js owns the idle effect
// (appHookSource checks App imports and calls it).
const activeTimeClock = appHookSource('useActiveTimeClock');
const idleEffect = region(activeTimeClock, 'THE ACCOMMODATION HIDES THE PROMPT, NOT THE CLOCK.', 'activeSupportPresentation.disableIdleTimer]);', 'idle/engagement effect');
const effectStart = activeTimeClock.lastIndexOf('useEffect(() => {', activeTimeClock.indexOf('THE ACCOMMODATION HIDES THE PROMPT, NOT THE CLOCK.'));
const guard = activeTimeClock.slice(effectStart, activeTimeClock.indexOf('THE ACCOMMODATION HIDES THE PROMPT, NOT THE CLOCK.'));

test('the idle-timer accommodation no longer stops the engagement counter', () => {
  // App runs the clock for every student, handing it the whole presentation
  // (not a flag that could switch it off) and the counters it adds to.
  assert.match(app, /useActiveTimeClock\(\{\s*user, activeView, activeAssignmentId, currentQuestionIndex, lastActivityRef, liveSessionActiveSecondsRef,\s*activeTimeRef, pendingAssignmentSecondsRef, getModuleTime, activeSupportPresentation, activeWorkingTracker,\s*\}\);/);
  // The early return that skipped the whole effect must not name the accommodation.
  assert.doesNotMatch(guard, /disableIdleTimer/);
  assert.match(guard, /if \(user\?\.role !== 'student' \|\| activeView !== 'assignment'\) \{/);
  // The accommodation only suppresses the overlay…
  assert.match(idleEffect, /if \(!suppressIdlePrompt\) setIsIdle\(true\);/);
  // …and idle time still counts for nobody: the branch returns before counting.
  const idleBranch = region(idleEffect, 'if (Date.now() - lastActivityRef.current > 120000) {', '}', 'idle branch');
  assert.match(idleBranch, /return;/);
  assert.match(idleEffect, /pendingAssignmentSecondsRef\.current \+= 1;/);
});

test('the ledger hook is wired for real student credit work and imported where it is called', () => {
  assert.match(app, /import useEngagementLedger from '\.\/platform\/supportEvidence\/useEngagementLedger\.js';/);
  const call = region(app, 'useEngagementLedger({', '});', 'ledger call');
  assert.match(call, /enabled: isStudentAssignment && Boolean\(activeAssignmentData\)/);
  assert.match(call, /creditEligible: activeLifecycle\.creditEligible && !isPracticeMode/);
  assert.match(call, /lastInteractionRef: lastActivityRef/);
});

test('the hook records through the shared engaged-now rule, at most once per minute', () => {
  assert.match(hook, /isEngagedNow\(\{/);
  assert.match(hook, /pageVisible: typeof document === 'undefined' \? true : document\.visibilityState === 'visible'/);
  assert.match(hook, /if \(last\.assignmentId === assignmentId && last\.minute === minute\) return;/);
  assert.match(hook, /recordEngagementMinute\(\{ db, studentId, assignmentId, nowMs \}\)/);
  assert.doesNotMatch(hook, /disableIdleTimer|isIdle/, 'the evidence clock knows nothing about the idle prompt');
});
