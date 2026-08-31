#!/usr/bin/env node
// Renders every Digital SAT family and looks for the wording a template can
// produce but the exam never prints: a unit coefficient written out ("1x"),
// a zero constant carried through a signed slot ("+ 0"), doubled signs, an
// empty group, or a placeholder that never resolved.
//
// The certification sweep found 244 of these across 664 families. They come
// from parameter ranges that include 0 and +/-1 in a coefficient or constant
// slot, so the repair is an exclude on the parameter or a constraint on the
// derived value - never a change to the renderer.
//
//   node scripts/digital-sat-render-lint.mjs [--draws 150] [--source <file>]
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
const DRAWS = Number(flag('draws', 150));
const SOURCE = flag('source', 'drafts/digitalSAT.v2.1.json');

export const RENDER_RULES = Object.freeze([
  [/(?<![\d.])1x/, 'unit coefficient written as 1x'],
  [/\+\s*-/, 'plus followed by minus'],
  [/--/, 'double minus'],
  [/\(\s*\)/, 'empty group'],
  [/\bx\^1\b/, 'exponent 1'],
  [/\+\s*0(?![\d.])/, 'plus zero'],
  [/\{\{/, 'placeholder left unrendered'],
]);

export const renderWarts = (docs, draws = 150) => {
  const found = new Map();
  for (const doc of docs) {
    for (const { question } of samplePathInstances(doc, draws)) {
      if (!question) continue;
      const review = question.solutionReview || {};
      const text = [question.prompt, ...(question.choices || []).map((c) => String(c.label)),
        ...(review.reasoning || []), review.answerSummary || ''].join('\n');
      for (const [rule, why] of RENDER_RULES) {
        const match = rule.exec(text);
        const key = `${doc.id}\t${why}`;
        if (match && !found.has(key)) {
          found.set(key, `${doc.id}\t${why}\t...${text.slice(Math.max(0, match.index - 28), match.index + 28)}...`);
        }
      }
    }
  }
  return [...found.values()];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const docs = JSON.parse(readFileSync(path.join(ROOT, SOURCE), 'utf8')).documents;
  const warts = renderWarts(docs, DRAWS);
  for (const line of warts) console.log(line);
  console.log(`\n${warts.length} rendering warts across ${docs.length} families`);
  process.exit(warts.length ? 1 : 0);
}
