/*
 * AN UNDO INTO A DAMAGED SAVED STEP NO LONGER STOPS THE QUESTION, AND VALID
 * SAVED STEPS COME BACK EXACTLY AS SAVED.
 *
 * Twenty-odd tools keep their Undo history across a reload (persistedMathUndo.js),
 * in the same storage as the draft, and as open to damage: an older build, a
 * Chromebook's storage, anything that rewrote it. A draft is read back through
 * each field's checks (usePersistentToolState.js, hydrateToolDraftField; the
 * November build's handoff, section 2), but an Undo handed a saved step to the
 * tool's setters unchecked. A step holding a value the tool cannot draw threw
 * in the render after the press, and the question showed "This question could
 * not be displayed" (section 6 of the same handoff).
 *
 * The damage is the fixture's: every place a damaged draft once threw
 * (fixtures/toolDraftDamageCases.json), put into a saved Undo step of the tool
 * that holds that field, with the rest of the step the state the student is
 * in. On the build before this fix 111 of the 122 such steps threw on one press
 * of Undo, in node here and in Chromium in the real QuestionEngine. Now the
 * press shows the field exactly as a reload of the same damaged value shows it
 * (the draft's repair keeps the valid part), and a step whose value the draft
 * repair would not keep at all is skipped rather than written over the work.
 *
 * The other half: every valid state the tools wrote in Chromium
 * (fixtures/toolDraftValidRecords.json), saved as a history, is read back as
 * the very values saved, and each press of Undo lands on the saved step.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { openToolUndoRenderer, errorText } from './helpers/toolUndoRender.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const CASES = JSON.parse(read('tests/platform/fixtures/toolDraftDamageCases.json')).cases;
const VALID = JSON.parse(read('tests/platform/fixtures/toolDraftValidRecords.json')).scenes;

let rendererPromise = null;
const renderer = () => { rendererPromise ||= openToolUndoRenderer({ cacheName: 'tool-undo-damage' }); return rendererPromise; };
after(async () => { if (rendererPromise) await (await rendererPromise).close(); });

const sceneById = async (id) => {
  const scene = (await renderer()).scenes.find((candidate) => candidate.id === id);
  assert.ok(scene, `scene ${id}`);
  return scene;
};
const without = (record, field) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));

// The registry tools whose Undo history is kept across a reload: every
// useFieldUndoHistory tool, and the useMathUndoHistory calls with `persist`.
// The last test fails when a tool joins or leaves without this list.
const TOOLS_WITH_SAVED_HISTORY = [
  'complexPlaneLab', 'dataModelingLab', 'exponentialLogBridge', 'functionOperationsLab', 'inverseCompositionLab', 'openSortBoard',
  'parabolaGeometryLab', 'polynomialWorkshop', 'representationBridge', 'representationMatch', 'signSolutionAnalyzer', 'systemsWorkspace',
];

// Every key a saved history records names the draft field it is restored
// through (useMathUndoHistory's `draftFields`), or a saved step's value for it
// would reach the tool unchecked.
const assertDeclared = (scene, owners) => owners.forEach((owner, ownerId) => {
  if (!owner.persistKey) return;
  const missing = Object.keys(owner.state || {}).filter((key) => !owner.draftFields.includes(key));
  assert.deepEqual(missing, [], `${scene.id} ${ownerId}: each key names its draft field (draftFields)`);
});

test('an Undo into a damaged saved step shows the field as its draft repair does, or skips the step', async (t) => {
  const r = await renderer();
  const same = (a, b) => r.mathematicalSnapshot(a) === r.mathematicalSnapshot(b);
  let reached = 0;
  let restored = 0;
  let skipped = 0;
  for (const damage of CASES) {
    const label = `${damage.scene} ${damage.field} (${damage.damage})`;
    const scene = await sceneById(damage.scene);
    if (!TOOLS_WITH_SAVED_HISTORY.includes(scene.toolId)) continue;
    const rest = without(damage.record, damage.field);
    // The question as the student has it: the draft without the damaged value.
    const before = await r.open(scene, { record: rest });
    await before.close();
    const owner = [...before.owners.values()].find((entry) => entry.persistKey && Object.prototype.hasOwnProperty.call(entry.state, damage.field));
    if (!owner) continue;
    reached += 1;
    // The same value read back as a draft: what its repair shows.
    const asDraft = await r.open(scene, { record: damage.record });
    await asDraft.close();
    const repair = asDraft.hydrated.find((entry) => entry.field === damage.field)?.result;
    const repaired = asDraft.owners.get(owner.ownerId)?.state?.[damage.field];
    assert.ok(repair, `${label}: the draft read the field`);
    // ... and as the step one Undo goes back to.
    r.saveHistory(owner, [{ ...owner.state, [damage.field]: damage.record[damage.field] }]);
    const opened = await r.open(scene, { record: rest, draftKey: before.draftKey });
    const couldUndo = opened.canUndo();
    await opened.undo();
    await opened.close();
    assert.deepEqual(errorText(opened), [], `${label}: Undo does not throw`);
    assert.doesNotMatch(opened.text(), /could not be displayed/, `${label}: the question is still on screen`);
    assert.match(opened.text(), /\S/, `${label}: the tool drew something`);
    const now = opened.owners.get(owner.ownerId).state;
    if (repair.restored && !same(repaired, owner.state[damage.field])) {
      restored += 1;
      assert.ok(couldUndo, `${label}: the repaired step can be undone to`);
      assert.ok(same(now[damage.field], repaired), `${label}: Undo shows ${damage.field} as a reload shows it`);
    } else {
      // Nothing the draft would keep, or nothing that differs from now: the
      // step is gone, and the work on screen stays.
      skipped += 1;
      assert.equal(couldUndo, false, `${label}: the step is skipped`);
      assert.ok(same(now, owner.state), `${label}: the work stays`);
    }
  }
  t.diagnostic(`${reached} damaged steps: ${restored} repaired, ${skipped} skipped`);
  // 122 when written: 18 repaired and shown as a reload shows them, 85 the
  // draft repair keeps nothing of, 19 whose repair is the state already shown.
  assert.ok(reached >= 120, `the damage reaches the saved histories of the tools that keep one (${reached})`);
  assert.ok(restored >= 10 && skipped >= 10, `both outcomes are exercised (${restored} repaired, ${skipped} skipped)`);
});

test('a key kept inside a field (the 3×3 board\'s checks) is repaired as that field is', async () => {
  // EquationByEquationMode records `verification`, the property of that name
  // of its stored check (`draftFields: { verification: [setStoredCheck, 'verification'] }`).
  const r = await renderer();
  const scene = await sceneById('extra:systemsWorkspace-algebraic-studentChoice');
  const damaged = { 0: { placed: { x: true }, leftAnswer: '2', rightAnswer: 7, checked: 'yes', valid: false }, 1: 'not a check' };
  const asDraft = await r.open(scene, { record: { byEquationVerification: { verification: damaged } } });
  await asDraft.close();
  const repaired = asDraft.owners.get('algebraic-by-equation-history').state.verification;
  assert.deepEqual(repaired, { 0: { placed: { x: true }, leftAnswer: '2', rightAnswer: '7', valid: false } }, 'the draft keeps the valid part of the checks');
  const before = await r.open(scene);
  await before.close();
  const owner = before.owners.get('algebraic-by-equation-history');
  r.saveHistory(owner, [{ ...owner.state, verification: damaged }]);
  const opened = await r.open(scene, { draftKey: before.draftKey });
  assert.equal(opened.canUndo(), true);
  await opened.undo();
  await opened.close();
  assert.deepEqual(errorText(opened), []);
  assert.deepEqual(opened.owners.get(owner.ownerId).state.verification, repaired, 'Undo restores the checks as a reload of the same value does');
});

test('every valid saved history comes back exactly as saved, and each Undo lands on its step', async (t) => {
  const r = await renderer();
  const same = (a, b) => r.mathematicalSnapshot(a) === r.mathematicalSnapshot(b);
  let histories = 0;
  let steps = 0;
  let presses = 0;
  for (const [sceneId, records] of Object.entries(VALID)) {
    const scene = await sceneById(sceneId);
    // The states the student passed through: the question opened blank, then
    // each recorded draft.
    const states = [];
    for (const record of [null, ...records]) {
      const opened = await r.open(scene, { record });
      await opened.close();
      assert.deepEqual(errorText(opened), [], `${sceneId}: opens`);
      assertDeclared(scene, opened.owners);
      states.push({ record, owners: opened.owners, draftKey: opened.draftKey });
    }
    const last = states[states.length - 1];
    const saved = new Map();
    for (const [ownerId, owner] of last.owners) {
      if (!owner.persistKey) continue;
      const path = [];
      states.forEach((state) => {
        const value = state.owners.get(ownerId)?.state;
        if (value !== undefined && !(path.length && same(path[path.length - 1], value))) path.push(value);
      });
      while (path.length && same(path[path.length - 1], owner.state)) path.pop();
      if (!path.length) continue;
      const entries = JSON.parse(JSON.stringify(path));
      r.saveHistory(owner, entries);
      saved.set(ownerId, entries);
    }
    if (!saved.size) continue;
    const opened = await r.open(scene, { record: last.record, draftKey: last.draftKey });
    for (const [ownerId, entries] of saved) {
      histories += 1;
      steps += entries.length;
      assert.ok(isDeepStrictEqual(opened.read.get(ownerId)?.stack?.entries, entries), `${sceneId} ${ownerId}: the history is read back exactly as saved`);
    }
    assert.deepEqual(opened.warnings.filter((warning) => /Undo history/.test(warning)), [], `${sceneId}: no repair is reported for a valid history`);
    // One history on the question: press Undo through it, step by step.
    if (saved.size === 1) {
      const [[ownerId, entries]] = [...saved];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        await opened.undo();
        presses += 1;
        assert.ok(same(opened.owners.get(ownerId).state, entries[index]), `${sceneId} ${ownerId}: Undo ${entries.length - index} lands on the saved step`);
      }
      assert.equal(opened.canUndo(), false, `${sceneId}: the history is used up`);
    }
    await opened.close();
    assert.deepEqual(errorText(opened), [], `${sceneId}: no error`);
  }
  t.diagnostic(`${histories} histories, ${steps} steps, ${presses} presses of Undo`);
  assert.ok(histories >= 40 && steps >= 100 && presses >= 80, `${histories} histories, ${steps} steps, ${presses} presses`);
});

test('every saved Undo history names the draft field of each key it records', async () => {
  const r = await renderer();
  const seen = new Set();
  for (const scene of r.scenes) {
    const opened = await r.open(scene);
    await opened.close();
    assertDeclared(scene, opened.owners);
    opened.owners.forEach((owner, ownerId) => { if (owner.persistKey) seen.add(`${scene.toolId} ${ownerId}`); });
  }
  const tools = [...new Set([...seen].map((entry) => entry.split(' ')[0]))].sort();
  assert.deepEqual(tools, [...TOOLS_WITH_SAVED_HISTORY].sort(), `the tools that keep a history: ${[...seen].join(', ')}`);
  ['algebraic-reduction-history', 'algebraic-elimination-history', 'algebraic-by-equation-history', 'lmr-board']
    .forEach((ownerId) => assert.ok([...seen].some((entry) => entry.endsWith(` ${ownerId}`)), `${ownerId} is reached`));
});
