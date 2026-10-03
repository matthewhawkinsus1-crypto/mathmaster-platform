/*
 * A TIMED WARM-UP CLOSES ON UNFINISHED WORK, THE TEACHER REOPENS IT, AND THE
 * STUDENT'S QUESTION HAS TO COME BACK.
 *
 * The production incident: Algebra I Warm-Up Question 1, `lmr-wu-1`
 * (representationMatch, `linear.representationSort`). Students with a partly
 * sorted board whose Warm-Up timed out found, after the teacher reopened it,
 * that Q1 would not open at all — "This question could not be displayed",
 * on every reload and every Chromebook.
 *
 * What the reproduction proved (tests/browser/teacherWorkflow/warmupReopenJourneys.mjs,
 * the real App.jsx on the in-memory Firestore):
 *
 *   - the LIFECYCLE is not the cause. The close freezes the draft byte for
 *     byte, records no attempt; the reopen unlocks the same work; a refresh,
 *     a second Chromebook, the timer armed for the original close and repeated
 *     close/reopen cycles all leave it intact. The tests in the first half of
 *     this file pin that down as properties, so a later change cannot quietly
 *     break it;
 *   - the CRASH is hydration. `usePersistentToolState` handed the tool whatever
 *     the persisted record held for a field, and RepresentationMatch
 *     dereferenced `linearAssignments[card.id]`; a persisted `null` threw
 *       TypeError: Cannot read properties of null (reading 'line-a:point')
 *     inside QuestionModuleBoundary, which latched with no way out — and since
 *     the draft was still there, every remount threw again.
 *
 * The second half is the fix's contract: drafts are validated where they are
 * read back (a shared shape guard for every draft-backed tool, plus the card
 * sort's own normaliser), a draft that still breaks a question can be set
 * aside — kept, not deleted — and the question starts fresh.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getWarmupState } from '../../src/assignmentLifecycle.js';
import { applyWarmupTeacherControl, resolveAuthoritativeClose } from '../../functions/shared/sectionDeadline.mjs';
import {
  buildLinearConnectionCards,
  linearConnectionsCardKinds,
  linearPlacementsFromAssignments,
  normalizeLinearAssignmentsDraft,
  representationSetsFor,
} from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import representationMatchGrader from '../../functions/shared/serverGrading/tools/representationMatch.mjs';
import { gradeWorkWithGrader } from '../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { selectRestorableDraftEntries } from '../../functions/shared/workspaceDraftSchema.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------- fixtures */

const DAY = '2026-10-05'; // a Monday
const CLASS_ID = 'class-p3';
const PERIOD = 'Period 3';
const SCHEDULE = {
  version: 2,
  dayTypeOverrides: { [DAY]: 'A' },
  daySchedules: { A: { periods: { [PERIOD]: { enabled: true, start: '09:00', end: '09:50' } } }, B: { periods: {} } },
};
const at = (hhmm, seconds = 0) => new Date(`${DAY}T${hhmm}:${String(seconds).padStart(2, '0')}`).getTime();

// lmr-wu-1 as the family delivers it (linear.representationSort), with the
// authored slot's ids and card kinds.
const LMR_WU_1 = Object.freeze({
  questionId: 'lmr-wu-1',
  type: 'representationMatch',
  mode: 'linearConnections',
  task: 'group',
  questionFamily: { id: 'linear.representationSort', version: 1 },
  cardKinds: ['slopeIntercept', 'standard', 'pointSlope', 'graph', 'xIntercept'],
  sets: [
    { id: 'line-a', slopeIntercept: 'y = 2x - 4', standard: '2x - y = 4', pointSlope: 'y - 2 = 2(x - 3)', graphSpec: { type: 'linear', a: 2, h: 0, k: -4 }, xIntercept: [2, 0] },
    { id: 'line-b', slopeIntercept: 'y = -x + 3', standard: 'x + y = 3', pointSlope: 'y - 1 = -1(x - 2)', graphSpec: { type: 'linear', a: -1, h: 0, k: 3 }, xIntercept: [3, 0] },
  ],
});
const DECK = buildLinearConnectionCards(representationSetsFor(LMR_WU_1), linearConnectionsCardKinds(LMR_WU_1));
const CARD_IDS = DECK.map((card) => card.id);
const SLOTS = 2;
const normalizeSort = (value) => normalizeLinearAssignmentsDraft(value, { cardIds: CARD_IDS, slotCount: SLOTS });

