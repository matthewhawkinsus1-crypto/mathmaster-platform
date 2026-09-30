/*
 * ONE FIELD, ONE ROW; ONE KEYPAD, THE ACTIVE FIELD'S (student UX pass, R-11).
 *
 * "Show math tools" was a pill on its own line under every math field: seven
 * rows of the same button on the representation board. And on a phone every
 * field's keypad stayed open once visited — the multi-answer grader opened one
 * on arrival for each field needing a fraction — so a three-part question
 * opened as 987px of keypads before the student had touched anything
 * (measured: 598px after).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const source = executableSource(readFileSync(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8'));
const render = source.slice(source.indexOf('return (\n    <div\n      ref={rootRef}'));

test('the tools button sits on the field\'s own row, not on a line of its own', () => {
  const row = render.slice(render.indexOf('className="mathmaster-math-input-row"'), render.indexOf('{requiredKeysVisible && requiredTools.length > 0'));
  assert.match(row, /<math-field[\s\S]*?\/>[\s\S]*?className="mathmaster-math-tools-toggle"/, 'field then toggle, in one flex row');
  assert.match(row, /display: 'flex'/);
  assert.equal((render.match(/mathmaster-math-tools-toggle/g) || []).length, 1, 'no second, standalone pill');
  assert.doesNotMatch(render, />\s*\{showTools \? 'Hide math tools' : 'Show math tools'\}\s*</, 'the old text pill is gone');
});

test('it keeps its name, state and target for assistive technology', () => {
  const toggle = render.slice(render.indexOf('className="mathmaster-math-tools-toggle"'), render.indexOf('</button>', render.indexOf('className="mathmaster-math-tools-toggle"')));
  assert.match(toggle, /aria-label=\{toolsVisible \? 'Hide math tools' : 'Show math tools'\}/);
  assert.match(toggle, /aria-expanded=\{toolsVisible\}/);
  assert.match(toggle, /aria-controls=\{toolsVisible \? toolsId : undefined\}/);
  assert.match(toggle, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/, 'pressing it leaves the caret in the field');
  assert.match(toggle, /minWidth: 44,\s*minHeight: 44/);
  assert.match(render, /<div\s*id=\{toolsId\}\s*className=\{`mathmaster-math-input-tools/);
});

test('on a touch device the keypad and the "needed" keys belong to the active field only', () => {
  assert.match(source, /const toolsVisible = isMobile \? showTools && fieldActive : showTools;/);
  assert.match(source, /const requiredKeysVisible = isMobile && fieldActive;/);
  assert.match(render, /\{requiredKeysVisible && requiredTools\.length > 0 && \(/);
  assert.match(render, /\{toolsVisible && \(/);
  // Moving to another place to TYPE makes it inactive; its own keys and a
  // button tap (a Check right under the keypad) do not — collapsing the keypad
  // under a finger mid-tap moved the button away and the tap missed.
  assert.match(render, /onFocus=\{\(\) => setFieldActive\(true\)\}/);
  const blur = render.slice(render.indexOf('onBlur={(event) => {'), render.indexOf('style={{', render.indexOf('onBlur={(event) => {')));
  assert.match(blur, /if \(rootRef\.current\?\.contains\?\.\(next\)\) return;/);
  assert.match(blur, /const typingElsewhere = Boolean\(next\) && \(\/\^\(MATH-FIELD\|INPUT\|TEXTAREA\|SELECT\)\$\/\.test/);
  assert.match(blur, /if \(typingElsewhere\) setFieldActive\(false\);/);
});

test('a desktop keeps the student\'s choice and an authored "open on arrival"', () => {
  assert.match(source, /useState\(showToolsInitially \|\| requiredSymbols\.length > 0\)/);
  assert.match(source, /isMobile \? showTools && fieldActive : showTools/, 'desktop visibility is the toggle alone');
});
