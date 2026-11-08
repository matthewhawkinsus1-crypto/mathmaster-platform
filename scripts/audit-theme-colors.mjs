import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseAst } from 'vite';
import { classifyThemeColor, roleForProperty } from '../src/theme/themeColorRoles.js';
import { indirectThemeColors } from './lib/themeColorFlow.mjs';

/*
 * THEME COLOR AUDIT — new code uses semantic tokens.
 *
 *   node scripts/audit-theme-colors.mjs                    # CI: fail on additions
 *   node scripts/audit-theme-colors.mjs --write-baseline   # after a deliberate reduction
 *   node scripts/audit-theme-colors.mjs --report           # every colour ratchet 3 follows
 *
 * Three ratchets, each against a checked-in baseline of what already exists
 * (reductions are always allowed; additions fail):
 *
 *   1. Black/white literals (theme-color-baseline.json): background or color
 *      set to #fff, white, #000, black or #202124.
 *   2. Light-palette literals (theme-token-baseline.json): ANY hex in a
 *      background / color / border / outline position that is a light-theme
 *      assumption — a pale surface, dark text meant for a light surface, a
 *      light outline. src/theme/themeColorRoles.js classifies it and names the
 *      token whose light value it is, so the message says exactly what to write
 *      instead. Saturated fills, white text and dark banners are not flagged:
 *      they read on both themes.
 *   3. Light-palette colours that reach a style without being written in it
 *      (theme-indirect-baseline.json): through a helper's return, a tone map or
 *      tuple, a variable, a parameter or prop, or a CSS custom property that has
 *      no dark value (scripts/lib/themeColorFlow.mjs follows each one back to
 *      its literal). Classified and keyed as 2, by the file that holds the
 *      literal. The live proctor monitor's status was such a colour: its
 *      statusColor() returned the light theme's #174ea6, 2.13:1 on the dark
 *      theme's rows, and 1 and 2 read nothing.
 *
 * Dark Mode 2.0 migrated ~5,400 literals with scripts/codemods/tokenize-theme-colors.mjs;
 * the token baseline holds what that migration deliberately left (SVG
 * presentation attributes, canvas/PDF code, chart palettes) or could not prove
 * safe. The indirect baseline holds the same kinds: palettes that identify a
 * chart's series or a group, the Live Challenge arena and projector (always
 * dark, whatever the theme), and PDF and print code.
 */

// Scan the complete application source so top-level shared student runtime
// files (App, QuestionEngine, MathInput, graph renderers, etc.) cannot bypass
// the guard merely because they do not live under components/student.
const roots = ['src'];
const extensions = new Set(['.js', '.jsx', '.css']);
const WRITE = process.argv.includes('--write-baseline');
const REPORT = process.argv.includes('--report');
const suspicious = /(?:background(?:-color)?\s*[:=]\s*['"]?|color\s*[:=]\s*['"]?)(#fff(?:fff)?|white|#202124|#000(?:000)?|black)\b/gi;
// A style property (camelCase in JS, kebab in CSS, or a bg/fg tone key) and the
// rest of its value up to the end of the declaration.
const styleValue = /\b(background(?:Color|-color)?|color|bg|fg|border(?:Top|Bottom|Left|Right|-top|-bottom|-left|-right)?(?:Color|-color)?|outline(?:Color|-color)?)\s*:\s*([^;,}\n]*)/g;
const baselineUrl = (name) => new URL(`./${name}`, import.meta.url);
const readBaseline = (name) => { try { return JSON.parse(readFileSync(baselineUrl(name), 'utf8')); } catch { return {}; } };
const blackWhiteBaseline = readBaseline('theme-color-baseline.json');
const tokenBaseline = readBaseline('theme-token-baseline.json');
const indirectBaseline = readBaseline('theme-indirect-baseline.json');

const blackWhite = {};
const lightPalette = {};
const examples = {};
// Every source file, for ratchet 3, and where 1 and 2 already read a literal,
// so 3 does not count it again.
const sources = [];
const direct = new Map();
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file))) {
      const relative = file.replaceAll('\\', '/');
      const source = readFileSync(file, 'utf8');
      // tokens.css is where the light and dark values are defined: ratchet 3
      // reads its dark values, and nothing in it is counted.
      sources.push({ path: relative, source });
      if (relative === 'src/theme/tokens.css') continue;
      const written = new Set();
      direct.set(relative, written);
      for (const match of source.matchAll(suspicious)) {
        const key = `${relative}:${match[1].toLowerCase()}`;
        blackWhite[key] = (blackWhite[key] || 0) + 1;
        written.add(`${match.index + match[0].length - match[1].length}:${/^background/i.test(match[0]) ? 'background' : 'text'}`);
      }
      for (const match of source.matchAll(styleValue)) {
        const role = roleForProperty(match[1]);
        if (!role) continue;
        const valueAt = match.index + match[0].length - match[2].length;
        for (const hex of match[2].matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
          written.add(`${valueAt + hex.index}:${role}`);
          const hit = classifyThemeColor(hex[0], role);
          if (!hit) continue;
          const key = `${relative}:${hit.token}`;
          lightPalette[key] = (lightPalette[key] || 0) + 1;
          if (!examples[key]) examples[key] = `${match[1]}: ${hex[0]}`;
        }
      }
    }
  }
};
roots.forEach(walk);

