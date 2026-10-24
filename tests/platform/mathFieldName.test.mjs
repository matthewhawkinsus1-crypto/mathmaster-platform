/*
 * Every math box is named where focus lands (student pass 3, A11Y-3).
 *
 * The defect: a screen reader lands in MathLive's keyboard sink, which carries
 * no name; MathInput named only the <math-field> host, so every classroom
 * answer box (assignments, Recovery, corrections, Live Challenge field
 * questions, Work View) was heard as an unnamed text box. MathLive also
 * rewrites the sink's aria-label itself whenever the field takes focus.
 *
 * The binder (platform/math/mathFieldName.js) is tested as behaviour against
 * a fake field; MathInput's wiring is asserted against the region that does
 * the work. The real field is checked in a browser by
 * tests/browser/studentAccessibleNames.mjs (the focused element's AX name).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMathFieldName, mathFieldAccessibleName, nameMathFieldSink } from '../../src/platform/math/mathFieldName.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const fakeElement = () => {
  const attributes = new Map();
  return {
    attributes,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute(name, value) {
      attributes.set(name, String(value));
      fakeWindow.observers.filter((entry) => entry.target === this && !entry.disconnected).forEach((entry) => entry.pending.push(name));
    },
  };
};

const fakeWindow = {
  observers: [],
  MutationObserver: class {
    constructor(callback) { this.callback = callback; this.pending = []; this.disconnected = false; }
    observe(target, options) { this.target = target; this.options = options; fakeWindow.observers.push(this); }
    disconnect() { this.disconnected = true; }
  },
  customElements: { whenDefined: () => new Promise(() => {}) },
};
// Deliver queued mutation records, as the browser does after the task.
const flushMutations = () => {
  for (let round = 0; round < 5; round += 1) {
    const due = fakeWindow.observers.filter((entry) => !entry.disconnected && entry.pending.length);
    if (!due.length) return round;
    due.forEach((entry) => { const records = entry.pending.splice(0); entry.callback(records); });
  }
  throw new Error('the observer keeps rewriting the name: a write loop');
};

const fakeField = ({ sink = fakeElement() } = {}) => {
  const listeners = {};
  const field = {
    sink,
    shadowRoot: { querySelector: (selector) => (/keyboard-sink/.test(selector) ? field.sink : null) },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((entry) => entry !== fn); },
    dispatch: (type) => (listeners[type] || []).forEach((fn) => fn({ type })),
    listeners,
  };
  return field;
};

test('the sink gets the field\'s name as soon as it exists', () => {
  fakeWindow.observers = [];
  const field = fakeField();
  bindMathFieldName(field, 'Slope', { win: fakeWindow });
  assert.equal(field.sink.getAttribute('aria-label'), 'Slope');
});

test('MathLive rewriting the sink\'s label on focus is undone (its "line" announcement sets "")', () => {
  fakeWindow.observers = [];
  const field = fakeField();
  bindMathFieldName(field, 'Slope', { win: fakeWindow });
  field.sink.setAttribute('aria-label', '');
  flushMutations();
  assert.equal(field.sink.getAttribute('aria-label'), 'Slope');
  field.sink.setAttribute('aria-label', 'x plus 2');
  flushMutations();
  assert.equal(field.sink.getAttribute('aria-label'), 'Slope', 'whatever MathLive writes there');
});

test('a sink MathLive rebuilt is named on the next focusin, and watched from then on', () => {
  fakeWindow.observers = [];
  const field = fakeField();
  bindMathFieldName(field, 'Answer', { win: fakeWindow });
  field.sink = fakeElement();
  field.dispatch('focusin');
  assert.equal(field.sink.getAttribute('aria-label'), 'Answer');
  field.sink.setAttribute('aria-label', '');
  flushMutations();
  assert.equal(field.sink.getAttribute('aria-label'), 'Answer');
});

test('cleanup stops naming; a field with no sink yet, or no name, is left alone', () => {
  fakeWindow.observers = [];
  const field = fakeField();
  const stop = bindMathFieldName(field, 'Answer', { win: fakeWindow });
  stop();
  field.sink.setAttribute('aria-label', '');
  flushMutations();
  field.dispatch('focusin');
  assert.equal(field.sink.getAttribute('aria-label'), '');
  assert.deepEqual(field.listeners.focusin, []);

  const unupgraded = { addEventListener() {}, removeEventListener() {} };
  assert.doesNotThrow(() => bindMathFieldName(unupgraded, 'Answer', { win: fakeWindow })());
  assert.equal(nameMathFieldSink(unupgraded, 'Answer'), null);
  const unnamed = fakeField();
  bindMathFieldName(unnamed, '', { win: fakeWindow });
  assert.equal(unnamed.sink.getAttribute('aria-label'), null);
});

test('naming never loops: writing the same name again is not a mutation', () => {
  fakeWindow.observers = [];
  const field = fakeField();
  bindMathFieldName(field, 'Answer', { win: fakeWindow });
  field.sink.setAttribute('aria-label', '');
  assert.ok(flushMutations() <= 2);
});

const MATH_INPUT = executableSource(componentSource('src/MathInput.jsx'));

// AX01: finished work is read-only, no longer inert, and a screen reader
// reviewing it hears the box. MathLive hides its typeset math, so a closed
// question's box says the answer in its name, in MathDisplay's words.
test('a closed question\'s math box is named with the answer it holds; an open one by its label', () => {
  assert.equal(mathFieldAccessibleName({ name: 'Slope', value: '\\frac{2}{3}' }), 'Slope', 'open: the label only');
  assert.equal(mathFieldAccessibleName({ name: 'Slope', value: '\\frac{2}{3}', closed: true }), 'Slope: 2 over 3');
  assert.equal(mathFieldAccessibleName({ name: 'Equation', value: 'y=-\\frac{2}{3}x+4', closed: true }), 'Equation: y equals negative 2 over 3 x plus 4');
  assert.equal(mathFieldAccessibleName({ name: 'Slope', value: '', closed: true }), 'Slope: nothing entered');
  assert.equal(mathFieldAccessibleName({ name: '', value: '7', closed: true }), 'Math answer: 7', 'the fallback name still leads');
  assert.equal(mathFieldAccessibleName({ name: '  ', value: '7' }), 'Math answer');
});

test('MathInput names its sink with the same name as the field host', () => {
  assert.match(MATH_INPUT, /^import \{ mathFieldAccessibleName, useMathFieldName \} from '\.\/platform\/math\/mathFieldName\.js';$/m);
  const body = region(MATH_INPUT, 'export default function MathInput(', '\n  return (', 'MathInput hooks');
  // The label (ariaLabel, else the placeholder), with the answer once the
  // question is closed (the lifecycle's terminal), for host and sink alike.
  const name = body.match(/const (\w+) = mathFieldAccessibleName\(\{ name: ariaLabel \|\| placeholder, value, closed: questionTerminal \}\);/);
  assert.ok(name, 'one name for the field');
  assert.match(body, /const \{ terminal: questionTerminal \} = useQuestionLifecycle\(\);/);
  assert.match(body, new RegExp(`useMathFieldName\\(mfRef, ${name[1]}\\);`), 'the sink of THIS field gets it');
  const host = region(MATH_INPUT, '<math-field', '/>', 'the math-field host');
  assert.match(host, new RegExp(`aria-label=\\{${name[1]}\\}`), 'the host keeps the same name');
});

// MathInput takes its name as `ariaLabel`; an `aria-label` prop never reaches
// the field, and the box was called by its placeholder (Function Operations'
// four boxes were all "Enter an expression in x").
test('no caller names a MathInput with an aria-label prop it ignores', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const root = new URL('../../', import.meta.url).pathname;
  const files = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : (name.endsWith('.jsx') ? [full] : []);
  });
  const offenders = files(join(root, 'src')).flatMap((file) => [...executableSource(readFileSync(file, 'utf8')).matchAll(/<MathInput\b[\s\S]*?\/>/g)]
    .filter((match) => /\saria-label=/.test(match[0]))
    .map((match) => `${relative(root, file)}: ${match[0].slice(0, 80)}…`));
  assert.deepEqual(offenders, []);
});

// Review: two boxes students reach (QuestionEngine renders both graders) fell
// back to a generic name. Each is named by what is on screen beside it.
test('the fraction and literal-equation boxes have their own names', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
  const box = (source) => source.match(/<MathInput\b[\s\S]*?\/>/)?.[0] || '';
  assert.match(box(read('src/FractionGrader.jsx')), /\bariaLabel="Fraction answer"/);
  // The visible label is "x =" (the variable solved for): the name says the same.
  assert.match(box(read('src/LiteralGrader.jsx')), /\bariaLabel=\{`\$\{solveFor\} =`\}/);
});
