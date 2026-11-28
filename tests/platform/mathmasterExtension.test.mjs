// The MathMaster Chrome extension (extensions/mathmaster): the TEAMS sync,
// by hand and on a timer, and the SchoolStatus family messages, in one.
//
// The owner's choices (2026-11-28): sync every 30 minutes from 6 am to 10 pm,
// in the background, with Chrome open on MathMaster and TEAMS; replace the
// TEAMS Sync extension after a live check. Pinned here: the timer's hours
// and times, when a run is skipped (never under the teacher's hands), that a
// timed run only applies what MathMaster published, and that the TEAMS code
// is the very code the live-checked extension runs until that one is retired.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  TEAMS_TIMER, describeRun, lockHeld, nextSyncAt, runTimedTeamsSync, skipReason, withinSyncHours,
} from '../../extensions/mathmaster/lib/teams/schedule.js';

const read = (file) => readFileSync(file, 'utf8');
const at = (iso) => Date.parse(iso);

test('it syncs from 6 am to 10 pm Central, across daylight saving', () => {
  // November: Central Standard Time, UTC-6.
  assert.equal(withinSyncHours(at('2026-11-30T11:59:00Z')), false, '5:59 am');
  assert.equal(withinSyncHours(at('2026-11-30T12:00:00Z')), true, '6:00 am');
  assert.equal(withinSyncHours(at('2026-12-01T03:59:00Z')), true, '9:59 pm');
  assert.equal(withinSyncHours(at('2026-12-01T04:00:00Z')), false, '10:00 pm');
  // July: Central Daylight Time, UTC-5.
  assert.equal(withinSyncHours(at('2026-07-15T10:59:00Z')), false, '5:59 am CDT');
  assert.equal(withinSyncHours(at('2026-07-15T11:00:00Z')), true, '6:00 am CDT');
  assert.equal(withinSyncHours(at('2026-07-16T02:59:00Z')), true, '9:59 pm CDT');
  assert.equal(withinSyncHours(at('2026-07-16T03:00:00Z')), false, '10:00 pm CDT');
});

test('runs fall five minutes after each of MathMaster\'s publishes, every 30 minutes', () => {
  assert.equal(TEAMS_TIMER.periodMinutes, 30);
  assert.equal(nextSyncAt(at('2026-11-30T12:00:00Z')), at('2026-11-30T12:05:00Z'));
  assert.equal(nextSyncAt(at('2026-11-30T12:05:00Z')), at('2026-11-30T12:35:00Z'), 'strictly after');
  assert.equal(nextSyncAt(at('2026-11-30T12:31:00Z')), at('2026-11-30T12:35:00Z'));
  assert.equal(nextSyncAt(at('2026-11-30T12:36:00Z')), at('2026-11-30T13:05:00Z'));
});

test('a timed run is skipped when the timer is off, out of hours, or another run holds the lock', () => {
  const noon = at('2026-11-30T18:00:00Z');
  assert.equal(skipReason({ enabled: false, nowMs: noon, lock: null }), 'Automatic sync is off.');
  assert.equal(skipReason({ enabled: true, nowMs: at('2026-11-30T05:00:00Z'), lock: null }), 'Outside 6 am–10 pm.');
  assert.equal(skipReason({ enabled: true, nowMs: noon, lock: { startedAt: noon - 60000 } }), 'Another sync is still running.');
  assert.equal(skipReason({ enabled: true, nowMs: noon, lock: null }), null);
  // A lock left by a run that died lapses.
  assert.equal(lockHeld({ startedAt: noon - TEAMS_TIMER.lockStaleMs - 1 }, noon), false);
  assert.equal(skipReason({ enabled: true, nowMs: noon, lock: { startedAt: noon - TEAMS_TIMER.lockStaleMs - 1 } }), null);
});

// MathMaster's bridge as seen from any teacher screen: no publish.
const bridgeFor = (classes, stepStatus = 'done') => {
  const calls = [];
  return {
    calls,
    bridge: {
      listClasses: async () => classes,
      step: async (payload) => { calls.push(payload); return { status: stepStatus, ops: [], summary: { verified: 3 } }; },
    },
  };
};
const fakeTeams = (readSection = async () => ({ columns: [], students: [] })) => ({ readSection });

test('a timed run applies what MathMaster published, class by class, and never publishes', async () => {
  const { bridge, calls } = bridgeFor([
    { classId: 'c1', label: 'Algebra I 1st', sections: [{ sectionRef: '15001/01' }], targetCount: 8 },
    { classId: 'c2', label: 'Algebra I 5th', sections: [{ sectionRef: '15001/05' }, { sectionRef: '15001/55' }], targetCount: 0 },
    { classId: 'c3', label: 'Not linked', sections: [], targetCount: 8 },
  ]);
  const lines = [];
  const run = await runTimedTeamsSync({ bridge, teams: fakeTeams(), runnerId: 'ext-0123456789abcdef01234567', log: (line) => lines.push(line) });
  assert.equal(run.status, 'ran');
  assert.deepEqual(run.results.map((result) => [result.classId, result.status]), [['c1', 'done'], ['c2', 'noGrades']], 'an unlinked class is not touched');
  assert.deepEqual(calls.map((call) => [call.classId, call.runnerId]), [['c1', 'ext-0123456789abcdef01234567']]);
  assert.ok(!('publish' in bridge));
  assert.ok(lines.every((line) => line.startsWith('Algebra I 1st: ')), 'each line names its class');
});

