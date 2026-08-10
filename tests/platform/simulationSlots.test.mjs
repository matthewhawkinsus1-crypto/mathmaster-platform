import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSlot, deleteSnapshot, describeSimulatedDate, duplicateSlot, removeSlot, renameSlot,
  resolveSimulatedNow, restoreSnapshot, rewindTo, saveSnapshot, setSimulatedDate,
  simulatedDateInputValue, updateSlot,
} from '../../src/platform/simulation/simulationSlots.js';

const sessionWith = (timeline = []) => ({
  learner: { id: 'sim', gradesByAssignment: { a1: { 0: { status: 'attempted' } } } },
  extraAssignments: [{ id: 'sim-seed:baseline', questions: [] }],
  timeline,
});

const event = (id, at) => ({ id, at, kind: 'outcome', label: id, detail: '' });

// --- Slots -------------------------------------------------------------------

test('a slot holds one simulation and starts on the real clock', () => {
  const slot = createSlot({ name: 'Struggling student' });
  assert.equal(slot.name, 'Struggling student');
  assert.equal(slot.simulatedNow, null, 'a teacher who set no date sees today');
  assert.deepEqual(slot.snapshots, []);
});

test('slots are renamed and updated without touching their neighbours', () => {
  const slots = [createSlot({ name: 'A' }), createSlot({ name: 'B' })];
  const renamed = renameSlot(slots, slots[1].id, 'Advanced');
  assert.deepEqual(renamed.map((slot) => slot.name), ['A', 'Advanced']);
  assert.equal(renameSlot(slots, slots[0].id, '   ')[0].name, 'A', 'a blank name is not a name');

  const updated = updateSlot(slots, slots[0].id, { session: sessionWith() });
  assert.ok(updated[0].session);
  assert.equal(updated[1].session, null);
});

test('the last slot cannot be deleted away', () => {
  const slots = [createSlot({ name: 'Only' })];
  const after = removeSlot(slots, slots[0].id);
  assert.equal(after.length, 1, 'a simulator with no simulation has nothing to show');
  assert.notEqual(after[0].id, slots[0].id);
});

test('duplicating a slot gives an independent copy for the other branch', () => {
  const slots = [createSlot({ name: 'Base', session: sessionWith([event('e1', 10)]) })];
  const copied = duplicateSlot(slots, slots[0].id);
  assert.equal(copied.length, 2);
  assert.equal(copied[1].name, 'Base (copy)');
  assert.notEqual(copied[1].id, copied[0].id);

  // Change the copy; the original must not move.
  copied[1].session.learner.gradesByAssignment.a1[0].status = 'correct';
  assert.equal(copied[0].session.learner.gradesByAssignment.a1[0].status, 'attempted');
});

test('duplicating an unknown slot changes nothing', () => {
  const slots = [createSlot({ name: 'Base' })];
  assert.deepEqual(duplicateSlot(slots, 'nope'), slots);
});

// --- Snapshots ---------------------------------------------------------------

test('a snapshot captures the whole state, including CCMR evidence', () => {
  const slot = createSlot({ session: sessionWith([event('e1', 10)]) });
  const saved = saveSnapshot(slot, { label: 'Before question 4', ccmrOverrides: { 'x:act': { proficiency: 0.4 } } });
  assert.equal(saved.snapshots.length, 1);
  assert.equal(saved.snapshots[0].label, 'Before question 4');
  assert.equal(saved.snapshots[0].ccmrOverrides['x:act'].proficiency, 0.4,
    'a restored route that loses the assessment evidence is not the same state');
});

test('a snapshot with no label still gets one', () => {
  const slot = saveSnapshot(createSlot({ session: sessionWith() }), {});
  assert.match(slot.snapshots[0].label, /Snapshot 1/);
});

test('there is nothing to snapshot before a simulation starts', () => {
  const slot = createSlot({});
  assert.deepEqual(saveSnapshot(slot, { label: 'x' }).snapshots, []);
});

