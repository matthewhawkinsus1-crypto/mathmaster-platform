// Stands in for the Live Challenge client service in the BRIDGE harness
// (graphFeatureRushGame.mjs), and nowhere else.
//
// Unlike liveChallengeServiceStub.js, nothing here fakes the server. Every
// callable is posted to a local bridge that runs the REAL handler (from the
// deployed entry, functions/platformEntry.js) against the Firestore emulator,
// under the identity this
// page was opened as (?as=student&studentId=… or ?as=teacher&email=…). So a
// student's tap is graded by the real transaction, a round is closed by the
// real lifecycle, and every screen renders what the server actually wrote.
//
// The watchers are the real ones: the component under test subscribes through
// exactly the code students run, with `db` pointed at the emulator. Each is
// only COUNTED while open (window.__mmWatchers), so a driver can see whether
// listeners pile up across rounds and games — the count must come back down
// every time a screen moves on.

import * as service from '../../../src/platform/liveChallenge/liveChallengeService.js';

export {
  readLiveChallengeRound,
  readLiveChallengeSolution,
  readChallengeReport,
  timestampMillis,
  setWarmupChallengeDelivery,
} from '../../../src/platform/liveChallenge/liveChallengeService.js';

window.__mmWatchers = { open: {}, opened: 0, closed: 0 };
const counted = (name, watch) => (...args) => {
  const stop = watch(...args);
  const book = window.__mmWatchers;
  book.open[name] = (book.open[name] || 0) + 1;
  book.opened += 1;
  let stopped = false;
  return () => {
    if (!stopped) {
      stopped = true;
      book.open[name] -= 1;
      book.closed += 1;
    }
    return typeof stop === 'function' ? stop() : undefined;
  };
};
// STANDINGS DELIVERIES, for the standings profile (liveChallengeShellQa.mjs
// `standings`): one entry per callback — when, which listener, how many
// documents changed, and what it carried that a latency can be measured from
// (the rows whose round changed, or a snapshot's source read time).
window.__mmStandingsLog = [];
const millisOf = (value) => value?.toMillis?.() ?? 0;
const logStandings = (entry) => {
  window.__mmStandingsLog.push(entry);
  if (window.__mmStandingsLog.length > 20000) window.__mmStandingsLog.splice(0, 10000);
};
const rowSignature = (row) => `${millisOf(row.updatedAt)}:${millisOf(row.provisionalAt)}:${millisOf(row.rushActiveAt)}`;
const loggedPlayers = (roomId, onValue, ...rest) => {
  const seen = new Map();
  return service.watchLiveChallengePlayers(roomId, (rows) => {
    const changed = rows.filter((row) => {
      const signature = rowSignature(row);
      if (seen.get(row.playerKey) === signature) return false;
      seen.set(row.playerKey, signature);
      return true;
    });
    logStandings([performance.now(), Date.now(), 'players', changed.length, changed.map((row) => [row.playerKey, Number(row.answeredRound)])]);
    return onValue?.(rows);
  }, ...rest);
};

// A student's two standings listeners: the class's snapshot (one document,
// replaced whole) and their own public row.
const loggedStandings = (roomId, onValue, ...rest) => service.watchLiveChallengeStandings(roomId, (snapshot) => {
  logStandings([performance.now(), Date.now(), 'standings', snapshot ? 1 : 0, snapshot
    ? { kind: snapshot.kind, roundVersion: snapshot.roundVersion, phase: snapshot.phase, count: snapshot.count, sourceReadMs: Number(snapshot.sourceReadMs) || 0 }
    : null]);
  return onValue?.(snapshot);
}, ...rest);
const loggedSelf = (roomId, playerKey, onValue, ...rest) => service.watchLiveChallengePlayer(roomId, playerKey, (row) => {
  logStandings([performance.now(), Date.now(), 'self', row ? 1 : 0, row ? [[row.playerKey, Number(row.answeredRound)]] : []]);
  return onValue?.(row);
}, ...rest);

