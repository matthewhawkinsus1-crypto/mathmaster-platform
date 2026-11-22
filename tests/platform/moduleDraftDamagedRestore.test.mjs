/*
 * A DAMAGED SAVED DRAFT NO LONGER STOPS A RESPONSE MODULE OUTSIDE THE TOOL
 * REGISTRY, AND VALID DRAFTS RESTORE EXACTLY AS BEFORE.
 *
 * The registry tools read their drafts through each field's checks
 * (usePersistentToolState.js, toolDraftShape.js; the November build's
 * handoff, section 2). The question engine's own response kinds did not: the
 * multi-answer boxes, the table, the number line, the graph workspace, Step
 * Algebra, the intercept workflow, a composed question's steps, the lab and
 * a secure test's field item read what storage (or the server's copy) held
 * and drew it. A record where a typed answer belongs, a sketch that was not
 * a list of strokes, a construction missing its placements threw in the
 * first render, or in the first Undo after it, and QuestionModuleBoundary
 * showed "This question could not be displayed" on every reload and every
 * Chromebook until the student started the question fresh.
 *
 * Now every such read goes through checkedQuestionDraft.js, with the
 * module's own shape (toolDraftShape.js) and the platform's rule for the kind
 * the draft starts as. fixtures/moduleDraftDamageCases.json holds one draft
 * per place a module threw on the build before (fa22bb2b); each test below
 * opens the drafts its fix covers, in the real module mounted as
 * QuestionEngine mounts it (helpers/toolUndoRender.mjs openModule), and then
 * makes a student's first moves: types into the first box, presses the first
 * button, presses Undo, submits, then leaves and comes back. None throws, and
 * the valid part of the draft comes back. The same is asked of the registry tools' damage cases
 * (fixtures/toolDraftDamageCases.json), which the restore sweep checked on
 * the first render only.
 *
 * The other half: every valid draft recorded for these modules (in Chromium,
 * by the draft-persistence and cross-device journeys; the classwork
 * capture's Step Algebra draft; the scenes' own) is read back as the very
 * value saved, with nothing reported.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { openToolUndoRenderer, errorText } from './helpers/toolUndoRender.mjs';
import { RESPONSE_MODULE_SCENES } from './fixtures/toolDraftScenes.mjs';
import { UNPRINTABLE, damagedCopies, hostileValues } from './helpers/hostileDraftValues.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const CASES = JSON.parse(read('tests/platform/fixtures/moduleDraftDamageCases.json')).cases;
const RECORDED = JSON.parse(read('tests/platform/fixtures/moduleDraftValidRecords.json')).scenes;
const TOOL_CASES = JSON.parse(read('tests/platform/fixtures/toolDraftDamageCases.json')).cases;

let rendererPromise = null;
const renderer = () => { rendererPromise ||= openToolUndoRenderer({ cacheName: 'module-draft-damage' }); return rendererPromise; };
after(async () => { if (rendererPromise) await (await rendererPromise).close(); });

const SCENES = new Map(RESPONSE_MODULE_SCENES.map((scene) => [scene.id, scene]));
const sceneOf = (id) => { const scene = SCENES.get(id); assert.ok(scene, `scene ${id}`); return scene; };

/** Open `scene` on `drafts` (or, for a secure item, its saved `payload`). */
const openScene = async (scene, { drafts = {}, payload = null, draftKey = null } = {}) => {
  const r = await renderer();
  if (scene.kind === 'lab') {
    return r.openModule(scene.module, { drafts, draftKey, render: ({ Module, h }) => h(Module, { rawLabSpec: scene.question, disabled: false, onServerGraded() {}, revealEvaluation: true }) });
  }
  if (scene.kind === 'secure') {
    return r.openModule(scene.module, { render: ({ Module, h }) => h(Module, { question: scene.question, mode: 'secureTest', draftKey: null, initialResponsePayload: payload, navigationMode: true, onSubmit: async () => ({}), onDraftChange() {} }) });
  }
  return r.openModule(scene.module, { question: { questionId: `module:${scene.id}`, id: `module:${scene.id}`, ...scene.question }, props: scene.props || {}, drafts, draftKey });
};

/**
 * A student's first moves: type into the first box, press the first button
 * that is the module's own (not Undo, a hint or a view control), press Undo,
 * submit; then go to another question and come back (`scene` given), which
 * opens the module again on what those moves saved. Stops at the first error.
 */
const firstMoves = async (opened, scene = null) => {
  const done = {};
  const { interact } = opened;
  for (const [move, run] of [
    ['type', () => interact.type('7')],
    ['press', () => interact.press(interact.buttons(interact.NOT_WORK)[0])],
    ['undo', () => interact.undo()],
    ['submit', () => interact.submit()],
  ]) {
    done[move] = await run();
    if (opened.errors.length) return { done, failedAt: move, errors: opened.errors };
  }
  if (scene && scene.kind !== 'secure') {
    await opened.close();
    const again = await openScene(scene, { draftKey: opened.draftKey });
    await again.close();
    done.reopen = true;
    if (again.errors.length || panelShown(again)) return { done, failedAt: 'reopen', errors: again.errors };
  }
  return { done, failedAt: null, errors: [] };
};

