#!/usr/bin/env node
// Per-file verification loop for a Digital SAT draft repair: rank bias,
// generation yield, duplicate options, and that the expected choice actually
// carries the family's answer variable. Every one of these caught a real defect
// during the certification sweep, including two I introduced while repairing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import { analyzeAnswerKeyBias } from '../functions/shared/asvabFidelity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const drawsIndex = args.indexOf('--draws');
const DRAWS = drawsIndex === -1 ? 400 : Number(args[drawsIndex + 1]);
const ids = new Set(args.filter((a, i) => !a.startsWith('--') && i !== drawsIndex + 1));

const KEYNAMES = new Set(['answer', 'area', 'sa', 'key', 'ans', 'result']);
const docs = JSON.parse(readFileSync(path.join(ROOT, 'drafts/digitalSAT.v2.1.json'), 'utf8')).documents;

let problems = 0;
for (const doc of docs) {
  if (ids.size && ![...ids].some((frag) => doc.id.includes(frag))) continue;
  const samples = samplePathInstances(doc, DRAWS);
  const instances = samples.map((s) => s.question).filter(Boolean);
  const say = (msg) => { problems += 1; console.log(`  ${doc.id}: ${msg}`); };

  const failed = samples.length - instances.length;
  if (failed) say(`${((failed / samples.length) * 100).toFixed(2)}% of seeds produced no instance`);

  for (const issue of analyzeAnswerKeyBias(instances).issues) say(issue.detail);

  const exp = (doc.responseFields || [])[0]?.expected;
  for (const instance of instances) {
    const labels = (instance.choices || []).map((c) => String(c.label));
    if (labels.length && new Set(labels).size !== labels.length) { say(`duplicate options: ${labels.join(' | ')}`); break; }
  }
  if (doc.assessmentItemFormat === 'multipleChoice') {
    const ids2 = new Set((doc.choices || []).map((c) => c.id));
    if (exp && !ids2.has(exp)) say(`expected ${exp} names no choice`);
    const label = String((doc.choices || []).find((c) => c.id === exp)?.label ?? '');
    const names = (label.match(/\{\{(\w+)/g) || []).map((s) => s.slice(2));
    const derived = (doc.generator || {}).derived || {};
    if (names.length && Object.keys(derived).some((k) => KEYNAMES.has(k)) && !names.some((n) => KEYNAMES.has(n))) {
      say(`expected choice ${exp} carries ${names.join(',')}, not the answer variable`);
    }
  }
}
console.log(problems ? `\n${problems} problems` : '\nclean');
process.exit(problems ? 1 : 0);
