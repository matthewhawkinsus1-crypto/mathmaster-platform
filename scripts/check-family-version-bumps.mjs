#!/usr/bin/env node
/**
 * A FIELD THAT ASKS FOR ANOTHER KIND OF ANSWER MOVES familyVersion (the owner,
 * 2026-10-20; student pass 3, W7-1 decision 5).
 *
 * WHY. A student's recorded answer is tied to the family's version. At
 * `dc2ae1ad` ten Algebra I fields were re-asked as inequalities (they had been
 * interval notation) without a version move, so answers recorded under the old
 * question read as answers to the new one. The equivalence sweep only lists
 * such fields (`oldKeysReasked`); this check refuses them. Those ten fields'
 * seven families moved to familyVersion 4 on 2026-10-23 (GR21), so the check
 * run against `dc2ae1ad^` now passes.
 *
 * WHAT. For every bank item in both the base commit and the working tree with
 * the same id and the same version (`familyVersion`, else `version`), each
 * response field present in both must ask for the same kind of answer: the
 * same `inputProfile`, `answerFormat`, `equivalence`, `notation` and
 * `toolProfile`, read from the stored (compiled) document. A variant with its
 * own responseFields asks its own questions, so each of its fields is
 * compared too (CI04, Codex on #507: 1,024 such variants were never read). A
 * key's text may change at the same version (the sweep checks the old
 * spelling is still accepted); its kind may not.
 *
 *   node scripts/check-family-version-bumps.mjs --base <commit>
 *
 * Without --base it compares against the merge base with origin/main. Exit 0
 * when every changed kind came with a version move, 1 when one did not, 2 when
 * the base cannot be read. Read-only: `git show` and the working tree.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The banks whose items carry a familyVersion (the sweep's seed files). */
export const BANK_DIRS = Object.freeze([
  ['functions/seeds/pathQuestionBank', (name) => name.endsWith('_pathQuestionBank_seed.json')],
  ['functions/seeds/secureAssessments', (name) => name.endsWith('.json')],
]);

export const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || []));
export const versionOf = (item) => item?.familyVersion ?? item?.version ?? null;
// Keys sorted, so a toolProfile written in another order is the same value.
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
/** What kind of answer a field asks for. */
export const fieldKind = (field) => JSON.stringify(canonical([
  field?.inputProfile || null, field?.answerFormat || null, field?.equivalence || null,
  field?.notation ?? null, field?.toolProfile ?? null,
]));
// The document's own fields by id, and each variant's own fields as
// `variants[<coverageKey or position>].<id>`.
const fieldsOf = (document) => {
  const fields = new Map();
  const add = (prefix, list) => (Array.isArray(list) ? list : [])
    .filter((field) => field && field.id !== undefined)
    .forEach((field) => fields.set(`${prefix}${field.id}`, field));
  add('', document?.responseFields);
  (Array.isArray(document?.variants) ? document.variants : []).forEach((variant, index) => {
    if (Array.isArray(variant?.responseFields)) add(`variants[${variant.coverageKey ?? index}].`, variant.responseFields);
  });
  return fields;
};

/**
 * Every field of `file` re-asked as another kind of answer at the same
 * version: [{ file, id, version, field, before, after }]. `compile` turns an
 * authored item into its stored document (identity by default).
 */
export const familyVersionViolations = ({ file, baseDocuments = [], headDocuments = [], compile = (item) => item }) => {
  const baseById = new Map(baseDocuments.filter((item) => item?.id !== undefined).map((item) => [item.id, item]));
  const violations = [];
  for (const item of headDocuments) {
    const before = baseById.get(item?.id);
    if (!before || versionOf(before) !== versionOf(item)) continue;
    const now = fieldsOf(compile(item));
    for (const [fieldId, oldField] of fieldsOf(compile(before))) {
      const field = now.get(fieldId);
      if (!field || fieldKind(oldField) === fieldKind(field)) continue;
      violations.push({ file, id: item.id, version: versionOf(item), field: fieldId, before: fieldKind(oldField), after: fieldKind(field) });
    }
  }
  return violations;
};

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

const main = () => {
  const index = process.argv.indexOf('--base');
  let base = index >= 0 ? process.argv[index + 1] : null;
  try {
    base = base || git('merge-base', 'HEAD', 'origin/main').trim();
    git('cat-file', '-e', `${base}^{commit}`);
  } catch {
    console.error(`family versions: cannot read the base commit (${base || 'merge base with origin/main'}). Pass --base <commit> and fetch it first.`);
    process.exit(2);
  }
  const require = createRequire(import.meta.url);
  const { compilePathRecordForStorage } = require(path.join(ROOT, 'functions/lib/pathFirestoreShape.js'));
  const compile = (item) => {
    try { return compilePathRecordForStorage({ ...item, active: true }).document || item; } catch { return item; }
  };
  const violations = [];
  let compared = 0;
  for (const [dir, wanted] of BANK_DIRS) {
    for (const name of readdirSync(path.join(ROOT, dir)).filter(wanted).sort()) {
      const relative = `${dir}/${name}`;
      let baseText;
      try { baseText = git('show', `${base}:${relative}`); } catch { continue; } // new in this change
      const headText = readFileSync(path.join(ROOT, relative), 'utf8');
      if (baseText === headText) continue;
      compared += 1;
      violations.push(...familyVersionViolations({
        file: relative,
        baseDocuments: documentsIn(JSON.parse(baseText)),
        headDocuments: documentsIn(JSON.parse(headText)),
        compile,
      }));
    }
  }
  console.log(`family versions: ${compared} changed bank file(s) compared with ${base.slice(0, 12)}.`);
  if (!violations.length) {
    console.log('family versions: every field that asks for another kind of answer moved its familyVersion.');
    return;
  }
  console.error(`\nA FIELD RE-ASKED AS ANOTHER KIND OF ANSWER WITHOUT A VERSION MOVE (${violations.length}):`);
  for (const { file, id, version, field, before, after } of violations) {
    console.error(`  ${file} ${id} (version ${version}) field ${field}: ${before} → ${after}`);
  }
  console.error('\nMove the item\'s familyVersion: a recorded answer belongs to the question it was given for.');
  process.exit(1);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
