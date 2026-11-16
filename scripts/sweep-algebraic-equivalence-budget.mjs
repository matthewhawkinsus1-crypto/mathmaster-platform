#!/usr/bin/env node
/**
 * Verdict sweep for the simplify budget (functions/shared/toolMath/workflow/simplifyBudget.mjs).
 *
 * isAlgebraicallyEquivalent now decides a difference past the budget at sample
 * points instead of asking mathjs to simplify it. A grading change needs a
 * sweep that shows exactly which verdicts move, so this lays the rule as it
 * was beside the rule as it is, over every answer the banks key:
 *
 *   keys        every typed field of every Path and CCMR bank, and every
 *               typed box of an instance of every Question Family
 *   responses   the key, its right spellings (typedAnswerSpellings.mjs, the
 *               math editor's), its near misses, and the fuzz harness's own
 *               inputs for it (unfinished, mutated, padded)
 *
 * A pair inside the budget runs the same code as before; the sweep checks
 * that anyway. A pair past it is listed with both verdicts. The rule as it
 * was cannot be asked about a chain it never finishes, so past 16 links it is
 * recorded as "not run" (16 links took it under a second; 24, minutes).
 *
 *   node scripts/sweep-algebraic-equivalence-budget.mjs [--out sweep.json]
 *
 * Exit 1 if any verdict moved from right to wrong. Read only.
 */
import { writeFileSync } from 'node:fs';

import { parse, simplify } from '../functions/shared/algebra/safeMath.mjs';
import { sameValue } from '../functions/shared/answerEquivalence.mjs';
import { compareMathAnswer, normalizeMathAnswer } from '../functions/shared/answerUtils.mjs';
import { isAlgebraicallyEquivalent } from '../functions/shared/toolMath/workflow/equivalence.mjs';
import { algebraicExpressionInput } from '../functions/shared/toolMath/workflow/expressionSafety.mjs';
import { SIMPLIFY_BUDGET, simplifyCost } from '../functions/shared/toolMath/workflow/simplifyBudget.mjs';
import { familyQuestionCorpus, typedFieldCorpus } from './lib/graderFuzz/corpus.mjs';
import { INPUT_CLASSES, typedInput } from './lib/graderFuzz/inputs.mjs';
import { createRng } from './lib/graderFuzz/prng.mjs';
import { editorTypedSpellings } from './lib/editorTypedSpelling.mjs';
import { typedNearMissesOf, typedSpellingsOf } from './lib/typedAnswerSpellings.mjs';

const OLD_RULE_CHAIN_LIMIT = 16;

/** Where a pair is decided: before mathjs, by simplify (inside the budget), or past the budget. */
const routeOf = (student, expected) => {
  if (sameValue(student, expected, 1e-9) || compareMathAnswer(student, expected, 1e-9)) return { route: 'before-mathjs', verdict: true };
  const a = algebraicExpressionInput(student);
  const b = algebraicExpressionInput(expected);
  if (!a || !b) return { route: 'before-mathjs', verdict: false };
  if (a.includes('=') || b.includes('=')) {
    const left = a.split('=');
    const right = b.split('=');
    if (left.length !== 2 || right.length !== 2) return { route: 'before-mathjs', verdict: false };
    const same = (p, q) => normalizeMathAnswer(p) === normalizeMathAnswer(q);
    return { route: 'before-mathjs', verdict: (same(left[0], right[0]) && same(left[1], right[1])) || (same(left[0], right[1]) && same(left[1], right[0])) };
  }
  let cost;
  try {
    parse(a);
    parse(b);
    cost = simplifyCost(parse(`(${a}) - (${b})`));
  } catch {
    return { route: 'before-mathjs', verdict: false };
  }
  const inside = cost.nodes <= SIMPLIFY_BUDGET.nodes && cost.chain <= SIMPLIFY_BUDGET.chain;
  // The rule as it was: simplify the difference, whatever its size.
  const asItWas = () => {
    try { return simplify(`(${a}) - (${b})`).toString().replace(/\s+/g, '') === '0'; } catch { return false; }
  };
  if (inside) return { route: 'simplify', verdict: asItWas(), cost };
  return { route: 'past-budget', verdict: cost.chain <= OLD_RULE_CHAIN_LIMIT ? asItWas() : null, cost };
};

