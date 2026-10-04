import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { classifyThemeColor, roleForProperty } from '../src/theme/themeColorRoles.js';

/*
 * THEME COLOR AUDIT — new code uses semantic tokens.
 *
 *   node scripts/audit-theme-colors.mjs                    # CI: fail on additions
 *   node scripts/audit-theme-colors.mjs --write-baseline   # after a deliberate reduction
 *
 * Two ratchets, each against a checked-in baseline of what already exists
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
 *
 * Dark Mode 2.0 migrated ~5,400 literals with scripts/codemods/tokenize-theme-colors.mjs;
 * the token baseline holds what that migration deliberately left (SVG
 * presentation attributes, canvas/PDF code, chart palettes) or could not prove
 * safe.
 */

// Scan the complete application source so top-level shared student runtime
// files (App, QuestionEngine, MathInput, graph renderers, etc.) cannot bypass
// the guard merely because they do not live under components/student.
const roots = ['src'];
const extensions = new Set(['.js', '.jsx', '.css']);
const WRITE = process.argv.includes('--write-baseline');
const suspicious = /(?:background(?:-color)?\s*[:=]\s*['"]?|color\s*[:=]\s*['"]?)(#fff(?:fff)?|white|#202124|#000(?:000)?|black)\b/gi;
// A style property (camelCase in JS, kebab in CSS, or a bg/fg tone key) and the
// rest of its value up to the end of the declaration.
const styleValue = /\b(background(?:Color|-color)?|color|bg|fg|border(?:Top|Bottom|Left|Right|-top|-bottom|-left|-right)?(?:Color|-color)?|outline(?:Color|-color)?)\s*:\s*([^;,}\n]*)/g;
const baselineUrl = (name) => new URL(`./${name}`, import.meta.url);
const readBaseline = (name) => { try { return JSON.parse(readFileSync(baselineUrl(name), 'utf8')); } catch { return {}; } };
const blackWhiteBaseline = readBaseline('theme-color-baseline.json');
const tokenBaseline = readBaseline('theme-token-baseline.json');

const blackWhite = {};
const lightPalette = {};
const examples = {};
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file))) {
      const relative = file.replaceAll('\\', '/');
      if (relative === 'src/theme/tokens.css') continue; // where the light values are defined
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(suspicious)) {
        const key = `${relative}:${match[1].toLowerCase()}`;
        blackWhite[key] = (blackWhite[key] || 0) + 1;
      }
      for (const match of source.matchAll(styleValue)) {
        const role = roleForProperty(match[1]);
        if (!role) continue;
        for (const hex of match[2].matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
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

if (WRITE) {
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselineUrl('theme-color-baseline.json'), `${JSON.stringify(sorted(blackWhite), null, 2)}\n`);
  writeFileSync(baselineUrl('theme-token-baseline.json'), `${JSON.stringify(sorted(lightPalette), null, 2)}\n`);
  console.log(`Wrote baselines: ${Object.keys(blackWhite).length} black/white groups, ${Object.keys(lightPalette).length} light-palette groups.`);
} else {
  const additions = Object.entries(blackWhite).filter(([key, count]) => count > (blackWhiteBaseline[key] || 0));
  const tokenAdditions = Object.entries(lightPalette).filter(([key, count]) => count > (tokenBaseline[key] || 0));
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
  if (!additions.length && !tokenAdditions.length) {
    console.log(`Theme color audit passed (${Object.keys(blackWhite).length} black/white and ${Object.keys(lightPalette).length} light-palette legacy groups; reductions are allowed).`);
  }
}