const panelShown = (opened) => /This question could not be displayed/.test(opened.text());

/* ---------------------------------------------- every read is a checked one */

const MODULE_SCENES = RESPONSE_MODULE_SCENES.filter((scene) => !scene.kind);
const validDraftsOf = (scene) => [
  ...Object.entries(scene.valid || {}).flatMap(([suffix, values]) => values.map((value) => ({ [suffix]: value }))),
  ...(RECORDED[scene.id] || []),
];

test('every draft a response module reads back is checked, and a structured one by the module\'s own shape', async () => {
  const problems = [];
  const reached = new Set();
  for (const scene of MODULE_SCENES) {
    for (const drafts of [{}, ...validDraftsOf(scene)]) {
      const opened = await openScene(scene, { drafts });
      await opened.close();
      opened.direct.forEach((entry) => problems.push(`${scene.id}: ${entry.key} read directly by ${entry.file}`));
      opened.asked.forEach((entry) => {
        reached.add(`${scene.id}${entry.key.slice(opened.draftKey.length)}`);
        const structured = entry.fallback === null || typeof entry.fallback === 'object';
        if (structured && typeof entry.normalize !== 'function') problems.push(`${scene.id}: ${entry.key.slice(opened.draftKey.length)} starts as ${JSON.stringify(entry.fallback)} and has no normalize`);
      });
    }
  }
  assert.deepEqual([...new Set(problems)], []);
  // Not vacuous: the drafts of every module were reached.
  for (const expected of ['fraction-simplify:fraction', 'table:table', 'multi-answer:multi-answer', 'graph-line:line', 'number-line:number-line', 'graph-story:graph-story',
    'function-graph:graph-construction', 'graph-analysis:graph-analysis', 'step-algebra:step-algebra', 'relation:multi-relation', 'linear-intercepts:linear-intercepts',
    'workflow-rich:workflow-responses', 'workflow-rich:workflow-stage', 'guided-coach:guided-step', 'graph-scenario-match:graph-scenario-match', 'graph-comparison:graph-comparison',
    'relationship-model:relationship-model', 'context-interpretation:context-interpretation']) {
    assert.ok(reached.has(expected), `${expected} is read through the check`);
  }
});

test('nothing in src reads a question draft from storage but the checked reads', () => {
  // A module that reads storage itself skips every check above.
  const ALLOWED = new Set([
    'src/questionDraftStorage.js',
    'src/platform/persistence/checkedQuestionDraft.js',
    'src/tools/shared/usePersistentToolState.js',
    'src/platform/workView/persistedMathUndo.js',
  ]);
  const offenders = [];
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url)).forEach((name) => {
    const path = `${dir}/${name}`;
    if (statSync(new URL(`../../${path}`, import.meta.url)).isDirectory()) return walk(path);
    if (!/\.(m?js|jsx)$/.test(name) || ALLOWED.has(path)) return undefined;
    if (/\breadQuestionDraft\s*\(/.test(executableSource(read(path)))) offenders.push(path);
    return undefined;
  });
  walk('src');
  assert.deepEqual(offenders, []);
});

/* -------------------- the drafts that threw open, and survive the first moves */

const FIXES = [...new Set(CASES.map((entry) => entry.fix))].sort();
test('the damage fixture holds the drafts of every fix', () => {
  assert.ok(CASES.length >= 150, `${CASES.length} damaged drafts`);
  for (const fix of ['platform-kind', 'src/MultiAnswerGrader.jsx', 'src/InteractiveGraphWorkspace.jsx', 'src/algebraDraftState.js', 'src/platform/workflow/workflowResponseDraft.js',
    'src/components/labs/InteractiveModelingLabPlayer.jsx', 'src/components/question/RichQuestionRuntime.jsx']) {
    assert.ok(FIXES.includes(fix), fix);
  }
  assert.ok(!FIXES.includes('unknown'));
});

