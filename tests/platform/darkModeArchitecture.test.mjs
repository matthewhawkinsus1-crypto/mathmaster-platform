import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';
import { THEME_CHROME_COLOR } from '../../src/theme/mathMasterTheme.js';
import { COLOR_ROLE, ROLE_ANCHORS, classifyThemeColor, roleForProperty, toneTextColor } from '../../src/theme/themeColorRoles.js';

/*
 * DARK MODE 2.0 — the contracts that keep the platform from drifting back into
 * "a light app inside a dark shell". The rendered result is certified in a
 * browser (tests/browser/darkModeCertification.mjs); these hold the
 * architecture that makes that result possible.
 */

const read = (file) => readFileSync(file, 'utf8');
const tokensCss = read('src/theme/tokens.css');

const blockAfter = (source, needle) => {
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `missing ${needle}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
  }
  throw new Error(`unclosed block after ${needle}`);
};
const definitions = (block) => Object.fromEntries([...block.matchAll(/(--mm-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = definitions(blockAfter(tokensCss, ':root {'));
const dark = definitions(blockAfter(tokensCss, ":root[data-theme='dark'] {"));
const isColorValue = (value) => /^(#|rgba?\()/.test(value);

test('every color token has a designed dark value — one definition per theme, in one file', () => {
  const lightColors = Object.entries(light).filter(([, value]) => isColorValue(value)).map(([name]) => name);
  assert.ok(lightColors.length > 60, 'the palette is expected to be in tokens.css');
  const missing = lightColors.filter((name) => !(name in dark));
  assert.deepEqual(missing, [], `color tokens with no dark value stay light in dark mode: ${missing.join(', ')}`);
  // Aliases point at tokens, so they follow automatically.
  Object.entries(light).filter(([, value]) => value.startsWith('var(')).forEach(([name, value]) => {
    const target = value.match(/var\((--mm-[a-z0-9-]+)\)/)?.[1];
    assert.ok(target && target in light, `${name} aliases an undefined token`);
  });
});

test('no other stylesheet redefines the color tokens (uiKit.css used to win in light mode)', () => {
  for (const file of ['src/index.css', 'src/ui/uiKit.css', 'src/App.css']) {
    const css = read(file);
    const redefined = [...css.matchAll(/(--mm-[a-z0-9-]+):\s*(#|rgba?\()/g)].map((m) => m[1]);
    assert.deepEqual(redefined, [], `${file} redefines ${redefined.join(', ')}`);
  }
  assert.match(read('src/index.css'), /@import '\.\/theme\/tokens\.css';/);
});

test('dark surfaces are layered neutrals, never pure black, and the elevated layer is lighter', () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const order = ['--mm-page-bg', '--mm-surface-sunken', '--mm-surface', '--mm-surface-raised'];
  order.forEach((name) => assert.notEqual(dark[name].toLowerCase(), '#000000', `${name} must not be pure black`));
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(lum(dark[order[index]]) > lum(dark[order[index - 1]]), `${order[index]} must sit above ${order[index - 1]} in dark mode`);
  }
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const surface of ['--mm-page-bg', '--mm-surface-sunken', '--mm-surface', '--mm-surface-control', '--mm-surface-raised']) {
    for (const text of ['--mm-text-strong', '--mm-text', '--mm-text-muted', '--mm-text-subtle']) {
      assert.ok(ratio(dark[text], dark[surface]) >= 4.5, `${text} on ${surface} is ${ratio(dark[text], dark[surface]).toFixed(2)}:1 in dark mode`);
    }
    assert.ok(ratio(dark['--mm-control-border'], dark[surface]) >= 3, `--mm-control-border must meet WCAG 1.4.11 on ${surface}`);
  }
  for (const status of ['success', 'warning', 'error']) {
    assert.ok(ratio(dark[`--mm-${status}-text`], dark[`--mm-${status}-bg`]) >= 4.5, `${status} text on its container`);
  }
  assert.ok(ratio(dark['--mm-primary-text'], dark['--mm-primary-soft']) >= 4.5, 'selected text on the selected container');
});

test('print always uses the light palette', () => {
  assert.match(tokensCss, /@media screen \{\s*:root\[data-theme='dark'\] \{/);
});

test('the browser integrates: color-scheme per theme, theme-color in step, theme resolved before first paint', () => {
  assert.match(blockAfter(tokensCss, ':root {'), /color-scheme: light;/);
  assert.match(blockAfter(tokensCss, ":root[data-theme='dark'] {"), /color-scheme: dark;/);
  const html = read('index.html');
  assert.match(html, /<meta name="color-scheme" content="light dark" \/>/);
  assert.match(html, /<meta name="theme-color" content="#ffffff" \/>/);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /root\.dataset\.theme = dark \? 'dark' : 'light';/, 'the pre-paint script must set data-theme in <head>');
  assert.ok(head.includes(`'${THEME_CHROME_COLOR.dark}'`) && head.includes(`'${THEME_CHROME_COLOR.light}'`), 'the pre-paint theme-color must match THEME_CHROME_COLOR');
  assert.equal(THEME_CHROME_COLOR.light, light['--mm-page-bg']);
  assert.equal(THEME_CHROME_COLOR.dark, dark['--mm-page-bg']);
  const installer = executableSource(read('src/theme/mathMasterTheme.js'));
  assert.match(installer, /root\.style\.colorScheme = resolved;\s*syncThemeColorMeta\(resolved\);/);
  // The boot screen is themed too: no light flash for a dark-mode device.
  assert.match(head, /html\[data-theme='dark'\] \.mm-boot \{/);
});

test('dark styling is keyed to the resolved theme, never inverted', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(css|jsx?)$/.test(entry.name)) files.push(file);
  });
  walk('src');
  for (const file of files) {
    const source = file.endsWith('.css') ? read(file) : executableSource(read(file));
    assert.doesNotMatch(source, /filter:\s*['"]?invert\(/, `${file} inverts colors; use tokens`);
    if (file.endsWith('.css')) {
      assert.doesNotMatch(source, /@media \(prefers-color-scheme: dark\)\s*\{\s*\.[\w-]/, `${file} styles dark mode from the OS query alone; key it to [data-theme='dark']`);
    }
  }
});

test('every --mm-* token a screen names is defined somewhere', () => {
  const defined = new Set(Object.keys(light));
  const used = new Map();
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!/\.(css|jsx?)$/.test(entry.name)) return;
    const source = read(file);
    // Locally scoped custom properties (layout measurements, a screen's own
    // tokens such as .mm-login's) count as definitions.
    for (const m of source.matchAll(/['"]?(--mm-[a-z0-9-]+)['"]?\s*:/g)) defined.add(m[1]);
    for (const m of source.matchAll(/var\((--mm-[a-z0-9-]+)\s*[,)]/g)) {
      if (!m[0].includes(',')) used.set(m[1], file);
    }
  });
  walk('src');
  const undefinedTokens = [...used].filter(([name]) => !defined.has(name)).map(([name, file]) => `${name} (${file})`);
  assert.deepEqual(undefinedTokens, []);
});

// Deliberate light-mode changes, each for a measured accessibility failure.
// Anything not listed here keeps the exact legacy value.
const LIGHT_VALUE_CHANGES = Object.freeze({
  '--mm-text-subtle': { legacy: '#80868b', now: '#65696e', why: '3.7:1 on white failed WCAG 1.4.3; now >= 4.9:1' },
});

test('the classifier maps each legacy literal to the token whose LIGHT value it is', () => {
  // This is what keeps light mode unchanged by the migration.
  for (const [role, families] of Object.entries(ROLE_ANCHORS)) {
    for (const anchors of Object.values(families)) {
      for (const [hex, token] of anchors) {
        const expected = LIGHT_VALUE_CHANGES[token]?.legacy === hex ? LIGHT_VALUE_CHANGES[token].now : hex;
        assert.equal(light[token]?.toLowerCase(), expected, `${token} light value must equal its anchor ${hex} (${role})`);
      }
    }
  }
});

test('the classifier leaves colors that already read on both themes alone', () => {
  assert.equal(classifyThemeColor('#f8f9fa', COLOR_ROLE.BACKGROUND).token, '--mm-surface-sunken');
  assert.equal(classifyThemeColor('#e8f0fe', COLOR_ROLE.BACKGROUND).token, '--mm-primary-soft');
  assert.equal(classifyThemeColor('#fff8e1', COLOR_ROLE.BACKGROUND).token, '--mm-warning-bg');
  assert.equal(classifyThemeColor('#5f6b7a', COLOR_ROLE.TEXT).token, '--mm-text-muted');
  assert.equal(classifyThemeColor('#172033', COLOR_ROLE.TEXT).token, '--mm-text-strong', 'near-black navy is strong text');
  assert.equal(classifyThemeColor('#c5d5ef', COLOR_ROLE.BORDER).token, '--mm-tint-border');
  // Saturated fills, white text, mid-tone and dark banners are not light-palette assumptions.
  assert.equal(classifyThemeColor('#1a73e8', COLOR_ROLE.BACKGROUND), null);
  assert.equal(classifyThemeColor('#202124', COLOR_ROLE.BACKGROUND), null);
  assert.equal(classifyThemeColor('#ffffff', COLOR_ROLE.TEXT), null);
  assert.equal(classifyThemeColor('#f9ab00', COLOR_ROLE.BORDER), null);
  assert.equal(classifyThemeColor('#5f6368', COLOR_ROLE.BORDER), null);
  assert.equal(roleForProperty('backgroundColor'), COLOR_ROLE.BACKGROUND);
  assert.equal(roleForProperty('border-left-color'), COLOR_ROLE.BORDER);
  assert.equal(roleForProperty('fill'), null, 'SVG fill is never rewritten');
});

test('a saturated tone used as text gets the themed text token of its hue', () => {
  assert.equal(toneTextColor('#1967d2'), 'var(--mm-primary-text)');
  assert.equal(toneTextColor('#b06000'), 'var(--mm-warning-text)');
  assert.equal(toneTextColor('#1e8e3e'), 'var(--mm-success-text)');
  assert.equal(toneTextColor('#c5221f'), 'var(--mm-error-text)');
  assert.equal(toneTextColor('#5b21b6'), 'var(--mm-accent-text)');
  assert.equal(toneTextColor('#5f6368'), 'var(--mm-text-muted)');
  assert.equal(toneTextColor('var(--mm-danger)'), 'var(--mm-danger)', 'tokens pass through');
});

test('the teacher shell — the reported screen — is built from tokens, not light literals', () => {
  const sidebar = executableSource(read('src/TeacherSidebar.jsx'));
  assert.match(sidebar, /background: 'var\(--mm-surface-sunken\)'/);
  assert.match(sidebar, /background: active \? 'var\(--mm-primary-soft\)' : 'transparent'/);
  assert.match(sidebar, /color: active \? 'var\(--mm-primary-text\)' : 'var\(--mm-text\)'/);
  const classBar = executableSource(read('src/components/teacher/ClassContextBar.jsx'));
  assert.match(classBar, /background: 'var\(--mm-surface-sunken\)'/);
  for (const [file, source] of [['TeacherSidebar', sidebar], ['ClassContextBar', classBar]]) {
    const lightLiterals = [...source.matchAll(/(?:background|color|border\w*):\s*['"`][^'"`]*?(#[0-9a-f]{3,6})\b/gi)]
      .map((m) => m[1]).filter((hex) => ['background', 'text', 'border'].some((role) => classifyThemeColor(hex, role)));
    assert.deepEqual(lightLiterals, [], `${file} still hard-codes light-palette colors`);
  }
});

test('SVG text drawn on themed surfaces is filled with text tokens, not light-palette literals', () => {
  // The progress wheels' hubs follow the card surface; their labels used to be
  // fill '#202124' / '#5f6368' and vanished on the dark hub (PR #431 review).
  const offenders = [];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!entry.name.endsWith('.jsx')) return;
    for (const m of read(file).matchAll(/<text\b[^>]*style=\{\{([^}]*)\}\}/g)) {
      for (const hex of m[1].matchAll(/fill:[^,}]*?(#[0-9a-fA-F]{3,6})\b/g)) {
        if (classifyThemeColor(hex[1], COLOR_ROLE.TEXT)) offenders.push(`${file}: ${hex[1]}`);
      }
    }
  });
  walk('src');
  assert.deepEqual(offenders, []);
});

