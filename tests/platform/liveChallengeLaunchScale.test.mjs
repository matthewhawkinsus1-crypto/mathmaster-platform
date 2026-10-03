import test from 'node:test';
import assert from 'node:assert/strict';
import { LAUNCH_EVENT, nextLaunchDiagnostic } from '../../functions/shared/liveChallengeLaunchDiagnostics.mjs';

const launchSimulation = (size, { offline = new Set(), late = new Set() } = {}) => {
  const authoritativeRoom = { status: 'running', roundIndex: 0, revision: 1 };
  const clients = Array.from({ length: size }, (_, index) => ({ index, revision: 0, diagnostic: {}, playerRecords: new Set([`player-${index}`]), scoreRecords: new Set() }));
  let reads = 0;
  let roomWrites = 1; // The host changes one authoritative room, independent of roster size.
  const deliverCurrentState = (client, at) => {
    reads += 1;
    client.revision = authoritativeRoom.revision;
    client.diagnostic = { ...client.diagnostic, ...nextLaunchDiagnostic(client.diagnostic, { event: LAUNCH_EVENT.RUNNING_RECEIVED, nowMs: at, roomStatus: authoritativeRoom.status, roundIndex: 0 }) };
    client.diagnostic = { ...client.diagnostic, ...nextLaunchDiagnostic(client.diagnostic, { event: LAUNCH_EVENT.GAME_MOUNTED, nowMs: at + 2, roomStatus: authoritativeRoom.status, roundIndex: 0 }) };
  };
  clients.forEach((client) => { if (!offline.has(client.index) && !late.has(client.index)) deliverCurrentState(client, 1_000 + client.index); });
  late.forEach((index) => deliverCurrentState(clients[index], 1_200 + index));
  offline.forEach((index) => deliverCurrentState(clients[index], 2_000 + index));
  return { clients, reads, roomWrites };
};

for (const size of [5, 10, 20, 30, 40, 50, 64]) {
  test(`${size} clients derive launch from the same current room state`, () => {
    const result = launchSimulation(size);
    assert.equal(result.clients.filter((client) => client.diagnostic.gameMountedAtMs).length / size, 1);
    assert.equal(result.roomWrites, 1, 'launch is O(1), not a host write per student');
    assert.equal(result.reads, size, 'one delivered current snapshot per simulated listener');
    assert.ok(Math.max(...result.clients.map((client) => client.diagnostic.runningReceivedAtMs)) - 1_000 < size);
  });
}

test('offline-at-zero and listeners attached after ACTIVE recover from current state without duplicates', () => {
  const result = launchSimulation(60, { offline: new Set([3, 17, 41]), late: new Set([8, 29, 55]) });
  assert.equal(result.clients.every((client) => client.revision === 1 && client.diagnostic.gameMountedAtMs), true);
  assert.equal(result.clients.every((client) => client.playerRecords.size === 1 && client.scoreRecords.size === 0), true);
  assert.equal(result.roomWrites, 1);
});

test('launch telemetry is bounded and preserves the first milestone across duplicate snapshots', () => {
  let diagnostic = nextLaunchDiagnostic({}, { event: LAUNCH_EVENT.RUNNING_RECEIVED, nowMs: 100, roomStatus: 'running', roundIndex: 0 });
  diagnostic = { ...diagnostic, ...nextLaunchDiagnostic(diagnostic, { event: LAUNCH_EVENT.RUNNING_RECEIVED, nowMs: 900, roomStatus: 'running', roundIndex: 0 }) };
  assert.equal(diagnostic.runningReceivedAtMs, 100);
  assert.equal(diagnostic.lastLaunchEventAtMs, 900);
  assert.equal(Object.keys(diagnostic).length <= 6, true);
});
