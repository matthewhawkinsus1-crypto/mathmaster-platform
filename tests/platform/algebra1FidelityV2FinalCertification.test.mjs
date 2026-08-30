import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'drafts/fidelity-v2/algebra1';
const payloads = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')));
const docs = payloads.flatMap((payload) => payload.documents || []);

const promptSurface = (doc) =>
  `${doc.prompt || ''} ${doc.stimulus ? JSON.stringify(doc.stimulus) : ''}`.toLowerCase();

const ERROR_CUES = [
  'student', 'mistake', 'error', 'incorrect', 'wrong', 'claim', 'says',
  'what went wrong', 'headline', 'flaw', 'correct',
];
const STRATEGIC_CUES = [
  'justify', 'explain why', 'compare', 'design', 'create', 'construct',
  'most defensible', 'best evidence', 'why', 'multiple conditions',
];
const hasAny = (text, cues) => cues.some((cue) => text.includes(cue));
const fieldCount = (doc) => (doc.responseFields || doc.answerFields || []).length;
const toolBacked = (doc) => Boolean(doc.type && doc.type !== 'response');
const GRAPH_TOOLS = new Set([
  'functionInvestigation', 'systemsWorkspace', 'graphing2',
  'dataModelingLab', 'intervalNumberLine',
]);

test('Algebra I final Fidelity V2 candidate is 49 complete standards and 245 families', () => {
  assert.equal(payloads.length, 49);
  assert.equal(docs.length, 245);
  assert.ok(payloads.every((payload) => payload.documents?.length === 5));
  assert.equal(new Set(docs.map((doc) => doc.id)).size, 245);
  assert.equal(new Set(docs.map((doc) => doc.familyId)).size, 245);
});

test('student-facing representation and error-analysis metadata are honest across all 245 families', () => {
  for (const doc of docs) {
    const prompt = promptSurface(doc);
    if (doc.taskType === 'errorAnalysis') {
      assert.equal(
        hasAny(prompt, ERROR_CUES),
        true,
        `${doc.id} is labelled errorAnalysis but presents no visible error, claim, flaw or correction`,
      );
    }
    if (doc.representation === 'table') {
      assert.ok(
        doc.stimulus?.table?.rows?.length >= 2 || doc.type === 'multiAnswer',
        `${doc.id} is labelled table without an actual table`,
      );
    }
    if (doc.representation === 'graph') {
      assert.ok(
        doc.stimulus?.graph || GRAPH_TOOLS.has(String(doc.type || '')),
        `${doc.id} is labelled graph without a graph stimulus or graph-capable tool`,
      );
    }
  }
});

test('DOK 3 is not being manufactured from a hard-looking one-response reverse calculation', () => {
  const contradictions = docs.filter((doc) => {
    if (doc.taskType !== 'reverseReasoning' || Number(doc.dok) < 3) return false;
    if (toolBacked(doc) || fieldCount(doc) > 1) return false;
    return !hasAny(promptSurface(doc), STRATEGIC_CUES);
  });
  assert.deepEqual(
    contradictions.map((doc) => doc.id),
    [],
    'difficulty may be high without claiming strategic DOK 3',
  );
});

test('DOK and difficulty remain separate constructs in the final candidate', () => {
  const hardDok2 = docs.filter((doc) => Number(doc.dok) === 2 && Number(doc.difficultyBand) >= 4);
  const dok3 = docs.filter((doc) => Number(doc.dok) === 3);
  assert.ok(hardDok2.length >= 7, 'the bank needs explicit hard-but-DOK-2 evidence');
  assert.ok(dok3.length >= 10, 'the bank should still contain genuine strategic DOK-3 evidence');

  const dok2Bands = new Set(docs.filter((doc) => Number(doc.dok) === 2).map((doc) => Number(doc.difficultyBand)));
  const band4Doks = new Set(docs.filter((doc) => Number(doc.difficultyBand) === 4).map((doc) => Number(doc.dok)));
  assert.ok(dok2Bands.size >= 2, 'DOK 2 must span more than one difficulty band');
  assert.ok(band4Doks.has(2) && band4Doks.has(3), 'difficulty band 4 must not imply one DOK level');
});
