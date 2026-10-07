/*
 * UNFINISHED WORK, WITHOUT A SUBMIT.
 *
 * PR #247 made a SUBMITTED answer survive anything. This suite is about the
 * state before that: a student who typed into a tool, walked to another
 * question and came back. Nothing here involves an attempt, a grade or the
 * network, and that is the point — the whole path is a local write and a local
 * read, and the server copy rides the existing workspace-draft sync.
 *
 * Node cannot render React, so what is exercised here is the storage layer the
 * hook sits on: the key namespaces, the precedence against a newer submitted
 * answer, and the rules about what may leave the device. The hook's behaviour
 * INSIDE a real browser — restore after navigation, after reload, after a
 * close and reopen — is certified by tests/browser/draftPersistence.mjs, which
 * is the only place that can honestly claim it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isSyncableDraftKey,
  sanitizeWorkspaceDraftValue,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { stripComments } from './helpers/stripComments.mjs';
import { region } from './helpers/sourceContract.mjs';
import { canonicalResponseSavedAt } from '../../src/platform/persistence/canonicalResponseTime.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const memoryLocalStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    entries: () => [...values.entries()],
  };
};

const withLocalStorage = async (store, run) => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: store };
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

const draftModule = () => import('../../src/questionDraftStorage.js');
const toolModule = () => import('../../src/tools/shared/usePersistentToolState.js');

let uniqueSeed = 0;
const uniqueKey = async (overrides = {}) => {
  const { buildQuestionDraftKey } = await draftModule();
  uniqueSeed += 1;
  return buildQuestionDraftKey({
    studentId: `student-${uniqueSeed}`,
    assignmentId: 'assignment-1',
    questionIndex: 0,
    variantIndex: 0,
    ...overrides,
  });
};

/* ---------------------------------------------------------------- namespace */

test('a tool workspace hangs off the question draft key, so it inherits its namespaces', async () => {
  const { buildQuestionDraftKey } = await draftModule();
  const { toolDraftKey } = await toolModule();
  const base = (overrides) => buildQuestionDraftKey({
    studentId: 'ada', assignmentId: 'a1', questionIndex: 3, variantIndex: 0, ...overrides,
  });

  // A replacement question is a different variant, and therefore a different
  // workspace. Restoring the previous variant's work into it would be showing
  // the student an answer to a question they are no longer being asked.
  assert.notEqual(toolDraftKey(base({})), toolDraftKey(base({ variantIndex: 1 })));
  // Practising after the deadline has its own bucket and cannot overwrite the
  // graded workspace.
  assert.notEqual(toolDraftKey(base({})), toolDraftKey(base({ sessionMode: 'post-deadline-practice' })));
  // One student's browser draft can never be read into another student's session.
  assert.notEqual(toolDraftKey(base({})), toolDraftKey(base({ studentId: 'grace' })));
  // Different questions, different workspaces.
  assert.notEqual(toolDraftKey(base({})), toolDraftKey(base({ questionIndex: 4 })));
  // No scope in the tree at all (the tools lab bench) means no key and no write.
  assert.equal(toolDraftKey(null), null);
});

test('a tool workspace is inside the question draft family, so replacement retires it', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { removeQuestionDraftFamily, writeQuestionDraft } = await draftModule();
    const { toolDraftKey } = await toolModule();
    const draftKey = await uniqueKey();
    writeQuestionDraft(`${draftKey}:literal`, 'x = 4');
    writeQuestionDraft(toolDraftKey(draftKey), { responses: { sum: '2x' } });
    writeQuestionDraft(toolDraftKey(draftKey, 'stage-plot'), { points: [[1, 2]] });
    assert.equal(store.entries().length, 3);

    removeQuestionDraftFamily(draftKey);
    assert.deepEqual(store.entries(), [], 'the whole family goes, tool workspaces included');
  });
});

