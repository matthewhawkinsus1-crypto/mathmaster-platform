/*
 * ONE SIMULATED STUDENT DEVICE FOR THE LIVE CHALLENGE LAUNCH CERTIFICATION.
 *
 * What is REAL here:
 *   - the room, standings-snapshot, own-row and invite listeners: the
 *     production client service (src/platform/liveChallenge/
 *     liveChallengeService.js), loaded per device with its own Firebase app
 *     and Firestore connection (clientFirebase.mjs);
 *   - every decision the student screen makes from what those listeners
 *     deliver, through the same pure modules LiveChallengeStudent.jsx uses:
 *     acceptChallengeSnapshot + challengePhaseAt (which snapshot to keep),
 *     challengeClock (the stage at calibrated server time),
 *     calibrateChallengeClock (the clock), standingsFromProjection and
 *     projectionBoardRows (the board), the device's own row ("am I joined?",
 *     "is this round's answer on the server?"), studentConnectionState (the
 *     connection pill);
 *   - every server call: the real callables, under this student's identity,
 *     against the emulator (the caller supplies `call`).
 *
 * What is MIRRORED from LiveChallengeStudent.jsx, because a React component
 * cannot run in node: when it joins, when it calibrates (five samples, then a
 * heartbeat every 30 s), how it collects and batches launch milestones (one
 * entry per event per room, piggybacked on the heartbeat, one batch one
 * second after the game mounts), how it retries a locked answer with the same
 * submission id, and when the round counts as on screen (status running, the
 * round open, a question, a ready clock, stage roundActive). The device never
 * learns the stage from a countdown event: it re-derives it from the room it
 * holds and its clock, on its own render tick.
 *
 * Device behaviour is a profile: render tick (a backgrounded Chromebook
 * renders about once a second), extra latency on every request, delay on
 * every snapshot (late, and therefore sometimes out of order), freezing,
 * going offline, refreshing, answering late or twice.
 */
import { performance } from 'node:perf_hooks';
import { calibrateChallengeClock, acceptChallengeSnapshot, challengePhaseAt } from '../../../functions/shared/liveChallengeParity.mjs';
import { publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { leaderboardOptionsFor } from '../../../functions/shared/liveChallengeScoring.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { CHALLENGE_STAGE, challengeClock } from '../../../src/platform/liveChallenge/challengeShellModel.js';
import { studentConnectionState } from '../../../src/platform/liveChallenge/challengePresenceModel.js';
import { projectionBoardRows, standingsRows, standingsWindow } from '../../../src/platform/liveChallenge/challengeStandingsModel.js';
import { standingsFromProjection } from '../../../functions/shared/liveChallengeStandingsProjection.mjs';
import { summaryFinal } from '../../../functions/shared/liveChallengePlayerSummary.mjs';
import { documentWireBytes, SNAPSHOT_OVERHEAD_BYTES } from './firestoreWireBytes.mjs';
import { importClientService } from './registerClientFirebase.mjs';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });
let deviceSeq = 0;

/*
 * WHAT A STANDINGS DELIVERY COST THIS DEVICE (the standings profile reads it).
 *
 * Firestore delivers — and bills — every document that changed since the
 * listener's last snapshot. A row changes only through a server write, and
 * every server write to a public row stamps one of these times, so a new
 * signature is exactly a delivered document. Its size is estimated once per
 * version per worker (every device in a worker receives the same versions).
 */
const millisOf = (value) => value?.toMillis?.() ?? (typeof value?.seconds === 'number' ? value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6) : 0);
const rowSignature = (row) => `${millisOf(row.updatedAt)}:${millisOf(row.provisionalAt)}:${millisOf(row.rushActiveAt)}:${row.score}:${row.alias}:${row.joined}`;
const deliveredBytes = new Map();
const bytesOfVersion = (documentPath, signature, data) => {
  const key = `${documentPath}#${signature}`;
  if (!deliveredBytes.has(key)) {
    if (deliveredBytes.size > 50_000) deliveredBytes.clear();
    const { playerKey: _playerKey, ...fields } = data || {};
    deliveredBytes.set(key, documentWireBytes(documentPath, fields));
  }
  return deliveredBytes.get(key);
};

/** Every device's open listeners, by kind: a leak shows up as a count that never comes back down. */
export const openListeners = { room: 0, standings: 0, self: 0, summary: 0, players: 0, invite: 0 };
export const listenerTotal = () => Object.values(openListeners).reduce((sum, count) => sum + count, 0);

const counted = (kind, stop) => {
  openListeners[kind] += 1;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    openListeners[kind] -= 1;
    stop?.();
  };
};

