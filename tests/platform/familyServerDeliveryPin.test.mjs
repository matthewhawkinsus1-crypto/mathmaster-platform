/*
 * A PERSONALIZED QUESTION'S NUMBERS, PINNED ON THE SERVER BEFORE THE FIRST
 * SUBMIT (RT15, A2-76).
 *
 * A Question Family slot was pinned on the device the moment it rendered and
 * on the question record at the first Submit — and nowhere in between. A
 * student who started on one Chromebook and moved to another before
 * submitting was dealt a fresh allocation there, which differs whenever the
 * seats moved (a provisional seat, then the teacher's app seating the class):
 * different numbers under the work they had started.
 *
 * Now the pin rides the workspace draft. What must hold:
 *   - device A's pin travels through the real save path (patch, merge, read)
 *     and device B shows A's numbers, not its own fresh allocation;
 *   - it is checked exactly as a device pin is: one the server would refuse is
 *     dropped (and named), and the question falls back as before;
 *   - this device's own pin, and the question record's, still win;
 *   - the server keeps the first pin saved; a device sends one only where the
 *     server lacks it, or to replace one it had to drop;
 *   - the App waits for the server's pins before dealing a fresh allocation,
 *     but never long, and only for a student's own assignment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateQuestion } from '../../src/problemGenerator.js';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { buildStudentFamilyContext, writeLocalDeliveryPin } from '../../src/platform/generation/familyDelivery.js';
import {
  MAX_WORKSPACE_DELIVERY_PINS,
  buildWorkspaceDraftPatch,
  deliveryPinKey,
  mergeWorkspaceDraftDocument,
  readWorkspaceDeliveryPins,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { FAMILY_PIN_SERVER_WAIT_MS, createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const CLASS = 'class-p4';
const ASSIGNMENT_ID = 'asg-server-pins';
const TWO_STEP = { questionId: 'q1-two-step', type: 'stepAlgebra', prompt: 'Solve for x.', activityRole: 'classwork', questionFamily: { id: 'linear.twoStepEquation' } };

const memoryStore = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
};

const seating = (students) => {
  const assignment = { id: ASSIGNMENT_ID, schemaVersion: 5, generationSeats: { version: 1, byClassId: {} } };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: students });
  return assignment;
};

// One render on one device, as App.jsx does it: the context, the question,
// and the pin of what was shown (handleFamilyDelivery).
const render = ({ assignment, studentId, store, serverPins = null, record = null }) => {
  const context = buildStudentFamilyContext({ assignment, question: TWO_STEP, storageIndex: 0, studentId, classId: CLASS, store, serverPins, record });
  const rendered = generateQuestion(TWO_STEP, `${assignment.id}|${studentId}|0|variant:0`, null, null, context);
  assert.ok(rendered.familyDelivery, 'a family question reports what it showed');
  writeLocalDeliveryPin({ studentId, delivery: rendered.familyDelivery, store, devicePinDropped: Boolean(rendered.familyPinNotice) });
  return { context, rendered, delivery: rendered.familyDelivery };
};

// The server copy after a device saved `pins` through the real patch and merge.
const serverCopyWith = (studentId, pins, existing = null) => mergeWorkspaceDraftDocument({
  existing,
  patch: buildWorkspaceDraftPatch({ studentId, assignmentId: ASSIGNMENT_ID, deliveryPins: pins.map((pin) => ({ pin })) }),
});

// A student whose provisional instance (before the teacher's app seats them)
// and seated instance (after) differ — the case where a second device swapped.
const provisionalThenSeated = () => {
  for (let index = 0; index < 40; index += 1) {
    const studentId = `stu-moved-${index}`;
    const before = seating(['stu-ana', 'stu-ben']);
    const after = seating(['stu-ana', 'stu-ben', studentId]);
    const provisional = render({ assignment: before, studentId, store: memoryStore() }).delivery;
    const seated = render({ assignment: after, studentId, store: memoryStore() }).delivery;
    if (provisional.fingerprint !== seated.fingerprint) return { studentId, before, after, provisional, seated };
  }
  throw new Error('no student whose provisional and seated instances differ');
};

/* ------------------------------------------------------- the second device */

