/*
 * THE THEME AUDIT FOLLOWS A COLOUR THAT REACHES A STYLE WITHOUT BEING WRITTEN
 * IN IT (scripts/audit-theme-colors.mjs, ratchet 3; scripts/lib/themeColorFlow.mjs).
 *
 * The live proctor monitor's session status was `color: statusColor(status)`,
 * and statusColor() returned the light theme's #174ea6: 2.13:1 on the dark
 * theme's rows, and the audit read nothing, because it reads a colour where it
 * is written. These plant each way a colour travels (a helper, a tone tuple, a
 * ternary, a map, an import, a prop, a parameter, a CSS custom property with
 * no dark value, CSS a script writes, a DOM style) and each place it must NOT
 * be counted (SVG attributes, canvas, a chart series' data, the theme's own
 * helpers, colours that read on both themes, a literal the audit already
 * counts where it is written). Then the audit itself fails CI on the proctor
 * monitor's old helper, and passes on the fixed one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import { cssDeclarations, indirectThemeColors } from '../../scripts/lib/themeColorFlow.mjs';
import { runsOnPullRequest } from './helpers/ciWorkflows.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const parse = (source) => parseAst(source, { lang: 'jsx' });
// The tokens' dark values decide which custom properties are themed.
const TOKENS = { path: 'src/theme/tokens.css', source: read('src/theme/tokens.css') };
const ROLES = { path: 'src/theme/themeColorRoles.js', source: read('src/theme/themeColorRoles.js') };
const flow = (files, options = {}) => indirectThemeColors({
  files: [TOKENS, ROLES, ...Object.entries(files).map(([file, source]) => ({ path: file, source }))], parse, ...options,
});
const found = (files, options) => flow(files, options).map((f) => `${f.hex} ${f.role} ${f.token}`).sort();

// The proctor monitor's Status cell and its helper as they were before
// e9679278: three fixed light-theme colours, none of them in the property.
const OLD_PROCTOR_HELPER = "const statusColor = (status) => status?.startsWith('locked') ? '#b3261e' : ['submitted', 'force_submitted', 'time_expired'].includes(status) ? '#137333' : '#174ea6';";
const OLD_PROCTOR_CELL = "export const Row = ({ session }) => <tr><td style={{ padding: 9, borderBottom: '1px solid var(--mm-border-soft)', color: statusColor(session.status), fontWeight: 800 }}>{session.status}</td></tr>;";

test("the proctor monitor's old status helper is followed to its three light-theme colours, each named by its token", () => {
  const findings = flow({ 'src/components/assessment/ProctorLiveMonitor.jsx': `${OLD_PROCTOR_HELPER}\n${OLD_PROCTOR_CELL}\n` });
  assert.deepEqual(findings.map((f) => `${f.hex} ${f.role} ${f.token}`).sort(), [
    '#137333 text --mm-success-text',
    '#174ea6 text --mm-primary-text',
    '#b3261e text --mm-error-text',
  ]);
  for (const finding of findings) {
    assert.equal(finding.file, 'src/components/assessment/ProctorLiveMonitor.jsx', 'counted where the literal is');
    assert.equal(finding.line, 1, 'on the helper\'s line');
    assert.equal(finding.sink.property, 'color');
    assert.match(finding.sink.expression, /^statusColor\(session\.status\)$/, 'and says which style it reaches');
  }
  // The fixed monitor: each tone is a token.
  assert.deepEqual(found({ 'src/components/assessment/ProctorLiveMonitor.jsx': read('src/components/assessment/ProctorLiveMonitor.jsx') }), []);
});

test('a tone tuple is read by its place: the pale colour as a background, the dark one as text', () => {
  const source = `
    const badge = (kind) => (kind === 'a' ? ['#e8f0fe', '#174ea6'] : ['#f1f3f4', '#5f6368']);
    export const Badge = ({ kind }) => { const [background, color] = badge(kind); return <span style={{ background, color }} />; };`;
  assert.deepEqual(found({ 'src/Badge.jsx': source }), [
    '#174ea6 text --mm-primary-text',
    '#5f6368 text --mm-text-muted',
    '#e8f0fe background --mm-primary-soft',
    '#f1f3f4 background --mm-surface-control',
  ]);
  // Read by index: element 1 only (element 0 would be flagged as text too).
  const second = "const T = { a: ['#a50e0e', '#174ea6'] }; export const X = () => <b style={{ color: T.a[1] }} />;";
  assert.deepEqual(found({ 'src/X.jsx': second }), ['#174ea6 text --mm-primary-text']);
});

test('a ternary in a variable, a map read by any key, and a map read by one key', () => {
  const ternary = "export const A = ({ ok }) => { const tone = ok ? '#137333' : '#a50e0e'; return <b style={{ color: tone }} />; };";
  assert.deepEqual(found({ 'src/A.jsx': ternary }), ['#137333 text --mm-success-text', '#a50e0e text --mm-error-text']);
  const anyKey = "const TONE = Object.freeze({ locked: '#a50e0e', done: '#137333' }); export const B = ({ s }) => <b style={{ color: TONE[s] }} />;";
  assert.deepEqual(found({ 'src/B.jsx': anyKey }), ['#137333 text --mm-success-text', '#a50e0e text --mm-error-text']);
  const oneKey = "const TONE = { locked: '#a50e0e', done: '#137333' }; export const C = () => <b style={{ color: TONE.locked }} />;";
  assert.deepEqual(found({ 'src/C.jsx': oneKey }), ['#a50e0e text --mm-error-text']);
  // Object.entries and a .map callback hand on the entries.
  const entries = "const TONE = { a: '#174ea6' }; export const D = () => Object.entries(TONE).map(([key, tone]) => <b key={key} style={{ color: tone }} />);";
  assert.deepEqual(found({ 'src/D.jsx': entries }), ['#174ea6 text --mm-primary-text']);
});

test('across files: an imported map, a component\'s prop from the JSX that renders it, a helper\'s parameters from its calls', () => {
  assert.deepEqual(flow({
    'src/model/tones.js': "export const STATUS_TONE = { gap: '#a50e0e' };",
    'src/Card.jsx': "import { STATUS_TONE } from './model/tones.js';\nexport const Card = () => <p style={{ color: STATUS_TONE.gap }} />;",
  }).map((f) => `${f.file} ${f.hex} ${f.token}`), ['src/model/tones.js #a50e0e --mm-error-text']);
  assert.deepEqual(flow({
    'src/Badge.jsx': 'export default function Badge({ tone }) { return <b style={{ color: tone, padding: 4 }} />; }',
    'src/Screen.jsx': "import Badge from './Badge.jsx';\nexport const Screen = () => <Badge tone=\"#174ea6\" />;",
  }).map((f) => `${f.file} ${f.hex} ${f.token}`), ['src/Screen.jsx #174ea6 --mm-primary-text']);
  const pill = "const pill = (bg, fg) => ({ background: bg, color: fg, padding: 2 }); export const P = () => <b style={pill('#fce8e6', '#a50e0e')} />;";
  assert.deepEqual(found({ 'src/P.jsx': pill }), ['#a50e0e text --mm-error-text', '#fce8e6 background --mm-error-bg']);
});

test('a CSS custom property with no dark value carries its light colour into dark; one with a dark value does not', () => {
  const light = '.x { --tint: #eaf2ff; --ink: #14508f; }\n.x .y { background: var(--tint); color: var(--ink); }';
  assert.deepEqual(found({ 'src/x.css': light }), ['#14508f text --mm-primary-text', '#eaf2ff background --mm-primary-soft']);
  const themed = `${light}\n:root[data-theme='dark'] .x { --tint: var(--mm-primary-soft); --ink: var(--mm-primary-text); }`;
  assert.deepEqual(found({ 'src/x.css': themed }), []);
  // A fallback is read only where the first property has no value: not in dark
  // when that one has a dark value (WorkflowFocusMode.css's --wf-text).
  const gated = ".x { --ink: #14508f; }\n.x .y { color: var(--text, var(--ink)); }\n:root[data-theme='dark'] .x { --text: #a8c7fa; }";
  assert.deepEqual(found({ 'src/x.css': gated }), []);
  assert.deepEqual(found({ 'src/x.css': gated.replace(/\n:root.*$/, '') }), ['#14508f text --mm-primary-text'], 'with no dark --text, the fallback is what dark shows');
  // A print rule is the light palette on purpose.
  assert.deepEqual(found({ 'src/x.css': '@media print { .x { --ink: #14508f; } .x .y { color: var(--ink); } }' }), []);
});

test('CSS a script writes, a style object\'s custom property, and a DOM style are styles too', () => {
  const sheet = "const GP = { ink: '#174ea6' }; export const CSS = `.mm-a { padding: 2px; color: ${GP.ink}; }`;";
  assert.deepEqual(found({ 'src/sheet.js': sheet }), ['#174ea6 text --mm-primary-text']);
  const inline = "const tone = '#a50e0e'; export const html = `<span style=\"color:${tone}\">x</span>`;";
  assert.deepEqual(found({ 'src/inline.js': inline }), ['#a50e0e text --mm-error-text']);
  const custom = {
    'src/c.css': '.c { background: var(--chip-bg); }',
    'src/C.jsx': "const BG = '#e6f4ea'; export const C = () => <i className=\"c\" style={{ '--chip-bg': BG }} />;",
  };
  assert.deepEqual(found(custom), ['#e6f4ea background --mm-success-bg']);
  const dom = "const TONE = { bad: '#a50e0e' }; export const paint = (el) => { el.style.color = TONE.bad; el.style.setProperty('border-color', '#aecbfa'); };";
  assert.deepEqual(found({ 'src/dom.js': dom }), ['#a50e0e text --mm-error-text', '#aecbfa border --mm-primary-border']);
});

test('what the baselines keep on purpose is not a style: SVG attributes, canvas, a chart series\' data', () => {
  const svg = "const C = { line: '#174ea6' }; export const G = () => <svg><text fill={C.line} stroke={C.line} style={{ fill: C.line }}>1</text></svg>;";
  assert.deepEqual(found({ 'src/G.jsx': svg }), []);
  const canvas = "const C = { ink: '#202124' }; export const draw = (ctx) => { ctx.fillStyle = C.ink; ctx.strokeStyle = C.ink; };";
  assert.deepEqual(found({ 'src/draw.js': canvas }), []);
  const series = "export const SERIES = [{ label: 'Linear', color: '#174ea6' }, { label: 'Quadratic', color: '#137333' }];";
  assert.deepEqual(found({ 'src/series.js': series }), [], 'a series\' colour feeds the chart');
  // Read into a style, it counts.
  const legend = `${series}\nexport const Legend = () => SERIES.map((s) => <b key={s.label} style={{ color: s.color }}>{s.label}</b>);`;
  assert.deepEqual(found({ 'src/series.jsx': legend }), ['#137333 text --mm-success-text', '#174ea6 text --mm-primary-text']);
});

test('the theme\'s own helpers, colours that read on both themes, and literals the audit counts where written are not counted here', () => {
  const helpers = "import { toneTextColor } from './theme/themeColorRoles.js';\nconst T = '#174ea6';\nexport const H = () => <b style={{ color: toneTextColor(T) }} />;";
  assert.deepEqual(found({ 'src/H.jsx': helpers }), [], 'toneTextColor() gives a token for any colour');
  const both = "const FILL = '#1a73e8'; const INK = '#ffffff'; export const B = () => <b style={{ background: FILL, color: INK, border: `1px solid ${FILL}` }} />;";
  assert.deepEqual(found({ 'src/B.jsx': both }), [], 'a saturated fill and white text read on both themes');
  const written = "export const W = () => <b style={{ color: '#174ea6' }} />;";
  const offset = written.indexOf('#174ea6');
  assert.deepEqual(found({ 'src/W.jsx': written }), ['#174ea6 text --mm-primary-text'], 'the analysis sees it');
  assert.deepEqual(found({ 'src/W.jsx': written }, { direct: new Map([['src/W.jsx', new Set([`${offset}:text`])]]) }), [], 'but the audit\'s second ratchet counts it, so the third does not');
  assert.deepEqual(found({ 'src/W.jsx': written }, { direct: new Map([['src/W.jsx', new Set([`${offset}:background`])]]) }), ['#174ea6 text --mm-primary-text'], 'counted there in another role, it is counted here in this one');
});

test('a declaration\'s value and its offset, read from CSS whatever wraps it', () => {
  const css = "/* a */ .a { color: #174ea6; } @media print { .b { --x: #fff; } } :root[data-theme='dark'] .c { --y: #000 }";
  const declarations = cssDeclarations(css);
  assert.deepEqual(declarations.map((d) => [d.property, d.value, css.slice(d.offset, d.offset + d.value.length), d.dark, d.print]), [
    ['color', '#174ea6', '#174ea6', false, false],
    ['--x', '#fff', '#fff', false, true],
    ['--y', '#000', '#000', true, false],
  ]);
});

