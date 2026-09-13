// Deterministic timing and state rules for Live Challenge.  This module has no
// Firebase or browser dependency so the same contract is exercised by Cloud
// Functions, clients, and the parity certification harness.

export const ROUND_PHASE = Object.freeze({
  LOBBY: 'lobby', ANSWERING: 'answering', LOCKED: 'locked', FINISHED: 'finished',
});

const PHASE_ORDER = Object.freeze(Object.fromEntries(Object.values(ROUND_PHASE).map((phase, index) => [phase, index])));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** NTP-style calibration from multiple request samples. Wall time is used only
 * to estimate the server epoch; elapsed response capture uses monotonic time. */
export function calibrateChallengeClock(samples = []) {
  const valid = samples.map((sample) => {
    const sent = Number(sample.clientSentAt);
    const received = Number(sample.clientReceivedAt);
    const server = Number(sample.serverAt);
    const rttMs = Math.max(0, received - sent);
    return { rttMs, offsetMs: server - ((sent + received) / 2) };
  }).filter((sample) => Number.isFinite(sample.rttMs) && Number.isFinite(sample.offsetMs));
  const rtts = valid.map((sample) => sample.rttMs);
  const rttMs = median(rtts);
  const jitterMs = median(rtts.map((value) => Math.abs(value - rttMs)));
  const offsetMs = median(valid.map((sample) => sample.offsetMs));
  const quality = !valid.length ? 'reconnecting' : (rttMs > 500 || jitterMs > 150 ? 'delayed' : 'synchronized');
  return Object.freeze({ offsetMs, rttMs, jitterMs, quality, sampleCount: valid.length });
}

export const SPEED_TIERS = Object.freeze([
  { maximumElapsedRatio: .2, multiplier: 1, tier: 'instant' },
  { maximumElapsedRatio: .4, multiplier: .8, tier: 'fast' },
  { maximumElapsedRatio: .6, multiplier: .6, tier: 'steady' },
  { maximumElapsedRatio: .8, multiplier: .4, tier: 'careful' },
  { maximumElapsedRatio: 1, multiplier: .2, tier: 'deadline' },
]);
export const SPEED_TIER_BOUNDARY_TOLERANCE_MS = 750;

export function challengeSpeedTier(elapsedMs, totalMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const total = Math.max(1, Number(totalMs) || 1);
  if (elapsed >= total) return Object.freeze({ tier: 'expired', multiplier: 0, elapsedRatio: elapsed / total });
  const elapsedRatio = elapsed / total;
  // Server-observed arrival is deliberately fuzzy at a band boundary. A
  // classroom-scale transport difference must not turn a near tie into a new
  // placement, and no client claim participates in this tolerance.
  const band = SPEED_TIERS.find((candidate, index) => (
    index === SPEED_TIERS.length - 1
      ? elapsedRatio < 1
      : elapsed <= (candidate.maximumElapsedRatio * total) + SPEED_TIER_BOUNDARY_TOLERANCE_MS
  )) || SPEED_TIERS.at(-1);
  return Object.freeze({ ...band, elapsedRatio });
}

export function acceptChallengeSnapshot(current, incoming) {
  if (!incoming) return current || null;
  if (!current) return incoming;
  const currentRound = Number(current.currentRound ?? -1);
  const incomingRound = Number(incoming.currentRound ?? -1);
  if (incomingRound < currentRound) return current;
  if (incomingRound > currentRound) return incoming;
  const currentVersion = Number(current.roundVersion || 0);
  const incomingVersion = Number(incoming.roundVersion || 0);
  if (incomingVersion < currentVersion) return current;
  if (incomingVersion > currentVersion) return incoming;
  if ((PHASE_ORDER[incoming.phase] ?? -1) < (PHASE_ORDER[current.phase] ?? -1)) return current;
  return incoming;
}

// 750 ms covers the requested 600 ms classroom path with scheduling margin,
// without creating a second answering period after the round. A response in
// this transport-only grace receives only the final speed band.
export const SUBMISSION_ARRIVAL_GRACE_MS = 750;

export function challengePhaseAt(snapshot = {}, serverNowMs = Date.now()) {
  if (snapshot.status === 'finished' || snapshot.status === 'cancelled') return ROUND_PHASE.FINISHED;
  if (snapshot.status === 'lobby') return ROUND_PHASE.LOBBY;
  const endsAtMs = Number(snapshot.endsAtMs || snapshot.roundEndsAtMs || 0);
  return endsAtMs > 0 && Number(serverNowMs) >= endsAtMs ? ROUND_PHASE.LOCKED : ROUND_PHASE.ANSWERING;
}

export function submissionArrivalDecision({ arrivedAtMs, startsAtMs, endsAtMs, graceMs = SUBMISSION_ARRIVAL_GRACE_MS }) {
  const arrived = Number(arrivedAtMs);
  const starts = Number(startsAtMs);
  const ends = Number(endsAtMs);
  const grace = Math.max(0, Math.min(SUBMISSION_ARRIVAL_GRACE_MS, Number(graceMs) || 0));
  if (![arrived, starts, ends].every(Number.isFinite) || ends <= starts) {
    return Object.freeze({ accepted: false, reason: 'invalid_timeline', elapsedMs: 0, inGrace: false });
  }
  if (arrived > ends + grace) {
    return Object.freeze({ accepted: false, reason: 'arrival_window_expired', elapsedMs: ends - starts, inGrace: false });
  }
  const inGrace = arrived >= ends;
  return Object.freeze({
    accepted: true,
    reason: null,
    // Server-observed only. Claims and device wall time cannot improve a tier.
    elapsedMs: inGrace ? Math.max(0, ends - starts - 1) : Math.max(0, arrived - starts),
    inGrace,
  });
}

export function authoritativeElapsed({ arrivedAtMs, startsAtMs, totalMs }) {
  const arrivalElapsed = Math.max(0, Number(arrivedAtMs) - Number(startsAtMs));
  return Math.min(Number(totalMs), arrivalElapsed);
}
