/*
 * ONE UNDO THAT WORKS, NOT TWO THAT DISAGREE (student UX pass, R-14).
 *
 * The multiple-representations board gave each graph its own Undo, while the
 * platform Undo in the action bar — the one every other question uses — was
 * permanently disabled on it. The board now registers with the platform Undo
 * (useActiveUndoOwner): it takes back the student's most recent graph change,
 * on whichever graph, popping the SAME per-graph history the graph's own Undo
 * pops, so the two can never disagree. Measured in a browser: plot on Graph 1,
 * plot on Graph 2, platform Undo twice → Graph 2 then Graph 1 emptied, button
 * disabled, its title naming the graph each time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const board = executableSource(readFileSync(new URL('../../src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', import.meta.url), 'utf8'));

test('every graph change is recorded in one cross-graph order', () => {
  const change = board.slice(board.indexOf('const changeGraph = (key, next) => {'), board.indexOf('const plotPoint'));
  assert.match(change, /historyRef\.current\[key\] = \[\.\.\.historyRef\.current\[key\]\.slice\(-19\), current\];\s*editOrderRef\.current = \[\.\.\.editOrderRef\.current\.slice\(-59\), key\];/);
});

test('a graph\'s own Undo and the platform Undo pop the same history', () => {
  const undo = board.slice(board.indexOf('const undoGraph = (key) => {'), board.indexOf('const clearGraph'));
  assert.match(undo, /historyRef\.current\[key\] = stack\.slice\(0, -1\);\s*const lastEdit = editOrderRef\.current\.lastIndexOf\(key\);/);
  const platform = board.slice(board.indexOf('const platformUndo = useMemo'), board.indexOf("useActiveUndoOwner({ id: 'linear-representations-graphs'"));
  assert.match(platform, /onUndo: \(\) => \{\s*const key = \[\.\.\.editOrderRef\.current\]\.reverse\(\)\.find\(\(entry\) => historyRef\.current\[entry\]\?\.length > 0\);\s*if \(key\) undoGraphRef\.current\(key\);/);
  assert.match(platform, /canUndo: Boolean\(lastUndoableGraph\)/);
  assert.match(board, /useActiveUndoOwner\(\{ id: 'linear-representations-graphs', controller: platformUndo \}\);/);
  assert.match(board, /import \{ useActiveUndoOwner \} from '\.\.\/\.\.\/platform\/workView\/useMathUndoHistory\.js';/);
});

test('histories stay out of the synced draft', () => {
  // The order, like the per-graph histories, lives in refs: a history in the
  // draft record is what stopped server backup in #390.
  assert.match(board, /const editOrderRef = useRef\(\[\]\);/);
  assert.doesNotMatch(board, /usePersistentToolState\('editOrder/);
});
