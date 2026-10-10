// HOW THE SECURE ANSWER FIELD AND THE GRAPHING CALCULATOR ARE WIRED.
//
// Node cannot render these components, so this reads their source — bound to
// the statement or region that does the work (tests/platform/helpers/
// sourceContract.mjs), with forbidden-identifier checks run on executable
// code only. The behaviour each assertion protects is in its message; if one
// fails after a refactor, check that behaviour before touching the regex
// (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md). The pure halves are tested
// directly: secureMathAnswerRoundTrip.test.mjs, graphingCalculatorModel.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { READ_ONLY_EDITOR_ACTIONS, SECURE_EDITOR_HELD_EVENTS, readOnlyEditorAction } from '../../src/platform/assessment/secureAnswerEntry.js';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const FIELD = read('src/components/assessment/SecureMathAnswerField.jsx');
const PANEL = read('src/components/assessment/GraphingCalculatorPanel.jsx');

// ------------------------------------------------------ SecureMathAnswerField

test('the field picks its editor from the entry policy, not from a list of its own', () => {
  const component = region(FIELD, 'export default function SecureMathAnswerField', '\n}\n', 'the field');
  assert.match(component, /const entry = useMemo\(\(\) => secureAnswerEntryFor\(field\), \[field\]\);/);
  assert.match(component, /\{entry\.editor === SECURE_ANSWER_EDITORS\.MATH \? \(\s*<MathEditor/, 'the math editor only where the policy says the grader reads it');
  assert.match(component, /\) : \(\s*<TextEditor/);
  assert.match(FIELD, /^import \{\n\s*READ_ONLY_EDITOR_ACTIONS, SECURE_ANSWER_EDITORS, SECURE_EDITOR_HELD_EVENTS, readOnlyEditorAction, secureAnswerEntryFor,\n\} from '\.\.\/\.\.\/platform\/assessment\/secureAnswerEntry\.js';$/m);
});

test('what the editor holds is what is passed up — unchanged, and never while the answer is held', () => {
  const emit = region(FIELD, 'const emit = useCallback((next) => {', '}, []);', 'emit');
  assert.match(emit, /\n\s*if \(readOnlyRef\.current\) return;\n\s*onChangeRef\.current\?\.\(String\(next \?\? ''\)\);\s*$/, 'emit passes the exact value, after the read-only gate');
  const math = region(FIELD, 'function MathEditor(', '\n}\n', 'the math editor');
  const input = region(math, '<MathInput', '/>', 'MathInput');
  assert.match(input, /\n\s*value=\{value\}/);
  assert.match(input, /\n\s*onChange=\{emit\}/, 'MathInput reports straight to emit');
  assert.match(input, /\n\s*toolProfile=\{entry\.toolProfile\}/, 'the keypad the answer needs');
  const text = region(FIELD, 'function TextEditor(', '\n}\n', 'the text editor');
  assert.match(text, /onChange=\{\(event\) => emit\(event\.target\.value\)\}/);
  assert.match(text, /\n\s*type="text"/);
});

// A tiny stand-in for the DOM the hold reads: elements with a tag, a parent,
// closest(tag) and a wrapper that contains(node).
const element = (tag, parent = null) => ({
  tag,
  parent,
  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.tag === selector) return node;
    return null;
  },
});
const wrapperOf = (root) => ({ contains: (node) => { for (let n = node; n; n = n.parent) if (n === root) return true; return false; } });

