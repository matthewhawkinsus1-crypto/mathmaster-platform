import { calculateNextRetentionDueDate, RETENTION_STATUS } from './retentionScheduler.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

export const evaluateRetentionProbeResult = ({
  teksCode,
  probeStepResult = {},
  currentSchedule = {},
  now = Date.now(),
}) => {
  const displayCode = toDisplayCode(teksCode);
  const completedQuestions = Math.max(0, Number(probeStepResult.completedQuestions) || 0);
  const independentSuccesses = Math.max(0, Number(probeStepResult.independentSuccesses) || 0);
  const passed = probeStepResult.status === 'passed'
    && completedQuestions >= 2
    && independentSuccesses >= 2;

  if (passed) {
    const successfulCheckCount = Math.max(0, Number(currentSchedule.successfulCheckCount) || 0) + 1;
    return {
      passed: true,
      updatedSchedule: {
        ...currentSchedule,
        teksCode: displayCode,
        lastVerifiedAt: now,
        successfulCheckCount,
        nextCheckDueAt: calculateNextRetentionDueDate(now, successfulCheckCount, now),
        status: RETENTION_STATUS.SCHEDULED,
        daysOverdue: 0,
      },
      pathStateOverride: { lastVerification: { outcome: 'passed', consumed: false, timestamp: now } },
      userFeedback: {
        title: 'Retention verified!',
        message: `You confirmed TEKS ${displayCode}. The next check is scheduled in ${successfulCheckCount === 1 ? 30 : 60} days.`,
      },
    };
  }

  return {
    passed: false,
    updatedSchedule: {
      ...currentSchedule,
      teksCode: displayCode,
      status: RETENTION_STATUS.CONCERN,
      lastFailedCheckAt: now,
    },
    pathStateOverride: { lastVerification: { outcome: 'failed', consumed: false, timestamp: now } },
    userFeedback: {
      title: 'Review needed',
      message: `This check showed that TEKS ${displayCode} needs a little more review.`,
    },
  };
};