const keys = new Map();
const addKey = (key, field, source) => {
  if (typeof key !== 'string' && typeof key !== 'number') return;
  if (!keys.has(String(key))) keys.set(String(key), { key: String(key), field, source });
};
for (const { source, field } of typedFieldCorpus()) addKey(field.expected, field, source);
for (const { source, question } of familyQuestionCorpus({ perFamily: 3 })) {
  for (const field of Array.isArray(question.answerFields) ? question.answerFields : []) addKey(field.answer, field, source);
}

const rng = createRng('simplify-budget-sweep');
const totals = { keys: keys.size, pairs: 0, 'before-mathjs': 0, simplify: 0, 'past-budget': 0, pastBudgetKeys: 0 };
const moved = [];
const pastBudget = [];
for (const { key, field, source } of keys.values()) {
  const responses = new Set([key]);
  try { typedSpellingsOf(key, field).forEach(({ spelling }) => responses.add(spelling)); } catch { /* no spellings for this key */ }
  try { editorTypedSpellings(key).forEach((spelling) => responses.add(spelling)); } catch { /* as above */ }
  try { typedNearMissesOf(key, field).forEach(({ miss }) => responses.add(miss)); } catch { /* as above */ }
  for (const inputClass of INPUT_CLASSES) responses.add(typedInput(rng, inputClass, { key, field, maxLength: 300 }).text);
  let keyPastBudget = false;
  for (const response of responses) {
    totals.pairs += 1;
    const was = routeOf(response, key);
    totals[was.route] += 1;
    const now = isAlgebraicallyEquivalent(response, key);
    if (was.route === 'past-budget') {
      keyPastBudget = true;
      pastBudget.push({ source, key, response: response.slice(0, 200), was: was.verdict, now, cost: was.cost });
    }
    if (was.verdict !== null && was.verdict !== now) moved.push({ source, key, response: response.slice(0, 200), route: was.route, was: was.verdict, now, cost: was.cost });
  }
  if (keyPastBudget) totals.pastBudgetKeys += 1;
}

const lowered = moved.filter((entry) => entry.was === true && entry.now === false);
const raised = moved.filter((entry) => entry.was === false && entry.now === true);
const notRun = pastBudget.filter((entry) => entry.was === null);
console.log(`simplify budget sweep: ${totals.keys} keys, ${totals.pairs} (response, key) pairs`);
console.log(`  decided before mathjs: ${totals['before-mathjs']}`);
console.log(`  decided by simplify, inside the budget: ${totals.simplify}`);
console.log(`  past the budget, now decided at sample points: ${totals['past-budget']} (${totals.pastBudgetKeys} keys)`);
console.log(`    of those, the old rule was not run (a chain past ${OLD_RULE_CHAIN_LIMIT} links): ${notRun.length}, now right: ${notRun.filter((entry) => entry.now).length}`);
console.log(`  verdicts moved: ${moved.length} (right to wrong: ${lowered.length}, wrong to right: ${raised.length})`);
for (const entry of moved.slice(0, 40)) console.log(`    ${entry.was} -> ${entry.now}  key ${JSON.stringify(entry.key)}  response ${JSON.stringify(entry.response)}  [${entry.source}]`);
for (const entry of notRun.filter((item) => item.now).slice(0, 20)) console.log(`    not run -> true  key ${JSON.stringify(entry.key)}  response ${JSON.stringify(entry.response)}`);

const outIndex = process.argv.indexOf('--out');
if (outIndex >= 0) writeFileSync(process.argv[outIndex + 1], `${JSON.stringify({ totals, moved, pastBudget }, null, 2)}\n`);
process.exit(lowered.length ? 1 : 0);
