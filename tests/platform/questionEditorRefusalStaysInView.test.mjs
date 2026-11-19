/*
 * A REFUSED INCLUDE STAYS IN VIEW WHILE PRE-FLIGHT'S FINDINGS LAND.
 *
 * On a 390x844 phone, an Include pressed on a replaced question in the editor's
 * first second or two was explained, and scrolled into view; then Pre-Flight's
 * findings landed, every card above grew by 78px, and the explanation sat 480px
 * under the dialog's footer (tests/browser/questionEditorSupersession.mjs,
 * REFUSED: "the refusal is not fully visible where the teacher pressed").
 * Now the notice is revealed again once the new findings are drawn, until the
 * teacher moves the view themselves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEACHER_MOVE_EVENTS, keepRevealedWhileFindingsLand } from '../../src/components/teacher/keepRevealedWhileFindingsLand.js';
import { createPreflightFindingsStore } from '../../src/components/teacher/useQuestionPreflightFindings.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Findings as the editor's Pre-Flight publishes them, a fresh object each time.
let runs = 0;
const findings = () => {
  runs += 1;
  return { byQuestionId: new Map([['q1', { warnings: [], notes: [`note ${runs}`] }]]), assignment: { warnings: [], notes: [] } };
};

// Frames run only when the test says so.
const frames = () => {
  let next = 1;
  const queue = new Map();
  return {
    nextFrame: (run) => { const id = next; next += 1; queue.set(id, run); return id; },
    cancelFrame: (id) => { queue.delete(id); },
    flush: () => { const due = [...queue.values()]; queue.clear(); due.forEach((run) => run()); },
    pending: () => queue.size,
  };
};

const setup = ({ motion = 'smooth' } = {}) => {
  const reveals = [];
  const notice = { scrollIntoView: (options) => reveals.push(options) };
  const area = new EventTarget();
  const store = createPreflightFindingsStore();
  const clock = frames();
  const stop = keepRevealedWhileFindingsLand({
    target: () => notice, area, store, motion, nextFrame: clock.nextFrame, cancelFrame: clock.cancelFrame,
  });
  return { reveals, area, store, clock, stop };
};

test('the notice is revealed at once, and again once new findings have been drawn', () => {
  const { reveals, store, clock } = setup();
  assert.deepEqual(reveals, [{ block: 'nearest', behavior: 'smooth' }], 'with the teacher\'s motion preference');
  store.publish(findings(), { source: 1 });
  assert.equal(reveals.length, 1, 'not while the regions are still drawing');
  clock.flush();
  assert.equal(reveals.length, 1, 'one frame is not enough: layout comes after the regions re-render');
  clock.flush();
  assert.deepEqual(reveals.at(-1), { block: 'nearest', behavior: 'auto' }, 'instantly: the teacher already saw it move');
  assert.equal(reveals.length, 2);
});

test('findings published several times before a frame reveal once', () => {
  const { reveals, store, clock } = setup();
  store.publish(findings(), { source: 1 });
  store.publish(findings(), { source: 2 });
  store.publish(findings(), { source: 3 });
  assert.equal(clock.pending(), 1);
  clock.flush();
  clock.flush();
  assert.equal(reveals.length, 2);
});

test('once the teacher scrolls, taps, clicks or types, the view is theirs', () => {
  for (const type of TEACHER_MOVE_EVENTS) {
    const { reveals, area, store, clock } = setup();
    area.dispatchEvent(new Event(type));
    store.publish(findings(), { source: 1 });
    clock.flush();
    clock.flush();
    assert.equal(reveals.length, 1, `${type}: nothing moves it back`);
  }
  // A move between the publication and the second frame counts too.
  const { reveals, area, store, clock } = setup();
  store.publish(findings(), { source: 1 });
  clock.flush();
  area.dispatchEvent(new Event('wheel'));
  clock.flush();
  assert.equal(reveals.length, 1);
});

test('the cleanup stops listening, cancels a pending reveal, and leaves the area as it found it', () => {
  const { reveals, area, store, clock, stop } = setup({ motion: 'auto' });
  store.publish(findings(), { source: 1 });
  stop();
  assert.equal(clock.pending(), 0, 'the pending reveal is cancelled');
  store.publish(findings(), { source: 2 });
  clock.flush();
  clock.flush();
  assert.deepEqual(reveals, [{ block: 'nearest', behavior: 'auto' }]);
  // Its listeners are gone: a new run starts clean.
  const again = keepRevealedWhileFindingsLand({ target: () => ({ scrollIntoView: () => reveals.push('again') }), area, store, nextFrame: clock.nextFrame, cancelFrame: clock.cancelFrame });
  store.publish(findings(), { source: 3 });
  clock.flush();
  clock.flush();
  assert.deepEqual(reveals.slice(-2), ['again', 'again']);
  again();
});

test('nothing to reveal, no area or no store is not an error', () => {
  const stop = keepRevealedWhileFindingsLand({ target: () => null });
  stop();
  keepRevealedWhileFindingsLand()();
});

test('the editor keeps a refused Include in view this way, in its own scroll area', () => {
  const editor = executableSource(readFileSync(new URL('../../src/AssignmentQuestionEditorBase.jsx', import.meta.url), 'utf8'));
  const effect = region(editor, 'useEffect(() => {\n    if (!inclusionNotice) return undefined;', '}, [inclusionNotice, preflightStore]);', 'the refusal\'s effect');
  assert.match(effect, /return keepRevealedWhileFindingsLand\(\{\s*target: \(\) => inclusionAlertRef\.current,\s*area: scrollAreaRef\.current,\s*store: preflightStore,\s*motion: scrollMotion\(\),\s*\}\);/);
  // The area is the dialog's one scroll area, between its header and footer.
  assert.match(editor, /<div ref=\{scrollAreaRef\} style=\{\{ padding: '20px 24px', overflowY: 'auto' \}\}>/);
  assert.match(editor, /const preflightStore = useQuestionPreflightFindings\(/);
});
