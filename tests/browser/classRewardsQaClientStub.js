// Stands in for src/platform/rewards/classRewardsClient.js inside the class
// rewards QA harness ONLY (tests/browser/classRewardsQa.mjs).
//
// Reads are the real module's — the real queries against the Firestore
// emulator. The callables go to the harness's local server, which runs the
// REAL transactions (functions/lib/classRewardStore.js) against the same
// emulator, so a click here exercises the real store end to end.
export {
  newClassRewardRequestId,
  subscribeToClassRewardCatalog,
  subscribeToPendingClassRewardRequests,
  subscribeToStudentClassRewardRequests,
} from '../../src/platform/rewards/classRewardsClient.js';

const params = new URLSearchParams(window.location.search);
const api = params.get('api') || 'http://localhost:5298';

const post = (name, identity) => async (payload) => {
  let response;
  try {
    response = await fetch(`${api}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, payload }),
    });
  } catch {
    const failure = new Error('Failed to fetch');
    failure.code = 'functions/unavailable';
    throw failure;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error(body?.error?.message || 'Request failed');
    failure.code = `functions/${body?.error?.code || 'internal'}`;
    failure.details = body?.error?.details;
    throw failure;
  }
  return body;
};

const student = { studentId: params.get('student') };
const teacher = { teacherEmail: params.get('teacher') };

export const redeemClassReward = post('redeemClassReward', student);
export const saveClassRewardCatalog = post('saveClassRewardCatalog', teacher);
export const resolveClassRewardRequest = post('resolveClassRewardRequest', teacher);
