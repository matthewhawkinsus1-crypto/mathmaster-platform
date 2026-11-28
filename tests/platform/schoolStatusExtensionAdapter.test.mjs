// The SchoolStatus extension's page side: lib/schoolStatusAdapter.js chains
// the page steps (lib/schoolStatusPage.js) that find a student, list the
// parents and guardians, and send one text each. Here a scripted fake answers
// each step the way SchoolStatus Classic's pages did when read on 2026-11-27;
// the page module itself runs only in Chrome, so its last checks before Send
// are pinned by region below.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { createSchoolStatusAdapter, isParentOrGuardian, sameDistrictId } from '../../extensions/schoolstatus-messages/lib/schoolStatusAdapter.js';

// A clock the waits move, so nothing really sleeps.
const clock = () => {
  let t = 0;
  return { now: () => t, wait: async (ms) => { t += ms; } };
};

const page = (answers) => {
  const calls = [];
  const run = async (action, args) => {
    calls.push({ action, args });
    const answer = answers[action];
    if (typeof answer === 'function') return answer(args, calls);
    if (answer === undefined) throw new Error(`unexpected step ${action}`);
    return answer;
  };
  return { run, calls, steps: () => calls.map((call) => call.action) };
};

const student = (overrides = {}) => ({
  where: { page: 'app' },
  home: { ok: true },
  atHome: { ok: true },
  search: { ok: true },
  searchResults: { count: 1 },
  openResult: { ok: true },
  readStudent: { studentKey: 'uuid-1', sis: '0150101', name: 'Ada Lovelace' },
  openContacts: { ok: true },
  readContacts: {
    contacts: [
      { index: 0, relationship: 'Mother', canText: true },
      { index: 1, relationship: 'Father', canText: false },
      { index: 2, relationship: 'Grandmother', canText: true },
      { index: 3, relationship: 'Emergency Contact', canText: true },
      { index: 4, relationship: 'Legal Guardian', canText: true },
    ],
  },
  ...overrides,
});

const adapterFor = (answers) => {
  const time = clock();
  const fake = page(answers);
  return { fake, adapter: createSchoolStatusAdapter({ run: fake.run, wait: time.wait, now: time.now }) };
};

test('a student is found by SIS ID and checked on their own page; only parents and guardians who can get a text are listed', async () => {
  const { fake, adapter } = adapterFor(student());
  const found = await adapter.findStudent({ sisStudentId: '150101', studentName: 'Ada Lovelace' });
  assert.deepEqual(found, { ok: true, guardians: [{ index: 0, relationship: 'Mother' }, { index: 4, relationship: 'Legal Guardian' }], skipped: 3 });
  assert.deepEqual(fake.steps(), ['home', 'atHome', 'search', 'searchResults', 'openResult', 'readStudent', 'openContacts', 'readContacts']);
  assert.equal(fake.calls.find((call) => call.action === 'readContacts').args.studentKey, 'uuid-1', 'the contacts of the student just checked');
});

for (const [name, overrides, reason] of [
  ['no result', { searchResults: { count: 0 } }, /No SchoolStatus student has that district ID/],
  ['several results', { searchResults: { count: 2 } }, /found 2 students/],
  ['a different SIS ID on the page', { readStudent: { studentKey: 'u', sis: '150102', name: 'Ada Lovelace' } }, /different SIS ID/],
  ['another name on the page', { readStudent: { studentKey: 'u', sis: '150101', name: 'Grace Lovelace' } }, /does not match/],
]) {
  test(`${name}: not this student, and the contacts are never opened`, async () => {
    const { fake, adapter } = adapterFor(student(overrides));
    const found = await adapter.findStudent({ sisStudentId: '150101', studentName: 'Ada Lovelace' });
    assert.equal(found.ok, false);
    assert.match(found.reason, reason);
    assert.ok(!fake.steps().includes('openContacts'));
  });
}

test('a text box: the right guardian, exactly the message, then Send; nothing sends without a fill', async () => {
  const { fake, adapter } = adapterFor({
    ...student(),
    openThread: { ok: true },
    readThread: { ready: true, maxLength: 480, own: 4, typedLength: 0 },
    fill: ({ body }) => ({ exact: true, counted: body.length, sendEnabled: true }),
    pressSend: { pressed: true },
  });
  await assert.rejects(adapter.pressSend(), /Nothing is ready to send/);
  const opened = await adapter.openThread({ index: 0, relationship: 'Mother' });
  assert.deepEqual(opened, { ok: true, maxLength: 480 });
  await adapter.fill({ body: 'Hello.' });
  await adapter.pressSend();
  const press = fake.calls.find((call) => call.action === 'pressSend');
  assert.deepEqual(press.args, { body: 'Hello.', relationship: 'Mother' }, 'the page checks both again before it presses');
});

test('a fill that SchoolStatus did not take exactly stops the run before any Send', async () => {
  for (const fill of [{ exact: false, counted: 6, sendEnabled: true }, { exact: true, counted: 5, sendEnabled: true }, { exact: true, counted: 6, sendEnabled: false }]) {
    const { fake, adapter } = adapterFor({ ...student(), openThread: { ok: true }, readThread: { ready: true, maxLength: 480, own: 0, typedLength: 0 }, fill });
    await adapter.openThread({ index: 0, relationship: 'Mother' });
    await assert.rejects(adapter.fill({ body: 'Hello.' }), (error) => error.stopRun === true);
    await assert.rejects(adapter.pressSend(), /Nothing is ready to send/);
    assert.ok(!fake.steps().includes('pressSend'));
  }
});

