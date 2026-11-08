/*
 * WHAT THE MATH TOOLS LAB'S WORK VIEWS FOUND (keypad-done).
 *
 * Every Work View the Lab's tools open is a certified scene now (axe and the contrast review, light and dark) and is
 * walked by Tab in the 2.4.11 walk, at 1366×768 and on a 390×844 phone. Two things they found are Work View's own,
 * so every student's Work View had them, and both are fixed in the shared code:
 *
 *   - Shift+Tab from Work View's first control goes round to its last, and the dialog's trap moved focus there
 *     without scrolling, so the last control (the tool's "Stuck? Show a hint") stayed below the work's visible edge,
 *     under the row of actions (the walk back, on a phone: Transformations Lab, Open Sort Board; WCAG 2.4.11). The trap
 *     now brings it into view inside the dialog, as Tab does, and leaves the page behind still.
 *   - The header shows four whole lines of the task and scrolls the rest: a longer task (Function Investigation's on
 *     a phone) was a box only a finger could scroll (axe: scrollable-region-focusable). While it scrolls, and only
 *     then, it is a Tab stop the arrow keys scroll, as a matrix wider than its box is.
 *
 * The browser proof is the two CI jobs that run the Lab: accessibility-certification.yml
 * browser-accessibility-math-tools-lab (the scenes) and browser-focus-not-obscured (the walk). With either fix taken
 * out, they fail again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revealInDialog } from '../../src/ui/dialogFocus.js';
import { overflowsDownward, overflowsSideways } from '../../src/components/common/matrixScrollRegion.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A page in boxes: each node knows its parent, its place on screen, whether it scrolls up and down, and how far it has
// scrolled; the control moves with every box that scrolls around it.
const page = () => {
  const nodes = new Map();
  const node = (name, { parent = null, top = 0, height = 0, scrollHeight = height, overflowY = 'visible' } = {}) => {
    const entry = { name, parentElement: parent, top, height, overflowY, clientTop: 0, clientHeight: height, scrollHeight, scrolled: 0, scrollLeft: 0 };
    Object.defineProperty(entry, 'scrollTop', {
      get: () => entry.scrolled,
      // A box scrolls no further than it can, as a browser's does.
      set: (value) => { entry.scrolled = Math.max(0, Math.min(value, entry.scrollHeight - entry.clientHeight)); },
    });
    entry.getBoundingClientRect = () => {
      let shift = 0;
      for (let above = entry.parentElement; above; above = above.parentElement) shift += above.scrolled;
      return { top: entry.top - shift, bottom: entry.top - shift + entry.height };
    };
    nodes.set(name, entry);
    return entry;
  };
  return { node, styleOf: (entry) => ({ overflowY: entry.overflowY }) };
};

// Work View on a 390×844 phone: the dialog fills the screen, its work scrolls from 81 to 787 (706px of 830), and the
// tool's last control sits at the bottom of the work, below the part that shows.
const workView = () => {
  const { node, styleOf } = page();
  const pageBehind = node('page', { top: 0, height: 844, scrollHeight: 2400, overflowY: 'auto' });
  const dialog = node('dialog', { parent: pageBehind, top: 0, height: 844 });
  const work = node('work', { parent: dialog, top: 81, height: 706, scrollHeight: 830, overflowY: 'auto' });
  const panel = node('panel', { parent: work, top: 81, height: 830 });
  const hint = node('hint', { parent: panel, top: 81 + 769 - 81, height: 44 });
  return { pageBehind, dialog, work, panel, hint, styleOf };
};

test('the control the trap moves focus to is brought into view inside the dialog, by as little as shows it', () => {
  const { pageBehind, dialog, work, hint, styleOf } = workView();
  assert.ok(hint.getBoundingClientRect().bottom > 787, 'it starts below the work\'s visible edge');
  assert.equal(revealInDialog(hint, dialog, { styleOf }), 1, 'one part scrolled');
  assert.equal(work.scrollTop, 769 + 44 - 787, 'the work, by exactly the part that was out of view');
  assert.equal(hint.getBoundingClientRect().bottom, 787, 'its bottom at the work\'s lower edge');
  // Never the page behind the dialog, and never sideways.
  assert.equal(pageBehind.scrollTop, 0);
  assert.equal(work.scrollLeft, 0);
  assert.equal(dialog.scrollTop, 0);
});

test('a control above the part that shows comes down to its upper edge; one in view, or in a part that does not scroll, stays', () => {
  const { dialog, work, hint, styleOf } = workView();
  work.scrollTop = 124;
  hint.top = 100; // near the top of the work, scrolled up out of view
  assert.equal(revealInDialog(hint, dialog, { styleOf }), 1);
  assert.equal(hint.getBoundingClientRect().top, 81, 'its top at the work\'s upper edge');
  // Already in view: nothing moves.
  const before = work.scrollTop;
  assert.equal(revealInDialog(hint, dialog, { styleOf }), 0);
  assert.equal(work.scrollTop, before);
  // A part that does not scroll (overflow visible) is not scrolled, however long it is.
  const { dialog: other, work: still, hint: below, styleOf: style } = workView();
  still.overflowY = 'visible';
  assert.equal(revealInDialog(below, other, { styleOf: style }), 0);
  assert.equal(still.scrollTop, 0);
});

test('a control taller than the part that shows keeps its top in view', () => {
  const { dialog, work, hint, styleOf } = workView();
  hint.height = 900;
  hint.scrollHeight = 900;
  work.scrollHeight = 1800;
  revealInDialog(hint, dialog, { styleOf });
  assert.equal(hint.getBoundingClientRect().top, 81, 'its top, not its bottom, is brought to the edge');
  assert.equal(revealInDialog(null, dialog, { styleOf }), 0);
  assert.equal(revealInDialog(hint, null, { styleOf }), 0);
  // A control the dialog does not hold is left alone, and so is everything around it, the page included.
  const { pageBehind, dialog: elsewhere, work: around, hint: outside, styleOf: style } = workView();
  elsewhere.contains = () => false;
  assert.equal(revealInDialog(outside, elsewhere, { styleOf: style }), 0);
  assert.deepEqual([around.scrollTop, pageBehind.scrollTop], [0, 0]);
});

test('the dialog\'s trap brings into view the control it moves focus to, and keeps the page behind still', () => {
  const source = executableSource(read('src/ui/Dialog.jsx'));
  const keys = region(source, 'const onKeyDown = (event) => {', '\n    };', 'the trap\'s keys');
  assert.match(keys, /items\[index\]\.focus\(\{ preventScroll: true \}\);\s*revealInDialog\(items\[index\], dialog\);/, 'focus without the browser\'s scroll, then the dialog\'s own parts');
  assert.match(source, /import \{[^}]*\brevealInDialog\b[^}]*\} from '\.\/dialogFocus\.js';/);
});

test('Work View\'s header task is a Tab stop while it scrolls, and only then', () => {
  assert.equal(overflowsDownward({ scrollHeight: 140, clientHeight: 73 }), true, 'six lines in a box of four');
  assert.equal(overflowsDownward({ scrollHeight: 73, clientHeight: 73 }), false, 'a task that fits');
  assert.equal(overflowsDownward({ scrollHeight: 74, clientHeight: 73 }), false, 'a pixel of rounding is not a scroll');
  assert.equal(overflowsDownward({}), false);
  assert.equal(overflowsSideways({ scrollWidth: 312, clientWidth: 286 }), true, 'a word longer than its line');
  assert.equal(overflowsSideways({ scrollWidth: 286, clientWidth: 286 }), false, 'a task that fits its width');
  assert.equal(overflowsSideways({ scrollWidth: 287, clientWidth: 286 }), false, 'a pixel of rounding is not a scroll');
  assert.equal(overflowsSideways({}), false);
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  const header = region(figure, '<header className="mathmaster-work-view-header">', '</header>', 'the Work View header');
  const task = region(header, '<div\n              ref={taskRef}', '>', 'the header task');
  assert.match(task, /role="group"\s*aria-label="Your task"\s*tabIndex=\{taskScrolls \? 0 : undefined\}/, 'named as before, and a stop only while it scrolls');
  const measure = region(figure, 'const [taskScrolls, setTaskScrolls] = useState(false);', '}, [enlarged, taskWords]);', 'the measure');
  assert.match(measure, /if \(!enlarged \|\| !box\) \{\s*setTaskScrolls\(false\);/, 'no stop while Work View is closed');
  assert.match(measure, /const measure = \(\) => setTaskScrolls\(\/\^\(auto\|scroll\)\$\/\.test\(window\.getComputedStyle\(box\)\.overflowY\) && \(overflowsDownward\(box\) \|\| overflowsSideways\(box\)\)\);/, 'taller or wider than its box, in a box that scrolls (not a short phone\'s one clipped line)');
  assert.match(measure, /observer\.observe\(box\);\s*if \(box\.parentElement\) observer\.observe\(box\.parentElement\);/, 'again when it or the header around it changes size');
  assert.match(measure, /words\.observe\(box, \{ subtree: true, childList: true, characterData: true \}\);/, 'again when its words change, which leaves the clamped box its size');
  assert.match(measure, /document\.fonts\?\.ready\?\.then\(\(\) => \{ if \(!gone\) measure\(\); \}\);/, 'again once the fonts have loaded');
  // The box it measures is the one the stylesheet clamps to whole lines and lets scroll.
  const css = executableSource(read('src/components/common/WorkViewShell.css'));
  assert.match(css, /\.mathmaster-work-view-persistent-task \{ max-height: calc\(1\.35em \* 4\); overflow-y: auto; overflow-wrap: anywhere; \}/, 'a word longer than the line wraps, so the task does not scroll sideways');
});
