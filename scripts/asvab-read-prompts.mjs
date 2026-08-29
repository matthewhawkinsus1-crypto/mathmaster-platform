#!/usr/bin/env node
// Print one generated prompt per family, for reading.
//
// This exists because two classes of defect got through every automated gate.
// Independently drawn `choice` parameters produced "how many ounces are in 11
// hours?" and a table asserting 1 kilogram = 100 grams; plural item pools
// produced "what does one panels cost?" and "the lowest price per cartons".
// In both cases the arithmetic was internally consistent, the answer key was
// right, and the bias profile was healthy — only the words were wrong, and
// nothing but reading them was going to show that.
//
//   node scripts/asvab-read-prompts.mjs [drafts/asvab-ar.json] [seed] [--choices]
import { readFileSync } from 'node:fs';
import { generatePathInstance } from '../functions/shared/pathQuestionGeneration.mjs';

const args = process.argv.slice(2);
const file = args.find((entry) => !entry.startsWith('--')) || 'drafts/asvab-ar.json';
const seed = args.filter((entry) => !entry.startsWith('--'))[1] || 'read';
const withChoices = args.includes('--choices');

const documents = JSON.parse(readFileSync(file, 'utf8')).documents || [];
let ungenerated = 0;
for (const question of documents) {
  const instance = generatePathInstance(question, seed).question;
  if (!instance) { ungenerated += 1; console.log(`!! ${question.id} did not generate`); continue; }
  console.log(`${question.assessedConstruct.padEnd(7)} ${instance.prompt}`);
  if (instance.stimulus?.table) {
    for (const row of instance.stimulus.table.rows) {
      console.log(`        | ${(Array.isArray(row) ? row : row.cells).join(' | ')}`);
    }
  }
  if (withChoices) console.log(`        ${instance.choices.map((c) => c.label).join('   ')}`);
}
console.log(`\n${documents.length} families, ${ungenerated} ungenerated.`);
