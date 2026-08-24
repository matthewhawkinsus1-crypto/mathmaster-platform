#!/usr/bin/env node
// Development probe: where does the answer key land among the four choices,
// family by family? A family whose key sits at one rank every time is
// answerable by magnitude alone.
//
// This deliberately calls the same analyzer the audit and the tests use rather
// than reimplementing the label parsing. An earlier version had its own copy,
// which read `\frac{1}{5}` as the integer 15 and cheerfully reported a family
// as clean that the real gate then rejected.
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import { EXTREME_TOLERANCE, RANK_TOLERANCE, analyzeAnswerKeyBias } from '../functions/shared/asvabFidelity.mjs';

const file = process.argv[2] || 'drafts/asvab-ar.json';
// 200 rather than 60. A family whose key genuinely splits 50/50 between the two
// middle ranks sits close to the 0.6 tolerance, and at 60 draws sampling noise
// alone crosses it often enough to make the gate flaky.
const draws = Number(process.argv[3]) || 200;
const documents = JSON.parse(readFileSync(file, 'utf8')).documents || [];

console.log(`rank tolerance ${RANK_TOLERANCE}, extreme tolerance ${EXTREME_TOLERANCE}, ${draws} draws per family\n`);
let flagged = 0;
for (const question of documents) {
  const samples = samplePathInstances(question, draws);
  const instances = samples.map((entry) => entry.question).filter(Boolean);
  const ungenerated = samples.length - instances.length;
  const bias = analyzeAnswerKeyBias(instances);
  const total = bias.rank.reduce((sum, count) => sum + count, 0) || 1;
  const worst = Math.max(...bias.rank) / total;
  const bad = bias.issues.length > 0;
  if (bad) flagged += 1;
  const note = bias.numeric ? `ranks=[${bias.rank.join(',')}] worst=${(worst * 100).toFixed(0)}%` : 'non-numeric choices, rank analysis not applicable';
  console.log(`${bad ? 'BIAS' : '  ok'}  ${String(question.id).padEnd(48)} ${note}${ungenerated ? ` ungenerated=${ungenerated}` : ''}`);
  bias.issues.forEach((issue) => console.log(`        ${issue.code}: ${issue.detail}`));
}
console.log(`\n${flagged} of ${documents.length} families flagged.`);
process.exit(flagged ? 1 : 0);
