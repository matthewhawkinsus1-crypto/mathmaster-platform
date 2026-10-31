import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRANT_OUTCOME,
  REWARD_GRANT_STATUS,
  buildRewardGrant,
  effectiveGrantStatus,
  grantExpiryTime,
  grantsDueToExpire,
  pickGrantToSpend,
  planGrantTransition,
} from '../../functions/shared/rewardGrants.mjs';

/*
 * LAZY EXPIRY (LC23). An available grant past its end date already READS as
 * expired everywhere; nothing sweeps on a schedule. These are the two pure
 * decisions the server paths that already hold a student's grants make while
 * they are there: which grants are due to be written as expired, and when the
 * history says each one expired. The writes themselves, and the paths that
 * make them, are certified against a real Firestore in
 * tests/integration/rewardActions.test.mjs.
 */

const NOW = Date.parse('2026-10-01T15:00:00.000Z');
const DAY = 86_400_000;
const iso = (millis) => new Date(millis).toISOString();

const pass = (grantId, overrides = {}) => ({
  ...buildRewardGrant({
    grantId,
    rewardCode: 'practicePass',
    studentId: 'student-1',
    classId: 'class-1',
    source: { type: 'teacher', id: 't@school.org' },
    awardedAt: iso(NOW - 40 * DAY),
    expiresAt: iso(NOW + 30 * DAY),
    originTeacherEmail: 't@school.org',
    authorizedTeacherEmails: ['t@school.org'],
  }),
  ...overrides,
});

test('only an available grant past its end date is due; every other state is left alone', () => {
  const grants = [
    pass('due-yesterday', { expiresAt: iso(NOW - DAY) }),
    pass('due-to-the-millisecond', { expiresAt: iso(NOW) }),
    pass('due-as-a-number', { expiresAt: NOW - 5 * DAY }),
    pass('due-as-a-timestamp', { expiresAt: { toMillis: () => NOW - 2 * DAY } }),
    pass('ends-tomorrow', { expiresAt: iso(NOW + DAY) }),
    pass('never-ends', { expiresAt: null }),
    pass('used-and-past-its-end', { status: REWARD_GRANT_STATUS.REDEEMED, expiresAt: iso(NOW - 3 * DAY) }),
    pass('taken-back-and-past-its-end', { status: REWARD_GRANT_STATUS.REVOKED, expiresAt: iso(NOW - 3 * DAY) }),
    pass('already-recorded', { status: REWARD_GRANT_STATUS.EXPIRED, expiresAt: iso(NOW - 3 * DAY) }),
    null,
    {},
    { ...pass('no-id', { expiresAt: iso(NOW - DAY) }), grantId: '' },
  ];
  const before = JSON.stringify(grants);

  assert.deepEqual(
    grantsDueToExpire(grants, NOW).map((grant) => grant.grantId),
    ['due-yesterday', 'due-to-the-millisecond', 'due-as-a-number', 'due-as-a-timestamp'],
  );
  assert.equal(JSON.stringify(grants), before, 'reading what is due changes nothing');
  assert.deepEqual(grantsDueToExpire(undefined, NOW), []);
  assert.deepEqual(grantsDueToExpire('nothing', NOW), []);
});

test('what is due follows the clock it is given', () => {
  const grants = [pass('g', { expiresAt: iso(NOW + 10 * DAY) })];
  assert.deepEqual(grantsDueToExpire(grants, NOW), []);
  assert.deepEqual(grantsDueToExpire(grants, NOW + 10 * DAY - 1), []);
  assert.deepEqual(grantsDueToExpire(grants, NOW + 10 * DAY).map((grant) => grant.grantId), ['g']);
});