test('a draft already in the box is cleared before anything is typed', async () => {
  const { fake, adapter } = adapterFor({ ...student(), openThread: { ok: true }, readThread: { ready: true, maxLength: 480, own: 0, typedLength: 12 }, clear: { ok: true, empty: true } });
  assert.equal((await adapter.openThread({ index: 0, relationship: 'Mother' })).ok, true);
  assert.deepEqual(fake.steps(), ['openThread', 'readThread', 'clear']);
});

const sentAdapter = (readSent) => adapterFor({
  ...student(),
  openThread: { ok: true },
  readThread: { ready: true, maxLength: 480, own: 4, typedLength: 0 },
  fill: ({ body }) => ({ exact: true, counted: body.length, sendEnabled: true }),
  pressSend: { pressed: true },
  readSent,
});

test('after Send: the new text in the conversation is "seen"; marked undelivered, it did not reach that guardian', async () => {
  const delivered = sentAdapter(({ ownBefore }) => ({ appeared: true, status: '', textMatches: true, ownBefore }));
  await delivered.adapter.openThread({ index: 0, relationship: 'Mother' });
  await delivered.adapter.fill({ body: 'Hello.' });
  await delivered.adapter.pressSend();
  assert.deepEqual(await delivered.adapter.confirmSent(), { seen: true, delivered: true, reason: '' });
  assert.equal(delivered.fake.calls.find((call) => call.action === 'readSent').args.ownBefore, 4, 'counted against the conversation before Send');

  let reads = 0;
  const undelivered = sentAdapter(() => { reads += 1; return reads < 3 ? { appeared: true, status: '' } : { appeared: true, status: 'undelivered' }; });
  await undelivered.adapter.openThread({ index: 0, relationship: 'Mother' });
  await undelivered.adapter.fill({ body: 'Hello.' });
  await undelivered.adapter.pressSend();
  assert.deepEqual(await undelivered.adapter.confirmSent(), { seen: true, delivered: false, reason: 'undelivered' });
});

test('after Send: no new text, or an error, is not seen', async () => {
  const none = sentAdapter({ appeared: false, error: false });
  await none.adapter.openThread({ index: 0, relationship: 'Mother' });
  await none.adapter.fill({ body: 'Hello.' });
  await none.adapter.pressSend();
  assert.equal((await none.adapter.confirmSent()).seen, false);

  const failed = sentAdapter({ appeared: false, error: true });
  await failed.adapter.openThread({ index: 0, relationship: 'Mother' });
  await failed.adapter.fill({ body: 'Hello.' });
  await failed.adapter.pressSend();
  assert.deepEqual(await failed.adapter.confirmSent(), { seen: false, reason: 'SchoolStatus showed an error after Send.' });
});

test('signed out or off SchoolStatus stops the run', async () => {
  for (const [where, pattern] of [[{ page: 'signin' }, /signed out/], [{ page: 'other' }, /not on SchoolStatus/]]) {
    const { adapter } = adapterFor({ where });
    await assert.rejects(adapter.where(), (error) => error.stopRun === true && pattern.test(error.message));
  }
});

test('who counts as a parent or guardian, and district IDs with leading zeros', () => {
  for (const yes of ['Mother', 'Father', 'Guardian', 'Legal Guardian', 'Stepmother', 'step-father', 'Foster Parent', 'Parent/Guardian']) assert.ok(isParentOrGuardian(yes), yes);
  for (const no of ['Grandmother', 'Emergency Contact', 'Aunt', 'Student', 'Self', 'Counselor', '', 'Mother-in-law']) assert.equal(isParentOrGuardian(no), false, no);
  assert.ok(sameDistrictId('0150101', '150101'));
  assert.equal(sameDistrictId('150101', '150102'), false);
  assert.equal(sameDistrictId('', ''), false);
  assert.equal(sameDistrictId('15O101', '150101'), false, 'digits only');
});

test('the page presses Send only for the right guardian, with exactly the message, and never returns contact details', () => {
  const source = executableSource(readFileSync('extensions/schoolstatus-messages/lib/schoolStatusPage.js', 'utf8'));
  const press = region(source, "case 'pressSend': {", "case 'readSent': {", 'the press');
  const click = press.indexOf('button.click();');
  assert.ok(click > 0);
  for (const guard of ["endsWith(`'s ${args.relationship}`)", 'typedText() !== norm(args.body)', 'button.disabled']) {
    const at = press.indexOf(guard);
    assert.ok(at > 0 && at < click, `${guard} is checked before the click`);
  }
  assert.equal(source.match(/\.click\(\)/g)?.length, 4, 'search result, Contacts tab, a contact\'s Text button, Send: nothing else is clicked');
  const contacts = region(source, "case 'readContacts': {", "case 'openThread': {", 'the contact list');
  assert.match(contacts, /contacts: cards\.map\(\(entry, index\) => \(\{ index, relationship: relationshipOf\(entry\.card\), canText: !entry\.chat\.disabled \}\)\)/, 'a relationship and whether a text can go: no name, number or email');
});
