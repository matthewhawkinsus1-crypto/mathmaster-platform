import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_CRITERIA, GATE_SUMMARY_FIELDS, gateLines, gateVerdict, sceneFailures } from '../browser/support/keyboardSweepGate.mjs';

/*
 * CI09 (VH-16): the keyboard sweep (tests/browser/keyboardSweep.mjs) can judge
 * its own report. This file proves the judging, without a browser:
 *   - each criterion fails a scene that breaks it, and only that criterion;
 *   - what is only reported (a plain disclosure that stays open, a Check the
 *     generic probe could not satisfy, stops off screen) never fails one;
 *   - an empty run, and a report missing a field the gate reads, are not passes;
 *   - the sweep still writes every field the gate reads, and still has the legacy
 *     question types in its scenes.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A scene that breaks nothing: what the sweep writes for a tool with a clean keyboard route. */
const clean = (sceneKey = 'demo') => ({
  sceneKey,
  pageErrors: [],
  renderFailure: null,
  summary: {
    tabStops: 12,
    reachedEnd: true,
    trap: null,
    reverseReachedStart: true,
    reverseTrap: null,
    noVisibleFocus: [],
    focusHiddenUnderOverlay: [],
    unnamed: [],
    offscreenStops: [],
    pointerNotReachable: [],
    pointerNotActivatable: [],
    dragOnly: [],
    escapeFailures: [],
    keyboardUncloseable: [],
    dialogFocusLeaks: [],
    checks: [{ result: 'graded' }],
    focusDroppedAfterLoadMs: null,
    focusLostAfterCheck: [],
    focusLostAfterAction: null,
  },
});
const with_ = (changes, sceneKey) => {
  const entry = clean(sceneKey);
  const { summary, ...rest } = changes;
  return { ...entry, ...rest, summary: { ...entry.summary, ...summary } };
};
const ids = (entry) => sceneFailures(entry).map((failure) => failure.id);

test('a clean scene breaks nothing', () => {
  assert.deepEqual(sceneFailures(clean()), []);
});

test('each criterion fails a scene that breaks it, and only that criterion', () => {
  const breaks = {
    ran: { error: 'Error: page.waitForSelector: Timeout' },
    rendered: { renderFailure: 'This question could not be displayed' },
    pageErrors: { pageErrors: ['TypeError: x is not a function'] },
    forwardTrap: { summary: { reachedEnd: false, trap: { kind: 'cycle' } } },
    reverseTrap: { summary: { reverseReachedStart: false, reverseTrap: { kind: 'wrapped-to-end' } } },
    noVisibleFocus: { summary: { noVisibleFocus: [{ id: 'k4' }] } },
    focusHidden: { summary: { focusHiddenUnderOverlay: [{ id: 'k5', by: 'div.work-bar' }] } },
    unnamed: { summary: { unnamed: [{ id: 'k6' }] } },
    mouseOnly: { summary: { pointerNotReachable: [{ id: 'k7' }] } },
    notActivatable: { summary: { pointerNotActivatable: [{ id: 'k8' }] } },
    cannotClose: { summary: { escapeFailures: [{ name: 'Menu' }] } },
    focusLost: { summary: { focusLostAfterCheck: ['Check'] } },
  };
  assert.deepEqual(Object.keys(breaks).sort(), GATE_CRITERIA.map((criterion) => criterion.id).sort(), 'one case for every criterion');
  for (const [id, changes] of Object.entries(breaks)) {
    assert.deepEqual(ids(with_(changes)), [id], id);
  }
});