const lesson = (warmup = {}) => ({
  id: 'lmr-final',
  schemaVersion: 5,
  releaseAt: `${DAY}T00:00:00`,
  dueAt: `${DAY}T23:59:00`,
  lateDueAt: `${DAY}T23:59:00`,
  assignedClassIds: [CLASS_ID],
  warmup: { enabled: true, minutesBeforeStart: 7, closeMinutesAfterStart: 10, instructionDatesByClassId: { [CLASS_ID]: DAY }, ...warmup },
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ ...LMR_WU_1, activityRole: 'warmup' }] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'lmr-cw-1', type: 'representationBridge', activityRole: 'classwork' }] },
  ],
});

const stateAt = (assignment, ms) => getWarmupState({ assignment, schedule: SCHEDULE, classId: CLASS_ID, classPeriod: PERIOD, nowValue: ms });
const serverCloseAt = (assignment, ms) => resolveAuthoritativeClose({
  assignment, activityRole: 'warmup', schedule: SCHEDULE, classId: CLASS_ID, classPeriod: PERIOD, nowValue: ms, timeZone: null,
});
const teacher = (assignment, action, ms, options = {}) => ({
  ...assignment,
  warmup: applyWarmupTeacherControl({
    assignment,
    classId: CLASS_ID,
    action,
    nowMs: ms,
    dateKey: DAY,
    windowEndMs: stateAt(assignment, ms).window.end.getTime(),
    teacherIdentity: 'teacher@example.test',
    ...options,
  }).warmup,
});

// App.jsx's precise student clock: the next transition it arms a timer for.
const nextTransitionAt = (state) => (state.status === 'active'
  ? (state.autoCloseScheduled ? state.autoCloseAt.getTime() : state.endsAt.getTime()) + 100
  : null);

/* ------------------------------------------------- browser storage, in node */

const memoryLocalStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    keys: () => [...values.keys()],
  };
};
const withDevice = async (run) => {
  const previous = globalThis.window;
  const localStorage = memoryLocalStorage();
  globalThis.window = { localStorage, addEventListener() {} };
  try {
    return await run(localStorage);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};
const drafts = () => import('../../src/questionDraftStorage.js');
const tools = () => import('../../src/tools/shared/usePersistentToolState.js');

let seed = 0;
const draftKeyFor = async (studentId = `student-${(seed += 1)}`, overrides = {}) => {
  const { buildQuestionDraftKey } = await drafts();
  return buildQuestionDraftKey({ studentId, assignmentId: 'lmr-final', questionIndex: 0, variantIndex: 0, ...overrides });
};
// The card sort's field, hydrated exactly as the tool's hook hydrates it.
const hydrateSort = async (draftKey) => {
  const { hydrateToolDraftField, readToolDraftRecord } = await tools();
  return hydrateToolDraftField({
    record: readToolDraftRecord(draftKey),
    field: 'linearAssignments',
    initialValue: {},
    normalize: normalizeSort,
  });
};
const grade = (assignments) => gradeWorkWithGrader({
  grader: representationMatchGrader,
  question: LMR_WU_1,
  work: { assignments: linearPlacementsFromAssignments(assignments) },
});

const PARTIAL = Object.freeze({ 'line-a:slopeIntercept': 0, 'line-a:graph': 0, 'line-b:standard': 1, 'line-b:xIntercept': 1, 'line-a:pointSlope': 0 });
const COMPLETE = Object.freeze(Object.fromEntries(DECK.map((card) => [card.id, card.setId === 'line-a' ? 0 : 1])));

/* ===================================================================== */
/* 1. THE LIFECYCLE — what the reproduction proved, as properties.        */
/* ===================================================================== */

test('production path: partial sort → timer close → teacher reopen → restored → submitted (lmr-wu-1)', async () => {
  await withDevice(async () => {
    const { writeQuestionDraft } = await drafts();
    const { toolDraftKey } = await tools();
    const draftKey = await draftKeyFor('student-b');
    let assignment = lesson();

    // 09:02 — open, sort five of ten cards, persist, do not submit.
    assert.equal(stateAt(assignment, at('09:02')).status, 'active');
    writeQuestionDraft(toolDraftKey(draftKey), { linearAssignments: { ...PARTIAL } }, { edit: true });

    // 09:10 — the Warm-Up's own ten-minute timer.
    const closed = stateAt(assignment, at('09:10', 1));
    assert.equal(closed.status, 'closed');
    assert.equal(serverCloseAt(assignment, at('09:10', 1)).closesAtMs <= at('09:10', 1), true, 'the server agrees it is closed');
    // Freezing touched nothing: the draft is exactly what was sorted.
    assert.deepEqual((await hydrateSort(draftKey)).value, PARTIAL);

    // 09:12 — the teacher reopens.
    assignment = teacher(assignment, 'reopen', at('09:12'));
    const reopened = stateAt(assignment, at('09:12', 1));
    assert.equal(reopened.status, 'active');
    assert.equal(reopened.endsAt.getTime(), at('09:50'), 'the reopened Warm-Up runs to the end of the class period');

    // Remount: no exception, the partial sort is back exactly.
    const hydrated = await hydrateSort(draftKey);
    assert.deepEqual(hydrated.value, PARTIAL);
    assert.deepEqual(hydrated.issues, []);
    assert.equal(grade(hydrated.value).isComplete, false, 'still unfinished — never turned into a submission');

    // Finish and submit.
    const result = grade({ ...hydrated.value, ...COMPLETE });
    assert.equal(result.isComplete, true);
    assert.equal(result.isCorrect, true);
  });
});

test('the timer armed for the ORIGINAL close cannot close the reopened Warm-Up', () => {
  let assignment = lesson();
  const armed = nextTransitionAt(stateAt(assignment, at('09:02')));
  assert.equal(armed, at('09:10') + 100, 'the client armed a wake-up for the original close');
  assignment = teacher(assignment, 'reopen', at('09:12'));
  // A wake-up is only a re-render: App.jsx's callback does `setNow(Date.now())`
  // and the gate resolves the CURRENT assignment at the CURRENT time. However
  // late the stale callback runs, it finds the reopened window open.
  assert.equal(stateAt(assignment, at('09:12', 1)).status, 'active');
  assert.equal(stateAt(assignment, at('09:30')).status, 'active');
  assert.equal(serverCloseAt(assignment, at('09:30')).closesAtMs, at('09:50'), 'the server finalizer reschedules to the new close');
  // What the client arms next belongs to the new window.
  assert.equal(nextTransitionAt(stateAt(assignment, at('09:12', 1))), at('09:50') + 100);
});

/*
 * WHY THE REOPENED WINDOW IS NOT GATED ON ITS `setAt`.
 *
 * The reopen record carries `setAt` (the teacher's clock) and a new `closesAt`.
 * Gating the new window on `setAt` — a "generation" that only starts at the
 * reopen instant — looks tidier, and was considered. It would make a reopen
 * invisible to every Chromebook whose clock runs behind the teacher's until
 * that clock caught up: the exact "teacher reopened, students still locked"
 * failure. Nothing needs the gate either: the student gate and the deadline
 * finalizer resolve the CURRENT window at the CURRENT time, and ingestion
 * judges a submission by the section state the device recorded AT CAPTURE
 * (`timedSectionAccess`), never by re-resolving the past.
 */
test('a reopen opens the Warm-Up for a student whose clock runs behind the teacher\'s', () => {
  const teacherClock = at('09:12');
  const studentClock = teacherClock - 90_000; // ninety seconds behind
  const assignment = teacher(lesson(), 'reopen', teacherClock);
  assert.equal(stateAt(assignment, studentClock).status, 'active');
  assert.equal(stateAt(assignment, studentClock).endsAt.getTime(), at('09:50'));
});

test('reopening is idempotent and deterministic, and only ever writes the Warm-Up controls', () => {
  const base = lesson();
  const once = teacher(base, 'reopen', at('09:12'));
  const twice = teacher(once, 'reopen', at('09:12'));
  assert.deepEqual(twice.warmup, once.warmup, 'the same reopen at the same instant writes the same record');
  const later = teacher(once, 'reopen', at('09:20'));
  for (const ms of [at('09:20', 1), at('09:35'), at('09:49', 59), at('09:50', 1)]) {
    assert.equal(stateAt(later, ms).status, stateAt(once, ms).status, `the window resolves the same at ${new Date(ms).toTimeString()}`);
    assert.equal(stateAt(later, ms).endsAt?.getTime(), stateAt(once, ms).endsAt?.getTime());
  }
  // Question identity, family, order and every other field are untouched.
  const { warmup: _a, ...restBefore } = base;
  const { warmup: _b, ...restAfter } = once;
  assert.deepEqual(restAfter, restBefore);
  assert.equal(once.sections[0].questions[0].questionId, 'lmr-wu-1');
  assert.equal(once.sections[0].questions[0].questionFamily.id, 'linear.representationSort');
});

test('close / reopen cycles resolve deterministically', () => {
  let assignment = lesson();
  const timeline = [];
  assignment = teacher(assignment, 'close', at('09:05'));
  timeline.push(stateAt(assignment, at('09:05', 1)).status);
  assignment = teacher(assignment, 'reopen', at('09:06'));
  timeline.push(stateAt(assignment, at('09:06', 1)).status);
  assignment = teacher(assignment, 'close', at('09:20'));
  timeline.push(stateAt(assignment, at('09:20', 1)).status);
  assignment = teacher(assignment, 'timer', at('09:21'), { timerMinutes: 5 });
  const timed = stateAt(assignment, at('09:21', 1));
  timeline.push(timed.status);
  assert.equal(timed.endsAt.getTime(), at('09:26'), 'a timed reopen shows its own deadline');
  timeline.push(stateAt(assignment, at('09:26', 1)).status);
  assert.deepEqual(timeline, ['closed', 'active', 'closed', 'active', 'closed']);
});

test('client and server section-deadline resolvers agree across a reopen', () => {
  const reopened = teacher(lesson(), 'reopen', at('09:12'));
  const timed = teacher(lesson(), 'timer', at('09:12'), { timerMinutes: 3 });
  for (const assignment of [lesson(), reopened, timed]) {
    for (const ms of [at('09:02'), at('09:09', 59), at('09:10', 1), at('09:13'), at('09:15', 1), at('09:49', 59)]) {
      const client = stateAt(assignment, ms);
      const server = serverCloseAt(assignment, ms);
      if (client.status === 'active') assert.equal(server.closesAtMs, client.endsAt.getTime(), `close instant at ${new Date(ms).toTimeString()}`);
      assert.equal(client.status === 'active', server.closesAtMs > ms, `open/closed at ${new Date(ms).toTimeString()}`);
    }
  }
});

test('the reopen is per class: two students keep independent drafts and the reopen touches neither', async () => {
  await withDevice(async () => {
    const { writeQuestionDraft } = await drafts();
    const { toolDraftKey } = await tools();
    const a = await draftKeyFor('student-a');
    const b = await draftKeyFor('student-b');
    assert.notEqual(a, b);
    writeQuestionDraft(toolDraftKey(a), { linearAssignments: { ...COMPLETE } }, { edit: true });
    writeQuestionDraft(toolDraftKey(b), { linearAssignments: { ...PARTIAL } }, { edit: true });
    teacher(lesson(), 'reopen', at('09:12'));
    assert.deepEqual((await hydrateSort(a)).value, COMPLETE);
    assert.deepEqual((await hydrateSort(b)).value, PARTIAL);
  });
});

test('a student who already submitted is not reopened: the newer submission still outranks an older draft', async () => {
  // The submitted attempt is the canonical record; reopening writes only the
  // Warm-Up controls, so it creates no attempt and changes no record. A draft
  // older than that attempt (another device, before the submit) stays history.
  const submittedAt = at('09:08');
  const restorable = selectRestorableDraftEntries({
    entries: [{ key: 'k', value: { linearAssignments: PARTIAL }, savedAt: at('09:06'), savedAtIsEdit: true, questionIndex: 0 }],
    localSavedAt: () => 0,
    canonicalSavedAt: () => submittedAt,
  });
  assert.deepEqual(restorable, []);
  const reopened = teacher(lesson(), 'reopen', at('09:12'));
  assert.equal(JSON.stringify(reopened).includes('gradesByAssignment'), false);
  assert.equal(JSON.stringify(reopened).includes('lastAttemptAt'), false);
});

test('local and server copies of a partial draft: newest edit wins, deterministically', async () => {
  await withDevice(async () => {
    const { restoreQuestionDrafts, writeQuestionDraft } = await drafts();
    const { toolDraftKey } = await tools();
    const key = toolDraftKey(await draftKeyFor('student-c'));
    writeQuestionDraft(key, { linearAssignments: { 'line-a:graph': 0 } }, { edit: true });
    const local = JSON.parse(globalThis.window.localStorage.getItem(key)).savedAt;
    // An older server copy never replaces this device's newer work…
    assert.equal(restoreQuestionDrafts([{ key, value: { linearAssignments: { 'line-b:graph': 1 } }, savedAt: local - 1000, savedAtIsEdit: true }]), 0);
    // …and a newer one (another Chromebook after the reopen) does.
    assert.equal(restoreQuestionDrafts([{ key, value: { linearAssignments: { ...PARTIAL } }, savedAt: local + 1000, savedAtIsEdit: true }]), 1);
    const { readToolDraftRecord } = await tools();
    assert.deepEqual(readToolDraftRecord(key.replace(/:work:tool$/, '')).linearAssignments, PARTIAL);
  });
});

/* ===================================================================== */
/* 2. HYDRATION — the crash, and what reads a draft back now.             */
/* ===================================================================== */

test('the card sort normaliser keeps a valid partial sort exactly', () => {
  assert.deepEqual(normalizeSort(PARTIAL), { value: PARTIAL, issues: [] });
  assert.deepEqual(normalizeSort({}), { value: {}, issues: [] });
  assert.deepEqual(normalizeSort(undefined), { value: {}, issues: [] }, 'no draft is not a problem');
});

test('the card sort normaliser recovers every malformed shape to a usable board', () => {
  // The production crash: a persisted null where the map should be.
  assert.deepEqual(normalizeSort(null), { value: {}, issues: ['not-a-map'] });
  assert.deepEqual(normalizeSort('line-a:graph=0'), { value: {}, issues: ['not-a-map'] });
  assert.deepEqual(normalizeSort(7), { value: {}, issues: ['not-a-map'] });
  // A submitted response's placements, not a draft's map: salvaged.
  assert.deepEqual(
    normalizeSort([{ cardId: 'line-a:graph', slot: 0 }, { cardId: 'line-b:standard', slot: 1 }, { cardId: 'nope', slot: 0 }, null]),
    { value: { 'line-a:graph': 0, 'line-b:standard': 1 }, issues: ['placements-list', 'stale-card', 'invalid-placement'] },
  );
});

test('a draft that names a card the question no longer deals keeps only what still exists', () => {
  const result = normalizeSort({ 'line-z:graph': 0, 'line-a:graph': 0, 'line-a:standard': 7, 'line-b:standard': '1', 'line-b:graph': 'B', 'line-a:pointSlope': -1, 'line-b:pointSlope': 0.5 });
  assert.deepEqual(result.value, { 'line-a:graph': 0, 'line-b:standard': 1 });
  assert.deepEqual(result.issues, ['stale-card', 'invalid-slot', 'repaired-slot']);
  // What survives is exactly what the shared grader reads as placed — the
  // screen can no longer show a card as sorted that the grade ignores.
  const withRepair = grade({ ...COMPLETE, ...result.value });
  assert.equal(withRepair.isComplete, true);
  const unrepaired = grade({ ...COMPLETE, 'line-b:standard': '1' });
  assert.equal(unrepaired.isComplete, false, 'the grader drops a string slot the screen used to show as sorted');
});

test('hydrateToolDraftField: a field restores verbatim, a cleared value stays cleared', async () => {
  const { hydrateToolDraftField } = await tools();
  assert.deepEqual(hydrateToolDraftField({ record: { sum: '12' }, field: 'sum', initialValue: '' }), { value: '12', restored: true, issues: [] });
  assert.deepEqual(hydrateToolDraftField({ record: { sum: '' }, field: 'sum', initialValue: '7' }), { value: '', restored: true, issues: [] });
  assert.deepEqual(hydrateToolDraftField({ record: {}, field: 'sum', initialValue: '7' }), { value: '7', restored: false, issues: [] });
  assert.deepEqual(hydrateToolDraftField({ record: null, field: 'sum', initialValue: () => 'x' }), { value: 'x', restored: false, issues: [] });
});

test('hydrateToolDraftField: the shared guard refuses a persisted value of the wrong collection kind for EVERY tool', async () => {
  const { hydrateToolDraftField } = await tools();
  // A map field (the lmr-wu-1 crash, with no tool normaliser in the way).
  assert.deepEqual(
    hydrateToolDraftField({ record: { linearAssignments: null }, field: 'linearAssignments', initialValue: {} }),
    { value: {}, restored: false, issues: ['expected-map'] },
  );
  assert.deepEqual(
    hydrateToolDraftField({ record: { points: { 0: [1, 2] } }, field: 'points', initialValue: [] }),
    { value: [], restored: false, issues: ['expected-list'] },
  );
  assert.deepEqual(
    hydrateToolDraftField({ record: { rows: [] }, field: 'rows', initialValue: () => ({ a: 1 }) }),
    { value: { a: 1 }, restored: false, issues: ['expected-map'] },
  );
  // Scalars are the tool's own business: `null` → number is a real edit there.
  assert.deepEqual(hydrateToolDraftField({ record: { badRow: 2 }, field: 'badRow', initialValue: null }), { value: 2, restored: true, issues: [] });
});

test('hydrateToolDraftField: a tool normaliser runs first, can salvage, and cannot crash hydration', async () => {
  const { hydrateToolDraftField } = await tools();
  const salvaged = hydrateToolDraftField({
    record: { linearAssignments: [{ cardId: 'line-a:graph', slot: 0 }] },
    field: 'linearAssignments',
    initialValue: {},
    normalize: normalizeSort,
  });
  assert.deepEqual(salvaged, { value: { 'line-a:graph': 0 }, restored: true, issues: ['placements-list'] });
  const thrown = hydrateToolDraftField({
    record: { linearAssignments: { 'line-a:graph': 0 } },
    field: 'linearAssignments',
    initialValue: {},
    normalize: () => { throw new Error('normaliser bug'); },
  });
  assert.deepEqual(thrown, { value: {}, restored: false, issues: ['normalize-failed'] });
  const wrongKind = hydrateToolDraftField({
    record: { linearAssignments: {} }, field: 'linearAssignments', initialValue: {}, normalize: () => ({ value: null, issues: [] }),
  });
  assert.deepEqual(wrongKind, { value: {}, restored: false, issues: ['expected-map'] });
});

test('empty, legacy and malformed persisted drafts all hydrate to a usable sort (no exception)', async () => {
  await withDevice(async (storage) => {
    const { toolDraftKey } = await tools();
    const cases = [
      ['empty partial draft', { linearAssignments: {} }, {}],
      ['legacy record (no field)', { equation: '', table: '' }, {}],
      ['null map (production)', { linearAssignments: null }, {}],
      ['whole record a string', 'linearAssignments', {}],
      ['whole record an array', [['line-a:graph', 0]], {}],
      ['stale card', { linearAssignments: { 'line-a:graph': 0, 'gone:card': 1 } }, { 'line-a:graph': 0 }],
    ];
    for (const [name, value, expected] of cases) {
      const draftKey = await draftKeyFor();
      storage.setItem(toolDraftKey(draftKey), JSON.stringify({ version: 2, savedAt: Date.now(), value }));
      const hydrated = await hydrateSort(draftKey);
      assert.deepEqual(hydrated.value, expected, name);
      // The tool's render reads `linearAssignments[card.id]` for every card.
      assert.doesNotThrow(() => DECK.forEach((card) => hydrated.value[card.id]), name);
    }
  });
});

test('a coalesced (drag-rate) write pending at the close persists the last committed value, never an in-between one', async () => {
  await withDevice(async (storage) => {
    const { toolDraftKey, flushToolDrafts, hydrateToolDraftField, readToolDraftRecord } = await tools();
    const { writeQuestionDraft } = await drafts();
    const draftKey = await draftKeyFor();
    const key = toolDraftKey(draftKey);
    // Every committed board is a complete, valid map — a tap is atomic, so
    // there is no half-placed card to persist.
    let board = {};
    for (const cardId of Object.keys(PARTIAL)) {
      board = { ...board, [cardId]: PARTIAL[cardId] };
      writeQuestionDraft(key, { linearAssignments: board }, { edit: true });
      assert.deepEqual(normalizeSort(JSON.parse(storage.getItem(key)).value.linearAssignments).issues, []);
    }
    flushToolDrafts();
    const record = readToolDraftRecord(draftKey);
    assert.deepEqual(hydrateToolDraftField({ record, field: 'linearAssignments', initialValue: {}, normalize: normalizeSort }).value, PARTIAL);
  });
});

/* ===================================================================== */
/* 3. CONTAINMENT — a draft that still breaks a question.                 */
/* ===================================================================== */

test('quarantining a question\'s drafts keeps a copy, then starts the question fresh everywhere', async () => {
  await withDevice(async (storage) => {
    const { quarantineQuestionDraftFamily, readQuarantinedDrafts, readQuestionDraft, writeQuestionDraft } = await drafts();
    const { toolDraftKey } = await tools();
    const draftKey = await draftKeyFor('student-q');
    const other = await draftKeyFor('student-q', { questionIndex: 1 });
    writeQuestionDraft(toolDraftKey(draftKey), { linearAssignments: null }, { edit: true });
    writeQuestionDraft(toolDraftKey(other), { linearAssignments: { 'line-a:graph': 0 } }, { edit: true });

    const moved = quarantineQuestionDraftFamily(draftKey, { reason: 'question-module-error' });
    assert.ok(moved >= 1);
    // Fresh: the broken workspace reads as "no draft"…
    assert.equal(readQuestionDraft(toolDraftKey(draftKey), 'fallback'), 'fallback');
    // …through a tombstone, so the server backup is retired too, not resurrected.
    assert.equal(JSON.parse(storage.getItem(toolDraftKey(draftKey))).value, null);
    // The neighbouring question is untouched.
    assert.deepEqual(readQuestionDraft(toolDraftKey(other)), { linearAssignments: { 'line-a:graph': 0 } });
    // And nothing was destroyed: the copy is kept for the teacher.
    const kept = readQuarantinedDrafts(draftKey);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].key, toolDraftKey(draftKey));
    assert.deepEqual(kept[0].envelope.value, { linearAssignments: null });
    assert.equal(kept[0].reason, 'question-module-error');
  });
});

