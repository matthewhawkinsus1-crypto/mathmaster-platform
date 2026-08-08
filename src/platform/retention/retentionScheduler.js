import { toDisplayCode } from '../../utils/teksUtils.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_HORIZONS_MS = Object.freeze({
  INITIAL_MASTERY: 14 * DAY_MS,
  EXTENDED_VERIFIED: 30 * DAY_MS,
  LONG_TERM_SECURE: 60 * DAY_MS,
});

export const RETENTION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  DUE: 'due',
  OVERDUE: 'overdue',
  CONCERN: 'concern',
  CONFIRMED_LOSS: 'confirmedLoss',
});

const asMillis = (value, fallback) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const calculateNextRetentionDueDate = (lastVerifiedAt, successfulCheckCount = 0, now = Date.now()) => {
  const baseTime = asMillis(lastVerifiedAt, now);
  const count = Math.max(0, Number(successfulCheckCount) || 0);
  const horizon = count === 0
    ? RETENTION_HORIZONS_MS.INITIAL_MASTERY
    : count === 1
      ? RETENTION_HORIZONS_MS.EXTENDED_VERIFIED
      : RETENTION_HORIZONS_MS.LONG_TERM_SECURE;
  return baseTime + horizon;
};

export const evaluateStudentRetentionSchedule = (
  masteryProfilesByTEKS = {},
  retentionSchedulesByTEKS = {},
  now = Date.now(),
) => {
  const scheduleReport = {};
  const pendingProbes = [];

  Object.entries(masteryProfilesByTEKS).forEach(([rawTeksCode, profile]) => {
    const teksCode = toDisplayCode(rawTeksCode);
    const masteryStatus = profile?.mastery?.status;
    if (!['Mastered', 'Secure'].includes(masteryStatus)) return;

    const existingSchedule = retentionSchedulesByTEKS[teksCode]
      || retentionSchedulesByTEKS[rawTeksCode]
      || {};
    const lastIndependentSuccessAt = profile?.dimensions?.lastIndependentSuccessAt;
    const lastVerifiedAt = asMillis(existingSchedule.lastVerifiedAt, asMillis(lastIndependentSuccessAt, now));
    const successfulCheckCount = Math.max(0, Number(existingSchedule.successfulCheckCount) || 0);
    const nextCheckDueAt = asMillis(
      existingSchedule.nextCheckDueAt,
      calculateNextRetentionDueDate(lastVerifiedAt, successfulCheckCount, now),
    );
    const timeUntilDue = nextCheckDueAt - now;

    let status = RETENTION_STATUS.SCHEDULED;
    if (profile?.signals?.retention === RETENTION_STATUS.CONFIRMED_LOSS) status = RETENTION_STATUS.CONFIRMED_LOSS;
    else if (profile?.signals?.retention === RETENTION_STATUS.CONCERN) status = RETENTION_STATUS.CONCERN;
    else if (timeUntilDue <= -7 * DAY_MS) status = RETENTION_STATUS.OVERDUE;
    else if (timeUntilDue <= 0) status = RETENTION_STATUS.DUE;

    const updatedSchedule = {
      ...existingSchedule,
      teksCode,
      lastVerifiedAt,
      successfulCheckCount,
      nextCheckDueAt,
      status,
      daysOverdue: timeUntilDue < 0 ? Math.max(0, Math.floor(Math.abs(timeUntilDue) / DAY_MS)) : 0,
    };
    scheduleReport[teksCode] = updatedSchedule;

    if ([RETENTION_STATUS.DUE, RETENTION_STATUS.OVERDUE, RETENTION_STATUS.CONCERN].includes(status)) {
      const priority = status === RETENTION_STATUS.CONCERN ? 1 : status === RETENTION_STATUS.OVERDUE ? 2 : 3;
      pendingProbes.push({
        teksCode,
        priority,
        reason: status === RETENTION_STATUS.CONCERN
          ? 'Recent errors detected on a previously secure skill.'
          : status === RETENTION_STATUS.OVERDUE
            ? `Retention check is ${updatedSchedule.daysOverdue} day${updatedSchedule.daysOverdue === 1 ? '' : 's'} overdue.`
            : 'Scheduled retention check is due.',
        schedule: updatedSchedule,
      });
    }
  });

  pendingProbes.sort((left, right) => left.priority - right.priority
    || left.schedule.nextCheckDueAt - right.schedule.nextCheckDueAt
    || left.teksCode.localeCompare(right.teksCode));

  return { schedules: scheduleReport, pendingProbes, hasPendingProbes: pendingProbes.length > 0 };
};