// Plain data, so a profile can be sent to a worker thread (deviceFarm.mjs).
export const DEFAULT_PROFILE = Object.freeze({
  tickMs: 100, // how often the screen re-derives its stage
  rttMs: 0, // added to every request, each way
  deliveryFixedMs: 0, // added to every snapshot
  deliveryJitterMs: 0, // plus up to this much more, per snapshot (so snapshots can arrive out of order)
  heartbeatMs: 30_000, // LiveChallengeStudent: re-calibrate every 30 s
  answer: 'correct', // 'correct' | 'wrong' | 'none'
  answerJitterMs: 300, // a student takes up to this long to answer once the question shows
  lostReply: false, // the server takes the first answer but the reply never arrives; the device resends the same envelope
  secondAnswer: false, // after the first answer settles, try another one for the round
  // How this device hears the class's standings:
  //   'projection'  the screen: its own public row and the room's one standings
  //                 snapshot (functions/shared/liveChallengeStandingsProjection.mjs)
  //   'legacy'      every public player row, as the screen did before the snapshot
  //                 (the standings profile's comparison; O(N) deliveries per answer)
  //   'off'         not at all: a control that leaves only the server and Firestore
  standingsClient: 'projection',
  // Keep a per-delivery and per-answer log for the standings profile.
  trace: false,
});

// A small seeded generator per device, so a run's jitter is repeatable.
const seededRandom = (text) => {
  let seed = [...String(text)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 2147483647, 7) || 7;
  return () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
};

/**
 * @param {object} options
 * @param {string} options.studentId
 * @param {(name: string, studentId: string, data: object) => Promise<object>} options.call  the real callable
 * @param {(roomId: string, roundIndex: number, correct: boolean) => Promise<object>} options.responseFor
 * @param {Map} [options.storage]  this student's localStorage/sessionStorage; survives a refresh
 */