test('a second Chromebook shows the numbers the first one showed, before any Submit', () => {
  const { studentId, before, after, provisional, seated } = provisionalThenSeated();
  // Chromebook A shows the question while the student is not seated yet.
  const deviceA = memoryStore();
  const shownOnA = render({ assignment: before, studentId, store: deviceA }).delivery;
  assert.equal(shownOnA.fingerprint, provisional.fingerprint);
  // A's pin reaches the server copy through the real save path.
  const serverCopy = serverCopyWith(studentId, [shownOnA]);
  const serverPins = readWorkspaceDeliveryPins(serverCopy);
  assert.equal(serverPins.get(deliveryPinKey(shownOnA))?.fingerprint, shownOnA.fingerprint);

  // The teacher's app seats the class; the student opens Chromebook B.
  const without = render({ assignment: after, studentId, store: memoryStore() });
  assert.equal(without.delivery.fingerprint, seated.fingerprint, 'without the server pin, B deals the seated instance: different numbers');
  const deviceB = memoryStore();
  const onB = render({ assignment: after, studentId, store: deviceB, serverPins });
  assert.equal(onB.delivery.fingerprint, shownOnA.fingerprint, 'with it, B shows exactly what A showed');
  assert.equal(onB.context.pinSource, 'device', 'a device pin in every way: never authoritative');
  assert.equal(onB.rendered.familyPinNotice, undefined);
  assert.equal(onB.rendered.prompt, render({ assignment: before, studentId, store: deviceA }).rendered.prompt, 'the same question text');
  // B pinned it too: a reload there needs the server copy no longer.
  assert.equal(render({ assignment: after, studentId, store: deviceB }).delivery.fingerprint, shownOnA.fingerprint);
});

test('the server\'s pin is checked exactly as a device pin is: one the server would refuse is dropped and named', () => {
  const { studentId, after } = provisionalThenSeated();
  // A classmate's seated pin, planted in this student's server copy.
  const classmatePin = render({ assignment: after, studentId: 'stu-ana', store: memoryStore() }).delivery;
  const serverPins = readWorkspaceDeliveryPins(serverCopyWith(studentId, [classmatePin]));
  const own = render({ assignment: after, studentId, store: memoryStore() });
  const planted = render({ assignment: after, studentId, store: memoryStore(), serverPins });
  assert.equal(planted.context.pin, null, 'the classmate\'s pin is not used');
  assert.equal(planted.context.devicePinRefused, 'pin-seat-not-held', 'and the refusal is named');
  assert.equal(planted.delivery.fingerprint, own.delivery.fingerprint, 'the student is dealt their own allocation, as before');
  assert.ok(planted.rendered.familyPinNotice, 'the question says a pin was dropped, so the server copy is replaced');
});

test('this device\'s own pin, and the question record\'s, still win over the server copy', () => {
  const { studentId, before, after, provisional, seated } = provisionalThenSeated();
  const serverPins = readWorkspaceDeliveryPins(serverCopyWith(studentId, [provisional]));
  // This device already showed the seated instance: it keeps showing it.
  const device = memoryStore();
  render({ assignment: after, studentId, store: device });
  assert.equal(render({ assignment: after, studentId, store: device, serverPins }).delivery.fingerprint, seated.fingerprint);
  // Submitted: the record's canonical pin decides, whatever the server copy says.
  const record = { variantIndex: 0, familyDelivery: seated };
  const canonical = render({ assignment: before, studentId, store: memoryStore(), serverPins, record });
  assert.equal(canonical.context.pinSource, 'canonical');
  assert.equal(canonical.delivery.fingerprint, seated.fingerprint);
  // A pin of another variant (before "New Question") is not this question's.
  const otherVariant = readWorkspaceDeliveryPins(serverCopyWith(studentId, [{ ...provisional, variant: 1, index: provisional.index + provisional.stride, resolvedIndex: provisional.resolvedIndex + provisional.stride }]));
  assert.equal(render({ assignment: after, studentId, store: memoryStore(), serverPins: otherVariant }).delivery.fingerprint, seated.fingerprint);
  // A teacher's preview never reads a student's pins.
  const preview = buildStudentFamilyContext({ assignment: after, question: TWO_STEP, storageIndex: 0, studentId, classId: CLASS, store: memoryStore(), serverPins, preview: true });
  assert.equal(preview.pin, null);
});

test('a device pin the server would refuse gives way to the server copy\'s, and is replaced by it', () => {
  const { studentId, before, after, provisional } = provisionalThenSeated();
  const device = memoryStore();
  // A pin on this device naming a seat this student never held.
  writeLocalDeliveryPin({ studentId, delivery: render({ assignment: after, studentId: 'stu-ben', store: memoryStore() }).delivery, store: device });
  const serverPins = readWorkspaceDeliveryPins(serverCopyWith(studentId, [provisional]));
  const shown = render({ assignment: after, studentId, store: device, serverPins });
  assert.equal(shown.delivery.fingerprint, provisional.fingerprint, 'the server copy\'s pin is shown');
  assert.equal(shown.context.devicePinRefused, 'pin-seat-not-held', 'the device pin is named as dropped');
  assert.equal(render({ assignment: before, studentId, store: device }).delivery.fingerprint, provisional.fingerprint, 'and the device now holds what it showed');
});

/* ------------------------------------------------------- the server copy */