/* --- the audit -------------------------------------------------------------- */

// The audit, run on a tree of its own: src/ holds what is planted, and the
// checked-in baselines are the repository's.
const audit = (files) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'theme-audit-'));
  try {
    for (const [file, source] of Object.entries({ [TOKENS.path]: TOKENS.source, [ROLES.path]: ROLES.source, ...files })) {
      mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(dir, file), source);
    }
    const run = spawnSync(process.execPath, [path.join(repo, 'scripts/audit-theme-colors.mjs')], { cwd: dir, encoding: 'utf8' });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('CI fails on the proctor monitor\'s old helper, and passes on the fixed monitor', () => {
  const monitor = read('src/components/assessment/ProctorLiveMonitor.jsx');
  const fixed = audit({ 'src/components/assessment/ProctorLiveMonitor.jsx': monitor });
  assert.equal(fixed.status, 0, fixed.stderr);
  const helper = monitor.slice(monitor.indexOf('const STATUS_TONE_COLOR'), monitor.indexOf('\n', monitor.indexOf('const statusColor')) + 1);
  assert.match(helper, /^const STATUS_TONE_COLOR[\s\S]*const statusColor = [^\n]*\n$/, 'the fixed helper, whole');
  const planted = audit({ 'src/components/assessment/ProctorLiveMonitor.jsx': monitor.replace(helper, `${OLD_PROCTOR_HELPER}\n`) });
  assert.equal(planted.status, 1, 'the old helper fails the audit');
  assert.match(planted.stderr, /reach a style through a helper, a map or a variable/);
  for (const token of ['--mm-error-text', '--mm-success-text', '--mm-primary-text']) {
    assert.match(planted.stderr, new RegExp(`src/components/assessment/ProctorLiveMonitor\\.jsx: #[0-9a-f]{6} at line \\d+ reaches color: statusColor\\(shown\\.tone\\) .* -> var\\(${token}\\)  \\(1, baseline 0\\)`), token);
  }
  // Its first two ratchets saw nothing: the hexes are not in a style property.
  assert.doesNotMatch(planted.stderr, /New hard-coded surface|New light-palette colors detected/);
});

