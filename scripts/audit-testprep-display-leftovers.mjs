#!/usr/bin/env node
/*
 * THE TEST-PREP DISPLAY AUDIT (CT12): count the display leftovers of CT14 and
 * A2-109 (an exponent of 1, a denominator of 1, "-7/1", a collapsed "(x)", a "where"
 * clause over the generator's constants) and the O2 classes, over every draw of every
 * Digital SAT, ACT and TSIA2 template. Draws are a sample: a form that needs two or
 * three parameters to line up (a run of 1 only when t = 1 and k - h = 1) can miss it,
 * and tests/platform/testPrepDisplayLeftovers.test.mjs walks every value instead.
 *
 *   node scripts/audit-testprep-display-leftovers.mjs                 counts per class, framework and surface
 *   node scripts/audit-testprep-display-leftovers.mjs --items         and every template, with an example
 *   node scripts/audit-testprep-display-leftovers.mjs --draws 200     more draws per template (default 60)
 *   node scripts/audit-testprep-display-leftovers.mjs --json out.json the whole result
 *
 * Read-only: it draws questions in memory and writes nothing unless --json is given.
 * The classes and what each means are in scripts/lib/testPrepDisplayAudit.mjs.
 */
import { writeFileSync } from 'node:fs';

import { FRAMEWORKS, SURFACES, scanBank } from './lib/testPrepDisplayAudit.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const draws = Number(option('--draws') || 60);
const jsonPath = option('--json');
const showItems = args.includes('--items');

const result = scanBank({ draws });
console.log(`Test-prep display audit: ${result.templates} templates, ${result.draws} draws (${draws} per template)\n`);
const short = { digitalSAT: 'SAT', act: 'ACT', tsia2: 'TSIA2' };
for (const [id, summary] of Object.entries(result.classes)) {
  const frameworks = FRAMEWORKS.map((framework) => `${short[framework]} ${summary.byFramework[framework].templates}`).join(' · ');
  const surfaces = SURFACES.map((surface) => `${surface} ${summary.bySurface[surface].templates}`).join(', ');
  console.log(`${summary.certain ? '' : '(judgement) '}${id}: ${summary.templates} templates, ${summary.draws} draws — ${frameworks}`);
  console.log(`    ${summary.label}  [${summary.source}]`);
  if (summary.templates) console.log(`    templates by surface: ${surfaces}`);
  if (showItems) {
    summary.items.forEach((item) => console.log(`      ${item.id}  ${item.draws}/${draws} draws  ${Object.keys(item.surfaces).join('+')}  ${item.example ? `“${item.example.snippet}” in ${item.example.surface}: ${item.example.text}` : ''}`));
  }
}
if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nWrote ${jsonPath}`);
}