test('a held answer swallows every way into the editor, lets shortcuts reach the integrity logger, and never traps Tab', () => {
  const { PASS, CANCEL, HOLD } = READ_ONLY_EDITOR_ACTIONS;
  const root = element('div');
  const field = element('math-field', root);
  const keypad = element('div', root);
  const key = element('button', keypad);
  const keyLabel = element('span', key);
  const outside = element('button', element('div'));
  const wrapper = wrapperOf(root);
  const held = (event) => readOnlyEditorAction(event, { readOnly: true, wrapper });

  // The keypad: a click on any of its buttons (or what is inside one) is held.
  assert.equal(held({ type: 'click', target: key }), HOLD, 'a keypad key does not insert while the answer is held');
  assert.equal(held({ type: 'click', target: keyLabel }), HOLD, 'nor does a tap on the label inside a key');
  assert.equal(held({ type: 'click', target: field }), PASS, 'a click that only places the caret is fine');
  assert.equal(held({ type: 'click', target: outside }), PASS, 'buttons elsewhere on the page are not this field\'s');
  // Typing: characters (the backslash MathInput inserts itself included) and editing keys.
  for (const typed of ['9', 'x', '\\', ' ', '/', 'Backspace', 'Delete', 'Enter', 'Unidentified', 'Process']) {
    assert.equal(held({ type: 'keydown', key: typed, target: field }), HOLD, `${JSON.stringify(typed)} is held`);
  }
  for (const moving of ['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Shift', 'Control']) {
    assert.equal(held({ type: 'keydown', key: moving, target: field }), PASS, `${moving} is not held: the field is no trap`);
  }
  // Shortcuts type nothing; their default is cancelled and they travel on to
  // the document, where examIntegrityLogger.js records Ctrl+C/V/X.
  for (const letter of ['c', 'v', 'x', 'z', 'a']) {
    assert.equal(held({ type: 'keydown', key: letter, ctrlKey: true, target: field }), CANCEL, `Ctrl+${letter}`);
    assert.equal(held({ type: 'keydown', key: letter, metaKey: true, target: field }), CANCEL, `⌘${letter}`);
  }
  assert.equal(held({ type: 'keydown', key: '\\', ctrlKey: true, target: field }), HOLD, 'MathInput inserts a backslash whatever the modifier');
  // The clipboard reaches the logger too; drag and drop and raw input do not get in.
  assert.equal(held({ type: 'paste', target: field }), CANCEL);
  assert.equal(held({ type: 'cut', target: field }), CANCEL);
  assert.equal(held({ type: 'drop', target: field }), HOLD);
  assert.equal(held({ type: 'beforeinput', target: field }), HOLD);
  assert.equal(held({ type: 'keydown', key: '9', target: outside }), PASS, 'only this field');
  // Editable again: nothing is touched.
  for (const event of [{ type: 'click', target: key }, { type: 'keydown', key: '\\', target: field }, { type: 'paste', target: field }]) {
    assert.equal(readOnlyEditorAction(event, { readOnly: false, wrapper }), PASS);
  }
  assert.equal(readOnlyEditorAction({ type: 'click', target: key }, { readOnly: true, wrapper: null }), PASS);
  assert.deepEqual([...SECURE_EDITOR_HELD_EVENTS].sort(), ['beforeinput', 'click', 'cut', 'drop', 'keydown', 'paste']);
});

test('read-only reaches the math field itself, and the hold runs in the capture phase ahead of MathInput', () => {
  const math = region(FIELD, 'function MathEditor(', '\n}\n', 'the math editor');
  const readOnlyEffect = region(math, '  useEffect(() => {', '}, [readOnly]);', 'the read-only effect');
  assert.match(readOnlyEffect, /mathField\.readOnly = Boolean\(readOnly\);/);
  const hold = region(math, 'const holdWhileReadOnly = (event) => {', '};', 'the hold');
  assert.match(hold, /const action = readOnlyEditorAction\(event, \{ readOnly: readOnlyRef\.current, wrapper \}\);/, 'the pure rule decides');
  assert.match(hold, /if \(action === READ_ONLY_EDITOR_ACTIONS\.PASS\) return;\s*event\.preventDefault\(\);\s*if \(action === READ_ONLY_EDITOR_ACTIONS\.HOLD\) event\.stopPropagation\(\);/,
    'cancel what it names; stop only what must not reach the field');
  assert.match(math, /SECURE_EDITOR_HELD_EVENTS\.forEach\(\(type\) => wrapper\.addEventListener\(type, holdWhileReadOnly, \{ capture: true \}\)\);/, 'capture, so it runs before MathInput\'s own handlers');
  const text = region(FIELD, 'function TextEditor(', '\n}\n', 'the text editor');
  assert.match(text, /\n\s*readOnly=\{readOnly\}/);
});

test('the math field\'s accessible name carries the typing hint, which an id reference cannot carry into MathLive', () => {
  const component = region(FIELD, 'export default function SecureMathAnswerField', '\n}\n', 'the field');
  assert.match(component, /<MathEditor[\s\S]*?label=\{nameWithHint\(label, entry\.hint, serverHint\)\}/, 'the hint rides in the field\'s name');
  // MathLive leaves its keyboard sink — where focus lands — unnamed. It is
  // found through the MathLive adapter, which pins the verified selector.
  const math = region(FIELD, 'function MathEditor(', '\n}\n', 'the math editor');
  const nameSink = region(math, 'const nameSink = () => {', '};', 'nameSink');
  assert.match(FIELD, /^import \{ mathFieldKeyboardSink \} from '\.\.\/\.\.\/platform\/math\/mathLiveCompat\.js';$/m);
  assert.match(nameSink, /const sink = mathFieldKeyboardSink\(wrapper\.querySelector\('math-field'\)\);/);
  assert.match(nameSink, /sink\.setAttribute\('aria-label', label\)/);
  assert.match(math, /wrapper\.addEventListener\('focusin', nameSink\);/, 'and again on focus');
  const named = region(FIELD, 'const nameWithHint = (label, hint, fromServer) => {', '\n};', 'nameWithHint');
  assert.match(named, /const spoken = fromServer \? speechTextFor\(hint\) : hint;/, 'a server hint\'s $…$ mathematics is said in words');
  assert.match(component, /<TextEditor[\s\S]*?hintId=\{entry\.hint \? hintId : ''\}/, 'a text box keeps its description');
});

test('the field decides nothing about correctness, and never uses a number input that refuses 3/4', () => {
  const code = executableSource(FIELD);
  assert.doesNotMatch(code, /isCorrect|gradeResponse|gradeItem|sameValue|answerEquivalence|expected|accepted|feedback|verdict/);
  assert.doesNotMatch(code, /type="number"|type=\{'number'\}/);
});

