#!/usr/bin/env node
// Compact working view of the flagged Digital SAT families in one draft file:
// prompt, key expression, each distractor's expression, and where each sits
// relative to the key across a sample. This is what a repair is designed
// against — the generator alone does not show which side a distractor lands on.
//
//   node scripts/digital-sat-family-view.mjs <draftFile> [--draws 300] [--all]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import { analyzeAnswerKeyBias } from '../functions/shared/asvabFidelity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const drawsIndex = args.indexOf('--draws');
const DRAWS = drawsIndex === -1 ? 300 : Number(args[drawsIndex + 1]);
const showAll = args.includes('--all');
const file = args.filter((a, i) => !a.startsWith('--') && i !== drawsIndex + 1)[0];

const parsed = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
const docs = parsed.documents || [];

const numeric = (label) => {
  if (typeof label === 'number') return Number.isFinite(label) ? label : null;
  if (typeof label !== 'string') return null;
  const cleaned = label.replace(/\$/g, '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ').replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
};

for (const doc of docs) {
  const instances = samplePathInstances(doc, DRAWS).map((s) => s.question).filter(Boolean);
  const bias = analyzeAnswerKeyBias(instances);
  if (!showAll && !bias.issues.length) continue;

  const gen = doc.generator || {};
  const derived = gen.derived || {};
  const keyId = (doc.responseFields || [])[0]?.expected;
  const exprOf = (label) => {
    const names = String(label).match(/\{\{(\w+)/g) || [];
    if (!names.length) return String(label);
    const name = names[0].slice(2);
    return derived[name] !== undefined ? `${name} = ${derived[name]}` : name;
  };

  const above = new Map();
  const total = new Map();
  const keys = [];
  for (const instance of instances) {
    const key = numeric((instance.choices || []).find((c) => c.id === keyId)?.label);
    if (key === null) continue;
    keys.push(key);
    for (const choice of instance.choices || []) {
      if (choice.id === keyId) continue;
      const value = numeric(choice.label);
      if (value === null) continue;
      total.set(choice.id, (total.get(choice.id) || 0) + 1);
      if (value > key) above.set(choice.id, (above.get(choice.id) || 0) + 1);
    }
  }
  keys.sort((a, b) => a - b);

  console.log(`\n${doc.id}   [${doc.ccmrFamilyRole} band ${doc.difficultyBand} dok ${doc.dok}]`);
  console.log(`   ${String(doc.prompt).slice(0, 150)}`);
  console.log(`   issues: ${bias.issues.map((i) => i.code).join(', ') || 'none'}${bias.issues.length ? ` — ${bias.issues[0].detail}` : ''}`);
  console.log(`   params: ${JSON.stringify(gen.parameters || {}).slice(0, 220)}`);
  if (gen.constraints) console.log(`   constraints: ${JSON.stringify(gen.constraints)}`);
  for (const choice of doc.choices || []) {
    const n = total.get(choice.id);
    const pct = n ? `${Math.round((100 * (above.get(choice.id) || 0)) / n)}% above` : '—';
    console.log(`   ${choice.id === keyId ? 'KEY ' : '    '}${String(choice.id).padEnd(10)} ${String(choice.label).padEnd(28)} ${exprOf(choice.label).padEnd(34)} ${pct}`);
  }
  if (keys.length) console.log(`   key range: ${keys[0]} .. ${keys[keys.length - 1]}`);
}