export const watchLiveChallengeInvite = counted('invite', service.watchLiveChallengeInvite);
export const watchLiveChallengeRoom = counted('room', service.watchLiveChallengeRoom);
export const watchLiveChallengePlayers = counted('players', loggedPlayers);
export const watchLiveChallengeStandings = counted('standings', loggedStandings);
export const watchLiveChallengePlayer = counted('self', loggedSelf);
export const watchLiveChallengeDiagnostics = counted('diagnostics', service.watchLiveChallengeDiagnostics);
export const watchTeacherActiveChallenge = counted('teacherActive', service.watchTeacherActiveChallenge);
export const watchLiveChallengeRound = counted('round', service.watchLiveChallengeRound);

const params = new URLSearchParams(window.location.search);
const BRIDGE = params.get('bridge') || 'http://localhost:5299';

// Who this page is. The bridge builds the auth context a callable would see.
window.__mmIdentity = params.get('as') === 'teacher'
  ? { as: 'teacher', email: params.get('email') }
  : { as: 'student', studentId: params.get('studentId') };

// Recorded so the driver can see what the page asked for.
window.__mmBridgeCalls = [];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const call = (name) => async (payload = {}) => {
  const entry = { name, at: Date.now(), payload };
  window.__mmBridgeCalls.push(entry);
  // The driver can take the network away, or slow it down, per page.
  if (window.__mmBridgeDelayMs) await sleep(window.__mmBridgeDelayMs);
  if (window.__mmBridgeOffline) {
    const error = new Error('Simulated network outage.');
    error.code = 'functions/unavailable';
    entry.error = error.code;
    throw error;
  }
  const response = await fetch(`${BRIDGE}/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: window.__mmIdentity, data: payload }),
  });
  const body = await response.json();
  if (!response.ok) {
    // The shape httpsCallable throws: a `functions/`-prefixed code.
    const error = new Error(body.message || name);
    error.code = `functions/${body.code || 'internal'}`;
    error.details = body.details;
    entry.error = error.code;
    throw error;
  }
  entry.ok = true;
  return body.data || {};
};

export const createLiveChallenge = call('createLiveChallenge');
export const joinLiveChallenge = call('joinLiveChallenge');
export const startLiveChallenge = call('startLiveChallenge');
export const closeLiveChallengeRound = call('closeLiveChallengeRound');
export const advanceLiveChallenge = call('advanceLiveChallenge');
export const getLiveChallengeMatchRecap = call('getLiveChallengeMatchRecap');
export const finishLiveChallenge = call('finishLiveChallenge');
export const cancelLiveChallenge = call('cancelLiveChallenge');
export const submitLiveChallengeResponse = call('submitLiveChallengeResponse');
export const publishLiveChallengeStandings = call('publishLiveChallengeStandings');
export const ensureLiveChallengeFinalStandings = call('ensureLiveChallengeFinalStandings');
export const calibrateLiveChallengeClock = call('calibrateLiveChallengeClock');
export const reportLiveChallengeProgress = call('reportLiveChallengeProgress');
export const updateLiveChallengePacing = call('updateLiveChallengePacing');
export const getLiveChallengeHostRoster = call('getLiveChallengeHostRoster');
export const getGraphFeatureRushRound = call('getGraphFeatureRushRound');
export const submitGraphFeatureRushAttempts = call('submitGraphFeatureRushAttempts');
export const previewGraphFeatureRush = call('previewGraphFeatureRush');
export const configureLiveChallengeExperience = call('configureLiveChallengeExperience');
export const getLiveChallengeExperience = call('getLiveChallengeExperience');
export const createChallengeDryRun = call('createChallengeDryRun');
export const swapChallengeDryRunRound = call('swapChallengeDryRunRound');
export const gradeChallengeDryRunResponse = call('gradeChallengeDryRunResponse');
export const discardChallengeDryRun = call('discardChallengeDryRun');