export function createSimStudent({ studentId, call, responseFor, profile: profileOverrides = {}, storage = new Map(), stats = null }) {
  const profile = { ...DEFAULT_PROFILE, ...profileOverrides };
  const random = seededRandom(studentId);
  const deliveryDelayMs = () => profile.deliveryFixedMs + Math.round(random() * profile.deliveryJitterMs);
  const answerDelayMs = () => Math.round(random() * profile.answerJitterMs);
  const tally = stats || { requests: {}, launchOnlyRequests: 0, heartbeatRequests: 0, diagnosticWrites: 0, snapshots: 0 };
  // Standings deliveries: callbacks, documents delivered, estimated browser
  // bytes, and the time spent on what the screen does with each delivery
  // (rank the board, cut the window it shows) — separately from what it costs
  // to count them.
  tally.standings ||= { callbacks: 0, docs: 0, bytes: 0, rankMs: 0, renderMs: 0, instrumentationMs: 0 };
  // With `trace`: one entry per standings callback, per changed row, and per answer.
  tally.trace ||= { callbacks: [], rows: [], answers: [], roomSnapshots: [], projections: [] };
  const device = {
    studentId,
    profile,
    storage,
    stats: tally,
    service: null,
    firebase: null,
    deviceId: null,
    roomId: null,
    invite: null,
    room: null,
    roomFromCache: false,
    everInSync: false,
    roomMissing: false,
    players: [],
    online: true,
    frozen: false,
    closed: false,
    joining: false,
    joinedRoomId: null,
    joinRefusedFor: null,
    clock: { offsetMs: 0, rttMs: 0, jitterMs: 0, quality: 'reconnecting', sampleCount: 0 },
    errors: [],
    // Per room: rounds this device had on screen as roundActive, with when.
    seen: {},
    stops: { room: null, standings: null, self: null, summary: null, players: null, invite: null },
    // The screen's own row and the room's standings snapshot ('projection').
    selfRow: null,
    projection: null,
    standingsView: null,
    // The device's own summary (playerSummaries/{studentId}): its own place.
    summary: null,
    ownFinal: null,
    joinedPlayerKey: null,
    timers: new Set(),
    queued: [],
    launchInFlight: false,
    // Answers this device is still sending (a host that moves the round on
    // first is racing the student, not testing the server).
    answering: 0,
    scheduledAnswers: 0,
  };

  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      device.timers.delete(timer);
      if (device.closed) return;
      // A frozen tab runs no JavaScript: its timers fire when it wakes.
      if (device.frozen) device.queued.push(fn);
      else fn();
    }, Math.max(0, ms));
    device.timers.add(timer);
    return timer;
  };

  /* ------------------------------ transport ------------------------------ */

  const request = async (name, data, { onSent = null } = {}) => {
    tally.requests[name] = (tally.requests[name] || 0) + 1;
    if (!device.online) {
      const error = new Error('Simulated network outage.');
      error.code = 'functions/unavailable';
      throw error;
    }
    await sleep(profile.rttMs);
    try {
      onSent?.(Date.now());
      return await call(name, studentId, data);
    } catch (error) {
      // The shape httpsCallable throws.
      const wrapped = new Error(error?.message || name);
      wrapped.code = `functions/${error?.code || 'internal'}`;
      wrapped.details = error?.details;
      throw wrapped;
    } finally {
      await sleep(profile.rttMs);
    }
  };

  /* --------------------- launch milestones (as #417) --------------------- */

  const launchKey = (roomId) => `mm-live-challenge-launch-${roomId}`;
  const launchState = () => {
    const key = launchKey(device.roomId);
    if (!storage.has(key)) storage.set(key, { milestones: {}, reported: {} });
    return storage.get(key);
  };
  const collectLaunchEvent = (event, observedRoom = device.room) => {
    if (!device.roomId) return;
    const state = launchState();
    if (state.milestones[event] || state.reported[event]) return;
    state.milestones[event] = {
      clientAtMs: Date.now(),
      roomStatus: observedRoom?.status || null,
      roundIndex: Number.isInteger(Number(observedRoom?.currentRound)) ? Number(observedRoom.currentRound) : null,
    };
  };
  const calibrate = (data) => {
    if (data.quality || data.launchReport) tally.diagnosticWrites += 1;
    if (data.launchReport && !data.quality) tally.launchOnlyRequests += 1;
    if (data.quality) tally.heartbeatRequests += 1;
    return request('calibrateLiveChallengeClock', data);
  };
  const sendLaunchDiagnostics = async (extra = {}) => {
    const roomId = device.roomId;
    if (!roomId || device.launchInFlight) return null;
    const state = launchState();
    if (!Object.keys(state.milestones).length) {
      return extra.quality ? calibrate({ roomId, sessionId: device.sessionId, ...extra }) : null;
    }
    const sent = { milestones: { ...state.milestones } };
    device.launchInFlight = true;
    try {
      const reply = await calibrate({ roomId, sessionId: device.sessionId, ...extra, launchReport: sent });
      for (const [event, milestone] of Object.entries(sent.milestones)) {
        if (state.milestones[event]?.clientAtMs === milestone.clientAtMs) {
          state.reported[event] = milestone.clientAtMs;
          delete state.milestones[event];
        }
      }
      return reply;
    } finally {
      device.launchInFlight = false;
    }
  };

  /* -------------------------------- clock -------------------------------- */

  let calibrationRun = 0;
  const startCalibration = () => {
    const run = (calibrationRun += 1);
    let failures = 0;
    const sample = async () => {
      if (device.closed || run !== calibrationRun || !calibrating()) return;
      try {
        const samples = [];
        for (let index = 0; index < 5; index += 1) {
          const clientSentAt = Date.now();
          // eslint-disable-next-line no-await-in-loop
          const reply = await request('calibrateLiveChallengeClock', { roomId: device.roomId });
          samples.push({ clientSentAt, clientReceivedAt: Date.now(), serverAt: reply.serverAt });
        }
        const estimate = calibrateChallengeClock(samples);
        failures = 0;
        if (run !== calibrationRun) return;
        device.clock = estimate;
        await sendLaunchDiagnostics({ quality: estimate.quality }).catch(() => (
          calibrate({ roomId: device.roomId, quality: estimate.quality, sessionId: device.sessionId }).catch(() => {})
        ));
        later(sample, profile.heartbeatMs);
      } catch {
        failures += 1;
        if (run !== calibrationRun) return;
        device.clock = { ...device.clock, quality: 'degraded' };
        later(sample, failures > 5 ? 10_000 : 2_000);
      }
    };
    sample();
  };
  const calibrating = () => !device.room || device.room.status === 'lobby' || device.room.status === 'running';

  /* ------------------------------ the screen ------------------------------ */

  const roomKey = () => device.roomId;
  const seenFor = () => {
    if (!device.seen[roomKey()]) device.seen[roomKey()] = { rounds: {}, stages: new Set(), countdownSeen: new Set(), answers: {} };
    return device.seen[roomKey()];
  };
  const leaderboard = () => publicLeaderboard(device.players, { activeRound: null, ...leaderboardOptionsFor(device.room?.scoringStrategyId || null) });
  const stage = () => (device.room ? challengeClock(device.room, Date.now() + device.clock.offsetMs).stage : null);
  const clockReady = () => device.clock.sampleCount > 0 || device.clock.quality === 'degraded';

  const onRoom = (next, { fromCache = false } = {}) => {
    tally.snapshots += 1;
    if (profile.trace) tally.trace.roomSnapshots.push(Date.now());
    // How long after the server wrote the room this device heard it.
    const writtenAt = next?.updatedAt?.toMillis?.();
    if (writtenAt && !fromCache) tally.roomLagMaxMs = Math.max(tally.roomLagMaxMs || 0, Date.now() - writtenAt);
    const deliver = () => {
      if (device.closed || (next && next.roomId !== device.roomId)) return;
      if (device.frozen) { device.queued.push(() => deliver()); return; }
      const phase = challengePhaseAt({ ...next, roundEndsAtMs: device.service.timestampMillis(next?.endsAt || next?.roundEndsAt) }, Date.now() + device.clock.offsetMs);
      device.roomFromCache = fromCache;
      if (!fromCache) {
        device.everInSync = true;
        device.roomMissing = !next;
      }
      device.room = acceptChallengeSnapshot(device.room, next ? { ...next, phase } : null);
      if (next?.status === 'running') {
        collectLaunchEvent('running_received', next);
        if (device.service.timestampMillis(next.startsAt || next.roundStartedAt) > Date.now() + device.clock.offsetMs) {
          collectLaunchEvent('countdown_received', next);
          seenFor().countdownSeen.add(Number(next.currentRound));
        }
      }
      syncStandingsListeners();
      render();
    };
    const delay = deliveryDelayMs();
    if (delay > 0) later(deliver, delay);
    else deliver();
  };

  // What the screen derives from each standings delivery: the board ranked as
  // the room's strategy ranks a match (LiveChallengeStudent's useMemo), and
  // the window it shows (the top five and this student's own row).
  const activeRoundNow = () => (device.room && stage() === CHALLENGE_STAGE.ROUND_ACTIVE ? Number(device.room.currentRound) : null);
  const deriveBoard = () => {
    const board = publicLeaderboard(device.players, { activeRound: activeRoundNow(), ...leaderboardOptionsFor(device.room?.scoringStrategyId || null) });
    device.boardWindow = standingsWindow(standingsRows(board, { selfKey: device.invite?.playerKey }), { limit: 5, selfKey: device.invite?.playerKey });
    return board;
  };

  // The standings listener pauses while a rush round is open (as the screen does).
  let playersListenerFor = null;
  const rowSignatures = new Map();
  const syncPlayersListener = () => {
    const rushRoundOpen = device.room?.challengeMode === RUSH_MODE_ID && device.room?.status === 'running' && device.room?.roundState !== 'closed';
    const wanted = device.roomId && !rushRoundOpen && profile.standingsClient !== 'off' ? device.roomId : null;
    if (wanted === playersListenerFor) return;
    device.stops.players?.();
    device.stops.players = null;
    playersListenerFor = wanted;
    // A listener that starts again is delivered every row again.
    rowSignatures.clear();
    if (!wanted) return;
    device.stops.players = counted('players', device.service.watchLiveChallengePlayers(wanted, (rows) => {
      if (device.closed || wanted !== device.roomId) return;
      const receivedAt = Date.now();
      const started = performance.now();
      let docs = 0;
      let bytes = SNAPSHOT_OVERHEAD_BYTES;
      rows.forEach((row) => {
        const signature = rowSignature(row);
        if (rowSignatures.get(row.playerKey) === signature) return;
        rowSignatures.set(row.playerKey, signature);
        docs += 1;
        bytes += bytesOfVersion(`liveChallengeRooms/${wanted}/players/${row.playerKey}`, signature, row);
        if (profile.trace) tally.trace.rows.push([receivedAt, row.playerKey, Number(row.answeredRound), millisOf(row.updatedAt), Number(row.score) || 0]);
      });
      const counting = performance.now() - started;
      device.players = rows;
      const ranking = performance.now();
      deriveBoard();
      const rankMs = performance.now() - ranking;
      const rendering = performance.now();
      render();
      const renderMs = performance.now() - rendering;
      tally.standings.callbacks += 1;
      tally.standings.docs += docs;
      tally.standings.bytes += bytes;
      tally.standings.rankMs += rankMs;
      tally.standings.renderMs += renderMs;
      tally.standings.instrumentationMs += counting;
      if (profile.trace) tally.trace.callbacks.push([receivedAt, docs, bytes, Math.round((rankMs + renderMs) * 1000) / 1000]);
    }, (error) => device.errors.push(`players: ${error?.message}`)));
  };

  // THE SCREEN'S STANDINGS ('projection'): three single documents — the
  // device's own public row and the room's standings snapshot, both paused
  // while a rush round is open, and the device's own summary (its own place,
  // which changes only at a round's close and the finish). Each delivery is one
  // document, whatever the class size.
  let standingsFor = null;
  let selfFor = null;
  let summaryFor = null;
  const myKey = () => device.invite?.playerKey || device.joinedPlayerKey || null;
  const deriveStandings = () => {
    device.standingsView = standingsFromProjection(device.projection, { roomId: device.roomId });
    device.ownFinal = summaryFinal(device.summary, { roomId: device.roomId });
    device.boardWindow = standingsWindow(
      standingsRows(projectionBoardRows(device.standingsView, { selfKey: myKey(), alias: device.invite?.alias, own: device.ownFinal }), { selfKey: myKey() }),
      { limit: 5, selfKey: myKey(), total: device.standingsView?.count ?? null },
    );
  };
  const delivered = (kind, documentPath, data, extra = null) => {
    const receivedAt = Date.now();
    const bytes = SNAPSHOT_OVERHEAD_BYTES + (data ? documentWireBytes(documentPath, data) : 0);
    const ranking = performance.now();
    deriveStandings();
    const rankMs = performance.now() - ranking;
    const rendering = performance.now();
    render();
    const renderMs = performance.now() - rendering;
    tally.standings.callbacks += 1;
    tally.standings.docs += 1;
    tally.standings.bytes += bytes;
    tally.standings.rankMs += rankMs;
    tally.standings.renderMs += renderMs;
    tally.standings[`${kind}Callbacks`] = (tally.standings[`${kind}Callbacks`] || 0) + 1;
    // Snapshots by the moment they are from: live (paced), roundClosed, final.
    if (kind === 'standings' && data?.kind) {
      tally.standings.byKind ||= {};
      tally.standings.byKind[data.kind] = (tally.standings.byKind[data.kind] || 0) + 1;
      if (data.kind === 'live' && data.phase === 'open') tally.standings.liveInRound = (tally.standings.liveInRound || 0) + 1;
    }
    if (profile.trace) {
      tally.trace.callbacks.push([receivedAt, 1, bytes, Math.round((rankMs + renderMs) * 1000) / 1000, kind]);
      if (extra) tally.trace[kind === 'standings' ? 'projections' : 'rows'].push([receivedAt, ...extra]);
    }
  };
  const syncStandingsListeners = () => {
    if (profile.standingsClient === 'legacy' || profile.standingsClient === 'off') { syncPlayersListener(); return; }
    const rushRoundOpen = device.room?.challengeMode === RUSH_MODE_ID && device.room?.status === 'running' && device.room?.roundState !== 'closed';
    const wantedRoom = device.roomId && !rushRoundOpen ? device.roomId : null;
    const wantedSelf = wantedRoom && myKey() ? `${wantedRoom}/${myKey()}` : null;
    if (wantedRoom !== standingsFor) {
      device.stops.standings?.();
      device.stops.standings = null;
      standingsFor = wantedRoom;
      if (wantedRoom) {
        device.stops.standings = counted('standings', device.service.watchLiveChallengeStandings(wantedRoom, (snapshot) => {
          if (device.closed || wantedRoom !== device.roomId) return;
          device.projection = snapshot;
          delivered('standings', `liveChallengeRooms/${wantedRoom}/standings/current`, snapshot, snapshot ? [Number(snapshot.sourceReadMs) || 0, snapshot.kind, snapshot.phase, Number(snapshot.roundVersion) || 0] : null);
        }, (error) => device.errors.push(`standings: ${error?.message}`)));
      }
    }
    if (wantedSelf !== selfFor) {
      device.stops.self?.();
      device.stops.self = null;
      selfFor = wantedSelf;
      if (wantedSelf) {
        const key = myKey();
        device.stops.self = counted('self', device.service.watchLiveChallengePlayer(wantedRoom, key, (row) => {
          if (device.closed || wantedRoom !== device.roomId) return;
          device.selfRow = row;
          delivered('self', `liveChallengeRooms/${wantedRoom}/players/${key}`, row, row ? [key, Number(row.answeredRound), millisOf(row.updatedAt), Number(row.score) || 0] : null);
        }, (error) => device.errors.push(`self: ${error?.message}`)));
      }
    }
    const wantedSummary = device.roomId ? `${device.roomId}/${studentId}` : null;
    if (wantedSummary !== summaryFor) {
      device.stops.summary?.();
      device.stops.summary = null;
      summaryFor = wantedSummary;
      if (wantedSummary) {
        const summaryRoom = device.roomId;
        device.stops.summary = counted('summary', device.service.watchLiveChallengePlayerSummary(summaryRoom, studentId, (summary) => {
          if (device.closed || summaryRoom !== device.roomId) return;
          device.summary = summary;
          delivered('summary', `liveChallengeRooms/${summaryRoom}/playerSummaries/${studentId}`, summary);
        }, (error) => device.errors.push(`summary: ${error?.message}`)));
      }
    }
  };
  // Whether this student is already in the room: the screen asks its own row
  // (the legacy screen looked for itself on the class's board).
  const alreadyJoined = () => (profile.standingsClient === 'projection'
    ? device.selfRow?.joined === true
    : leaderboard().some((entry) => entry.playerKey === device.invite?.playerKey));

  const maybeJoin = () => {
    const { room } = device;
    if (!device.roomId || device.joining || !room || room.roomId !== device.roomId || !['lobby', 'running'].includes(room.status)) return;
    if (device.joinRefusedFor === device.roomId || device.joinedRoomId === device.roomId) return;
    if (alreadyJoined()) return;
    device.joining = true;
    const roomId = device.roomId;
    request('joinLiveChallenge', { roomId })
      .then((reply) => {
        if (roomId !== device.roomId) return;
        device.joinedRoomId = roomId;
        if (reply?.playerKey) device.joinedPlayerKey = String(reply.playerKey);
        seenFor().joinReply = reply;
        syncStandingsListeners();
      })
      .catch((error) => {
        if (/permission-denied|failed-precondition|not-found|invalid-argument/.test(String(error?.code || ''))) device.joinRefusedFor = roomId;
        device.errors.push(`join: ${error?.code} ${error?.message}`);
      })
      .finally(() => { device.joining = false; });
  };

  // An answer is locked and kept (with its submission id) until the server
  // has it: as ChallengeRound's pending envelope, in this student's storage.
  const pendingKey = (roomId, roundIndex, roundVersion) => `live-challenge-pending-${roomId}-${roundIndex}-${roundVersion || 0}`;
  const resultKey = (roomId, roundIndex, roundVersion) => `live-challenge-result-${roomId}-${roundIndex}-${roundVersion || 0}`;
  // `kind`: 'first' (the answer), 'resend' (the same envelope again, after a
  // lost reply or a reconnect) or 'second' (a different answer for a round
  // already answered, which the server must never score).
  const sendAnswer = async (capture, kind = 'first') => {
    const seen = seenFor();
    const record = (seen.answers[capture.roundIndex] ||= { attempts: 0, accepted: [], refused: [] });
    record.attempts += 1;
    const sentAt = Date.now();
    // Lock In -> sent -> the reply, for the standings profile: what a student
    // waits for, beside what the server and the network spent of it.
    const timing = profile.trace ? { submissionId: capture.submissionId, roundIndex: capture.roundIndex, kind, lockedAt: capture.lockedAt || sentAt, sentAt: null, replyAt: null, ok: null } : null;
    if (timing) tally.trace.answers.push(timing);
    try {
      const grading = await request('submitLiveChallengeResponse', capture, { onSent: (at) => { if (timing) timing.sentAt = at; } });
      if (timing) { timing.replyAt = Date.now(); timing.ok = true; timing.duplicate = grading?.duplicate === true; }
      if (profile.lostReply && !capture.replyLostOnce) {
        // The answer reached the server; its reply did not reach the device.
        capture.replyLostOnce = true;
        const lost = new Error('Simulated lost reply.');
        lost.code = 'functions/unavailable';
        throw lost;
      }
      record.accepted.push({ kind, ms: Date.now() - sentAt, submissionId: capture.submissionId, duplicate: grading.duplicate === true, pointsAwarded: Number(grading.pointsAwarded) || 0, totalScore: Number(grading.totalScore) || 0, isCorrect: grading.isCorrect === true });
      storage.set(resultKey(capture.roomId, capture.roundIndex, capture.roundVersion), grading);
      storage.delete(pendingKey(capture.roomId, capture.roundIndex, capture.roundVersion));
      return grading;
    } catch (error) {
      if (timing && timing.ok === null) { timing.replyAt = Date.now(); timing.ok = false; timing.code = error.code; }
      record.refused.push({ kind, ms: Date.now() - sentAt, submissionId: capture.submissionId, code: error.code, message: error.message });
      // A refusal settles the envelope (already-exists: the first answer is
      // recorded; a closed or missing round: the screen has caught up). A
      // dropped connection keeps it, with its id, for the retry.
      if (/already-exists|failed-precondition|deadline-exceeded|not-found|permission-denied|invalid-argument/.test(String(error.code))) {
        storage.delete(pendingKey(capture.roomId, capture.roundIndex, capture.roundVersion));
      }
      return null;
    }
  };
  const retryPending = () => {
    for (const [key, capture] of storage) {
      if (typeof key === 'string' && key.startsWith(`live-challenge-pending-${device.roomId}-`) && capture && !capture.inFlight) {
        capture.inFlight = true;
        sendAnswer(capture, 'resend').finally(() => { capture.inFlight = false; });
      }
    }
  };
  const answerRound = async (room) => {
    device.answering += 1;
    try {
      await answerRoundNow(room);
    } finally {
      device.answering -= 1;
    }
  };
  const answerRoundNow = async (room) => {
    const roundIndex = Number(room.currentRound);
    const roundVersion = Number(room.roundVersion) || 0;
    const pKey = pendingKey(room.roomId, roundIndex, roundVersion);
    if (profile.answer === 'none' || storage.has(pKey) || storage.has(resultKey(room.roomId, roundIndex, roundVersion))) return;
    // Answered on another device, or before a refresh: the screen reads its own row.
    const self = profile.standingsClient === 'projection' ? device.selfRow : device.players.find((row) => row.playerKey === device.invite?.playerKey);
    if (Number(self?.answeredRound) === roundIndex) return;
    const capture = {
      roomId: room.roomId,
      roundIndex,
      roundVersion,
      roundToken: room.roundToken || '',
      submissionId: globalThis.crypto.randomUUID(),
      responsePayload: await responseFor(room.roomId, roundIndex, profile.answer === 'correct'),
      humanElapsedMs: 1_000,
      connectionQuality: device.clock.quality,
      timingDegraded: device.clock.quality === 'degraded',
      autoFinalizedAtRoundEnd: false,
    };
    // Lock In: the envelope exists from here, before any transport.
    Object.defineProperty(capture, 'lockedAt', { value: Date.now(), enumerable: false });
    storage.set(pKey, capture);
    capture.inFlight = true;
    await sendAnswer(capture);
    capture.inFlight = false;
    // The screen still holds the locked envelope after a lost reply; the
    // student's Retry (or the next 'online' event) sends that same envelope.
    if (storage.has(pKey)) {
      await sleep(300);
      capture.inFlight = true;
      await sendAnswer(capture, 'resend');
      capture.inFlight = false;
    }
    if (profile.secondAnswer) await sendAnswer({ ...capture, submissionId: globalThis.crypto.randomUUID() }, 'second');
  };

  const fetchRushGraphs = async (room) => {
    const seen = seenFor();
    const round = seen.rounds[room.currentRound];
    let delay = 600;
    for (let attempt = 0; attempt < 12 && !device.closed && room.roomId === device.roomId; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const reply = await request('getGraphFeatureRushRound', { roomId: room.roomId, roundIndex: Number(room.currentRound), roundVersion: Number(room.roundVersion) || 0, roundToken: room.roundToken || '', count: 6 });
        if (reply?.joined === false) { await sleep(400); continue; } // eslint-disable-line no-await-in-loop
        round.rushGraphs = (reply?.questions || []).length;
        round.rushPayloadBytes = JSON.stringify(reply?.questions || []).length;
        return;
      } catch {
        await sleep(delay); // eslint-disable-line no-await-in-loop
        delay = Math.min(5_000, delay * 2);
      }
    }
  };

  const render = () => {
    if (device.closed || device.frozen || !device.room || device.room.roomId !== device.roomId) return;
    const { room } = device;
    maybeJoin();
    const current = stage();
    const seen = seenFor();
    seen.stages.add(current);
    seen.connection = studentConnectionState({ online: device.online, fromCache: device.roomFromCache, everInSync: device.everInSync });
    const roundOpen = room.status === 'running' && room.roundState !== 'closed';
    const playable = roundOpen && room.currentQuestion && clockReady() && current === CHALLENGE_STAGE.ROUND_ACTIVE;
    if (!playable) return;
    const roundIndex = Number(room.currentRound);
    if (seen.rounds[roundIndex]) return;
    seen.rounds[roundIndex] = { at: Date.now(), startsAtMs: device.service.timestampMillis(room.startsAt || room.roundStartedAt), roundVersion: Number(room.roundVersion) || 0 };
    // game_mounted, then one best-effort batch a second later (never awaited).
    collectLaunchEvent('game_mounted', room);
    later(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
    if (room.challengeMode === RUSH_MODE_ID) fetchRushGraphs(room);
    else retryPending(); // a locked answer from before a refresh is sent again, same id
    if (room.challengeMode !== RUSH_MODE_ID) { device.answering += 1; device.scheduledAnswers += 1; }
    if (room.challengeMode !== RUSH_MODE_ID) later(() => { device.answering -= 1; device.scheduledAnswers -= 1; answerRound(room).catch((error) => device.errors.push(`answer: ${error?.message}`)); }, answerDelayMs());
  };

  let tickTimer = null;
  const startTicking = () => {
    if (tickTimer) return;
    const tick = () => { render(); tickTimer = later(tick, profile.tickMs); };
    tickTimer = later(tick, profile.tickMs);
  };

  /* ----------------------------- the lifecycle ----------------------------- */

  const loadDevice = async () => {
    deviceSeq += 1;
    device.deviceId = `${studentId}-${deviceSeq}`;
    const client = await importClientService(device.deviceId, `simulated device ${device.deviceId}`);
    device.service = client.service;
    device.firebase = client.firebase;
    if (!storage.has('mm-live-challenge-session')) storage.set('mm-live-challenge-session', globalThis.crypto.randomUUID());
    device.sessionId = storage.get('mm-live-challenge-session');
  };

  const openRoom = (roomId) => {
    device.stops.room?.();
    device.stops.room = null;
    // A different room is a different game: nothing of the last one stays.
    device.room = null;
    device.players = [];
    device.selfRow = null;
    device.projection = null;
    device.standingsView = null;
    device.summary = null;
    device.ownFinal = null;
    device.joinedPlayerKey = null;
    device.roomFromCache = false;
    device.everInSync = false;
    device.roomMissing = false;
    device.joinedRoomId = null;
    device.joinRefusedFor = null;
    device.roomId = roomId;
    playersListenerFor = null;
    device.stops.players?.();
    device.stops.players = null;
    standingsFor = null;
    selfFor = null;
    summaryFor = null;
    device.stops.standings?.();
    device.stops.standings = null;
    device.stops.self?.();
    device.stops.self = null;
    device.stops.summary?.();
    device.stops.summary = null;
    if (!roomId) return;
    collectLaunchEvent('listener_attached', null);
    device.stops.room = counted('room', device.service.watchLiveChallengeRoom(roomId, onRoom, (error) => {
      collectLaunchEvent('listener_error');
      later(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
      device.errors.push(`room: ${error?.message}`);
    }, { includeMetadataChanges: true }));
    syncStandingsListeners();
    startCalibration();
  };

  return Object.assign(device, {
    /** Open the game screen for an invite ({ roomId, playerKey }), as App does. */
    async open(invite) {
      if (!device.service) await loadDevice();
      device.invite = invite;
      openRoom(invite?.roomId || null);
      startTicking();
    },
    /** Follow this student's invite pointer: a new game moves the screen to it, unrefreshed. */
    async followInvites() {
      if (!device.service) await loadDevice();
      device.stops.invite?.();
      device.stops.invite = counted('invite', device.service.watchLiveChallengeInvite(studentId, (invite) => {
        if (device.closed || !invite?.roomId || invite.roomId === device.roomId) return;
        device.invite = invite;
        openRoom(invite.roomId);
      }, (error) => device.errors.push(`invite: ${error?.message}`)));
      startTicking();
    },
    stage,
    leaderboard,
    clockReady,
    /** What the device holds, as plain data (for a worker's report). */
    view() {
      const plainSeen = (seen) => Object.fromEntries(Object.entries(seen || {}).map(([roomId, entry]) => [roomId, {
        ...entry, stages: [...entry.stages], countdownSeen: [...entry.countdownSeen],
      }]));
      const room = device.room;
      return {
        studentId,
        roomId: device.roomId,
        invite: device.invite ? { roomId: device.invite.roomId, playerKey: device.invite.playerKey } : null,
        room: room ? { roomId: room.roomId, status: room.status, currentRound: room.currentRound, roundState: room.roundState, roundVersion: room.roundVersion, phase: room.phase } : null,
        stage: stage(),
        clockReady: clockReady(),
        clock: device.clock,
        online: device.online,
        frozen: device.frozen,
        answering: device.answering,
        playerCount: profile.standingsClient === 'projection' ? (device.standingsView?.count ?? 0) : device.players.length,
        board: profile.standingsClient === 'projection' ? null : leaderboard().map((row) => [row.playerKey, row.rank]),
        // What the screen's standings say: the snapshot's moment, how many
        // play, its public rows and where the last group starts — and this
        // student's own final place, from their own summary.
        standings: device.standingsView ? {
          kind: device.standingsView.kind,
          exact: device.standingsView.exact,
          roundVersion: device.standingsView.roundVersion,
          phase: device.standingsView.phase,
          count: device.standingsView.count,
          lastRank: device.standingsView.lastRank,
          top: device.standingsView.top.map((row) => [row.playerKey, row.rank, row.tied, row.score]),
          self: device.ownFinal ? { rank: device.ownFinal.rank, tied: device.ownFinal.tied === true, score: device.ownFinal.score } : null,
        } : null,
        selfRow: device.selfRow ? { answeredRound: device.selfRow.answeredRound, score: device.selfRow.score, slot: device.selfRow.slot ?? null, joined: device.selfRow.joined === true } : null,
        window: device.boardWindow ? { top: device.boardWindow.top.map((row) => [row.playerKey, row.rank]), self: device.boardWindow.self ? [device.boardWindow.self.playerKey, device.boardWindow.self.rank] : null, hiddenCount: device.boardWindow.hiddenCount } : null,
        seen: plainSeen(device.seen),
        seenBeforeRefresh: plainSeen(device.seenBeforeRefresh),
        // The trace is fetched once, at the end (traceData): a view is polled.
        stats: { ...tally, trace: undefined },
        errors: device.errors.slice(-5),
      };
    },
    /** The standings profile's per-delivery and per-answer log (with `trace`). */
    traceData() {
      return { studentId, playerKey: device.invite?.playerKey || null, trace: tally.trace, standings: tally.standings };
    },
    seenIn: (roomId) => device.seen[roomId] || null,
    async goOffline() {
      device.online = false;
      collectLaunchEvent('connection_lost');
      const { disableNetwork } = await import('firebase/firestore');
      await disableNetwork(device.firebase.db);
    },
    async goOnline() {
      const { enableNetwork } = await import('firebase/firestore');
      await enableNetwork(device.firebase.db);
      device.online = true;
      collectLaunchEvent('connection_restored');
      later(() => { sendLaunchDiagnostics().catch(() => {}); }, 1_000);
      retryPending();
    },
    freeze() { device.frozen = true; },
    thaw() {
      device.frozen = false;
      const queued = device.queued.splice(0);
      queued.forEach((fn) => fn());
      render(); // visibilitychange: re-derive at once
    },
    /** A refresh: this tab's page is gone and a new one opens with the same storage. */
    async refresh() {
      const invite = device.invite;
      const following = Boolean(device.stops.invite);
      await this.shutdown({ keepStorage: true });
      device.closed = false;
      // The new page starts with nothing on screen; what the old page saw is kept for the report.
      device.seenBeforeRefresh = device.seen;
      device.seen = {};
      device.service = null;
      device.clock = { offsetMs: 0, rttMs: 0, jitterMs: 0, quality: 'reconnecting', sampleCount: 0 };
      await loadDevice();
      if (following) await this.followInvites();
      device.invite = invite;
      openRoom(invite?.roomId || null);
      tickTimer = null;
      startTicking();
    },
    async shutdown() {
      device.closed = true;
      calibrationRun += 1;
      for (const timer of device.timers) clearTimeout(timer);
      device.timers.clear();
      // An answer this page scheduled but never sent leaves with the page.
      device.answering -= device.scheduledAnswers;
      device.scheduledAnswers = 0;
      tickTimer = null;
      Object.values(device.stops).forEach((stop) => stop?.());
      device.stops = { room: null, standings: null, self: null, summary: null, players: null, invite: null };
      playersListenerFor = null;
      standingsFor = null;
      selfFor = null;
      summaryFor = null;
      await device.firebase?.shutdown?.();
    },
  });
}