test('what a ratchet\'s baseline keeps is kept: a kept colour passes, one more fails', () => {
  const baseline = JSON.parse(read('scripts/theme-indirect-baseline.json'));
  assert.equal(baseline['src/tools/representationMatch/RepresentationMatch.jsx:--mm-primary'], 1, 'the group palette\'s blue, as text');
  const file = 'src/tools/representationMatch/RepresentationMatch.jsx';
  const source = "const GROUP_COLORS = ['#1a73e8'];\nexport const Label = ({ slot }) => <b style={{ color: GROUP_COLORS[slot], padding: 2 }} />;";
  assert.equal(audit({ [file]: source }).status, 0, 'as many as the baseline holds');
  const more = audit({ [file]: source.replace("['#1a73e8']", "['#1a73e8', '#1a73e9']") });
  assert.equal(more.status, 1, 'one more than the baseline');
  assert.match(more.stderr, /RepresentationMatch\.jsx: .* -> var\(--mm-primary\)  \(2, baseline 1\)/);
});

test('a pull request that changes the audit\'s flow or its baseline runs the theme certification', () => {
  for (const file of ['scripts/lib/themeColorFlow.mjs', 'scripts/theme-indirect-baseline.json']) {
    assert.equal(runsOnPullRequest('theme-certification.yml', file), true, file);
  }
});
