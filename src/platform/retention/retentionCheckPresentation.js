// What a student reads when a retention check finishes.
//
// The verdict is the server's (`session.retentionOutcome`, written in the same
// transaction that moves the retention schedule — see
// functions/shared/pathRetentionCheck.mjs). It is shown only once the check is
// over: nothing here is read while a question can still be answered.

import { RETENTION_PROBE } from '../../../functions/shared/pathRetentionCheck.mjs';

export const describeRetentionCheckOutcome = (session = null) => {
  if (session?.sessionKind !== RETENTION_PROBE || session?.status !== 'completed') return null;
  if (session.retentionOutcome === 'passed') {
    return {
      passed: true,
      headline: 'Still with you ✓',
      message: 'Both questions right on your own, so this skill stays counted. MathMaster will check it again in a few weeks.',
    };
  }
  if (session.retentionOutcome === 'failed') {
    return {
      passed: false,
      headline: 'Worth a refresh',
      message: 'This one slipped a little. It stays on your Path as a quick check, and practising it again will bring it back.',
    };
  }
  return null;
};

export default describeRetentionCheckOutcome;
