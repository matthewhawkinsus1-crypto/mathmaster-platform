// Harness for tests/browser/accessibilityKeyboardReachSelfTest.mjs: one React
// page that is right for the keyboard, and ?plant=<name> pages that are wrong in
// exactly one way, so the Tab walk (accessibilityKeyboardReach.mjs) can be shown
// to find each thing it claims to find and to leave the right page alone.
//
// React renders it because the walk reads React's own props to find controls that
// answer a click and no key (a plain DOM page has none). The real Dialog is used
// for the dialog plants, because the walk is judged on what that Dialog does.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Dialog from '../../src/ui/Dialog.jsx';
import CoordinatePlane from '../../src/tools/shared/CoordinatePlane.jsx';
import '../../src/platform/math/mathliveRuntime.js';
import { useMathFieldName } from '../../src/platform/math/mathFieldName.js';

const plant = new URLSearchParams(window.location.search).get('plant') || 'clean';
const noop = () => {};

// Right: every one of these must pass the walk.
function Correct() {
  return (
    <>
      <button type="button">Save</button>
      <label>Nickname <input type="text" /></label>
      <a href="#top">Back to top</a>
      <label>Due <input type="date" /></label>
      {/* A disclosure: its summary is a stop, and what it hides is not one until it opens. */}
      <details>
        <summary>More settings</summary>
        <button type="button">Hidden until opened</button>
        <input aria-label="Hidden field" />
      </details>
      {/* A card that opens on a click, with the button that does the same by key inside it. */}
      <div onClick={noop} style={{ padding: 8 }}><button type="button" onClick={noop}>Open the card</button></div>
      {/* A custom control that answers Enter and Space as well as a click. */}
      <div role="button" tabIndex={0} onClick={noop} onKeyDown={noop}>Custom button</div>
      {/* A wrapper that only keeps a click from reaching the card around it: not an action. */}
      <div onClick={(event) => event.stopPropagation()}><span>A points balance</span></div>
      {/* Focus shown by a child, not by the control: the picture changes, its own style does not. */}
      <button type="button" className="dot-ring"><span className="dot" />Mark</button>
      <style>{'.dot-ring:focus-visible { outline: none; } .dot { display: inline-block; width: 16px; height: 16px; margin-right: 6px; background: #ddd; } .dot-ring:focus-visible .dot { background: #d00; }'}</style>
    </>
  );
}

// A math box named the way the app names one: on MathLive's keyboard sink,
// inside the shadow root, which is where focus really lands (mathFieldName.js).
function NamedMathBox({ name = 'Slope' }) {
  const ref = React.useRef(null);
  useMathFieldName(ref, name);
  return <math-field ref={ref} aria-label={name} style={{ display: 'block', minWidth: 160, border: '1px solid #888' }} />;
}