test('the server copy keeps the first pin saved, replaces it only when asked or unreadable, and stays bounded', () => {
  const { studentId, provisional, seated } = provisionalThenSeated();
  const first = serverCopyWith(studentId, [provisional]);
  assert.equal(readWorkspaceDeliveryPins(first).get(deliveryPinKey(provisional)).fingerprint, provisional.fingerprint);
  // A second device saving another pin for the same slot does not displace it.
  const second = serverCopyWith(studentId, [seated], first);
  assert.equal(readWorkspaceDeliveryPins(second).get(deliveryPinKey(provisional)).fingerprint, provisional.fingerprint);
  // A device that had to drop it replaces it.
  const replaced = mergeWorkspaceDraftDocument({
    existing: first,
    patch: buildWorkspaceDraftPatch({ studentId, assignmentId: ASSIGNMENT_ID, deliveryPins: [{ pin: seated, replace: true }] }),
  });
  assert.equal(readWorkspaceDeliveryPins(replaced).get(deliveryPinKey(seated)).fingerprint, seated.fingerprint);
  // One this build cannot read is replaced by the next save.
  const unreadable = { ...first, deliveryPins: [{ slot: provisional.slot, variant: 0, familyId: '' }] };
  assert.equal(readWorkspaceDeliveryPins(unreadable).size, 0, 'a malformed pin is not read');
  assert.equal(readWorkspaceDeliveryPins(serverCopyWith(studentId, [seated], unreadable)).get(deliveryPinKey(seated)).fingerprint, seated.fingerprint);
  // A save of drafts alone keeps every pin.
  const draftsOnly = mergeWorkspaceDraftDocument({
    existing: first,
    patch: buildWorkspaceDraftPatch({ studentId, assignmentId: ASSIGNMENT_ID, entries: [{ key: `mathmaster:draft:v2::${studentId}:${ASSIGNMENT_ID}:0:0:student:literal`, value: 'x = 3', savedAt: 5, savedAtIsEdit: true, questionIndex: 0, variantIndex: 0 }] }),
  });
  assert.equal(readWorkspaceDeliveryPins(draftsOnly).size, 1);
  // A document with no pins is stored exactly as before: no field at all.
  assert.equal('deliveryPins' in mergeWorkspaceDraftDocument({ existing: null, patch: buildWorkspaceDraftPatch({ studentId, assignmentId: ASSIGNMENT_ID }) }), false);
  assert.equal('deliveryPins' in buildWorkspaceDraftPatch({ studentId, assignmentId: ASSIGNMENT_ID }), false);
  // Bounded: past the cap, a new slot's pin stays on its device.
  const many = Array.from({ length: MAX_WORKSPACE_DELIVERY_PINS + 5 }, (_, index) => ({ ...provisional, slot: `${provisional.slot}#${index}` }));
  assert.equal(readWorkspaceDeliveryPins(serverCopyWith(studentId, many)).size, MAX_WORKSPACE_DELIVERY_PINS);
});

const manualScheduler = () => {
  const queue = [];
  return {
    set: (callback) => { queue.push(callback); return queue.length; },
    clear: () => {},
    runAll: () => { while (queue.length) queue.shift()(); },
  };
};

test('a device sends its pin only where the server has none — or to replace one it dropped — and only once', async () => {
  const { studentId, provisional, seated } = provisionalThenSeated();
  const sent = [];
  const scheduler = manualScheduler();
  const sync = createWorkspaceDraftSync({
    studentId,
    assignmentId: ASSIGNMENT_ID,
    scheduler,
    flush: async ({ document }) => { sent.push(document); return { written: true, droppedKeys: [] }; },
  });
  // Before the server copy is known, a pin waits: opening a question costs no write.
  assert.equal(sync.recordDeliveryPin(provisional), false);
  scheduler.runAll();
  await Promise.resolve();
  assert.equal(sent.length, 0);
  // The server holds none: the waiting pin is sent with the next save.
  sync.noteServerCopy([], { deliveryPins: new Map() });
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].deliveryPins.map(({ pin }) => pin.fingerprint), [provisional.fingerprint]);
  assert.equal(sent[0].deliveryPins[0].replace, undefined);
  // Acknowledged: the same pin, or another for that slot, is not sent again.
  assert.equal(sync.recordDeliveryPin(provisional), false);
  assert.equal(sync.recordDeliveryPin(seated), false, 'the server keeps the first pin saved');
  // A device that had to drop it replaces it.
  assert.equal(sync.recordDeliveryPin(seated, { replace: true }), true);
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].deliveryPins, [{ pin: sent[1].deliveryPins[0].pin, replace: true }]);
  assert.equal(sent[1].deliveryPins[0].pin.fingerprint, seated.fingerprint);

  // A server copy that already holds this pin: nothing to send.
  const other = createWorkspaceDraftSync({ studentId, assignmentId: ASSIGNMENT_ID, scheduler, flush: async ({ document }) => { sent.push(document); return {}; } });
  other.noteServerCopy([], { deliveryPins: readWorkspaceDeliveryPins(serverCopyWith(studentId, [provisional])) });
  assert.equal(other.recordDeliveryPin(provisional), false);
  assert.equal(other.recordDeliveryPin(seated), false);
  assert.equal(other.recordDeliveryPin({ slot: '', fingerprint: 'x' }), false, 'a malformed pin is never sent');
});

