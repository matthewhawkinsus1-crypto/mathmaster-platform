/*
 * OPENING WORK VIEW LAYS THE PAGE OUT ONCE BEFORE ITS FIRST FRAME.
 *
 * Work View's open forced 4 layouts (the runtime driver's trace mode): its
 * header task was measured in a layout effect, again once fonts.ready (long
 * since resolved) came back, and again inside the ResizeObservers' delivery
 * right after the sticky bars' observers had written (the bars under Work
 * View hide as it opens); the viewport was read after the page lock's
 * restyle; and its controls were measured after that restyle too. Now the
 * only one left is the dialog's first focus check, the first read after the
 * commit. What node can see of that is the components' source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Work View measures its controls before it locks the page, and its observers read nothing after a write', () => {
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  // Passive effects run in the order they are declared.
  const insets = figure.indexOf("root.style.setProperty('--mm-work-view-actions'");
  const lock = figure.indexOf("root.style.overflow = 'hidden';");
  assert.ok(insets > 0 && lock > insets, 'the controls are measured before the lock restyles the page');
  const observer = region(figure, 'new ResizeObserver((entries) => {', '})', 'the controls\' observer');
  assert.match(observer, /borderBoxSize/, 'the size its observer reports');
  assert.doesNotMatch(observer, /getBoundingClientRect/);
  const task = region(figure, 'const [taskScrolls, setTaskScrolls] = useState(false);', '}, [enlarged, taskWords]);', 'the header task');
  assert.match(task, /new ResizeObserver\(measureNextFrame\)/, 'the header task is measured in the frame after its observer reports');
});