const indirectFindings = indirectThemeColors({ files: sources, parse: (source) => parseAst(source, { lang: 'jsx' }), direct });
const indirect = {};
const indirectExamples = {};
for (const finding of indirectFindings) {
  const key = `${finding.file}:${finding.token}`;
  indirect[key] = (indirect[key] || 0) + 1;
  if (!indirectExamples[key]) indirectExamples[key] = `${finding.hex} at line ${finding.line} reaches ${finding.sink.property}: ${finding.sink.expression} (${finding.sink.file}:${finding.sink.line})`;
}
if (REPORT) {
  indirectFindings.forEach((f) => console.log(`${f.file}:${f.line}  ${f.hex} (${f.role}) -> var(${f.token})  reaches ${f.sink.property}: ${f.sink.expression}  (${f.sink.file}:${f.sink.line})`));
}

if (WRITE) {
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselineUrl('theme-color-baseline.json'), `${JSON.stringify(sorted(blackWhite), null, 2)}\n`);
  writeFileSync(baselineUrl('theme-token-baseline.json'), `${JSON.stringify(sorted(lightPalette), null, 2)}\n`);
  writeFileSync(baselineUrl('theme-indirect-baseline.json'), `${JSON.stringify(sorted(indirect), null, 2)}\n`);
  console.log(`Wrote baselines: ${Object.keys(blackWhite).length} black/white groups, ${Object.keys(lightPalette).length} light-palette groups, ${Object.keys(indirect).length} indirect groups.`);
} else {
  const additions = Object.entries(blackWhite).filter(([key, count]) => count > (blackWhiteBaseline[key] || 0));
  const tokenAdditions = Object.entries(lightPalette).filter(([key, count]) => count > (tokenBaseline[key] || 0));
  const indirectAdditions = Object.entries(indirect).filter(([key, count]) => count > (indirectBaseline[key] || 0));
  if (additions.length) {
    console.error('New hard-coded surface/text colors detected. Use --mm-* semantic tokens or document the exception in scripts/theme-color-baseline.json.');
    additions.forEach(([key, count]) => console.error(`  ${key}: ${count} (baseline ${blackWhiteBaseline[key] || 0})`));
    process.exitCode = 1;
  }
  if (tokenAdditions.length) {
    console.error('New light-palette colors detected — each one renders as a light island in dark mode. Use the token instead:');
    tokenAdditions.forEach(([key, count]) => {
      const [file, token] = key.split(/:(?=--mm-)/);
      console.error(`  ${file}: ${examples[key]} -> var(${token})  (${count}, baseline ${tokenBaseline[key] || 0})`);
    });
    process.exitCode = 1;
  }
  if (indirectAdditions.length) {
    console.error('New light-palette colors that reach a style through a helper, a map or a variable — each one is a light-theme color on the dark theme. Use the token instead:');
    indirectAdditions.forEach(([key, count]) => {
      const [file, token] = key.split(/:(?=--mm-)/);
      console.error(`  ${file}: ${indirectExamples[key]} -> var(${token})  (${count}, baseline ${indirectBaseline[key] || 0})`);
    });
    process.exitCode = 1;
  }
  if (!additions.length && !tokenAdditions.length && !indirectAdditions.length) {
    console.log(`Theme color audit passed (${Object.keys(blackWhite).length} black/white, ${Object.keys(lightPalette).length} light-palette and ${Object.keys(indirect).length} indirect legacy groups; reductions are allowed).`);
  }
}