test('a tool workspace key is one the background workspace sync will carry', async () => {
  const { toolDraftKey } = await toolModule();
  const { buildQuestionDraftKey, parseQuestionDraftKey } = await draftModule();
  const key = toolDraftKey(buildQuestionDraftKey({
    studentId: 'ada', assignmentId: 'a1', questionIndex: 2, variantIndex: 1,
  }));
  const identity = parseQuestionDraftKey(key);
  assert.equal(identity.studentId, 'ada');
  assert.equal(identity.questionIndex, 2);
  assert.equal(identity.variantIndex, 1);
  assert.equal(identity.sessionBucket, 'student');
  assert.ok(isSyncableDraftKey(key));

  // Teacher preview stays on the device it was typed on.
  const previewKey = toolDraftKey(buildQuestionDraftKey({
    studentId: 'teacher-preview', assignmentId: 'a1', questionIndex: 2, sessionMode: 'preview',
  }));
  assert.equal(isSyncableDraftKey(previewKey), false);
});

/* ------------------------------------------------------------ what persists */

test('a cleared field is state, not an absence: it does not restore the old value', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { readQuestionDraft, writeQuestionDraft } = await draftModule();
    const { toolDraftKey } = await toolModule();
    const key = toolDraftKey(await uniqueKey());
    writeQuestionDraft(key, { termAnswer: '12' });
    writeQuestionDraft(key, { termAnswer: '' });
    const record = readQuestionDraft(key, {});
    // The student typed 12, deleted it and left. They come back to an EMPTY box.
    assert.ok(Object.prototype.hasOwnProperty.call(record, 'termAnswer'));
    assert.equal(record.termAnswer, '');
  });
});

test('the hook reads a stored field by presence, never by truthiness', async () => {
  // The behaviour above is only correct because the restore checks
  // hasOwnProperty. `record[field] || fallback` would hand the 12 back.
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(record, field\)/);
  assert.doesNotMatch(source, /record\[field\]\s*\|\|/);
});

test('a tool workspace value is one the server will accept', async () => {
  // The realistic shape: several fields, a plotted set of points, a table.
  const workspace = {
    responses: { sum: '3x + 2', difference: 'x - 4' },
    restrictionResponse: '2, -5',
    plottedPoints: [[1, 3], [2, 5], [3, 7]],
    tableValues: ['3', '5', '7', '', ''],
  };
  const check = sanitizeWorkspaceDraftValue(workspace);
  assert.equal(check.ok, true, check.reason || '');
});

test('nothing a tool persists may be an answer key or a grade', async () => {
  // A draft is student-written and student-read. A tool that started persisting
  // its verdict would publish the key through a document the student may read,
  // so the sanitiser refuses it and the entry is visibly excluded rather than
  // silently synced.
  assert.equal(sanitizeWorkspaceDraftValue({ responses: {}, isCorrect: true }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ responses: {}, score: 0.5 }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ answerKey: ['3x'] }).ok, false);
});

/* ------------------------------------------------------------- precedence */

test('a newer submitted answer outranks an older local draft', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { writeQuestionDraft, readQuestionDraft } = await draftModule();
    const { toolDraftIsSuperseded, toolDraftKey } = await toolModule();
    const key = toolDraftKey(await uniqueKey());
    writeQuestionDraft(key, { termAnswer: '12' });
    const savedAt = JSON.parse(store.getItem(key)).savedAt;

    // Submitted from another device a minute later: this device's draft is history.
    assert.equal(toolDraftIsSuperseded(key, savedAt + 60_000), true);
    // Submitted before the draft was written: the draft is the newer work.
    assert.equal(toolDraftIsSuperseded(key, savedAt - 60_000), false);
    // A canonical timestamp a second ahead of the draft is two clocks
    // disagreeing about the same submission, not a stale device.
    assert.equal(toolDraftIsSuperseded(key, savedAt + 1_000), false);
    // Never submitted: the draft is entirely in charge.
    assert.equal(toolDraftIsSuperseded(key, 0), false);
    // Nothing stored: nothing to outrank.
    assert.equal(toolDraftIsSuperseded(toolDraftKey(await uniqueKey()), Date.now()), false);
    assert.deepEqual(readQuestionDraft(key, null), { termAnswer: '12' });
  });
});