test('restore puts the state back and returns its evidence', () => {
  let slot = createSlot({ session: sessionWith([event('e1', 10)]) });
  slot = saveSnapshot(slot, { label: 'Before', ccmrOverrides: { 'x:act': { proficiency: 0.4 } } });

  // The teacher forces a different outcome after saving.
  slot = { ...slot, session: { ...slot.session, learner: { ...slot.session.learner, gradesByAssignment: { a1: { 0: { status: 'correct' } } } } } };
  assert.equal(slot.session.learner.gradesByAssignment.a1[0].status, 'correct');

  const restored = restoreSnapshot(slot, slot.snapshots[0].id);
  assert.equal(restored.restored, true);
  assert.equal(restored.slot.session.learner.gradesByAssignment.a1[0].status, 'attempted');
  assert.equal(restored.ccmrOverrides['x:act'].proficiency, 0.4);
});

test('restoring a snapshot that is not there changes nothing', () => {
  const slot = createSlot({ session: sessionWith() });
  const result = restoreSnapshot(slot, 'nope');
  assert.equal(result.restored, false);
  assert.equal(result.slot, slot);
});

test('a deleted snapshot is gone', () => {
  let slot = saveSnapshot(createSlot({ session: sessionWith() }), { label: 'One' });
  slot = deleteSnapshot(slot, slot.snapshots[0].id);
  assert.deepEqual(slot.snapshots, []);
});

// --- Rewind -------------------------------------------------------------------

test('rewinding restores the nearest snapshot at or before that point', () => {
  let slot = createSlot({ session: sessionWith([event('e1', 10)]) });
  slot = saveSnapshot(slot, { label: 'At e1' });
  slot.snapshots[0].at = 10;
  slot = { ...slot, session: { ...slot.session, timeline: [event('e1', 10), event('e2', 20), event('e3', 30)] } };

  const result = rewindTo(slot, 'e2');
  assert.equal(result.restored, true);
  assert.equal(result.snapshotLabel, 'At e1');
});

test('rewinding with no snapshot says so rather than pretending', () => {
  const slot = createSlot({ session: sessionWith([event('e1', 10)]) });
  const result = rewindTo(slot, 'e1');
  assert.equal(result.restored, false);
  assert.equal(result.reason, 'no-snapshot');
  assert.equal(result.slot, slot, 'and it leaves the state exactly where it was');
});

test('rewinding to a point that is not on the timeline is refused', () => {
  const slot = createSlot({ session: sessionWith([event('e1', 10)]) });
  assert.equal(rewindTo(slot, 'nope').reason, 'unknown-point');
});

// --- The simulated clock -------------------------------------------------------

test('no simulated date means the real clock', () => {
  const slot = createSlot({});
  const real = Date.parse('2026-10-26T15:00:00Z');
  assert.equal(resolveSimulatedNow(slot, real), real);
  assert.equal(describeSimulatedDate(slot), 'Today (real date)');
  assert.equal(simulatedDateInputValue(slot), '');
});

test('a simulated date is used everywhere instead of the real one', () => {
  const slot = setSimulatedDate(createSlot({}), '2026-11-02');
  const real = Date.parse('2026-10-26T15:00:00Z');
  const simulated = resolveSimulatedNow(slot, real);
  assert.notEqual(simulated, real);
  assert.equal(new Date(simulated).getFullYear(), 2026);
  assert.equal(new Date(simulated).getMonth(), 10);
  assert.equal(new Date(simulated).getDate(), 2, 'midday local, so the day cannot slip across a timezone');
  assert.equal(simulatedDateInputValue(slot), '2026-11-02');
});

test('clearing the date returns to the real clock', () => {
  const slot = setSimulatedDate(setSimulatedDate(createSlot({}), '2026-11-02'), '');
  assert.equal(slot.simulatedNow, null);
});

test('a nonsense date is ignored rather than producing an invalid clock', () => {
  const slot = setSimulatedDate(createSlot({}), 'not-a-date');
  assert.equal(slot.simulatedNow, null);
});

test('a snapshot remembers the date it was taken on', () => {
  const dated = setSimulatedDate(createSlot({ session: sessionWith() }), '2026-11-02');
  const saved = saveSnapshot(dated, { label: 'November' });
  const moved = setSimulatedDate(saved, '2027-01-15');
  const restored = restoreSnapshot(moved, moved.snapshots[0].id);
  assert.equal(simulatedDateInputValue(restored.slot), '2026-11-02');
});
