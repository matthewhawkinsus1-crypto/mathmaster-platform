import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMIC_REFUSAL,
  CLASS_REWARD_REQUEST_STATUS,
  MAX_CATALOG_ITEMS,
  STARTER_CLASS_REWARDS,
  academicWordingIn,
  activeCatalogItems,
  buildCatalogDocument,
  buildClassRewardRequest,
  evaluateClassRewardRedemption,
  planRequestResolution,
  schoolWeekKey,
  validateCatalogInput,
  validateCatalogItem,
  validateRedeemInput,
  validateResolveInput,
  weeklyUseCount,
} from '../../functions/shared/classRewardCatalog.mjs';

// The class reward catalog's rules (functions/shared/classRewardCatalog.mjs):
// what a teacher may list, what a student may spend on, and how a request is
// resolved. The transactions that apply them are exercised against the
// emulator in tests/integration/classRewards.test.mjs.

const item = (overrides = {}) => ({
  itemId: 'starter-seat', label: 'Choose your seat for a day', description: 'Sit anywhere for one period.', cost: 50, active: true, weeklyLimitPerStudent: 1, ...overrides,
});

test('a valid item keeps only its allow-listed fields', () => {
  const cleaned = validateCatalogItem({ ...item(), note: 'kept out', createdBy: 'x' });
  assert.deepEqual(Object.keys(cleaned).sort(), ['active', 'cost', 'description', 'itemId', 'label', 'weeklyLimitPerStudent']);
  assert.equal(cleaned.cost, 50);
  assert.equal(cleaned.active, true);
});

test('an item carrying any academic field is refused, not trimmed', () => {
  for (const field of ['grade', 'gradeEffect', 'extraCredit', 'assignmentId', 'excuse', 'waiver', 'practicePass', 'Score']) {
    assert.throws(() => validateCatalogItem({ ...item(), [field]: 'anything' }), (error) => {
      assert.equal(error.name, 'ClassRewardInputError');
      assert.equal(error.message, ACADEMIC_REFUSAL);
      return true;
    }, field);
  }
});

