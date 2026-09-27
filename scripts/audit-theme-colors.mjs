import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const roots = ['src/components/student', 'src/components/common', 'src/tools', 'src/platform/workflow'];
const extensions = new Set(['.js', '.jsx', '.css']);
const suspicious = /(?:background(?:-color)?\s*[:=]\s*['"]?|color\s*[:=]\s*['"]?)(#fff(?:fff)?|white|#202124|#000(?:000)?|black)\b/gi;
const baseline = JSON.parse(readFileSync(new URL('./theme-color-baseline.json', import.meta.url), 'utf8'));
const counts = {};
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file))) {
      const relative = file.replaceAll('\\', '/');
      for (const match of readFileSync(file, 'utf8').matchAll(suspicious)) {
        const key = `${relative}:${match[1].toLowerCase()}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
};
roots.forEach(walk);
const additions = Object.entries(counts).filter(([key, count]) => count > (baseline[key] || 0));
if (additions.length) {
  console.error('New hard-coded surface/text colors detected. Use --mm-* semantic tokens or document the exception in scripts/theme-color-baseline.json.');
  additions.forEach(([key, count]) => console.error(`  ${key}: ${count} (baseline ${baseline[key] || 0})`));
  process.exitCode = 1;
} else console.log(`Theme color audit passed (${Object.keys(counts).length} documented legacy exception groups; reductions are allowed).`);
