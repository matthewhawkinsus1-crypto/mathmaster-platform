// Stands in for src/platform/rewards/rewardsClient.js inside the rewards QA
// harness ONLY (tests/browser/rewardsQa.mjs).
//
// Reads are the real module's — the real queries against the Firestore
// emulator. The callables, which in production run on Cloud Functions, go to
// the harness's local server instead, and that server runs the REAL
// transactions (functions/shared/rewardActionStore.mjs) against the same
// emulator. So a click in the harness exercises the real store end to end.
export {
  loadStudentRewardHistory,
  practicePassKey,
  subscribeToStudentRewardInventory,
} from '../../../src/platform/rewards/rewardsClient.js';

const params = new URLSearchParams(window.location.search);
const api = params.get('api') || 'http://localhost:5299';

const post = (name, identity) => async (payload) => {
  let response;
  try {
    response = await fetch(`${api}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, payload }),
    });
  } catch (error) {
    const failure = new Error('Failed to fetch');
    failure.code = 'functions/unavailable';
    throw failure;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error(body?.error?.message || 'Request failed');
    failure.code = `functions/${body?.error?.code || 'internal'}`;
    throw failure;
  }
  return body;
};

const student = { studentId: params.get('student') };
const teacher = { teacherEmail: params.get('teacher') };

export const usePracticePass = post('redeemPracticePass', student);
export const awardRewardGrant = post('awardRewardGrant', teacher);
export const revokeRewardGrant = post('revokeRewardGrant', teacher);
export const undoPracticePassRedemption = post('undoPracticePassRedemption', teacher);
export const getStudentRewards = post('getStudentRewards', teacher);
export const loadClassPracticePassKeys = async () => new Set();
