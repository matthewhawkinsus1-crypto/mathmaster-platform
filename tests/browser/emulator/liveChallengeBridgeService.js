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
// The watchers are re-exported untouched: the component under test subscribes
// through exactly the code students run, with `db` pointed at the emulator.

export {
  watchLiveChallengeInvite,
  watchLiveChallengeRoom,
  watchLiveChallengePlayers,
  watchLiveChallengeDiagnostics,
  watchTeacherActiveChallenge,
  readChallengeReport,
  timestampMillis,
  setWarmupChallengeDelivery,
} from '../../../src/platform/liveChallenge/liveChallengeService.js';

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
export const finishLiveChallenge = call('finishLiveChallenge');
export const cancelLiveChallenge = call('cancelLiveChallenge');
export const submitLiveChallengeResponse = call('submitLiveChallengeResponse');
export const calibrateLiveChallengeClock = call('calibrateLiveChallengeClock');
export const reportLiveChallengeProgress = call('reportLiveChallengeProgress');
export const updateLiveChallengePacing = call('updateLiveChallengePacing');
export const getGraphFeatureRushRound = call('getGraphFeatureRushRound');
export const submitGraphFeatureRushAttempts = call('submitGraphFeatureRushAttempts');
export const previewGraphFeatureRush = call('previewGraphFeatureRush');
export const configureLiveChallengeExperience = call('configureLiveChallengeExperience');
export const getLiveChallengeExperience = call('getLiveChallengeExperience');
export const createChallengeDryRun = call('createChallengeDryRun');
export const swapChallengeDryRunRound = call('swapChallengeDryRunRound');
export const gradeChallengeDryRunResponse = call('gradeChallengeDryRunResponse');
export const discardChallengeDryRun = call('discardChallengeDryRun');
