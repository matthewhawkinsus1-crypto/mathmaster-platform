/*
 * RELATION MAPPING'S PLOT FOLLOWS THE THEME (TL33, VH-27).
 *
 * The coordinate-plot mode drew its grid, axes and tick numbers in fixed
 * colours: in dark mode the tick numbers were about 3.1:1 and the axes about
 * 1.75:1 on the dark surface. It now uses the shared graph tokens, as the
 * coordinate plane does. These tests pin the wiring and measure the tokens on
 * the plot's own background in both themes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// The last value each theme block gives a token (light first, then dark).
const tokenValues = (css, name) => [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((match) => match[1]);

test('the plot draws its grid, axes and numbers with the theme\'s graph tokens', () => {
  const plot = executableSource(read('src/tools/relationMapping/RelationMapping.jsx'));
  assert.doesNotMatch(plot, /stroke="#e5e9f0"|stroke="#445"|fill="#5f6b7a"/, 'no fixed grid, axis or tick colours');
  assert.match(plot, /style=\{\{ stroke: 'var\(--mm-graph-grid\)' \}\}/);
  assert.match(plot, /style=\{\{ stroke: 'var\(--mm-graph-axis\)' \}\}/);
  assert.match(plot, /style=\{\{ fill: 'var\(--mm-graph-label\)' \}\}/);
});

test('on the plot\'s surface, numbers reach 4.5:1 and axes 3:1 in both themes', () => {
  const css = read('src/theme/tokens.css');
  const surfaces = tokenValues(css, 'mm-surface');
  const labels = tokenValues(css, 'mm-graph-label');
  const axes = tokenValues(css, 'mm-graph-axis');
  assert.ok(surfaces.length >= 2 && labels.length >= 2 && axes.length >= 2, 'light and dark values');
  [0, 1].forEach((theme) => {
    assert.ok(contrast(labels[theme], surfaces[theme]) >= 4.5, `tick numbers, theme ${theme}: ${contrast(labels[theme], surfaces[theme]).toFixed(2)}`);
    assert.ok(contrast(axes[theme], surfaces[theme]) >= 3, `axes, theme ${theme}: ${contrast(axes[theme], surfaces[theme]).toFixed(2)}`);
  });
});