test('submitting re-stamps this question workspace so the student keeps their own work', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const {
      TOOL_DRAFT_SUPERSEDE_MARGIN_MS, readToolDraftRecord, stampToolDraftSubmission, toolDraftIsSuperseded, toolDraftKey,
    } = await toolModule();
    const { writeQuestionDraft } = await draftModule();
    const draftKey = await uniqueKey();
    const key = toolDraftKey(draftKey);
    writeQuestionDraft(key, { termAnswer: '12' });
    readToolDraftRecord(draftKey); // the workspace is open, as it is at Submit

    // The real ordering: the attempt is recorded, then the workspace is stamped.
    const submittedAt = Date.now();
    assert.equal(stampToolDraftSubmission(draftKey), 1);
    // Without the stamp this reads as stale, and the student would open the
    // question to an empty box holding the answer they had just submitted.
    assert.equal(toolDraftIsSuperseded(key, submittedAt), false);
    // And the rule still bites for a draft that really is from before a
    // submission made somewhere else.
    assert.equal(toolDraftIsSuperseded(key, submittedAt + TOOL_DRAFT_SUPERSEDE_MARGIN_MS + 60_000), true);
    assert.deepEqual(readToolDraftRecord(draftKey), { termAnswer: '12' }, 'the values are unchanged');
  });
});

/* ------------------------------------------- a workspace started from nothing */

// The question opens before the server's copy is read (PQ-044), so on a
// Chromebook that never held this work the record starts empty and every write
// saves the whole record. Such a record says so (`__fresh`, the fields its
// student edited), and is settled against the server's copy when the read lands
// (workspaceDraftSchema.mjs, "a workspace a device started from nothing").

const storedValue = (store, key) => JSON.parse(store.getItem(key) || 'null')?.value;

test('a workspace this device starts from nothing is marked fresh; one begun on any stored copy is not', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { TOOL_WORKSPACE_FRESH_FIELD } = await import('../../functions/shared/workspaceDraftSchema.mjs');
    const { readToolDraftRecord, stampToolDraftSubmission, toolDraftKey } = await toolModule();
    const { writeQuestionDraft } = await draftModule();

    const fresh = await uniqueKey();
    assert.deepEqual(readToolDraftRecord(fresh), {}, 'the fields the tool reads never include the marker');
    stampToolDraftSubmission(fresh);
    assert.deepEqual(storedValue(store, toolDraftKey(fresh)), { [TOOL_WORKSPACE_FRESH_FIELD]: [] }, 'nothing stored: fresh');

    const reset = await uniqueKey();
    writeQuestionDraft(toolDraftKey(reset), null, { edit: true }); // "Start over" tombstones the record
    readToolDraftRecord(reset);
    stampToolDraftSubmission(reset);
    assert.deepEqual(storedValue(store, toolDraftKey(reset)), {}, 'begun on a reset: not fresh, so the reset sticks');

    const kept = await uniqueKey();
    writeQuestionDraft(toolDraftKey(kept), { slope: '2' }, { edit: true });
    readToolDraftRecord(kept);
    stampToolDraftSubmission(kept);
    assert.deepEqual(storedValue(store, toolDraftKey(kept)), { slope: '2' }, 'begun on this device\'s own copy: not fresh');

    const preview = await uniqueKey({ sessionMode: 'preview' });
    readToolDraftRecord(preview);
    stampToolDraftSubmission(preview);
    assert.deepEqual(storedValue(store, toolDraftKey(preview)), {}, 'a preview is never synced, so never marked');
  });
});

