// Stands in for the Live Challenge client service in liveChallengeTeachingQa.mjs
// ONLY. It is the bridge harness's service (emulator/liveChallengeBridgeService.js:
// the real watchers, every callable posted to the bridge that runs the real
// handler) plus the two reads a student's screen now makes that the bridge
// service does not yet export: a round's published worked solution, and the
// student's end-of-game recap. An explicit export below wins over the star
// export, so this keeps working once the bridge service gains them.
export * from './emulator/liveChallengeBridgeService.js';
export { readLiveChallengeSolution } from '../../src/platform/liveChallenge/liveChallengeService.js';

const BRIDGE = new URLSearchParams(window.location.search).get('bridge') || 'http://localhost:5299';

export const getLiveChallengeMatchRecap = async (payload = {}) => {
  window.__mmBridgeCalls?.push({ name: 'getLiveChallengeMatchRecap', at: Date.now(), payload });
  const response = await fetch(`${BRIDGE}/call/getLiveChallengeMatchRecap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: window.__mmIdentity, data: payload }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.message || 'getLiveChallengeMatchRecap');
    error.code = `functions/${body.code || 'internal'}`;
    throw error;
  }
  return body.data || {};
};
