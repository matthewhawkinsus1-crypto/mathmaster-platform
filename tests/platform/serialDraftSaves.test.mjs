import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, region } from './helpers/sourceContract.mjs';
import { createSerialSaver, newDraftWriterId } from '../../src/platform/assessment/serialDraftSaves.js';

/*
 * ONE DRAFT SAVE AT A TIME (Codex review, PR #461).
 *
 * An autosave for answer A was in flight when the student typed B and moved
 * on; the move started a second save without waiting, and the older request
 * could land last and become the graded draft. Saves now go one at a time,
 * each sending whatever is pending when its turn comes, and every request
 * carries this page's writer id and a rising revision the server checks.
 */

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => { setImmediate(resolve); });

test('a second save waits for the one on its way, then sends what is pending then', async () => {
  const sends = [];
  const gates = [deferred(), deferred()];
  let pending = 'A';
  const save = createSerialSaver(() => {
    const index = sends.length;
    sends.push(pending);
    return gates[index].promise;
  });
  const first = save();
  await tick();
  assert.deepEqual(sends, ['A'], 'the first save is on its way with A');
  pending = 'B';
  const second = save();
  await tick();
  assert.deepEqual(sends, ['A'], 'the second save has not started while the first is in flight');
  gates[0].resolve({ ok: true, sent: 'A' });
  assert.deepEqual(await first, { ok: true, sent: 'A' });
  await tick();
  assert.deepEqual(sends, ['A', 'B'], 'then it sends the newest draft');
  gates[1].resolve({ ok: true, sent: 'B' });
  assert.deepEqual(await second, { ok: true, sent: 'B' });
});

test('a save that fails does not hold up the next one', async () => {
  let calls = 0;
  const save = createSerialSaver(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
    return { ok: true };
  });
  await assert.rejects(save(), /network/);
  assert.deepEqual(await save(), { ok: true });
  assert.equal(calls, 2);
});

test('each page has its own writer id, in the shape the server accepts', () => {
  const first = newDraftWriterId();
  const second = newDraftWriterId();
  assert.match(first, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(first, second);
});

test('the secure test saves through the serial saver, and stamps every answer draft', () => {
  const container = componentSource('src/components/assessment/SecureExamContainer.jsx');
  assert.match(container, /^import \{ createSerialSaver, newDraftWriterId \} from '\.\.\/\.\.\/platform\/assessment\/serialDraftSaves\.js';$/m);
  // saveDraftNow — what the timer, a move, resume and Submit all await — is the serial saver.
  assert.match(container, /if \(!serialSaveRef\.current\) serialSaveRef\.current = createSerialSaver\(\(\) => sendPendingDraftRef\.current\(\)\);/);
  assert.match(container, /const saveDraftNow = useCallback\(\(\) => serialSaveRef\.current\(\), \[\]\);/);
  // The send reads the pending draft when its turn comes, not when it was queued.
  const send = region(container, 'const sendPendingDraft = useCallback(async () => {', '}, [mergeSaveResult]);', 'send');
  assert.match(send, /^\s*const pending = pendingDraftRef\.current;/m);
  // One writer per page; the revision rises with every stamp.
  assert.match(container, /if \(!draftWriterRef\.current\) draftWriterRef\.current = newDraftWriterId\(\);/);
  assert.match(region(container, 'const nextDraftStamp = useCallback(() => {', '}, []);', 'stamp'), /draftRevisionRef\.current \+= 1;\s*return \{ draftWriter: draftWriterRef\.current, draftRevision: draftRevisionRef\.current \};/);
  // Both requests that carry an answer draft are stamped: an edit, and the device copy sent back.
  assert.match(container, /responsePayload, supportUsage: usage, \.\.\.nextDraftStamp\(\) \}/);
  assert.match(container, /responsePayload: restored, supportUsage: \{\}, \.\.\.nextDraftStamp\(\) \}/);
  // And the service passes the stamp to the callable with the draft.
  const service = componentSource('src/services/secureExamService.js');
  const save = region(service, 'export const saveSecureExamDraft = async (', '\n};', 'service save');
  assert.match(save, /const stamp = hasPayload && typeof draftWriter === 'string' && Number\.isSafeInteger\(draftRevision\) \? \{ draftWriter, draftRevision \} : \{\};/);
  assert.match(save, /call\('saveSecureExamDraft', \{ examSessionId, questionInstanceId, \.\.\.\(hasPayload \? \{ responsePayload, supportUsage \} : \{\}\), \.\.\.stamp, \.\.\.flag \}\)/);
});