test('the several ways to break one criterion each count', () => {
  const failures = (changes, id) => sceneFailures(with_(changes)).find((failure) => failure.id === id)?.count ?? 0;
  assert.equal(failures({ summary: { reachedEnd: true, trap: { kind: 'cycle' } } }, 'forwardTrap'), 1, 'a trap on the way to the end');
  assert.equal(failures({ summary: { reachedEnd: false, trap: null } }, 'forwardTrap'), 1, 'an end never reached');
  assert.equal(failures({ summary: { reverseReachedStart: true, reverseTrap: { kind: 'cycle' } } }, 'reverseTrap'), 1);
  assert.equal(failures({ summary: { dragOnly: [{ verdict: 'not-reachable' }, {}] } }, 'mouseOnly'), 2, 'drag-only');
  assert.equal(failures({ summary: { dragOnly: [{ verdict: 'wrapper' }] } }, 'mouseOnly'), 0, 'a draggable card that holds the buttons for the same thing is judged by them');
  assert.equal(failures({ summary: { checks: [{ result: 'enabled-but-not-reached-by-Tab' }] } }, 'mouseOnly'), 1, 'an enabled Check Tab never reaches');
  assert.equal(failures({ summary: { keyboardUncloseable: [{ kind: 'dialog' }, { kind: 'floating-panel' }] } }, 'cannotClose'), 2, 'a dialog or a panel with no keyboard way out');
  assert.equal(failures({ summary: { dialogFocusLeaks: [{}] } }, 'cannotClose'), 1, 'Tab leaving a modal');
  assert.equal(failures({ summary: { focusDroppedAfterLoadMs: 600 } }, 'focusLost'), 1, 'focus falling to <body> on its own');
  assert.equal(failures({ summary: { focusLostAfterAction: 3 } }, 'focusLost'), 3, 'after an action that removes its button');
  assert.equal(failures({ summary: { noVisibleFocus: [{}, {}, {}] } }, 'noVisibleFocus'), 3);
});

test('what is only reported never fails a scene', () => {
  const reported = with_({
    summary: {
      // Read aloud's panel: opened, no Escape, no control that closes it. A disclosure traps nobody.
      keyboardUncloseable: [{ name: 'Read aloud', kind: 'disclosure', closedByEscape: false, closedByKeyboardControl: false }],
      // The probe cannot answer every tool, so a Check it cannot satisfy proves nothing.
      checks: [{ result: 'no-response' }, { result: 'disabled' }, { result: 'feedback-changed' }],
      offscreenStops: [{ id: 'k9' }],
    },
  });
  assert.deepEqual(sceneFailures(reported), []);
  assert.equal(gateVerdict([reported]).ok, true);
});

test('the verdict: an empty run fails; one broken scene fails the run and is named; the counts add up', () => {
  assert.equal(gateVerdict([]).ok, false, 'nothing measured is not a pass');
  assert.equal(gateVerdict(undefined).ok, false);
  assert.match(gateLines(gateVerdict([])).join('\n'), /no scene was measured/);

  const passing = gateVerdict([clean('a'), clean('b')]);
  assert.deepEqual([passing.ok, passing.scenes, passing.failing], [true, 2, []]);
  assert.match(gateLines(passing).join('\n'), /passed - 2 scenes/);

  const verdict = gateVerdict([
    clean('a'),
    with_({ summary: { pointerNotReachable: [{}, {}], unnamed: [{}] } }, 'fraction:legacy'),
    with_({ summary: { pointerNotReachable: [{}] } }, 'graphStory:legacy'),
  ]);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failing.map((scene) => scene.scene), ['fraction:legacy', 'graphStory:legacy']);
  assert.deepEqual(verdict.counts, { mouseOnly: 3, unnamed: 1 });
  const text = gateLines(verdict).join('\n');
  assert.match(text, /FAILED - 2 of 3 scenes/);
  assert.match(text, /mouseOnly \(2\.1\.1\): 3/);
  assert.match(text, /fraction:legacy: unnamed 1, mouseOnly 2/);
  assert.match(text, /graphStory:legacy: mouseOnly 1/);
});

test('a report without a field the gate reads is an error, never a pass', () => {
  for (const name of GATE_SUMMARY_FIELDS) {
    const entry = clean();
    delete entry.summary[name];
    assert.throws(() => sceneFailures(entry), new RegExp(`no "${name}"`), name);
  }
  assert.throws(() => sceneFailures({ sceneKey: 'x' }), /out of step/, 'a scene with no summary at all');
  const notAList = clean();
  notAList.summary.unnamed = 0;
  assert.throws(() => sceneFailures(notAList), /not a list/);
});