test('a fresh workspace is settled against the server\'s copy when the read lands', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { TOOL_WORKSPACE_FRESH_FIELD } = await import('../../functions/shared/workspaceDraftSchema.mjs');
    const { readToolDraftRecord, toolDraftKey } = await toolModule();
    const { questionDraftRestoreGeneration, questionDraftSavedAt, reconcileToolWorkspaceDrafts, restoreQuestionDrafts } = await draftModule();
    // Real times: a draft older than 45 days expires when it is read.
    const T = Date.now() - 60_000;
    const envelope = (value, savedAt) => JSON.stringify({ version: 2, savedAt, value, touchedAt: savedAt, savedAtIsEdit: true });
    const full = { slopeInterceptEquation: 'y=-2x+6', tableRows: [{ x: '0', y: '6' }], graph1Points: [[3, 0], [0, 6]], expandedCards: { table: true } };

    // 1. The student collapsed a panel before the read landed; the server
    //    holds Chromebook A's whole board, saved earlier.
    const early = await uniqueKey();
    const earlyKey = toolDraftKey(early);
    store.setItem(earlyKey, envelope({ expandedCards: { table: false }, [TOOL_WORKSPACE_FRESH_FIELD]: ['expandedCards'] }, T + 2_000));
    assert.deepEqual(readToolDraftRecord(early), { expandedCards: { table: false } }, 'the open board shows only the touch');
    // 2. The server copy is NEWER than a fresh edit made on another question.
    const behind = await uniqueKey();
    const behindKey = toolDraftKey(behind);
    store.setItem(behindKey, envelope({ slopeInterceptEquation: 'y=x', [TOOL_WORKSPACE_FRESH_FIELD]: ['slopeInterceptEquation'] }, T + 1_000));
    // 3. Fresh, and the server holds nothing for it.
    const alone = await uniqueKey();
    const aloneKey = toolDraftKey(alone);
    store.setItem(aloneKey, envelope({ featureSlope: '3', [TOOL_WORKSPACE_FRESH_FIELD]: ['featureSlope'] }, T + 1_500));
    // 4. Not fresh: left exactly as it is.
    const own = await uniqueKey();
    const ownKey = toolDraftKey(own);
    store.setItem(ownKey, envelope({ featureSlope: '5' }, T + 3_000));

    const entries = [
      { key: earlyKey, value: full, savedAt: T + 1_000, savedAtIsEdit: true },
      { key: behindKey, value: { slopeInterceptEquation: 'y=2x', tableRows: [{ x: '1', y: '2' }] }, savedAt: T + 2_000, savedAtIsEdit: true },
      { key: ownKey, value: { featureSlope: '9', standardFormEquation: '9x-y=0' }, savedAt: T + 1_000, savedAtIsEdit: true },
    ];
    // All four keys belong to the same student and assignment (uniqueKey varies the student).
    const keysOwner = (key) => {
      const parts = key.split(':');
      return { studentId: decodeURIComponent(parts[4]), assignmentId: decodeURIComponent(parts[5]) };
    };
    const generation = questionDraftRestoreGeneration();
    const settled = [earlyKey, behindKey, aloneKey, ownKey]
      .reduce((count, key) => count + reconcileToolWorkspaceDrafts(entries, keysOwner(key)), 0);
    assert.equal(settled, 3, 'every fresh record is settled, once');
    assert.notEqual(questionDraftRestoreGeneration(), generation, 'what is cached is read again');

    assert.deepEqual(storedValue(store, earlyKey), { ...full, expandedCards: { table: false } }, 'the server\'s board, with the student\'s own touch on top');
    assert.equal(questionDraftSavedAt(earlyKey), T + 2_000, 'and this device keeps the time of its own edit');
    assert.deepEqual(readToolDraftRecord(early), { ...full, expandedCards: { table: false } }, 'the cached copy is read again: the open board gets the whole of it');

    assert.deepEqual(storedValue(store, behindKey), { slopeInterceptEquation: 'y=2x', tableRows: [{ x: '1', y: '2' }] }, 'a newer edit on the server wins the field both hold');
    assert.equal(questionDraftSavedAt(behindKey), T + 2_000);
    assert.equal(restoreQuestionDrafts(entries.filter((entry) => entry.key === behindKey)), 0, 'and the restore that follows does not swap it in again');

    assert.deepEqual(storedValue(store, aloneKey), { featureSlope: '3' }, 'nothing on the server: the record is kept, no longer fresh');
    assert.deepEqual(storedValue(store, ownKey), { featureSlope: '5' }, 'a record that is not fresh is never merged here');
  });
});

