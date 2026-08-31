// Check drafted Path questions before they go anywhere near a student.
//
//   node scripts/verify-path-drafts.mjs drafts/grade6.json [more.json ...]
//   node scripts/verify-path-drafts.mjs drafts/*.json --samples 12
//   node scripts/verify-path-drafts.mjs drafts/*.json --json
//
// This is the gate for content drafted anywhere else. It runs the SAME checks
// the platform runs, in the same code, so "it passed" means the runtime will
// really issue and grade it — not that it looked right.
//
//   1. PRODUCTION ISSUABILITY. `buildTemplateIssuePlan`, which is what the
//      importer calls. A template is checked by GENERATING from it: sampled
//      instances each go through the same `buildIssuePlan` an authored item
//      faces. A template whose `expected` is still "{{b}}" looks gradeable and
//      is wrong for every student who meets it, and only generating finds that.
//   2. ALIGNMENT. Every alignmentKey has to be a real Texas standard.
//   3. IDENTITY. No id may collide with the existing bank or with a sibling.
//   4. RENDERING. Unbalanced `$…$` in any authored string, which is what puts
//      raw LaTeX on a student's screen. Checked on GENERATED instances, so a
//      substituted value that breaks the delimiters is caught too.
//   5. VARIETY. A template that draws the same question every time is a fixed
//      question wearing a generator, and is reported as such.
//
// Exit code is 0 only when every draft passes every check.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTexasStandard, normalizeTeksCode } from '../src/texasStandards.js';
import { isMathSegment, splitMathSegments } from '../src/components/common/mathSegments.js';
import { hasPathGenerator, samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(here, '../functions/seeds/pathQuestionBank');

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const samples = Number(argOf('--samples', '10')) || 10;
const asJson = process.argv.includes('--json');
const allowExistingIds = process.argv.includes('--allow-existing-ids');
const files = process.argv.slice(2).filter((entry) => entry.endsWith('.json'));

if (!files.length) {
  console.error('Usage: node scripts/verify-path-drafts.mjs <draft.json> [...] [--samples N] [--json]');
  process.exit(2);
}

const documentsIn = (parsed) => (Array.isArray(parsed)
  ? parsed
  : (parsed.documents || parsed.items || parsed.questions || []));

// Ids already published, so a draft cannot quietly overwrite one.
const existingIds = new Set(readdirSync(SEED_DIR).filter((name) => name.endsWith('.json'))
  .flatMap((name) => documentsIn(JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'))).map((entry) => entry.id)));

// --- rendering ------------------------------------------------------------------

const everyString = (node, found = []) => {
  if (typeof node === 'string') { found.push(node); return found; }
  if (Array.isArray(node)) { node.forEach((entry) => everyString(entry, found)); return found; }
  if (node && typeof node === 'object') { Object.values(node).forEach((entry) => everyString(entry, found)); return found; }
  return found;
};

// A `$` that never closes leaves its partner, and everything after it, on the
// screen as characters. Escape-aware, because `\$` is money and not a delimiter.
const unbalancedMath = (text) => {
  const delimiters = (String(text).match(/(?<!\\)\$/g) || []).length;
  if (delimiters % 2 === 0) return false;
  // A single lone `$` is a currency symbol ("Plan A total ($)"), not a formula.
  return delimiters > 1;
};

const rawCommandOutsideMath = (text) => splitMathSegments(text)
  .filter((segment) => !isMathSegment(segment))
  .some((segment) => /\\(?:frac|dfrac|sqrt|left|right|cdot|times|le|ge|infty|cup|begin|end)\b/.test(segment));

// --- the checks -----------------------------------------------------------------

const verifyDocument = async (document, seenIds) => {
  const problems = [];
  const id = String(document?.id || '').trim();
  if (!id) problems.push('missing_id');
  if (id && existingIds.has(id) && !allowExistingIds) problems.push(`id_already_published:${id}`);
  if (id && seenIds.has(id)) problems.push(`duplicate_id_in_drafts:${id}`);
  if (id) seenIds.add(id);

  const keys = Array.isArray(document?.alignmentKeys) ? document.alignmentKeys : [];
  if (!keys.length) problems.push('no_alignment_keys');
  keys.forEach((key) => {
    const code = normalizeTeksCode(String(key).replace(/^texas:/i, ''));
    if (!code || !getTexasStandard(code)) problems.push(`unknown_standard:${key}`);
  });

  const plan = await mathPath.buildTemplateIssuePlan(document, { samples });
  if (!plan.issuable) problems.push(`not_issuable:${plan.reason}`);

  // Render checks run on what a student would actually be given.
  const generated = hasPathGenerator(document)
    ? samplePathInstances(document, Math.min(samples, 6)).map((entry) => entry.question).filter(Boolean)
    : [document];
  // What counts as variety is the whole rendered question, not the prompt.
  //
  // A multiple-choice item may ask a fixed question about varying material —
  // "Which set of pairs is a function?" over four sets that change every draw,
  // or "Does the table show an inverse variation?" over a table that does. Those
  // generate perfectly well, and measuring the prompt alone reported 156 of them
  // as producing one question. Measuring the prompt, the choices and the stimulus
  // together still fails a generator that genuinely yields one item, which is
  // what this check is for.
  const rendered = new Set();
  generated.forEach((instance) => {
    // Generator variety is the STUDENT-VISIBLE mathematical surface, not only
    // prose. Interactive questions often keep the directions fixed while the
    // mapping pairs, system equations, data points, function, or inequality
    // changes. Ignoring those fields falsely reports a healthy generator as
    // "one question."
    //
    // Keep this an allowlist: expected answers and grading-only fields must not
    // be able to manufacture apparent variety.
    rendered.add(JSON.stringify({
      prompt: instance.prompt ?? '',
      choices: (instance.choices || []).map((choice) => choice?.label ?? ''),
      stimulus: instance.stimulus ?? null,
      context: instance.context ?? null,
      equationLatex: instance.equationLatex ?? null,
      equationsLatex: instance.equationsLatex ?? null,
      pairs: instance.pairs ?? null,
      system: instance.system ?? null,
      inequalities: instance.inequalities ?? null,
      points: instance.points ?? null,
      functionSpec: instance.functionSpec ?? null,
    }));
    everyString(instance).forEach((text) => {
      if (unbalancedMath(text)) problems.push(`unbalanced_math:${text.slice(0, 60)}`);
      if (rawCommandOutsideMath(text)) problems.push(`latex_outside_math:${text.slice(0, 60)}`);
      if (/\{\{/.test(text)) problems.push(`unsubstituted_placeholder:${text.slice(0, 60)}`);
    });
  });

  const variety = hasPathGenerator(document) ? rendered.size : null;
  if (variety !== null && variety <= 1) problems.push('generator_produces_one_question');

  return {
    id: id || '(no id)',
    standards: keys,
    generated: hasPathGenerator(document),
    samples: plan.samples,
    variety,
    problems: [...new Set(problems)],
  };
};

// --- run -------------------------------------------------------------------------

const seenIds = new Set();
const results = [];
for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    results.push({ file, id: '(unparseable)', problems: [`invalid_json:${error.message}`] });
    continue;
  }
  const documents = documentsIn(parsed);
  if (!documents.length) {
    results.push({ file, id: '(empty)', problems: ['no_question_documents'] });
    continue;
  }
  for (const document of documents) {
    // eslint-disable-next-line no-await-in-loop
    results.push({ file, ...(await verifyDocument(document, seenIds)) });
  }
}

const failed = results.filter((entry) => entry.problems.length);

if (asJson) {
  console.log(JSON.stringify({ checked: results.length, failed: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

console.log(`Checked ${results.length} drafted question(s) from ${files.length} file(s).\n`);
const generatedCount = results.filter((entry) => entry.generated).length;
console.log(`  templates (generate many questions) : ${generatedCount}`);
console.log(`  fixed questions                     : ${results.length - generatedCount}`);
console.log(`  passing every check                 : ${results.length - failed.length}/${results.length}\n`);

failed.forEach((entry) => {
  console.log(`✗ ${entry.id}  (${entry.file})`);
  entry.problems.forEach((problem) => console.log(`    ${problem}`));
});

if (!failed.length) {
  const thin = results.filter((entry) => entry.generated && entry.variety !== null && entry.variety < 4);
  console.log('All drafts pass. They will issue and grade in production.');
  if (thin.length) {
    console.log(`\nWorth a look: ${thin.length} template(s) produced fewer than 4 distinct questions in`);
    console.log('sampling. That is legal but thin — widen the parameter ranges.');
  }
  console.log('\nNext: add them to a seed file and import through the Path audit,');
  console.log('which runs this same gate server-side before anything is written.');
}

process.exit(failed.length ? 1 : 0);