test('the question boundary logs who/what/where without PII, and offers a fresh start instead of a dead end', () => {
  const boundary = executableSource(read('src/QuestionModuleBoundary.jsx'));
  // The diagnostic names the assignment, question, family, draft version and
  // lifecycle — never the student.
  const diagnostic = region(boundary, 'componentDidCatch', 'componentDidUpdate', 'boundary diagnostic');
  for (const field of ['assignmentId', 'questionId', 'family', 'draftVersion', 'lifecycle']) {
    assert.match(diagnostic, new RegExp(field), `the diagnostic carries ${field}`);
  }
  assert.doesNotMatch(diagnostic, /studentId|displayName|email/);
  // A programming error is not hidden: it is logged and shown.
  assert.match(diagnostic, /console\.error/);
  assert.match(diagnostic, /recordClientDiagnostic/);
  // The way out.
  assert.match(boundary, /onRecover/);
  assert.match(boundary, /Start this question fresh/);

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const recover = region(engine, 'const handleRecoverQuestionModule', 'const handleResetQuestion', 'module recovery');
  assert.match(recover, /quarantineQuestionDraftFamily\(draftKey/);
  assert.match(recover, /forgetToolDrafts\(draftKey\)/);
  assert.match(recover, /setQuestionResetVersion/);
  // Recovery never submits and never touches the attempt record.
  assert.doesNotMatch(recover, /onGrade|handleSubmit|setRecord|recordQuestionAttempt/);
  assert.match(engine, /<QuestionModuleBoundary[\s\S]*?onRecover=\{handleRecoverQuestionModule\}/);
});

test('the card sort reads its draft through the normaliser', () => {
  const tool = executableSource(read('src/tools/representationMatch/RepresentationMatch.jsx'));
  assert.match(tool, /usePersistentToolState\('linearAssignments', \{\}, \{\s*normalize:/);
  assert.match(tool, /normalizeLinearAssignmentsDraft\(/);
});

test('the time-ended receipt belongs to a closed window, not a reopened one', () => {
  const app = executableSource(read('src/App.jsx'));
  // While the Warm-Up (or DOL) is open again, the student is told their work
  // will be submitted when time ends — not that time already ended.
  assert.match(app, /const currentSectionOpenNow = /);
  assert.match(app, /!preview && currentCheckpointOutcome && !currentSectionOpenNow && \(/);
  assert.match(app, /\['warmup', 'dol'\]\.includes\(runtimeActivityRole\) && \(!currentCheckpointOutcome \|\| currentSectionOpenNow\) && \(/);
});

test('the teacher handler writes the Warm-Up controls through the shared, tested function', () => {
  const app = executableSource(read('src/App.jsx'));
  const handler = region(app, 'const handleToggleWarmupForClass', 'const handleToggleSectionAccessForClass', 'teacher Warm-Up handler');
  assert.match(handler, /applyWarmupTeacherControl\(\{/);
  assert.match(app, /import \{[^}]*applyWarmupTeacherControl[^}]*\} from '\.\.\/functions\/shared\/sectionDeadline\.mjs'/);
});