for (const fix of FIXES) {
  const title = fix === 'platform-kind'
    ? 'every module: a draft that starts as text, a number or true / false and held anything else opens as its own kind'
    : `${fix}: the damaged drafts that threw open with their valid part, and a student's first moves throw nothing`;
  test(title, async () => {
    for (const entry of CASES.filter((candidate) => candidate.fix === fix)) {
      const scene = sceneOf(entry.scene);
      const label = `${entry.scene} ${entry.suffix} ${entry.damage} (threw "${entry.threw.message}" ${entry.threw.when})`;
      const opened = await openScene(scene, { drafts: entry.drafts || {}, payload: entry.payload ?? null });
      assert.deepEqual(errorText(opened), [], `${label}: the module opens`);
      assert.ok(!panelShown(opened), `${label}: no panel`);
      if (scene.kind === 'lab') {
        assert.ok(opened.hydrated.some((field) => field.result.issues.length), `${label}: the repair is reported`);
      } else if (!scene.kind) {
        const check = opened.checked.find((candidate) => candidate.key.endsWith(entry.suffix));
        assert.ok(check, `${label}: the draft was read through the check`);
        assert.ok(check.result.issues.length > 0, `${label}: the repair is reported`);
      }
      const moves = await firstMoves(opened, scene);
      await opened.close();
      assert.equal(moves.failedAt, null, `${label}: ${moves.failedAt}: ${String(moves.errors[0]?.message || moves.errors[0] || 'panel')}`);
    }
  });
}

/* ------------------------------------- the sweep: every kind of damage, every module */

// One of each wrong kind, and each valid draft damaged one part at a time.
const RENDERED = new Set(['null', 'zero', 'text', 'true', 'empty list', 'empty map', 'list of null', 'list of text', 'list of record', 'nested list', 'map of text', 'hostile keys']);
test('every response module opens on every kind of damage, keeps the rest of its drafts, and survives a student\'s first moves', async (t) => {
  const failures = [];
  let opened = 0;
  let moved = 0;
  for (const scene of MODULE_SCENES) {
    const valids = validDraftsOf(scene);
    const richest = Object.assign({}, ...valids);
    const suffixes = new Set([...Object.keys(richest), ...(await (async () => {
      const empty = await openScene(scene);
      await empty.close();
      return empty.asked.map((entry) => entry.key.slice(empty.draftKey.length));
    })())]);
    for (const suffix of suffixes) {
      const damaged = richest[suffix] !== undefined ? damagedCopies(richest[suffix], { long: false }) : [];
      const unprintable = ([name]) => name.endsWith(`= ${UNPRINTABLE}`);
      const cases = [
        ...hostileValues({ long: false }).filter(([name]) => RENDERED.has(name)),
        ...damaged.filter((entry) => !unprintable(entry)).slice(0, 16),
        // A record that cannot become text, in each place a value is drawn from.
        ...damaged.filter(unprintable).slice(0, 10),
      ];
      for (const [index, [name, value]] of cases.entries()) {
        opened += 1;
        const drafts = { ...richest, [suffix]: value };
        const result = await openScene(scene, { drafts });
        const label = `${scene.id} ${suffix} ${name}`;
        if (result.errors.length || panelShown(result)) {
          failures.push(`${label}: ${errorText(result)[0] || 'panel'}`);
          await result.close();
          continue;
        }
        // Every other draft of the scene was valid, and comes back exactly.
        result.checked.forEach((entry) => {
          const other = entry.key.slice(result.draftKey.length);
          if (other === suffix || richest[other] === undefined) return;
          if (!isDeepStrictEqual(entry.result.value, richest[other])) failures.push(`${label}: the valid ${other} did not come back as saved`);
        });
        // A student's first moves on every fourth damage (each kind is reached).
        if (index % 4 === 0) {
          moved += 1;
          const moves = await firstMoves(result, scene);
          if (moves.failedAt) failures.push(`${label}: after ${moves.failedAt}: ${String(moves.errors[0]?.message || moves.errors[0] || 'panel')}`);
        }
        await result.close();
      }
    }
  }
  t.diagnostic(`${opened} damaged drafts opened, ${moved} worked after opening`);
  assert.ok(opened >= 900 && moved >= 220, `${opened} damaged drafts opened, ${moved} worked`);
  assert.deepEqual(failures.slice(0, 30), [], `${failures.length} failures`);
});

/* ------------------------------ the registry tools, after a student starts */

test('every registry tool opened on a draft that once threw survives a student\'s first moves', async (t) => {
  const r = await renderer();
  const failures = [];
  const done = { type: 0, press: 0, undo: 0, submit: 0 };
  const SUBMIT = /^(submit|check|save answer|record|verify)/i;
  for (const damage of TOOL_CASES) {
    const scene = r.scenes.find((candidate) => candidate.id === damage.scene);
    assert.ok(scene, damage.scene);
    const opened = await r.open(scene, { record: damage.record });
    const label = `${damage.scene} ${damage.field} (${damage.damage})`;
    if (opened.errors.length) { failures.push(`${label}: ${errorText(opened)[0]}`); await opened.close(); continue; }
    const { interact } = opened;
    for (const [move, run] of [
      ['type', () => interact.type('-2/3')],
      ['press', () => interact.press(interact.buttons(interact.NOT_WORK)[0])],
      ['undo', async () => { if (!opened.canUndo()) return false; await opened.undo(); return true; }],
      ['submit', () => interact.press(interact.buttons().find((node) => SUBMIT.test(String(node.getAttribute('aria-label') || node.textContent).trim())))],
    ]) {
      if (await run()) done[move] += 1;
      if (opened.errors.length) { failures.push(`${label}: after ${move}: ${errorText(opened)[0]}`); break; }
    }
    await opened.close();
  }
  t.diagnostic(`${TOOL_CASES.length} damaged drafts; typed ${done.type}, pressed ${done.press}, undone ${done.undo}, submitted ${done.submit}`);
  assert.ok(done.type >= 150 && done.press >= 200 && done.undo >= 100 && done.submit >= 100, JSON.stringify(done));
  assert.deepEqual(failures, []);
});

