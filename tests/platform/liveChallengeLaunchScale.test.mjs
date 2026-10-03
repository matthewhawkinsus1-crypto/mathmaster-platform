import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LAUNCH_EVENT, MAX_LAUNCH_EVENTS, nextLaunchDiagnostic, normalizeLaunchReport } from '../../functions/shared/liveChallengeLaunchDiagnostics.mjs';

const launchSimulation = (size, { offline = new Set(), late = new Set() } = {}) => {
  const authoritativeRoom = { status: 'running', roundIndex: 0, revision: 1 };
  const clients = Array.from({ length: size }, (_, index) => ({ index, revision: 0, diagnostic: {}, telemetryRequests: 0, telemetryWrites: 0, playerRecords: new Set([`player-${index}`]), scoreRecords: new Set() }));
  let reads = 0;
  let roomWrites = 1; // The host changes one authoritative room, independent of roster size.
  const deliverCurrentState = (client, at) => {
    reads += 1;
    client.revision = authoritativeRoom.revision;
    const report = { milestones: {
      [LAUNCH_EVENT.LISTENER_ATTACHED]: { clientAtMs: at - 10 },
      [LAUNCH_EVENT.RUNNING_RECEIVED]: { clientAtMs: at, roomStatus: authoritativeRoom.status, roundIndex: 0 },
      [LAUNCH_EVENT.GAME_MOUNTED]: { clientAtMs: at + 2, roomStatus: authoritativeRoom.status, roundIndex: 0 },
    } };
    client.telemetryRequests += 1;
    client.telemetryWrites += 1;
    client.diagnostic = { ...client.diagnostic, ...nextLaunchDiagnostic(client.diagnostic, { report, nowMs: at + 5 }) };
  };
  clients.forEach((client) => { if (!offline.has(client.index) && !late.has(client.index)) deliverCurrentState(client, 1_000 + client.index); });
  late.forEach((index) => deliverCurrentState(clients[index], 1_200 + index));
  offline.forEach((index) => deliverCurrentState(clients[index], 2_000 + index));
  return { clients, reads, roomWrites };
};

for (const size of [5, 10, 20, 30, 40, 50, 64]) {
  test(`${size} clients derive launch from the same current room state`, () => {
    const result = launchSimulation(size);
    assert.equal(result.clients.filter((client) => client.diagnostic.launchMilestones?.game_mounted).length / size, 1);
    assert.equal(result.roomWrites, 1, 'launch is O(1), not a host write per student');
    assert.equal(result.reads, size, 'one delivered current snapshot per simulated listener');
    assert.equal(result.clients.reduce((sum, client) => sum + client.telemetryRequests, 0), size, 'at most one extra launch batch per client');
    assert.equal(result.clients.reduce((sum, client) => sum + client.telemetryWrites, 0), size, 'at most one diagnostic write per client');
  });
}

test('offline-at-zero and listeners attached after ACTIVE recover from current state without duplicates', () => {
  const result = launchSimulation(60, { offline: new Set([3, 17, 41]), late: new Set([8, 29, 55]) });
  assert.equal(result.clients.every((client) => client.revision === 1 && client.diagnostic.launchMilestones?.game_mounted), true);
  assert.equal(result.clients.every((client) => client.playerRecords.size === 1 && client.scoreRecords.size === 0), true);
  assert.equal(result.roomWrites, 1);
});

test('launch telemetry is bounded and preserves the first milestone across duplicate snapshots', () => {
  const first = { milestones: { [LAUNCH_EVENT.RUNNING_RECEIVED]: { clientAtMs: 100, roomStatus: 'running', roundIndex: 0 } } };
  let diagnostic = nextLaunchDiagnostic({}, { report: first, nowMs: 150 });
  diagnostic = { ...diagnostic, ...nextLaunchDiagnostic(diagnostic, { report: { milestones: { [LAUNCH_EVENT.RUNNING_RECEIVED]: { clientAtMs: 900 } } }, nowMs: 950 }) };
  assert.equal(diagnostic.launchMilestones.running_received.clientAtMs, 100);
  assert.equal(diagnostic.launchMilestones.running_received.receivedAtMs, 150);
  assert.equal(Object.keys(diagnostic.launchMilestones).length <= MAX_LAUNCH_EVENTS, true);
  assert.deepEqual(normalizeLaunchReport({ milestones: { invented: { clientAtMs: 1 }, listener_error: { clientAtMs: 2 } } }), { milestones: { listener_error: { clientAtMs: 2 } } });
});

test('launch telemetry reduces the critical-path burst from four calls per student to at most one', () => {
  const totals = {};
  for (const students of [10, 20, 30, 40, 50, 64]) {
    const before = students * 4; // attached + countdown + running + mounted
    const after = launchSimulation(students).clients.reduce((sum, client) => sum + client.telemetryRequests, 0);
    assert.equal(after, students);
    assert.equal(after <= before / 4, true);
    totals[students] = { requests: after, writes: after };
  }
  assert.deepEqual(totals[50], { requests: 50, writes: 50 });
  assert.deepEqual(totals[64], { requests: 64, writes: 64 });
});

test('the student collector performs no request per milestone and sends one bounded batch', async () => {
  const source = await readFile(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const collector = source.slice(source.indexOf('const collectLaunchEvent'), source.indexOf('const sendLaunchDiagnostics'));
  assert.doesNotMatch(collector, /calibrateLiveChallengeClock|sendLaunchDiagnostics/, 'collecting a milestone is local only');
  assert.equal((source.match(/launchReport: sent/g) || []).length, 1, 'one batch request seam owns launch telemetry');
  assert.match(source, /sendLaunchDiagnostics\(\{ quality: estimate\.quality \}\)/, 'pending evidence piggybacks on the normal heartbeat');
});