const PLANTS = {
  clean: () => <Correct />,
  // A control with focus styling removed and nothing put in its place.
  noRing: () => (
    <>
      <Correct />
      <button type="button" className="no-ring">Remove</button>
      <style>{'.no-ring:focus-visible { outline: none; box-shadow: none; }'}</style>
    </>
  ),
  // A Tab stop that is announced as nothing.
  unnamed: () => (<><Correct /><button type="button" onClick={noop} /></>),
  // A math box named on its keyboard sink, where focus is: a named stop (the
  // walk once named the <math-field> host, and called every math box unnamed).
  mathBox: () => (<><Correct /><NamedMathBox /></>),
  // Math boxes with a control after them. MathLive gives a box focus from a
  // 60 ms timer: a Tab pressed sooner is pulled back into the box, and Tab from
  // one box to the next leaves focus in the first for those 60 ms. The walk
  // must wait out both (CI's headless shell, reading focus a few ms after each
  // Tab, stopped on "Slope"). Four boxes, so it meets the hand-over three
  // times. No findings.
  mathBoxesThenControl: () => (
    <>
      <Correct />
      {['Slope', 'y-intercept', 'x-intercept', 'Rate'].map((name) => <NamedMathBox key={name} name={name} />)}
      <button type="button">After the boxes</button>
    </>
  ),
  // A math box named nowhere: its sink is announced as nothing, and the walk says so.
  unnamedMathBox: () => (<><Correct /><math-field style={{ display: 'block', minWidth: 160, border: '1px solid #888' }} /></>),
  // A plane that only shows a graph: no Tab stop, and nothing a pointer does
  // there that a key cannot (the walk once counted it as pointer-only).
  readOnlyPlane: () => (<><Correct /><CoordinatePlane xMin={-5} xMax={5} yMin={-5} yMax={5} points={[[1, 2]]} ariaLabel="Graph of the trip" /></>),
  // Something that answers a click and nothing else.
  pointerOnly: () => (<><Correct /><div onClick={noop} style={{ padding: 8 }}>Open the row</div></>),
  // A Tab stop with a click handler and no key handler (a div that says it is a button).
  notActivatable: () => (<><Correct /><div role="button" tabIndex={0} onClick={noop}>Looks like a button</div></>),
  // The first control, under a sticky bar; the page's own controls start below the bar.
  obscured: () => (
    <>
      <button type="button" style={{ position: 'absolute', top: 10, left: 10 }}>Under the bar</button>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 50, background: '#ccc', zIndex: 10 }}>A sticky bar</div>
      <Correct />
    </>
  ),
  // A control Tab will not leave.
  trap: () => (<><Correct /><input aria-label="Stuck" onKeyDown={(event) => { if (event.key === 'Tab') event.preventDefault(); }} /></>),
  // A control that Tab goes past: the first button sends focus to the third.
  skipped: () => {
    const third = React.useRef(null);
    return (
      <>
        <Correct />
        <button type="button" onKeyDown={(event) => { if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); third.current?.focus(); } }}>First</button>
        <button type="button">Second, which Tab never lands on</button>
        <button type="button" ref={third}>Third</button>
      </>
    );
  },
  // Right for the keyboard, and scrolled a little at the start, with a page taller than the window and a
  // box that scrolls inside it. Tab scrolls both to reach the controls at their far ends; the walk must
  // put them back where they were (not to the top), or the next scene on a page opens where this one ended.
  scrolling: () => {
    const scroller = React.useRef(null);
    React.useEffect(() => {
      window.scrollTo(0, 40);
      scroller.current.scrollTop = 10;
    }, []);
    return (
      <>
        <Correct />
        <div ref={scroller} data-scroller style={{ height: 60, overflow: 'auto', border: '1px solid #888' }}>
          <button type="button">Inside one</button>
          <div style={{ height: 120 }} />
          <button type="button">Inside two</button>
        </div>
        <div style={{ height: 1400 }} />
        <button type="button">Far below</button>
      </>
    );
  },
  // A modal that holds focus: the real Dialog, with a disclosure in the middle of it.
  dialog: () => (
    <>
      <button type="button">Behind the dialog</button>
      <Dialog aria-label="Settings" onClose={noop}>
        <button type="button">First control</button>
        <details>
          <summary>More</summary>
          <button type="button">Inside the disclosure</button>
        </details>
        <button type="button">After the disclosure</button>
        <details>
          <summary>Advanced</summary>
          <button type="button">Hidden at the end</button>
        </details>
      </Dialog>
      <button type="button">Also behind</button>
    </>
  ),
  // A modal with one control, as the Find palette is: Tab has nowhere to go, and the dialog holds it there.
  singleControlDialog: () => (
    <>
      <button type="button">Behind the dialog</button>
      <Dialog aria-label="Find" onClose={noop}>
        <input aria-label="Search" type="search" />
        <ul role="listbox" aria-label="Results"><li role="option" aria-selected="false">One result</li></ul>
      </Dialog>
    </>
  ),
  // A modal with two controls, the last of which Tab will not leave: still a trap, however few controls the walk saw.
  dialogSwallowsTab: () => (
    <>
      <button type="button">Behind the dialog</button>
      <Dialog aria-label="Stuck" onClose={noop}>
        <button type="button">Before</button>
        <input aria-label="Stuck" onKeyDown={(event) => { if (event.key === 'Tab') event.preventDefault(); }} />
      </Dialog>
    </>
  ),
  // A modal that does not: aria-modal, and Tab walks out of it into the page.
  leakyDialog: () => (
    <>
      <div role="dialog" aria-modal="true" aria-label="Leaky" tabIndex={-1}>
        <button type="button">One</button>
        <button type="button">Two</button>
      </div>
      <button type="button">Behind the dialog</button>
    </>
  ),
};

function Page() {
  const Plant = PLANTS[plant];
  if (!Plant) return <p>Unknown plant {plant}</p>;
  return (
    <main>
      <h1 id="top">Keyboard reach self-test: {plant}</h1>
      <Plant />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Page />);