test('a grant that is due is exactly one that already reads as expired', () => {
  // The write only makes the stored status agree with what every screen reads.
  const grants = [
    pass('a', { expiresAt: iso(NOW - DAY) }),
    pass('b', { expiresAt: iso(NOW + DAY) }),
    pass('c', { expiresAt: null }),
    pass('d', { status: REWARD_GRANT_STATUS.REVOKED, expiresAt: iso(NOW - DAY) }),
  ];
  const due = new Set(grantsDueToExpire(grants, NOW).map((grant) => grant.grantId));
  const readAsExpired = grants.filter((grant) => grant.status === REWARD_GRANT_STATUS.AVAILABLE
    && effectiveGrantStatus(grant, NOW) === REWARD_GRANT_STATUS.EXPIRED).map((grant) => grant.grantId);
  assert.deepEqual([...due], ['a']);
  assert.deepEqual(readAsExpired, ['a']);
});

test('the expiry is recorded at the grant\'s end date, not when something next looked', () => {
  const ends = NOW - 3 * DAY;
  const grant = pass('g', { expiresAt: iso(ends) });
  assert.equal(grantExpiryTime(grant), iso(ends));
  assert.equal(grantExpiryTime(pass('n', { expiresAt: ends })), iso(ends), 'a number');
  assert.equal(grantExpiryTime(pass('t', { expiresAt: { toMillis: () => ends } })), iso(ends), 'a Firestore timestamp');
  assert.equal(grantExpiryTime(pass('x', { expiresAt: null })), null, 'no end date, no time');
  assert.equal(grantExpiryTime(pass('y', { expiresAt: 'not a date' })), null);
  assert.equal(grantExpiryTime(pass('z', { expiresAt: -1e18 })), null, 'a time no date can hold is not thrown over');
  assert.equal(grantExpiryTime(), null);

  const plan = planGrantTransition(grant, { to: REWARD_GRANT_STATUS.EXPIRED, at: grantExpiryTime(grant) }, NOW);
  assert.equal(plan.outcome, GRANT_OUTCOME.APPLY);
  assert.equal(plan.next.status, REWARD_GRANT_STATUS.EXPIRED);
  assert.equal(plan.next.expiredAt, iso(ends));
  assert.deepEqual(plan.next.history.map((entry) => [entry.status, entry.at, entry.actorType, entry.reason]), [
    ['available', iso(NOW - 40 * DAY), 'system', 'awarded'],
    ['expired', iso(ends), 'system', 'expired'],
  ]);
  // The grant it was planned from is not changed, and nothing else about it is.
  assert.equal(grant.status, REWARD_GRANT_STATUS.AVAILABLE);
  assert.equal(plan.next.expiresAt, grant.expiresAt);
  assert.equal(plan.next.awardedAt, grant.awardedAt);
});

test('settling a grant is final and never repeats', () => {
  const grant = pass('g', { expiresAt: iso(NOW - DAY) });
  const written = planGrantTransition(grant, { to: REWARD_GRANT_STATUS.EXPIRED, at: grantExpiryTime(grant) }, NOW).next;
  assert.deepEqual(grantsDueToExpire([written], NOW + 30 * DAY), [], 'once recorded it is not due again');
  assert.equal(
    planGrantTransition(written, { to: REWARD_GRANT_STATUS.EXPIRED }, NOW + 30 * DAY).outcome,
    GRANT_OUTCOME.ALREADY_APPLIED,
  );
  assert.equal(planGrantTransition(written, { to: REWARD_GRANT_STATUS.REVOKED, reason: 'x' }, NOW).code, 'already_expired');
});

test('a recorded expiry changes nothing about which pass is spent', () => {
  // Reading expired and being recorded expired are the same to the pass picker.
  const live = pass('live', { expiresAt: iso(NOW + 5 * DAY) });
  const stale = pass('stale', { expiresAt: iso(NOW - DAY) });
  const recorded = planGrantTransition(stale, { to: REWARD_GRANT_STATUS.EXPIRED, at: grantExpiryTime(stale) }, NOW).next;
  assert.equal(pickGrantToSpend([stale, live], 'practicePass', NOW).grantId, 'live');
  assert.equal(pickGrantToSpend([recorded, live], 'practicePass', NOW).grantId, 'live');
  assert.equal(pickGrantToSpend([stale], 'practicePass', NOW), null);
  assert.equal(pickGrantToSpend([recorded], 'practicePass', NOW), null);
});