test('a tool workspace restored from the server is never fresh on this device', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { TOOL_WORKSPACE_FRESH_FIELD } = await import('../../functions/shared/workspaceDraftSchema.mjs');
    const { toolDraftKey } = await toolModule();
    const { restoreQuestionDrafts } = await draftModule();
    const draftKey = await uniqueKey();
    const key = toolDraftKey(draftKey);
    // A fresh record the server stored as it came (nothing else was there).
    assert.equal(restoreQuestionDrafts([{ key, value: { featureSlope: '3', [TOOL_WORKSPACE_FRESH_FIELD]: ['featureSlope'] }, savedAt: 1_000, savedAtIsEdit: true }]), 1);
    assert.deepEqual(storedValue(store, key), { featureSlope: '3' });
    // Any other draft is restored exactly as it was stored.
    const literal = `${draftKey}:literal`;
    restoreQuestionDrafts([{ key: literal, value: { answer: '12', [TOOL_WORKSPACE_FRESH_FIELD]: ['answer'] }, savedAt: 1_000, savedAtIsEdit: true }]);
    assert.deepEqual(storedValue(store, literal), { answer: '12', [TOOL_WORKSPACE_FRESH_FIELD]: ['answer'] });
  });
});

test('restoring a draft is not a submission', async () => {
  // Nothing in the module can create an attempt, assign correctness or reach
  // Classroom. Asserted against the executable source because a draft layer
  // that gained any of these would be a grading bug, not a persistence one.
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  ['recordQuestionAttempt', 'onGrade', 'attemptCount', 'partialCredit', 'passback', 'evidence']
    .forEach((forbidden) => {
      assert.doesNotMatch(source, new RegExp(forbidden), `the draft layer must not reference ${forbidden}`);
    });
});

test('the server draft is still the weakest copy that can be restored', async () => {
  // Unchanged from PR #247 and asserted here because the tool workspaces now
  // ride the same path: a stored entry loses both to this device's newer copy
  // and to a newer canonical attempt.
  const entries = [
    { key: 'a', value: 1, savedAt: 100 },
    { key: 'b', value: 2, savedAt: 100 },
    { key: 'c', value: 3, savedAt: 100 },
  ];
  const restorable = selectRestorableDraftEntries({
    entries,
    localSavedAt: (key) => (key === 'a' ? 150 : 0),
    canonicalSavedAt: (entry) => (entry.key === 'b' ? 150 : 0),
  });
  assert.deepEqual(restorable.map((entry) => entry.key), ['c']);
});

/* -------------------------------------------------------------- durability */

