/*
 * ONE UNDO FOR THE WHOLE BOARD, NOT TWO THAT DISAGREE (R-14, then PQ-009).
 *
 * The multiple-representations board first gave each graph its own Undo while
 * the platform Undo in the action bar was permanently disabled; then the
 * platform Undo learned to pop the graphs' histories, but typed answers, table
 * cells and meanings had no Undo at all. Now the board feeds its whole
 * mathematical record to the platform's `useMathUndoHistory`: the platform
 * Undo takes back the last edit anywhere on the board, and each graph's own
 * Undo is the SAME history filtered to that graph (`undoChangeTo`), so the two
 * can never disagree or replay each other.
 *
 * Node cannot render the board, so the wiring is read from source, each
 * assertion bound to the region that does the work. The behaviour itself is
 * proven twice over: the history and its filter in
 * tests/platform/mathUndoFilteredChange.test.mjs and
 * tests/tools/linearMultipleRepresentationsUndo.test.mjs, and the rendered
 * board in tests/browser/linearMultipleRepresentations.mjs (journeys `undo`,
 * `undo-phone`): edits across four cards, Undo walks them back one at a time,
 * reveals and announces each, never touches a verdict, survives a reload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const board = executableSource(readFileSync(new URL('../../src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', import.meta.url), 'utf8'));

test('the board registers ONE history with the platform Undo: its whole mathematics, kept across a reload', () => {
  assert.match(board, /import useMathUndoHistory, \{ questionUndoResetKey \} from '\.\.\/\.\.\/platform\/workView\/useMathUndoHistory\.js';/);
  const call = region(board, 'const undoHistory = useMathUndoHistory({', '});', 'the board history');
  assert.match(call, /state: undoState,/);
  assert.match(call, /onRestore: restoreBoard,/);
  assert.match(call, /resetKey: questionUndoResetKey\(questionData\),/);
  assert.match(call, /ownerId: 'lmr-board',/);
  assert.match(call, /persist: true,/, 'an Undo after a refresh takes back one step of the restored work');
  // The recorded state is the board's answer, built by the helper that leaves
  // verdicts and layout out.
  assert.match(board, /const undoState = useMemo\(\(\) => boardUndoState\(currentResponse\), \[currentResponse\]\);/);
  // No second owner competing for the button, and no second history.
  assert.doesNotMatch(board, /useActiveUndoOwner|historyRef|editOrderRef/);
});

test('a graph\'s own Undo is the same history, filtered to that graph', () => {
  const graphUndo = region(board, 'const undoGraph = (key) =>', '\n  };', 'the graph Undo');
  assert.match(graphUndo, /return undoHistory\.undoChangeTo\(\[graphUndoField\(key\)\]\);/);
  const graphCanUndo = region(board, 'const canUndo = (key) =>', ';\n', 'the graph Undo state');
  assert.match(graphCanUndo, /undoHistory\.canUndoChangeTo\(\[graphUndoField\(key\)\]\)/);
  const controls = region(board, 'const graphControls = (graph) => (', '\n  );', 'the graph controls');
  assert.match(controls, /onClick=\{\(\) => undoGraph\(graph\.key\)\} disabled=\{!canUndo\(graph\.key\)\}/);
  // Start over is an ordinary change, so it is undoable like a point.
  assert.match(board, /const clearGraph = \(key\) => changeGraph\(key, \[\]\);/);
});

test('an Undo writes back the work it takes back, and never a verdict or the submission result', () => {
  const restore = region(board, 'const restoreBoard = (restored) => {', '\n  };', 'restoreBoard');
  // Only what differs is written, through the same setters the cards use.
  assert.match(restore, /changedBoardFields\(current, restored\)\.forEach\(\(field\) => \{/);
  assert.match(restore, /fieldSetters\[field\]\(restored\[field\]\);/);
  // Never the check fingerprints (an Undo can neither un-check a card nor
  // bring a verdict back), and never the board's submission result.
  assert.doesNotMatch(restore, /setCheckedCards|clearFeedback|submit\(|runCheck|checkContext/);
  const setters = region(board, 'const fieldSetters = {', '\n  };', 'the setters Undo may use');
  assert.doesNotMatch(setters, /setCheckedCards|setExpandedCards/);
});

test('an Undo opens the card it changed, says where it was, and brings it into view without taking focus', () => {
  const restore = region(board, 'const restoreBoard = (restored) => {', '\n  };', 'restoreBoard');
  assert.match(restore, /const changes = boardUndoChanges\(current, restored\);/);
  assert.match(restore, /setExpandedCards\(\(prev\) => \(\{ \.\.\.DEFAULT_EXPANDED, \.\.\.prev, \.\.\.Object\.fromEntries\(closed\.map\(\(key\) => \[key, true\]\)\) \}\)\);/);
  assert.match(restore, /announce\(describeBoardUndo\(changes\)\);/);
  assert.match(restore, /setUndoReveal\(/);
  const reveal = region(board, 'useEffect(() => {\n    if (!undoReveal) return;', '}, [undoReveal]);', 'the reveal');
  assert.match(reveal, /if \(!uncoveredOnScreen\(target\)\) target\.scrollIntoView\?\.\(\{ block: 'center', inline: 'nearest' \}\);/);
  // Keyboard focus stays on the Undo button, so pressing it again still works.
  // The one exception: a graph's own Undo that took back that graph's last
  // step disables itself, and a disabled button drops focus (out of the
  // enlarged graph's dialog). Then, and only then, focus goes to that plane.
  const focusMoves = [...reveal.matchAll(/\.focus\??\.?\(/g)];
  assert.equal(focusMoves.length, 1, 'focus moves in exactly one place');
  assert.match(reveal, /if \(undoReveal\.fromGraph && \(!active \|\| active === document\.body \|\| active\.matches\?\.\(':disabled'\)\)\) \{\s*target\.querySelector\?\.\('svg\[role="application"\]'\)\?\.focus\?\.\(\{ preventScroll: true \}\);/);
  // Read when the Undo runs, not inside the state updater (which runs at the
  // next render, after undoGraph has cleared the ref).
  assert.match(restore, /const fromGraph = graphUndoSourceRef\.current;\s*setUndoReveal\(\(previous\) => \(\{[^}]*fromGraph \}\)\);/);
  // One polite region; a new node per notice, so the same sentence twice is
  // announced twice.
  assert.match(board, /<p aria-live="polite" className="mm-sr-only" data-lmr-announcer="true"><span key=\{notice\.id\}>\{notice\.text\}<\/span><\/p>/);
});

test('the Undo history stays out of the synced draft', () => {
  // A history in the work record is what stopped server backup in #390; the
  // platform keeps it device-local under its own key (persistedMathUndo.js).
  assert.doesNotMatch(board, /usePersistentToolState\('(?:undo|history|editOrder)/i);
});
