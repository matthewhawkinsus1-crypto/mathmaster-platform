/*
 * N54: THE DIGITAL SAT ITEM THAT PRINTS ITS OWN ANSWER IS RETIRED.
 *
 * mm_sat_A_3H_challenge_3_intersection-feasible-vertex_v21 reads "The boundary
 * lines ... intersect at (x, y). What is the value of x?": the point it asks
 * about is in the prompt, so the question asks a student to copy a number.
 * It is set `active: false` in every copy of the bank (the seed, its
 * functions/seeds mirror, the CCMR v2.1 source and the hand-kept SAT
 * aggregate), the way the bank retires a document: it stays in the bank, so
 * the pinned totals and every stored attempt's template are kept, and the
 * Path and the CCMR builder no longer deal it.
 *
 * What a student meets instead: A.3H's challenge tier keeps two families, the
 * least the Path's challenge step uses on its own (functions/index.js, "Fidelity
 * V2 progression"), so a challenge session draws from those two.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ccmrBank = require('../../functions/lib/ccmrAssignmentBank.js');

const ROOT = new URL('../../', import.meta.url);
const read = (relPath) => readFileSync(new URL(relPath, ROOT), 'utf8');
const documentsOf = (relPath) => {
  const parsed = JSON.parse(read(relPath));
  return Array.isArray(parsed) ? parsed : parsed.documents || parsed.items || [];
};

const RETIRED = 'mm_sat_A_3H_challenge_3_intersection-feasible-vertex_v21';
const FAMILY = 'mathmaster:sat:A.3H:ccmr-challenge-intersection-feasible-vertex';
const COPIES = [
  'seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json',
  'functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json',
  'drafts/ccmr-v2.1/digitalSAT/algebra/A.3H.v2.1.json',
  'drafts/digitalSAT.v2.1.json',
];

test('the item states the point it asks about: the reason it is retired', () => {
  const item = documentsOf(COPIES[0]).find((entry) => entry.id === RETIRED);
  assert.match(item.prompt, /intersect at \$\(\{\{x\}\},\{\{y\}\}\)\$\. What is the value of \$x\$\?/);
  const keyed = item.responseFields[0].expected;
  assert.equal(item.choices.find((choice) => choice.id === keyed).label, '${{x}}$', 'the key is the x the prompt printed');
});

test('it is inactive in every copy of the bank, and it is the only one retired', () => {
  for (const copy of COPIES) {
    const documents = documentsOf(copy);
    const item = documents.find((entry) => entry.id === RETIRED);
    assert.ok(item, `${copy} still holds it, so its pinned totals and stored attempts keep their template`);
    assert.equal(item.active, false, `${copy}: retired`);
    assert.deepEqual(documents.filter((entry) => entry.active === false).map((entry) => entry.id), [RETIRED], `${copy}: nothing else is retired`);
  }
});

test('the CCMR builder no longer offers it for A.3H, and still offers the rest of the standard', () => {
  const offered = ccmrBank.rankAuditedBankDocuments({ framework: 'digitalSAT', teksCodes: ['A.3H'] }).map((entry) => entry.id);
  assert.equal(offered.includes(RETIRED), false);
  assert.ok(offered.length >= 7, `the other A.3H items are still offered (${offered.length})`);
  // The challenge tier keeps two families: the Path's challenge step draws from
  // challenge families alone only when it has at least two.
  const challenge = documentsOf(COPIES[0]).filter((entry) => entry.active !== false
    && (entry.alignmentKeys || []).includes('texas:A.3H') && Number(entry.ccmrChallengeTier || 1) >= 2);
  assert.equal(new Set(challenge.map((entry) => entry.familyId)).size, 2);
});

test('no lesson, sample assignment or demo names it', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) files.push(full);
    }
  };
  ['teacher-import-jsons', 'docs', 'src'].forEach((dir) => walk(new URL(dir, ROOT).pathname));
  readdirSync(new URL('.', ROOT)).filter((name) => name.endsWith('.json')).forEach((name) => files.push(new URL(name, ROOT).pathname));
  assert.ok(files.length > 50, `${files.length} lesson files read`);
  const naming = files.filter((file) => {
    const text = readFileSync(file, 'utf8');
    return text.includes(RETIRED) || text.includes(FAMILY);
  });
  assert.deepEqual(naming, []);
});