// --------------------------------------------------- GraphingCalculatorPanel

test('JSXGraph is loaded on demand, never in the bundle that every secure test downloads', () => {
  const code = executableSource(PANEL);
  assert.doesNotMatch(code, /^\s*import\b[^;]*['"]jsxgraph['"]/m, 'no static import of jsxgraph');
  const loader = region(PANEL, 'export const loadJsxGraph = () => {', '\n};', 'the loader');
  assert.match(loader, /import\('jsxgraph'\)/);
  assert.match(loader, /jsxGraphLoad = null;\s*throw error;/, 'a failed load can be tried again');
});

test('JSXGraph draws functions the model compiled — it is never handed the text a student typed', () => {
  const draw = region(PANEL, '// Draw every graphable line.', '}, [parsed, graphState, dark]);', 'the draw effect');
  assert.match(draw, /const value = entry\.evaluate\(x\);/);
  assert.match(draw, /board\.create\('functiongraph', \[y\], look\)/);
  assert.match(draw, /board\.create\('line', \[-entry\.x, 1, 0\]/);
  assert.doesNotMatch(executableSource(draw), /\.text\b|lines\[|line\.text/, 'no typed text reaches the board');
  const code = executableSource(PANEL);
  assert.doesNotMatch(code, /\beval\s*\(|new\s+Function\b|\bFunction\s*\(/);
  assert.match(PANEL, /const parsed = useMemo\(\s*\(\) => parseGraphEntries\(lines\.map\(\(line\) => line\.text\), \{ angleMode \}\),/, 'every line is read by the model');
});

test('the panel is offered only where the policy says, and keeps working without the picture', () => {
  const component = region(PANEL, 'export default function GraphingCalculatorPanel', '\n}\n', 'the panel');
  assert.match(component, /\n\s*if \(!available\) return null;/, 'not offered on this item: nothing on screen');
  assert.match(component, /if \(!available && open\) setOpen\(false\);/, 'an open panel closes when the next item does not offer it');
  assert.match(component, /setGraphState\('failed'\)/);
  assert.match(component, /The graph could not load\. Your lines, the table and the trace still work\./);
  assert.match(component, /onClick=\{\(\) => setRetry\(\(count\) => count \+ 1\)\}/, 'and can be tried again');
  const prefetch = region(component, '// Load the graph library while the student is still reading the question.', '}, [available, prefetch]);', 'the prefetch');
  assert.match(prefetch, /if \(!available \|\| !prefetch\) return undefined;/);
  assert.match(prefetch, /loadJsxGraph\(\)\.catch\(\(\) => \{\}\)/);
});

test('every line names the graph it drew in words, with colour and dash, and the graph has a text description', () => {
  const describe = region(PANEL, 'const describeEntry = (entry, style) => {', '\n};', 'describeEntry');
  assert.match(describe, /Graphed as the \$\{style\.name\}\./);
  for (const name of ['blue solid line', 'red dashed line', 'green dotted line', 'purple long-dashed line', 'orange dash-dot line', 'teal wide-dashed line']) {
    assert.ok(PANEL.includes(`name: '${name}'`), `${name}: colour is never the only cue`);
  }
  const styles = PANEL.match(/const LINE_STYLES = Object\.freeze\(\[([\s\S]*?)\]\);/)[1];
  const dashes = [...styles.matchAll(/dash: (\d)/g)].map((match) => match[1]);
  assert.equal(new Set(dashes).size, dashes.length, 'every line has its own dash pattern');
  const board = region(PANEL, 'id={`${baseId}-board`}', '/>', 'the board element');
  assert.match(board, /role="img"/);
  assert.match(board, /aria-label=\{graphDescription\}/);
});

test('removing a line keeps focus in the calculator, and the small boxes read numbers the way a line does', () => {
  const component = region(PANEL, 'export default function GraphingCalculatorPanel', '\n}\n', 'the panel');
  const remove = region(component, 'const removeLine = (id) => {', '\n  };', 'removeLine');
  // The pressed button leaves with its line; focus must not fall to the page,
  // where Escape would no longer reach the panel.
  assert.match(remove, /const target = next\[Math\.min\(Math\.max\(0, index - 1\), next\.length - 1\)\];/);
  assert.match(remove, /\(inputRefs\.current\.get\(target\.id\) \|\| addButtonRef\.current \|\| panelRef\.current\)\?\.focus\(\)/);
  assert.match(component, /const traceNumber = traceTyped \? readNumberEntry\(traceX, \{ angleMode \}\) : null;/, 'trace x = 1/2 is a number');
  assert.match(component, /start: readNumberEntry\(tableStart, \{ angleMode \}\), step: readNumberEntry\(tableStep, \{ angleMode \}\)/, 'an empty start is not 0');
  assert.doesNotMatch(executableSource(component), /Number\(tableStart\)|Number\(tableStep\)|Number\(String\(traceX\)/, 'no Number() on a typed box, which reads an empty one as 0');
});
