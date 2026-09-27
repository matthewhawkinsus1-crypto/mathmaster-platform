import test from 'node:test';
import assert from 'node:assert/strict';

import { createFieldEchoGuard } from '../../src/platform/interaction/fieldEchoGuard.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// Live QA, Algebra I District DOL #2: typing `40+5x` quickly into a math field
// saved `405x` or `4+x`. The prop carrying `40` arrived after the field already
// held `40+`, was written back, and the next key typed onto it.

test('a late echo of the field’s own value is not written back over newer typing', () => {
  const guard = createFieldEchoGuard();
  // The student types 4, 0, + faster than the parent re-renders.
  guard.emitted('4');
  guard.emitted('40');
  guard.emitted('40+');
  // The parent's renders arrive one by one, each behind the field.
  assert.equal(guard.shouldWrite('40+', '4'), false);
  assert.equal(guard.shouldWrite('40+', '40'), false);
  // Caught up: nothing to write, and the history is spent.
  assert.equal(guard.shouldWrite('40+', '40+'), false);
});

test('a change from outside the field is still written', () => {
  const guard = createFieldEchoGuard();
  guard.emitted('40+5x');
  assert.equal(guard.shouldWrite('40+5x', '40+5x'), false);
  // Reset Question, a restored draft, or Undo put a value the field never
  // emitted — or emitted long ago — into the prop.
  assert.equal(guard.shouldWrite('40+5x', ''), true, 'reset');
  assert.equal(guard.shouldWrite('', '40+5'), true, 'undo to an earlier value once typing has settled');
});

test('an outside change arriving mid-burst still wins', () => {
  const guard = createFieldEchoGuard();
  guard.emitted('4');
  guard.emitted('40');
  assert.equal(guard.shouldWrite('40', 'x+1'), true);
  // The burst's history was dropped with it: a stale `4` is no longer an echo.
  assert.equal(guard.shouldWrite('x+1', '4'), true);
});

test('MathInput reports through the guard and syncs its prop through it', () => {
  const source = executableSource(componentSource('src/MathInput.jsx'));
  // Every upward report is recorded, so none can later look like an outside change.
  assert.doesNotMatch(source, /onChangeRef\.current\(mathField\.value\)/, 'a report that bypasses emit() would be written back over newer typing');
  const emitDefinition = region(source, 'const emit = useCallback(', '}, []);', 'emit');
  assert.match(emitDefinition, /echoGuardRef\.current\.emitted\(/);
  // The only write of the prop into the field is the one the guard allows.
  const writes = source.match(/\.value = value \|\| ''/g) || [];
  assert.equal(writes.length, 1, 'one place writes the prop into the field');
  assert.match(
    source,
    /if \([^)]*echoGuardRef\.current\.shouldWrite\([^)]*\)\) \{\s*[A-Za-z.]+\.value = value \|\| ''/,
    'the prop is written into the field only when the guard says it is not a stale echo',
  );
});