test('wording that promises an academic effect is refused with the reason', () => {
  const refused = [
    'Homework-free night',
    'Homework pass',
    'Extra credit on the next quiz',
    '5 bonus points',
    'Drop your lowest grade',
    'Skip a question on the test',
    'Skip one practice problem',
    'Retake a quiz',
    'Late work accepted',
    'One free answer',
    'Extra Practice Pass',
    'Excused from classwork',
    // Shorthand and indirect wording for the same effects.
    'No HW tonight',
    'Drop your lowest score',
    'Free 100 on a warm-up',
    'Use notes on the unit check',
    '+5 on next check',
    'Turn in work a day late',
    'Open-note day',
  ];
  refused.forEach((label) => {
    assert.throws(() => validateCatalogItem(item({ label })), /can't change grades or required work/, label);
  });
  // In the description too.
  assert.throws(() => validateCatalogItem(item({ description: 'Counts as a homework grade.' })), /mentions/);
  assert.equal(academicWordingIn('Homework-free Friday'), 'homework');
});

test('ordinary classroom privileges are allowed — including ones that merely mention the warm-up', () => {
  ['Be the class DJ for the warm-up', 'Choose your seat for a day', 'Skip the line at the pencil sharpener', 'Lunch with the teacher', 'Contest judge for the day', 'Check out a class book', 'Stay five minutes late at recess with the teacher', 'Write a note to a friend on the board']
    .forEach((label) => assert.doesNotThrow(() => validateCatalogItem(item({ label })), label));
});

test('every starter suggestion is valid as-is and none touches academics', () => {
  assert.ok(STARTER_CLASS_REWARDS.length >= 3);
  STARTER_CLASS_REWARDS.forEach((starter) => {
    const cleaned = validateCatalogItem(starter);
    assert.equal(academicWordingIn(`${cleaned.label} ${cleaned.description}`), null);
  });
  const labels = STARTER_CLASS_REWARDS.map((entry) => entry.label);
  assert.ok(labels.includes('Choose your seat for a day'));
  assert.ok(labels.includes('Music with headphones during independent work'));
  assert.ok(labels.includes('Be the class DJ for the warm-up'));
});

test('limits: label 60, description 160, cost 10..500 whole, weekly 0..5', () => {
  assert.doesNotThrow(() => validateCatalogItem(item({ label: 'x'.repeat(60) })));
  assert.throws(() => validateCatalogItem(item({ label: 'x'.repeat(61) })), /60 characters/);
  assert.throws(() => validateCatalogItem(item({ label: '   ' })), /name/);
  assert.doesNotThrow(() => validateCatalogItem(item({ description: 'y'.repeat(160) })));
  assert.throws(() => validateCatalogItem(item({ description: 'y'.repeat(161) })), /160 characters/);
  [10, 500].forEach((cost) => assert.doesNotThrow(() => validateCatalogItem(item({ cost }))));
  [9, 501, 50.5, '50x', null, -50].forEach((cost) => assert.throws(() => validateCatalogItem(item({ cost })), /whole number from 10 to 500/, String(cost)));
  [0, 1, 5].forEach((weeklyLimitPerStudent) => assert.doesNotThrow(() => validateCatalogItem(item({ weeklyLimitPerStudent }))));
  assert.equal(validateCatalogItem(item({ weeklyLimitPerStudent: undefined })).weeklyLimitPerStudent, 0);
  [6, -1, 1.5].forEach((weeklyLimitPerStudent) => assert.throws(() => validateCatalogItem(item({ weeklyLimitPerStudent })), /weekly limit/));
  assert.throws(() => validateCatalogItem(item({ itemId: 'a b' })), /id/);
});

test('a catalog holds at most 12 items, unique ids, and no two active items with the same name', () => {
  const many = Array.from({ length: MAX_CATALOG_ITEMS + 1 }, (_, index) => item({ itemId: `item-${index}`, label: `Reward ${index}` }));
  assert.throws(() => validateCatalogInput({ classId: 'c', items: many }), /up to 12/);
  assert.doesNotThrow(() => validateCatalogInput({ classId: 'c', items: many.slice(0, MAX_CATALOG_ITEMS) }));
  assert.throws(() => validateCatalogInput({ classId: 'c', items: [item(), item()] }), /same id/);
  assert.throws(() => validateCatalogInput({ classId: 'c', items: [item(), item({ itemId: 'other', label: 'choose your seat for a day' })] }), /two rewards called/);
  // An inactive duplicate name is fine: the teacher is replacing it.
  assert.doesNotThrow(() => validateCatalogInput({ classId: 'c', items: [item(), item({ itemId: 'other', active: false })] }));
  assert.throws(() => validateCatalogInput({ items: [] }), /class/);
});

test('the stored catalog counts revisions and has no academic field anywhere', () => {
  const { items } = validateCatalogInput({ classId: 'c', items: [item()] });
  const first = buildCatalogDocument({ classId: 'c', items, at: 'now' });
  const second = buildCatalogDocument({ classId: 'c', items, previous: first, at: 'later' });
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  const keys = JSON.stringify(second).toLowerCase();
  ['grade', 'credit', 'assignment', 'excuse', 'waiver'].forEach((word) => assert.ok(!keys.includes(`"${word}`), word));
});

test('students are offered active items only, cheapest first', () => {
  const catalog = { items: [item({ itemId: 'a', label: 'A', cost: 60 }), item({ itemId: 'b', label: 'B', cost: 20 }), item({ itemId: 'c', label: 'C', cost: 30, active: false })] };
  assert.deepEqual(activeCatalogItems(catalog).map((entry) => entry.itemId), ['b', 'a']);
});

test('the school week starts Monday in Texas, not at midnight UTC', () => {
  // Monday Oct 5 2026, 12:30 AM Central = 05:30 UTC.
  assert.equal(schoolWeekKey(Date.parse('2026-10-05T05:30:00Z')), '2026-10-05');
  // Sunday Oct 4, 9 PM Central = Monday 02:00 UTC: still last week in Texas.
  assert.equal(schoolWeekKey(Date.parse('2026-10-05T02:00:00Z')), '2026-09-28');
  assert.equal(schoolWeekKey(Date.parse('2026-10-11T23:00:00Z')), '2026-10-05');
});

test('redemption: allowed, short balance, weekly limit (declined ones do not count), inactive, missing, price changed', () => {
  const week = '2026-10-05';
  const seat = item();
  assert.equal(evaluateClassRewardRedemption({ item: seat, balance: 50, weekKey: week }).eligible, true);
  const short = evaluateClassRewardRedemption({ item: seat, balance: 30, weekKey: week });
  assert.equal(short.code, 'insufficient-balance');
  assert.match(short.message, /20 more Class Points/);
  const used = [{ itemId: seat.itemId, weekKey: week, status: 'pending' }];
  assert.equal(evaluateClassRewardRedemption({ item: seat, balance: 500, weekKey: week, requestsThisWeek: used }).code, 'weekly-limit');
  // Last week's use, or a declined (refunded) one, does not count.
  assert.equal(evaluateClassRewardRedemption({ item: seat, balance: 500, weekKey: week, requestsThisWeek: [{ ...used[0], weekKey: '2026-09-28' }] }).eligible, true);
  assert.equal(evaluateClassRewardRedemption({ item: seat, balance: 500, weekKey: week, requestsThisWeek: [{ ...used[0], status: 'declined' }] }).eligible, true);
  assert.equal(weeklyUseCount([...used, { ...used[0], status: 'fulfilled' }], { itemId: seat.itemId, weekKey: week }), 2);
  // No limit at all.
  assert.equal(evaluateClassRewardRedemption({ item: item({ weeklyLimitPerStudent: 0 }), balance: 500, weekKey: week, requestsThisWeek: [...used, ...used] }).eligible, true);
  assert.equal(evaluateClassRewardRedemption({ item: item({ active: false }), balance: 500, weekKey: week }).code, 'inactive');
  assert.equal(evaluateClassRewardRedemption({ item: null, balance: 500, weekKey: week }).code, 'not-in-catalog');
  assert.equal(evaluateClassRewardRedemption({ item: seat, balance: 500, weekKey: week, expectedCost: 40 }).code, 'price-changed');
});

test('redeem and resolve inputs: a requestId is required; a decline needs a reason', () => {
  assert.throws(() => validateRedeemInput({ itemId: 'starter-seat' }), /request id/);
  assert.equal(validateRedeemInput({ itemId: 'starter-seat', requestId: 'r1', expectedCost: 50 }).expectedCost, 50);
  assert.throws(() => validateResolveInput({ requestDocId: 'crr_1', resolution: 'declined' }), /reason/);
  assert.throws(() => validateResolveInput({ requestDocId: 'crr_1', resolution: 'refunded' }), /fulfilled or declined/);
  assert.equal(validateResolveInput({ requestDocId: 'crr_1', resolution: 'fulfilled' }).reason, null);
});

test('resolution: pending → fulfilled never refunds; pending → declined refunds once; terminal states never change', () => {
  const pending = buildClassRewardRequest({
    requestDocId: 'crr_1', requestId: 'r1', studentId: 's', classId: 'c', item: item(), weekKey: '2026-10-05',
    debitTransactionId: 'crd_1', originTeacherEmail: 't', authorizedTeacherEmails: ['t'], at: 'then',
  });
  assert.equal(pending.status, CLASS_REWARD_REQUEST_STATUS.PENDING);
  assert.equal(pending.cost, 50);

  const fulfil = planRequestResolution(pending, { resolution: 'fulfilled', teacherEmail: 't', at: 'now' });
  assert.equal(fulfil.outcome, 'apply');
  assert.equal(fulfil.refund, false);
  assert.equal(fulfil.next.status, 'fulfilled');
  assert.equal(fulfil.next.declineReason, null);

  const decline = planRequestResolution(pending, { resolution: 'declined', reason: 'We ran out of seats', at: 'now' });
  assert.equal(decline.refund, true);
  assert.equal(decline.next.declineReason, 'We ran out of seats');
  assert.equal(decline.next.history.at(-1).status, 'declined');

  assert.equal(planRequestResolution(fulfil.next, { resolution: 'fulfilled', at: 'later' }).outcome, 'replay');
  assert.equal(planRequestResolution(decline.next, { resolution: 'declined', reason: 'x', at: 'later' }).outcome, 'replay');
  const flip = planRequestResolution(fulfil.next, { resolution: 'declined', reason: 'oops', at: 'later' });
  assert.equal(flip.outcome, 'refused');
  assert.match(flip.message, /already marked fulfilled/);
  assert.equal(planRequestResolution(decline.next, { resolution: 'fulfilled', at: 'later' }).outcome, 'refused');
});
