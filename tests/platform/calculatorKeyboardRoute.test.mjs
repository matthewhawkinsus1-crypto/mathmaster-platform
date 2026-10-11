// THE CALCULATOR BY KEYBOARD (WCAG 2.1.1, 2.4.3; KEYBOARD_SWEEP S7, job H).
// Escape with focus in the panel closes it and hands focus back to whatever
// opened it (the work bar's Calculator button, or the launcher); the drag
// handle's ↕ is a "Move calculator" button (arrows, Enter = next corner) that
// a pointer still drags by. Browser proof: tests/browser/calculatorKeyboard.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = executableSource(readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8'));

test('Escape in the panel closes it, in the capture phase, and returns focus', () => {
  const escape = region(source, 'const handlePanelKeyDownCapture', 'const panelDimensions', 'Escape handler');
  assert.match(escape, /if \(event\.key !== 'Escape' \|\| event\.isComposing\) return;/);
  assert.match(escape, /event\.stopPropagation\(\);\s*closePanel\(\);/, 'one Escape closes one layer (not a Work View beneath)');
  assert.match(source, /className="mathmaster-calculator-panel"[\s\S]{0,200}onKeyDownCapture=\{handlePanelKeyDownCapture\}/);
  const close = region(source, 'const closePanel = useCallback', 'const handlePanelKeyDownCapture', 'closePanel');
  assert.match(close, /\[openerRef\.current, toggleRef\.current\]\.find\(/, 'the opener first, else the launcher');
  assert.match(close, /setOpen\(false\);\s*target\?\.focus\?\.\(\{ preventScroll: true \}\);/);
  assert.match(source, /aria-label="Close calculator" onClick=\{closePanel\}/, '✕ returns focus too');
});

test('the opener is captured when the panel opens, before focus moves into it', () => {
  const capture = region(source, "if (!isOpen || typeof document === 'undefined') return;", '}, [isOpen]);', 'opener capture');
  assert.ok(source.indexOf("if (!isOpen || typeof document === 'undefined') return;") < source.indexOf('moveToMathfieldEnd'), 'declared before the effect that focuses the field');
  assert.match(capture, /openerRef\.current = active && active !== document\.body && !panelRef\.current\?\.contains\(active\) \? active : null;/);
});

test('Move calculator is a keyboard route; a pointer press on it still drags', () => {
  assert.match(source, /data-calculator-move=""[\s\S]{0,300}onClick=\{moveToNextCorner\}\s*onKeyDown=\{handleMoveKeyDown\}/);
  const drag = region(source, 'const startDrag = (event) => {', 'const moveDrag', 'startDrag');
  assert.match(drag, /closest\?\.\('button:not\(\[data-calculator-move\]\)'\)\) return;/, 'the grip is not excluded from dragging');
  assert.match(drag, /setPointerCapture/, 'the capture keeps a mouse click off the Move button');
  const keys = region(source, 'const handleMoveKeyDown', 'const moveToNextCorner', 'arrow keys');
  assert.match(keys, /nudgeCalculatorPosition\(/);
});