/* ------------------------------------------------------- the App */

test('App reads the server\'s pins with the draft copy, waits for them before a fresh allocation, and sends what it shows', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const effect = region(app, 'const readServerCopy = () => {', 'readServerCopy();\n', 'readServerCopy');
  // The pins are read with the copy, set for this assignment, and told to the sync.
  assert.match(effect, /const deliveryPins = readWorkspaceDeliveryPins\(stored\);\s*startTransition\(\(\) => setServerDeliveryPins\(\{ assignmentId: activeAssignmentId, known: true, pins: deliveryPins \}\)\);/);
  assert.match(effect, /sync\.noteServerCopy\(entries, \{ deliveryPins \}\);/);
  // A failed read stops the wait.
  assert.match(region(effect, '.catch((error) => {', '.finally(', 'the catch'), /if \(!cancelled\) stopWaitingForPins\(\);/);
  // So does the clock, and each new assignment starts unknown.
  const sync = region(app, 'const activeAssignmentUsesWorkspaceDrafts = useMemo(', '}, [user?.role, user?.id, user?.classId, activeAssignmentId, isTeacherPreview, activeAssignmentUsesWorkspaceDrafts]);', 'the draft sync');
  assert.match(sync, /setServerDeliveryPins\(\{ assignmentId: activeAssignmentId, known: false, pins: null \}\);/);
  assert.match(sync, /const pinWait = window\.setTimeout\(\(\) => \{ if \(!cancelled\) stopWaitingForPins\(\); \}, FAMILY_PIN_SERVER_WAIT_MS\);/);
  assert.match(sync, /window\.clearTimeout\(pinWait\);/);
  assert.ok(FAMILY_PIN_SERVER_WAIT_MS > 0 && FAMILY_PIN_SERVER_WAIT_MS <= 5000, 'the wait is short');

  // The question's context reads them; a fresh allocation waits for them.
  const view = region(app, 'const renderAssignmentWorkspace = (preview = false) => {', 'const currentAdaptation = ', 'the question context');
  assert.match(view, /serverPins: serverPinsRead \? serverDeliveryPins\.pins : null,/);
  assert.match(view, /const serverPinsRead = serverDeliveryPins\.assignmentId === assignment\.id && serverDeliveryPins\.known;/);
  const pending = region(view, 'const familyPinPending = ', ';', 'familyPinPending');
  for (const condition of [/!preview/, /user\?\.role === 'student'/, /!isTeacherPreview/, /activeAssignmentUsesWorkspaceDrafts/, /!serverPinsRead/, /!currentFamilyContext\.pin\b/, /!currentFamilyContext\.pinUnreadable/]) {
    assert.match(pending, condition, `the wait requires ${condition}`);
  }
  assert.match(app, /\{familyEngineLoading \|\| familyPinPending \? <p role="status"[^>]*>Loading this question…<\/p> : <QuestionEngine/);
  // The wait ends in a transition, both ways (pins read, or the wait timed out):
  // the question it held back mounts while QuestionEngine's code may still be
  // loading, and an ordinary update would hide the workspace behind the app's
  // "Loading your MathMaster workspace…" until it came.
  assert.match(app, /^import \{[^}]*\bstartTransition\b[^}]*\} from 'react';$/m);
  assert.match(app, /const stopWaitingForPins = \(\) => startTransition\(\(\) => setServerDeliveryPins\(/);
  assert.match(app, /startTransition\(\(\) => setServerDeliveryPins\(\{ assignmentId: activeAssignmentId, known: true, pins: deliveryPins \}\)\);/);
  // Every update that ends the wait is one of those two.
  assert.equal(app.match(/setServerDeliveryPins\(\{ assignmentId: activeAssignmentId, known: true/g)?.length, 1);

  // What is shown is pinned on the server too, replacing a pin it had to drop.
  const delivery = region(app, 'const handleFamilyDelivery = useCallback(', '}, [user?.role, user?.id, isTeacherPreview]);', 'handleFamilyDelivery');
  assert.match(delivery, /workspaceDraftSyncRef\.current\?\.recordDeliveryPin\(delivery, \{ replace: Boolean\(renderedQuestion\?\.familyPinNotice\) \}\);/);
});
