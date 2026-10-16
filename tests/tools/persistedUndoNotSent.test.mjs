/*
 * THE UNDO HISTORY STAYS ON THE DEVICE (pass 3 review, note 4).
 *
 * A secure item's drafts are sent to the server by key prefix
 * (RichQuestionRuntime.jsx → saveSecureExamDraft), inside per-item size and
 * entry limits; past them every draft for the item is dropped. The Undo history
 * sits under the same prefix (persistedMathUndo.js) and is a convenience, not
 * work: it must not be sent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPersistedUndoKey, persistedUndoKey, withoutPersistedUndo } from '../../src/platform/workView/persistedMathUndo.js';
import { executableSource } from '../platform/helpers/sourceContract.mjs';

test('the draft family sent for a secure item keeps the work and drops the Undo history', () => {
  const work = { key: 'exam-1:q3:work:tool', value: { value: '-3' }, savedAt: 1 };
  const undo = { key: persistedUndoKey('exam-1:q3:work:tool', 'mathematical-tool'), value: { entries: [] }, savedAt: 1 };
  assert.ok(isPersistedUndoKey(undo.key));
  assert.equal(isPersistedUndoKey(work.key), false);
  assert.deepEqual(withoutPersistedUndo([work, undo]), [work]);
  assert.deepEqual(withoutPersistedUndo(null), []);
});

test('both places the secure runtime sends drafts from use the filter', () => {
  const runtime = executableSource(readFileSync(new URL('../../src/components/question/RichQuestionRuntime.jsx', import.meta.url), 'utf8'));
  const sends = runtime.match(/workspaceDrafts: [^\n]*/g) || [];
  assert.equal(sends.length, 2);
  sends.forEach((line) => assert.match(line, /withoutPersistedUndo\(readQuestionDraftFamily\(draftKey\)\)/));
  assert.match(runtime, /import \{ withoutPersistedUndo \} from '\.\.\/\.\.\/platform\/workView\/persistedMathUndo\.js';/);
});
