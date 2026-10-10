/*
 * PROCESS MODE ON THE RENDERED BOARD — WIRING.
 *
 * Node cannot render the board, so the wiring below is read from source, each
 * assertion bound to the region that does the work
 * (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md). The mathematics it relies on is
 * exercised for real in tests/tools/lmrProcessMode.test.mjs, and the rendered
 * board is driven as a student — laptop, phone, keyboard, reload, DOL — by
 * tests/browser/lmrProcessMode.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCapability, executableSource, region } from './helpers/sourceContract.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const BOARD = 'src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx';
const PROCESS_FILES = [
  'src/tools/representationBridge/process/ProcessWorkspace.jsx',
  'src/tools/representationBridge/process/ProcessMethods.jsx',
  'src/tools/representationBridge/process/ProcessAlgebraMethods.jsx',
  'src/tools/representationBridge/process/ProcessBoardParts.jsx',
  'src/tools/representationBridge/process/processUi.jsx',
  'src/tools/representationBridge/process/processDraft.js',
];
const board = () => executableSource(read(BOARD));
const file = (relPath) => executableSource(read(relPath));

test('Process Mode is chosen by the question, and a Worksheet board\'s work keeps exactly its old shape', () => {
  const source = board();
  assert.match(source, /const processMode = isProcessModeQuestion\(questionData\);/);
  const response = region(source, 'const currentResponse = useMemo(() => ({', '}), [', 'the board\'s work');
  assert.match(response, /\.\.\.\(processMode \? \{ processLog \} : \{\}\),/, 'the process log travels only with a Process Mode board');
  // The work is draft-backed: a refresh, a lost connection or another
  // Chromebook brings back the process and the work in progress.
  assert.match(source, /usePersistentToolState\('processLog', null\)/);
  assert.match(source, /usePersistentToolState\('processDraft', null\)/);
});

test('what the student has established is the shared marking\'s — the function the server grades with — never the device\'s', () => {
  const shim = read('src/tools/representationBridge/lmrProcessMath.js');
  assert.match(shim, /export \* from '\.\.\/\.\.\/\.\.\/functions\/shared\/toolMath\/representationBridge\/lmrProcessVerify\.mjs';/);
  assert.match(shim, /export \* from '\.\.\/\.\.\/\.\.\/functions\/shared\/toolMath\/representationBridge\/lmrProcessModel\.mjs';/);
  const state = region(board(), 'const processState = useMemo(', ');', 'the resolved process');
  assert.match(state, /resolveLmrProcess\(questionData, \{ processLog \}, canonicalFacts, processEnv\)/);
  // A Check asks the same marking, with the activity's feedback policy.
  const check = region(file(PROCESS_FILES[0]), 'const check = () => {', '\n  };', 'the workspace Check');
  assert.match(check, /decideProcessCheck\(\{[^}]*reveal: canCheck/);
  // Work written for another version is never shown or reused: the marking
  // ignores a log bound to another version (tests/tools/lmrProcessMode.test.mjs,
  // "another version starts clean"), and the work in progress opens empty for
  // one.
  const source = board();
  assert.match(region(source, 'const processDraft = useMemo(', ');', 'the work in progress'), /readProcessDraft\(rawProcessDraft, processBinding\)/);
  // ...and it is never ERASED for being seen. Until the first Submit pins the
  // version on the server, another Chromebook can be dealt another version
  // under the same draft key. Erasing the work there reached every device with
  // the next keystroke, and the original version came back with every card
  // locked. So the log changes only when the student records work, and the
  // work in progress only through setProcessDraft, which binds it to the
  // version on screen.
  const record = region(source, 'const recordProcess = (entry, { target, keepOpen = false }) => {', '\n  };', 'recording work');
  assert.equal((source.match(/\bsetProcessLog\(/g) || []).length, 1, 'one place writes the process log');
  assert.match(record, /setProcessLog\(nextLog\);/, 'and it records the student\'s work');
  const rebind = region(source, 'const setProcessDraft = useCallback(', '}), [setRawProcessDraft, processBinding]);', 'setProcessDraft');
  assert.equal((source.match(/\bsetRawProcessDraft\(/g) || []).length, 1, 'one place writes the work in progress');
  assert.match(rebind, /setRawProcessDraft\(\(raw\) => \{[\s\S]*bind: processBinding/, 'and it binds the work to the version on screen');
});

test('a card the student\'s facts have not opened says what it waits for and offers a way to find it — it holds nothing to type into', () => {
  const source = board();
  const equation = region(source, 'const equationCard = (cardId, title, value, setValue, placeholder, hint) => {', 'const verdict = verdictFor(cardId);', 'the equation card');
  assert.match(equation, /if \(processLocked\(cardId\)\) return lockedCard\(cardId, title\);/);
  assert.match(source, /const tableCard = !needs\('table'\) \? null : processLocked\('table'\) \? lockedCard\('table', 'Table of values'\) :/);
  const graphs = region(source, 'const graphCards = GRAPHS.filter((graph) => needs(graph.cardId)).map((graph) => {', 'const verdict = verdictFor(graph.cardId);', 'the graph cards');
  assert.match(graphs, /if \(processLocked\(graph\.cardId\)\) return lockedCard\(graph\.cardId, graph\.title\);/);
  const locked = region(source, 'const lockedCard = (cardId, title) => (', '\n  );', 'the locked card');
  assert.match(locked, /<LockedCardBody [^>]*onFind=\{openProcess\}/);
  assert.doesNotMatch(locked, /MathInput|onPlot|<input/, 'a locked card has nothing to type into');
  assert.match(source, /needs\(graph\.cardId\) && !processLocked\(graph\.cardId\)/, 'a locked graph cannot be enlarged into a workspace');
  // The key features are the facts in "What I know": no typing them.
  assert.match(source, /!processMode && \(featureCards\.length \|\| twoPointsCard\)/);
});

test('"Find …" opens one workspace on the board — not a modal, not a menu — and Back to board returns the student where they were', () => {
  const source = board();
  const open = region(source, 'const openProcess = (target, method = null, origin = null) => {', '\n  };', 'openProcess');
  assert.match(open, /processReturnRef\.current = origin;/);
  assert.match(open, /open: target/);
  const back = region(source, 'const returnFromProcess = () => {', '\n  };', 'returnFromProcess');
  assert.match(back, /origin\?\.isConnected \? origin : boardRef\.current\?\.querySelector\('\[data-process-facts\]'\)/);
  assert.match(back, /\.focus\?\.\(\{ preventScroll: true \}\)/);
  const workspace = file(PROCESS_FILES[0]);
  // It is a board card: Enter in one of its fields checks it, like every card.
  assert.match(workspace, /data-lmr-card="process"/);
  assert.match(workspace, /data-card-check="true"[\s\S]{0,200}\{canCheck \? 'Check' : 'Save'\}/);
  // Enlarged, it is a dialog that Escape closes; the same elements stay mounted.
  assert.match(workspace, /role=\{enlarged \? 'dialog' : 'region'\}/);
  assert.match(workspace, /aria-modal=\{enlarged \? 'true' : undefined\}/);
  assert.match(workspace, /if \(event\.key !== 'Escape'\) return;/);
  // Only the methods that make sense now, plus a line naming the ones that need more.
  assert.match(workspace, /lmrMethodsFor\(question, process, target\)/);
  assert.match(workspace, /lmrLaterMethods\(question, process, target\)/);
});

test('the algebra processes are the platform\'s Step Algebra on the question the server checks — and Enter inside it stays there', () => {
  const algebra = file('src/tools/representationBridge/process/ProcessAlgebraMethods.jsx');
  assert.match(algebra, /import StepByStepAlgebraCore from '\.\.\/\.\.\/\.\.\/StepByStepAlgebraCore\.jsx';/);
  assert.match(algebra, /lmrRewriteQuestion\(env\)/);
  assert.match(algebra, /lmrSubstitutionQuestion\(env, option\.source, zero, facts\)/);
  assert.match(algebra, /<div data-process-algebra="true"/);
  // Its Undo owns the platform Undo only while it has a step to take back.
  assert.match(algebra, /useActiveUndoOwner\(\{ id: 'lmr-process-step-algebra', active: Boolean\(coreUndo\?\.canUndo\), priority: 50, controller: coreUndo \}\)/);
  const enter = region(board(), 'const handleBoardKeyDown = (event) => {', '};', 'the board Enter handler');
  const guard = enter.indexOf("closest?.('[data-process-algebra]')");
  assert.notEqual(guard, -1, 'Enter inside Step Algebra is Step Algebra\'s');
  assert.ok(guard < enter.indexOf('event.preventDefault();'), 'decided before the board takes the key');
});

test('reuse: what a student established is one tap away where they build — never retyped, never auto-filled beyond what they proved', () => {
  const source = board();
  assertCapability(source, [/<KnownPointChips[\s\S]{0,200}verb="Add"[\s\S]{0,120}onUse=\{addKnownRow\}/], 'a known point goes into the table in one tap');
  assertCapability(source, [/<KnownPointChips[\s\S]{0,200}verb="Plot"[\s\S]{0,300}onUse=\{\(point\) => plotPoint\(graph\.key/], 'a known point is plotted in one tap, through the graph\'s own history');
  assert.match(source, /setSlopeInterceptEquation\(factDisplay\(ownEquation\)\)/, 'y = mx + b from their own algebra fills slope-intercept form');
  assert.match(source, /graph1: \(record\) => record\.fact === 'xIntercept' \|\| record\.fact === 'yIntercept'/);
  assert.match(source, /graph2: \(record\) => record\.fact === 'yIntercept'/);
});

test('every Process Mode file speaks the board\'s language, fits a phone, and is declared to the draft-persistence gate', () => {
  for (const relPath of PROCESS_FILES) {
    const source = file(relPath);
    for (const word of [/token/i, /coherence/i, /target line/]) assert.doesNotMatch(source, word, `${relPath}: ${word}`);
    const tracks = [...source.matchAll(/minmax\((min\([^)]*\)|[^,]+),/g)].map((match) => match[1].trim());
    for (const track of tracks) assert.match(track, /^min\(\d+px, 100%\)$/, `${relPath}: grid track ${track} could force horizontal scrolling`);
  }
  const declared = TOOL_STATE_PERSISTENCE.representationBridge.sources;
  for (const relPath of PROCESS_FILES.filter((path) => path.endsWith('.jsx'))) {
    assert.ok(declared.includes(relPath.replace('src/tools/', '')), `${relPath} is audited by the draft-persistence gate`);
  }
  // Touch targets and radio semantics for every choice a student makes.
  const ui = file('src/tools/representationBridge/process/processUi.jsx');
  assert.match(ui, /minHeight: 44/);
  assert.match(ui, /role="radiogroup"/);
  assert.match(ui, /role="radio"\s+aria-checked=\{selected\}/);
});