/* --------------------------------------------- valid drafts restore as before */

test('every valid draft recorded for a response module is read back as the very value saved, with nothing reported', async () => {
  let compared = 0;
  for (const scene of MODULE_SCENES) {
    for (const drafts of validDraftsOf(scene)) {
      const opened = await openScene(scene, { drafts });
      await opened.close();
      assert.deepEqual(errorText(opened), [], `${scene.id} opens`);
      for (const [suffix, saved] of Object.entries(drafts)) {
        const check = opened.checked.find((entry) => entry.key.endsWith(suffix));
        assert.ok(check, `${scene.id} ${suffix} was read`);
        compared += 1;
        assert.ok(isDeepStrictEqual(check.result.value, saved), `${scene.id} ${suffix}: restored ${JSON.stringify(check.result.value)?.slice(0, 200)}, saved ${JSON.stringify(saved)?.slice(0, 200)}`);
        assert.deepEqual([check.result.restored, check.result.issues], [true, []], `${scene.id} ${suffix}: nothing to repair`);
      }
      assert.deepEqual(opened.warnings.filter((line) => /repaired a saved draft/.test(line)), [], `${scene.id}: nothing reported`);
    }
  }
  assert.ok(compared >= 40, `${compared} drafts compared`);
});

test('the lab and a secure field item read their valid saved work back as saved', async () => {
  const lab = sceneOf('modeling-lab');
  for (const record of lab.valid[':work:tool']) {
    const opened = await openScene(lab, { drafts: { ':work:tool': record } });
    await opened.close();
    assert.deepEqual(errorText(opened), []);
    Object.entries(record).forEach(([field, saved]) => {
      const entry = opened.hydrated.find((candidate) => candidate.field === field);
      assert.ok(entry && isDeepStrictEqual(entry.result.value, saved) && !entry.result.issues.length, `lab ${field}`);
    });
  }
  const secure = sceneOf('secure-field-item');
  for (const payload of secure.valid.payload) {
    const opened = await openScene(secure, { payload });
    // What each box holds: every regression cell, as saved. A secure Test's
    // field item opens one part at a time (SP-1b): the typed answer, already
    // given, is the line of its part, with the value as saved.
    const shown = opened.interact.boxes().map((node) => String(node.value ?? ''));
    const lines = opened.interact.answeredParts();
    await opened.close();
    assert.deepEqual(errorText(opened), []);
    const cells = payload.toolState.linearRegression.rows.flatMap((row) => (Array.isArray(row) ? row : row.cells));
    assert.deepEqual(shown, cells, 'the regression table is in its boxes as saved');
    assert.deepEqual(lines.find((line) => line.id === 'answer'), { id: 'answer', value: payload.responses.answer }, 'the answer is on its part\'s line as saved');
  }
});

test('the classwork capture\'s Step Algebra draft is read back exactly as saved', async () => {
  const capture = JSON.parse(read('tests/platform/fixtures/classworkQ2RuntimeCapture.json'));
  const saved = capture.persistedDraft[':algebraic:isolate:0:x:step-algebra'];
  const scene = { ...sceneOf('step-algebra'), question: { questionId: 'capture', type: 'stepAlgebra', prompt: 'Isolate x.', equation: `${saved.equation.left} = ${saved.equation.right}`, variable: 'x' } };
  const opened = await openScene(scene, { drafts: { ':step-algebra': saved } });
  await opened.close();
  assert.deepEqual(errorText(opened), []);
  const check = opened.checked.find((entry) => entry.key.endsWith(':step-algebra'));
  assert.deepEqual(check.stored, saved);
  assert.equal(check.result.value, check.stored, 'the very object read back, unchanged');
  assert.deepEqual(check.result.issues, []);
});

// A record that cannot be turned into text is in the sweep's damage too.
test('the sweep\'s damage includes a value that cannot be drawn as text', () => {
  const copies = damagedCopies({ slope: '1' });
  assert.ok(copies.some(([name]) => name.endsWith(`= ${UNPRINTABLE}`)));
});
