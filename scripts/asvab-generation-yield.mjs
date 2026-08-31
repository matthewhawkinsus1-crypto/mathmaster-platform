#!/usr/bin/env node
// Reports families whose generator constraints are tight enough that some seeds
// fail to produce an instance. A family that fails on any seed leaves a student
// staring at a missing question, so the yield has to be 100%.
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';

const file = process.argv[2];
const draws = Number(process.argv[3] || 2000);
const docs = JSON.parse(readFileSync(file, 'utf8')).documents || [];
let bad = 0;
for (const doc of docs) {
  const samples = samplePathInstances(doc, draws);
  const fails = samples.filter((entry) => !entry.question).length;
  if (fails) {
    bad += 1;
    console.log(`${((fails / draws) * 100).toFixed(2)}% fail  ${doc.id}`);
  }
}
console.log(`families with any generation failure: ${bad} of ${docs.length}`);
process.exit(bad ? 1 : 0);
