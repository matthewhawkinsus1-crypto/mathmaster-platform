import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHexColor, relativeLuminance } from '../../src/theme/themeColorRoles.js';

// Catch pale interaction surfaces paired with the theme's light foreground.
// Evaluate the actual declarations, including translucent colors and gradient
// endpoints, rather than requiring a particular token name or source spelling.
const read = (file) => readFileSync(file, 'utf8');
const palette = read('src/theme/tokens.css');
const definitions = (text) => Object.fromEntries([...text.matchAll(/(--mm-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
const themes = {
  light: definitions(palette.slice(palette.indexOf(':root {'), palette.indexOf('@media screen'))),
  dark: definitions(palette.slice(palette.indexOf(":root[data-theme='dark'] {"))),
};
const resolve = (value, tokens) => value.replace(/var\((--mm-[\w-]+)\)/g, (_, name) => resolve(tokens[name], tokens));
const rgb = (value) => parseHexColor(value) || value.match(/[\d.]+/g).map(Number);
const ratio = (a, b) => {
  const x = relativeLuminance(a); const y = relativeLuminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
const declaration = (file, selector, property) => {
  const source = read(file);
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing surface ${selector}`);
  const block = source.slice(start, source.indexOf('}', start));
  return block.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`))?.[1];
};
const surfaces = [
  ['src/StepByStepAlgebra.css', '.algebra-live-math-preview.is-staged', '--mm-text-strong'],
  ['src/StepByStepAlgebra.css', '.algebra-structure-token-group', '--mm-text-strong'],
  ['src/tools/systemsWorkspace/AlgebraicSystemMode.css', '.mathmaster-elim-round.is-complete', '--mm-text-strong'],
  ['src/tools/regressionCalculator/RegressionCalculator.css', '.regression-notice', '--mm-text'],
];
for (const [file, selector, fallbackText] of surfaces) {
  for (const [theme, tokens] of Object.entries(themes)) {
    test(`${theme}: ${selector} keeps active math and text readable`, () => {
      const background = resolve(declaration(file, selector, 'background'), tokens);
      const colors = background.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi);
      assert.ok(colors?.length, `unresolved background ${background}`);
      const foreground = rgb(resolve(declaration(file, selector, 'color') || `var(${fallbackText})`, tokens));
      const underneath = rgb(tokens['--mm-surface']);
      for (const color of colors) {
        const channels = rgb(color);
        const alpha = channels[3] ?? 1;
        const composite = channels.slice(0, 3).map((n, i) => n * alpha + underneath[i] * (1 - alpha));
        assert.ok(ratio(foreground, composite) >= 4.5, `${selector}: ${ratio(foreground, composite).toFixed(2)}:1 on ${color}`);
      }
    });
  }
}

test('representation highlight keeps table text readable in either theme', () => {
  const source = read('src/tools/representationBridge/RepresentationBridge.jsx');
  const expression = source.match(/const highlightBackground = (.*);/)[1];
  const highlight = Function(`return (${expression})`)()(true, true);
  for (const tokens of Object.values(themes)) {
    assert.ok(ratio(rgb(tokens['--mm-text']), rgb(resolve(highlight, tokens))) >= 4.5);
  }
});
