#!/usr/bin/env node
// Do the generators actually produce good questions — every time?
//
// A generator template is not a question. It is a recipe, and a recipe can be
// fine for ninety-nine parameter draws and produce something broken on the
// hundredth: an unbound placeholder that reaches a student as literal `{{b}}`,
// a derived value that divides by zero, a constraint set that cannot be
// satisfied, an answer that comes out as NaN, or a "generator" that draws the
// same numbers every time and is really a fixed question wearing a costume.
//
// None of those are findable by reading the template. They are findable by
// GENERATING from it, many times, and looking at what comes out — which is
// what this does, over every active template in the bank.
//
// It deliberately does NOT try to check that the mathematics is right. That
// requires knowing what each question means, and a checker that guesses would
// produce confident wrong answers. What it checks is that every instance is
// WELL-FORMED and DISTINCT, which is the class of defect that reaches students
// silently.
//
// Read-only.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { generatePathInstance, hasPathGenerator } from '../functions/shared/pathQuestionGeneration.mjs';

const SEED_DIR = 'seed/pathQuestionBank';
const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const requestedBank = argValue('--bank');
const requestedSamples = Number(argValue('--samples'));
const legacySamples = Number(process.argv[2]);
const SAMPLES = Number.isFinite(requestedSamples) && requestedSamples > 0
  ? requestedSamples
  : (Number.isFinite(legacySamples) && legacySamples > 0 ? legacySamples : 24);
const STRICT = process.argv.includes('--strict');

const load = () => {
  if (requestedBank) {
    const parsed = JSON.parse(readFileSync(requestedBank, 'utf8'));
    return (parsed.documents || []).filter((doc) => doc.active !== false).map((doc) => ({
      ...doc,
      bank: requestedBank,
    }));
  }

  const docs = [];
  readdirSync(SEED_DIR).filter((name) => name.endsWith('.json')).forEach((name) => {
    const parsed = JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8'));
    (parsed.documents || []).forEach((doc) => {
      if (doc.active !== false) docs.push({ ...doc, bank: name.replace('_pathQuestionBank_seed.json', '') });
    });
  });
  return docs;
};

/** Every string anywhere in the instance, so nothing hides in a nested field. */
const collectStrings = (node, out = []) => {
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((item) => collectStrings(item, out)); return out; }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((value) => collectStrings(value, out));
  }
  return out;
};

// "The result is undefined" is correct mathematical prose about a rational
// expression, not a leaked JavaScript value. Only the machine spellings count,
// and `undefined`/`null` only when they appear where a NUMBER belongs — beside
// an operator, a delimiter, or an equals sign.
const BAD_NUMBER = /(?:^|[^A-Za-z])NaN(?:$|[^A-Za-z])|[-+*/=(\[,]\s*(?:undefined|null)|(?:undefined|null)\s*[-+*/=)\],]|(?:^|[^A-Za-z])-?Infinity(?:$|[^A-Za-z])/;
// `\sqrt{{{n}}}` is a LaTeX brace wrapping a placeholder, and `\frac{\sqrt{7}}{7}`
// legitimately ends in `}}`. An UNSUBSTITUTED placeholder is what matters, and
// generatePathInstance already reports those separately — so this looks only for
// the opening form with a plausible identifier inside it.
const LEFTOVER = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(\|[^}]*)?\}\}/;
// "5 + -3" and "x = --4" are generated-arithmetic smells: a signed placeholder
// substituted where the template already wrote an operator.
const DOUBLE_SIGN = /[+\-*/=]\s*[+\-]\s*[+\-]|\+\s*-\s*\d|--\d/;
const EMPTY_MATH = /\$\s*\$/;

const findings = {
  noGenerator: [],
  unsatisfiable: [],
  unboundPlaceholder: [],
  badNumber: [],
  leftoverBraces: [],
  doubleSign: [],
  emptyMath: [],
  degenerate: [],
  divisionByZero: [],
};

const templates = load();
let instancesChecked = 0;