test('an edit is durable before any cleanup runs', async () => {
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  // Persisted inside the state transition, like useLocalDraftState and
  // useUndoHistory. A browser that is closed abruptly never runs an unmount
  // cleanup, so a layer that saved there would lose the last edit every time.
  assert.match(source, /setValue\(\(current\) => \{[\s\S]*commitField\(keyRef\.current, field, resolved, coalesceMs\b[^;]*\);\s*return resolved/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \(\) => \{[\s\S]*commitField/);
  // Nothing on the student's edit path is awaited.
  const commit = source.slice(source.indexOf('const commitField'), source.indexOf('export const flushToolDrafts') + 400);
  assert.doesNotMatch(commit, /await|async|fetch\(|firestore/i);
});

test('high-frequency edits coalesce, but a finished gesture is written at once', async () => {
  const { TOOL_DRAFT_COALESCE_MS } = await toolModule();
  assert.ok(TOOL_DRAFT_COALESCE_MS > 0 && TOOL_DRAFT_COALESCE_MS <= 250,
    'the in-memory-only window has to stay short enough that a shutdown costs part of one gesture');
  const interval = stripComments(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'));
  // The only display-rate writer in the registry: endpoint dragging.
  assert.match(interval, /usePersistentToolState\('built', \[\], \{ coalesceMs: TOOL_DRAFT_COALESCE_MS \}\)/);
  assert.match(interval, /const endDrag = \(\) => \{[\s\S]*flushToolDrafts\(\)/);
  // Typing is never coalesced.
  assert.match(interval, /usePersistentToolState\('notation', ''\)/);
});

test('the coalescing window survives the page going away', async () => {
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  ['pagehide', 'beforeunload', 'visibilitychange'].forEach((event) => {
    assert.match(source, new RegExp(`'${event}'`), `a pending write must be flushed on ${event}`);
  });
});

/* ------------------------------------------------------------------ wiring */

test('QuestionEngine opens the draft scope registry tools read', async () => {
  const engine = stripComments(read('src/QuestionEngine.jsx'));
  assert.match(engine, /<ToolDraftScopeProvider draftKey=\{draftKey\} canonicalSavedAt=\{canonicalAnswerSavedAt\}>/);
  // The question's last canonical response: `lastAttemptAt`, or for a deadline
  // auto-submit, when its work was captured (canonicalResponseTime.js).
  assert.match(engine, /const canonicalAnswerSavedAt = canonicalResponseSavedAt\(record\);/);
  assert.match(engine, /import \{ canonicalResponseSavedAt \} from '\.\/platform\/persistence\/canonicalResponseTime\.js'/);
  assert.equal(canonicalResponseSavedAt({ lastAttemptAt: '2026-09-14T15:00:00.000Z' }), Date.parse('2026-09-14T15:00:00.000Z'));
  assert.equal(canonicalResponseSavedAt({}), 0);
  // Imported next to the call — App.jsx-style free identifiers are a runtime
  // ReferenceError that every other check passes.
  assert.match(engine, /import \{ ToolDraftScopeProvider, forgetToolDrafts, stampToolDraftSubmission \} from '\.\/tools\/shared\/usePersistentToolState\.js'/);
  // A replacement question drops the parsed workspaces with the stored ones.
  assert.match(engine, /removeQuestionDraftFamily\(draftKey\);\s*forgetToolDrafts\(draftKey\);/);
  // Submitting re-stamps, so the student's own work never reads as stale.
  assert.match(engine, /stampToolDraftSubmission\(draftKey\)/);
  // The comment that said no tool had adopted the seam is gone, because they have.
  assert.doesNotMatch(read('src/QuestionEngine.jsx'), /No\s*\n?\s*(registry tool has adopted it yet)/);
});

test('a workflow stage gives its tool a namespace of its own', async () => {
  const runner = stripComments(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.match(runner, /import \{ ToolDraftScopeProvider \} from '\.\.\/\.\.\/tools\/shared\/usePersistentToolState\.js'/);
  assert.match(runner, /<ToolDraftScopeProvider[\s\S]*draftKey=\{draftKey\}[\s\S]*scope=\{`stage-\$\{stage\.id \|\| stage\.kind\}`\}[\s\S]*canonicalSavedAt=\{canonicalSavedAt\}/);
});

test('a composed question\'s Submit re-stamps its stage tools, so they are not deleted as stale on the next visit', async () => {
  // A stage tool's workspace hangs off the question's draft key under
  // `stage-*` and is handed the question's canonical time (above). The
  // registry path stamped after recording an attempt; performSubmit, which
  // records a composed question's attempt, did not. A student who pressed
  // Submit more than a few seconds after their last stage edit came back to
  // empty stages: toolDraftIsSuperseded read the workspace as older than the
  // attempt and deleted it.
  const engine = stripComments(read('src/QuestionEngine.jsx'));
  const submit = region(engine, 'const performSubmit = async () => {', '\n  };', 'performSubmit');
  const branches = submit.split('} finally {').slice(1).map((block) => block.slice(0, block.indexOf('}')));
  assert.equal(branches.length, 2, 'performSubmit records an attempt in a server-graded branch and an ordinary one');
  branches.forEach((block, index) => assert.match(block, /stampToolDraftSubmission\(draftKey\);/, `performSubmit branch ${index + 1} stamps the workspaces it just submitted`));

  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { readToolDraftRecord, stampToolDraftSubmission, toolDraftIsSuperseded, toolDraftKey } = await toolModule();
    const { writeQuestionDraft } = await draftModule();
    const realNow = Date.now;
    let clock = Date.parse('2026-10-07T15:00:00.000Z');
    Date.now = () => clock;
    try {
      const draftKey = await uniqueKey();
      const stage = toolDraftKey(draftKey, 'stage-interval');
      writeQuestionDraft(stage, { built: [[-2, 3]] }, { edit: true });
      readToolDraftRecord(draftKey, 'stage-interval'); // the stage is open at Submit
      clock += 30_000;
      const submittedAt = clock;
      assert.equal(toolDraftIsSuperseded(stage, submittedAt), true, 'unstamped, the stage reads as older than its own attempt');
      clock += 40;
      assert.equal(stampToolDraftSubmission(draftKey), 1, 'the stamp reaches a stage-* workspace');
      assert.equal(toolDraftIsSuperseded(stage, submittedAt), false);
      assert.deepEqual(readToolDraftRecord(draftKey, 'stage-interval'), { built: [[-2, 3]] }, 'the values are unchanged');
    } finally {
      Date.now = realNow;
    }
  });
});

test('the same question rendered twice in one workflow keeps two workspaces apart', async () => {
  const { toolDraftKey } = await toolModule();
  const draftKey = await uniqueKey();
  assert.notEqual(toolDraftKey(draftKey, 'stage-plot'), toolDraftKey(draftKey, 'stage-classify'));
});


test('workflow delegated tool scopes respect newer canonical attempts', () => {
  const engine = stripComments(read('src/QuestionEngine.jsx'));
  const runner = stripComments(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.match(engine, /<WorkflowRunner[\s\S]*canonicalSavedAt=\{canonicalAnswerSavedAt\}/);
  assert.match(runner, /canonicalSavedAt\s*=\s*0/);
  assert.match(runner, /<StageBody[\s\S]*canonicalSavedAt=\{canonicalSavedAt\}/);
  assert.match(runner, /<ToolDraftScopeProvider[\s\S]*canonicalSavedAt=\{canonicalSavedAt\}/);
});

test('assignment-level draft clearing also evicts parsed tool workspace caches', async () => {
  const store = memoryLocalStorage();
  await withLocalStorage(store, async () => {
    const { removeAssignmentDrafts, writeQuestionDraft } = await draftModule();
    const { forgetAssignmentToolDrafts, readToolDraftRecord, toolDraftKey } = await toolModule();
    const draftKey = await uniqueKey({ studentId: 'teacher-preview', assignmentId: 'preview-assignment', questionIndex: 2 });
    writeQuestionDraft(toolDraftKey(draftKey), { responses: { sum: '3x' } });
    assert.deepEqual(readToolDraftRecord(draftKey), { responses: { sum: '3x' } });
    removeAssignmentDrafts({ studentId: 'teacher-preview', assignmentId: 'preview-assignment' });
    forgetAssignmentToolDrafts({ studentId: 'teacher-preview', assignmentId: 'preview-assignment' });
    assert.deepEqual(readToolDraftRecord(draftKey), {}, 'cleared work must not be resurrected from memory');
  });
});

test('the shared hook refreshes question-specific initializers before a draft-key change', () => {
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  const assign = source.indexOf('initialRef.current = initialValue');
  const effect = source.indexOf('useEffect(() => {', assign);
  assert.ok(assign >= 0, 'the hook must keep the latest initializer');
  assert.ok(effect > assign, 'the latest initializer must be available before key-change restoration');
  // The restore reads the LATEST initializer (initialRef.current), whatever
  // else it is handed after the canonical time (a field's normaliser).
  assert.match(source.slice(effect, effect + 1400), /restoreField\(key, field, initialRef\.current, canonicalSavedAt(?:, [^)]*)?\)/);
});