test('nothing linked, or TEAMS signed out: the run says so and stops', async () => {
  const none = await runTimedTeamsSync({ bridge: bridgeFor([]).bridge, teams: fakeTeams(), runnerId: 'ext-0123456789abcdef01234567' });
  assert.deepEqual(none, { status: 'nothingLinked', results: [] });
  const { bridge, calls } = bridgeFor([
    { classId: 'c1', label: 'One', sections: [{ sectionRef: '1/01' }], targetCount: 2 },
    { classId: 'c2', label: 'Two', sections: [{ sectionRef: '1/02' }], targetCount: 2 },
  ]);
  const run = await runTimedTeamsSync({
    bridge,
    teams: fakeTeams(async () => { throw new Error('TEAMS is signed out. Sign in to TEAMS in that tab and run the sync again.'); }),
    runnerId: 'ext-0123456789abcdef01234567',
  });
  assert.deepEqual(run.results.map((result) => [result.classId, result.status]), [['c1', 'stopped']], 'the second class is not tried');
  assert.match(run.results[0].reason, /signed out/);
  assert.equal(calls.length, 0);
});

test('the page says in one line what the last automatic run did', () => {
  const when = at('2026-11-30T18:05:00Z');
  assert.equal(describeRun(null), 'No automatic sync has run yet.');
  assert.match(describeRun({ at: when, skipped: 'You were using the TEAMS tab, so it was left alone; the next sync will try again.' }), /: skipped\. You were using the TEAMS tab/);
  assert.match(describeRun({ at: when, results: [{ status: 'done', applied: 4 }, { status: 'done', applied: 0 }, { status: 'stopped' }] }), /2 of 3 classes in step with TEAMS, 4 changes made; 1 needs a look\./);
});

test('until the TEAMS Sync extension is retired, the TEAMS code here is its live-checked code, byte for byte', () => {
  for (const file of ['teamsPage.js', 'teamsAdapter.js', 'readback.js', 'runner.js']) {
    assert.equal(read(`extensions/mathmaster/lib/teams/${file}`), read(`extensions/teams-sync/lib/${file}`), file);
  }
});

test('one extension, four sites, an alarm', () => {
  const manifest = JSON.parse(read('extensions/mathmaster/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['alarms', 'scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, [
    'https://mathmaster-aleks.web.app/*', 'https://mathmasterlearning.com/*', 'https://desoto.teams.hosting/*', 'https://secure.schoolstatus.com/*',
  ]);
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
});

test('the timer checks before it touches anything, leaves a TEAMS tab the teacher is using, and holds the lock', () => {
  const background = executableSource(read('extensions/mathmaster/background.js'));
  assert.match(background, /chrome\.alarms\.create\(ALARM, \{ when: nextSyncAt\(Date\.now\(\)\), periodInMinutes: TEAMS_TIMER\.periodMinutes \}\)/);
  const run = region(background, 'const runTeamsSyncFromBackground = async (trigger) => {', '\nchrome.alarms.onAlarm', 'one run');
  const skip = run.indexOf('skipReason({ enabled: teamsSyncAuto, nowMs: at, lock: await readTeamsLock() })');
  const lock = run.indexOf("withTeamsLock(trigger, async () => {");
  const inUse = run.indexOf("if (trigger === 'timer' && await isTabInUse(teamsTab))");
  const sync = run.indexOf('runTimedTeamsSync({');
  assert.ok(skip > 0 && skip < lock && lock < inUse && inUse < sync, 'skip reasons, then the lock, then the tab in use, then the run');
  assert.doesNotMatch(background, /publish/, 'a timed run never publishes');
  const panel = executableSource(read('extensions/mathmaster/panel.js'));
  const syncClass = region(panel, 'const syncClass = async (entry, card, dryRun) => {', 'const linkSections', 'a class by hand');
  assert.match(syncClass, /await withTeamsLock\('page', async \(\) => \{/, 'by hand, the same lock');
  assert.match(region(panel, 'const publishIfGradeExportIsOpen = async', 'const syncClass', 'publish'), /if \(!\/Open Grade Export\/\.test\(error\.message\)\) throw error;/, 'only "Grade Export is not open" is passed over');
  assert.doesNotMatch(panel, /dueOnOrAfter|innerHTML/);
});

test('one sync at a time: the lock turns a second run away, lapses when stale, and is released only by its holder', async () => {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      session: {
        get: async (key) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: async (values) => Object.entries(values).forEach(([key, value]) => store.set(key, value)),
        remove: async (key) => { store.delete(key); },
      },
    },
  };
  try {
    const { withTeamsLock } = await import('../../extensions/mathmaster/lib/lock.js');
    let inner;
    const outer = await withTeamsLock('timer', async () => {
      inner = await withTeamsLock('page', async () => 'ran');
      return 'outer ran';
    });
    assert.equal(outer.value, 'outer ran');
    assert.equal(inner.locked.by, 'timer', 'the page is turned away while the timer runs');
    assert.equal(store.has('teamsSyncLock'), false, 'released after');
    // A lock left behind by a run that died is taken over.
    store.set('teamsSyncLock', { by: 'timer', startedAt: Date.now() - TEAMS_TIMER.lockStaleMs - 1000, id: 'dead' });
    assert.equal((await withTeamsLock('page', async () => 'took over')).value, 'took over');
    // A holder that finds someone else's lock on the way out leaves it.
    const result = await withTeamsLock('page', async () => { store.set('teamsSyncLock', { by: 'other', startedAt: Date.now(), id: 'other' }); return 'done'; });
    assert.equal(result.value, 'done');
    assert.equal(store.get('teamsSyncLock')?.id, 'other');
  } finally {
    delete globalThis.chrome;
  }
});
