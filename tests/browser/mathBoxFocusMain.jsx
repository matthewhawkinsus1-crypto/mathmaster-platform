// Harness for tests/browser/mathBoxFocus.mjs: four real MathInput boxes
// between two buttons, a heading and a message the page can send focus to, and
// a record of where focus went and when, so the driver can press Tab inside
// MathLive's 60 ms hand-over and see where focus ends up.
//
//   ?toggles=0   the boxes without their keypad button (a desktop row that
//                hides it), so Tab goes straight from box to box
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MathInput from '../../src/MathInput.jsx';
import { focusMathFieldWithoutScroll } from '../../src/platform/interaction/mathFieldFocusHandoff.js';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const withToggles = params.get('toggles') !== '0';
const NAMES = ['Slope', 'y-intercept', 'x-intercept', 'Rate'];

// Where focus really is, through the boxes' shadow roots, said as the name a
// person would be read: a box by its label, a button or heading by its words.
const deepActive = () => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
};
const nameOf = (element) => {
  if (!element || element === document.body || element === document.documentElement) return 'page';
  const field = element.getRootNode?.()?.host || (element.localName === 'math-field' ? element : null);
  if (field) return `box:${field.getAttribute('aria-label')}`;
  const test = element.closest?.('[data-test]')?.getAttribute('data-test');
  if (test === 'heading' || test === 'message') return test;
  const toolbar = element.closest?.('[role="toolbar"]');
  if (toolbar) return `keys:${toolbar.closest('[data-box]')?.getAttribute('data-box')}`;
  const box = element.closest?.('[data-box]')?.getAttribute('data-box');
  if (box) return `toggle:${box}`;
  return element.getAttribute?.('aria-label') || element.textContent?.trim() || element.localName;
};

// Every place focus arrived, and every key, with its time: the driver checks
// that its second Tab really came inside the hand-over.
const log = [];
document.addEventListener('focusin', () => { log.push({ type: 'focus', at: performance.now(), name: nameOf(deepActive()) }); }, true);
document.addEventListener('keydown', (event) => { log.push({ type: 'key', at: performance.now(), key: event.key, repeat: event.repeat, name: nameOf(deepActive()) }); }, true);

const field = (name) => document.querySelector(`math-field[aria-label="${name}"]`);
const targets = {
  heading: () => document.querySelector('[data-test="heading"]'),
  message: () => document.querySelector('[data-test="message"]'),
  after: () => document.querySelector('[data-test="after"]'),
};

let moved = null;
window.__mathBoxFocus = {
  where: () => nameOf(deepActive()),
  log: () => log.slice(),
  clear: () => { log.length = 0; },
  // What app code does: once `box` takes focus, move it `delay` ms later to a
  // heading or message (a screen change, feedback), to the next box (as Enter
  // does), or nowhere (a blur). `moved()` says where the move put it.
  moveAwayAfterFocus: (box, { delay = 5, to = 'heading' } = {}) => {
    const host = field(box);
    moved = null;
    const onFocus = () => {
      host.removeEventListener('focusin', onFocus);
      setTimeout(() => {
        if (to === 'blur') document.activeElement?.blur?.();
        else if (to.startsWith('box:')) focusMathFieldWithoutScroll(field(to.slice(4)));
        else targets[to]().focus({ preventScroll: true });
        moved = nameOf(deepActive());
      }, delay);
    };
    host.addEventListener('focusin', onFocus);
  },
  moved: () => moved,
  // The box's focus as the platform gives it (an opening autofocus, Enter to
  // the next box), and as MathfieldElement.focus() gives it (a keypad key, Undo).
  focusBox: (box, how = 'platform') => {
    if (how === 'platform') focusMathFieldWithoutScroll(field(box));
    else field(box).focus();
  },
  // React moves the boxes' elements (a keyed list in a new order): each is
  // disconnected and connected again, and MathLive builds it a new sink.
  reverse: () => reverseBoxes(),
  sinkOf: (box) => field(box)?.shadowRoot?.querySelector('[part="keyboard-sink"]') || null,
};
let reverseBoxes = () => {};

function Harness() {
  const [values, setValues] = useState({});
  const [order, setOrder] = useState(NAMES);
  useEffect(() => { reverseBoxes = () => setOrder((current) => [...current].reverse()); }, []);
  return (
    <main style={{ padding: 16, maxWidth: 560, fontFamily: 'system-ui' }}>
      <h1 data-test="heading" tabIndex={-1} style={{ fontSize: 20 }}>Math box focus</h1>
      <button type="button" data-test="before">Before the boxes</button>
      {order.map((name) => (
        <div key={name} data-box={name} style={{ margin: '10px 0' }}>
          <MathInput
            value={values[name] || ''}
            onChange={(next) => setValues((current) => ({ ...current, [name]: next }))}
            ariaLabel={name}
            hideToolsToggle={!withToggles}
          />
        </div>
      ))}
      <p data-test="message" tabIndex={-1}>A message the page can send focus to.</p>
      <output data-test="values">{JSON.stringify(values)}</output>
      <button type="button" data-test="after">After the boxes</button>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