templates.forEach((template) => {
  const id = `${template.bank}/${template.id}`;

  if (!hasPathGenerator(template)) {
    findings.noGenerator.push(id);
    return;
  }

  const fingerprints = new Set();
  let sampled = 0;

  for (let index = 0; index < SAMPLES; index += 1) {
    const result = generatePathInstance(template, `health-${index}`);
    instancesChecked += 1;

    if (!result.question) {
      const reason = String(result.reason || 'unknown');
      if (reason.startsWith('unbound_placeholders')) {
        findings.unboundPlaceholder.push(`${id} — ${reason}`);
      } else {
        findings.unsatisfiable.push(`${id} — ${reason}`);
      }
      break; // one report per template is enough
    }

    sampled += 1;
    const strings = collectStrings(result.question);
    const joined = strings.join('  ');
    fingerprints.add(joined);

    if (LEFTOVER.test(joined)) findings.leftoverBraces.push(`${id} (seed ${index})`);
    if (BAD_NUMBER.test(joined)) {
      const sample = strings.find((text) => BAD_NUMBER.test(text));
      findings.badNumber.push(`${id} (seed ${index}) — ${String(sample).slice(0, 110)}`);
    }
    if (EMPTY_MATH.test(joined)) findings.emptyMath.push(`${id} (seed ${index})`);
    if (DOUBLE_SIGN.test(joined)) {
      const sample = strings.find((text) => DOUBLE_SIGN.test(text));
      findings.doubleSign.push(`${id} (seed ${index}) — ${String(sample).slice(0, 110)}`);
    }

    // A derived value that came out as a division by zero. Only NUMERIC
    // parameters are checked: many templates legitimately draw from a list of
    // words ("pool pass", "eating breakfast") to vary a context, and calling
    // those non-finite numbers was this script being wrong about the data.
    Object.entries(result.parameters || {}).forEach(([name, value]) => {
      if (typeof value !== 'number') return;
      if (!Number.isFinite(value)) {
        findings.divisionByZero.push(`${id} (seed ${index}) — ${name}=${value}`);
      }
    });
  }

  // A generator that produces one distinct instance across two dozen seeds is a
  // fixed question with extra steps — and two students "personalised" from it
  // get identical work.
  if (sampled >= 4 && fingerprints.size <= 1) findings.degenerate.push(id);
});

// --- Report -------------------------------------------------------------------

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((entry) => {
    const key = String(entry).split(' (seed')[0].split(' — ')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const section = (title, list, detail) => {
  const unique = dedupe(list);
  const flag = unique.length ? '✗' : '✓';
  console.log(`${flag} ${title}: ${unique.length}${unique.length !== list.length ? ` (${list.length} instances)` : ''}`);
  if (detail && unique.length) {
    unique.slice(0, 10).forEach((entry) => console.log(`      ${entry}`));
    if (unique.length > 10) console.log(`      …and ${unique.length - 10} more templates`);
  }
  return unique.length;
};

console.log('# Generator health\n');
console.log(`Templates: ${templates.length}   Instances generated: ${instancesChecked}   Seeds per template: ${SAMPLES}\n`);

console.log('## Instances that would reach a student broken\n');
let blocking = 0;
blocking += section('Unbound placeholder — a student would see literal {{x}}', findings.unboundPlaceholder, true);
blocking += section('Leftover braces anywhere in the instance', findings.leftoverBraces, true);
blocking += section('NaN / Infinity / undefined in the text', findings.badNumber, true);
blocking += section('Empty math delimiters ($$)', findings.emptyMath, true);
blocking += section('Non-finite generated parameter', findings.divisionByZero, true);
blocking += section('Constraints unsatisfiable — no instance can be produced', findings.unsatisfiable, true);

console.log('\n## Instances that would reach a student ugly\n');
const ugly = section('Double sign, e.g. "5 + -3"', findings.doubleSign, true);

console.log('\n## Templates that do not really generate\n');
const fixed = section('No generator at all — fixed question', findings.noGenerator, true);
const degenerate = section('Degenerate — same instance from every seed', findings.degenerate, true);

console.log('');
console.log(blocking === 0
  ? 'No template produced a broken instance in any sampled draw.'
  : `${blocking} template(s) can produce a broken instance. These reach students silently.`);
if (STRICT) {
  console.log(`Strict quality findings: ${ugly + fixed + degenerate}`);
}

process.exitCode = blocking === 0 && (!STRICT || (ugly + fixed + degenerate) === 0) ? 0 : 1;
