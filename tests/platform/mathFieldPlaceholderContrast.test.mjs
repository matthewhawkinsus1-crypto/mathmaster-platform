/*
 * A MATH BOX'S PLACEHOLDER CAN BE READ, IN BOTH THEMES (AX17; WCAG 1.4.3).
 *
 * MathLive draws the hint of an empty box ("Type your answer", an example) in
 * a grey of its own, #bdbdbd. axe measured it at 1.66:1 on the focused box
 * (student pass 3, A11Y-7), and nothing in the certification showed a box with
 * a placeholder, so nothing could fail. src/index.css now colours it with the
 * token a text box's placeholder uses.
 *
 * This holds the arithmetic: that token, in each theme, against every
 * background the box can be drawn on. A box 20px or smaller (compact, in the
 * Systems rows and Process Mode) is not "large text", so the bar is 4.5:1, not
 * 3:1. The browser proof is the certification scene
 * assignment-tools/math-box-placeholder (tests/browser/accessibilityCertification.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHexColor, relativeLuminance } from '../../src/theme/themeColorRoles.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const css = executableSource(read('src/index.css'));
const palette = read('src/theme/tokens.css');
const definitions = (text) => Object.fromEntries([...text.matchAll(/(--mm-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const themes = {
  light: definitions(palette.slice(palette.indexOf(':root {'), palette.indexOf('@media screen'))),
  dark: definitions(palette.slice(palette.indexOf(":root[data-theme='dark'] {"))),
};
const resolve = (value, tokens) => value.replace(/var\((--mm-[\w-]+)\)/g, (_, name) => resolve(tokens[name], tokens));
const ratio = (a, b) => {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const placeholderToken = () => {
  const rule = region(css, 'math-field::part(placeholder) {', '}', 'the math-field placeholder rule');
  const token = rule.match(/\bcolor:\s*var\((--mm-[\w-]+)\);/)?.[1];
  assert.ok(token, 'the placeholder takes its colour from a theme token, not a literal');
  return token;
};

// What MathInput.jsx draws the box on: its surface, the correct and incorrect
// tints, and (dark theme) the input fill index.css forces onto every field.
const BOX_BACKGROUNDS = ['--mm-surface', '--mm-input-bg', '--mm-success-subtle', '--mm-error-subtle'];

for (const theme of Object.keys(themes)) {
  test(`${theme}: the placeholder reads at 4.5:1 on every background a math box has`, () => {
    const tokens = themes[theme];
    const token = placeholderToken();
    const text = parseHexColor(resolve(tokens[token], tokens));
    assert.ok(text, `${token} is a hex colour in ${theme}`);
    for (const background of BOX_BACKGROUNDS) {
      const behind = parseHexColor(resolve(tokens[background], tokens));
      assert.ok(behind, `${background} is a hex colour in ${theme}`);
      assert.ok(ratio(text, behind) >= 4.5, `${theme}: ${token} on ${background} is ${ratio(text, behind).toFixed(2)}:1`);
    }
  });
}

test('it is the same hint a text box shows, and nothing tints the box behind it', () => {
  const token = placeholderToken();
  assert.match(css, new RegExp(`input[^{]*::placeholder[^{]*\\{[^}]*color:\\s*var\\(${token}\\)`), 'a text box\'s placeholder takes the same token');
  // The arithmetic above is the text on the box itself. MathLive tints a
  // focused field's text-mode content (where a placeholder is drawn) — a pale
  // blue in light, 60% blue in an OS dark scheme — which would take this token
  // under 4.5:1 in light (4.3:1) and far under in dark, so the tint is off.
  const field = css.match(/(?:^|\n)math-field \{([^}]*)\}/g).find((rule) => rule.includes('--caret-color'));
  assert.match(field, /--highlight-text:\s*transparent;/, 'light scheme');
  assert.match(field, /--text-highlight-background-color:\s*transparent;/, 'dark scheme');
});