// --- the sweep itself ---------------------------------------------------------

const sweep = readFileSync(path.join(repo, 'tests/browser/keyboardSweep.mjs'), 'utf8');

test('the sweep writes every summary field the gate reads', () => {
  const start = sweep.indexOf('entry.summary = {');
  assert.notEqual(start, -1, 'the sweep builds a summary per scene');
  const block = sweep.slice(start, sweep.indexOf('\n  };', start));
  const written = [...block.matchAll(/^ {4}(\w+):/gm)].map((match) => match[1]);
  for (const name of GATE_SUMMARY_FIELDS) assert.ok(written.includes(name), `the sweep's summary has ${name}`);
});

test('the legacy question types QuestionEngine mounts from src/*.jsx are scenes of the sweep', async () => {
  // The types its switch hands to a grader outside the tool registry (algebra is an alias of stepAlgebra).
  const engine = readFileSync(path.join(repo, 'src/QuestionEngine.jsx'), 'utf8');
  const switchStart = engine.indexOf('switch (processedQuestion.type) {');
  assert.notEqual(switchStart, -1);
  const mounted = [...engine.slice(switchStart, engine.indexOf("default:", switchStart)).matchAll(/case '(\w+)':/g)]
    .map((match) => match[1])
    .filter((type) => !['modelingLab', 'algebra', 'platformQuestionError'].includes(type));
  assert.ok(mounted.length >= 15, `${mounted.length} legacy types in the switch`);
  const scenes = sweep.slice(sweep.indexOf('const LEGACY_SCENES = ['), sweep.indexOf(".map((scene) => ({ spec: null, ...scene, legacy: true }))"));
  for (const type of mounted) assert.match(scenes, new RegExp(`toolId: '${type}'`), `${type} has a scene`);
  // …and each has an example for the harness to mount it with (or a spec of its own).
  const { QUESTION_TYPE_CATALOG } = await import('../../src/platform/contract/questionTypeCatalog.js');
  for (const type of mounted) assert.ok(QUESTION_TYPE_CATALOG[type]?.example, `the catalog has an example of ${type}`);
});

test('a browser that cannot launch fails the sweep under --gate, and is only reported without it', () => {
  // A stand-in for Playwright whose browser will not start: the one run that
  // needs no real browser.
  const dir = mkdtempSync(path.join(tmpdir(), 'keyboard-sweep-'));
  const stub = path.join(dir, 'playwright.mjs');
  writeFileSync(stub, "export const chromium = { launch: async () => { throw new Error('no browser in this test'); } };\n");
  const report = path.join(repo, 'tests/browser/artifacts/keyboard/report-launch-test.json');
  const run = (...flags) => spawnSync(process.execPath, ['tests/browser/keyboardSweep.mjs', '--out=launch-test', ...flags], {
    cwd: repo, env: { ...process.env, PLAYWRIGHT_MODULE: stub }, encoding: 'utf8',
  });
  try {
    const audit = run();
    assert.equal(audit.status, 0, `an audit always exits 0: ${audit.stdout}${audit.stderr}`);
    assert.match(audit.stdout, /Browser launch failed/);
    const gate = run('--gate');
    assert.equal(gate.status, 1, `a gate that could not look has not passed: ${gate.stdout}${gate.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(report, { force: true });
  }
});

test('--gate judges a measured run by the verdict, and a page that listed no registry tool fails it', () => {
  // The measured run needs a real browser, so the lines that decide its exit code are read.
  assert.match(sweep, /const verdict = gateVerdict\(tools\);[\s\S]*process\.exit\(verdict\.ok \? 0 : 1\);/);
  assert.match(sweep, /allIds\.length === 0\) \{ verdict\.ok = false;/, 'a page that listed no registry tool fails it');
});
