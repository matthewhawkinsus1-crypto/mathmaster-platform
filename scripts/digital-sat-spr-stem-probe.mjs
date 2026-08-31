#!/usr/bin/env node
// Does a student-produced-response family print its own answer in the stem?
//
// The certification sweep's strongest checks - answer-key rank bias, choice-id
// leakage, arithmetic ladders, duplicate options - all need four options, so
// they say nothing at all about the 166 SPR families. This is the one leak that
// does apply to them, and it was found by hand-reading a stratified sample
// rather than by any automated rule.
//
// A hit is not automatically a defect. "The zeros of x^2-12x+32 are r and s;
// what is rs?" prints 32 in the stem because Vieta's relation is the skill
// being tested. But "the boundary lines intersect at (5,4); what is the value
// of y?" at band 5 / DOK 3 is a read-off wearing a challenge label, and that
// distinction needs a human. The script reports; it does not judge.
//
//   node scripts/digital-sat-spr-stem-probe.mjs [--draws 200] [--source <file>]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

export const answerInStem = (docs, draws = 200) => {
  const rows = [];
  for (const doc of docs) {
    if (doc.assessmentItemFormat !== 'studentProducedResponse') continue;
    let inStem = 0;
    let counted = 0;
    for (const { question } of samplePathInstances(doc, draws)) {
      if (!question) continue;
      const expected = String((question.responseFields || [])[0]?.expected ?? '').trim();
      if (!/^-?\d+(\.\d+)?$/.test(expected)) continue;
      counted += 1;
      // a standalone occurrence of the answer inside the visible stem
      const bounded = new RegExp(`(^|[^\\d.\\-])${expected.replace('-', '\\-')}([^\\d.]|$)`);
      if (bounded.test(String(question.prompt || ''))) inStem += 1;
    }
    if (counted >= 8 && inStem / counted > 0.95) {
      rows.push({
        id: doc.id,
        domain: (doc.assessmentContext || {}).domainId,
        role: doc.ccmrFamilyRole,
        band: doc.difficultyBand,
        dok: doc.dok,
      });
    }
  }
  return rows.sort((a, b) => (b.band - a.band) || a.id.localeCompare(b.id));
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = flag('source', 'seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json');
  const docs = JSON.parse(readFileSync(path.join(ROOT, source), 'utf8')).documents;
  const rows = answerInStem(docs, Number(flag('draws', 200)));
  for (const r of rows) console.log(`  ${r.id}  [${r.domain} ${r.role} band ${r.band} dok ${r.dok}]`);
  console.log(`\n${rows.length} SPR families print the expected answer in the stem in every draw`);
}
