// Every Step Algebra draft the tests hold, reopened, as plain JSON, for a test
// that reopens them twice (issue #559): once as the platform runs, and once
// with mathjs's own simplify (mathjsOwnSimplify.mjs), which makes every match
// of a rule where the platform's looks for the first.
//
//   node algebraDraftRestores.mjs [--mathjs-own-simplify]
//
// prints one JSON line: { mathjsOwnSimplify, sources: { name: count }, restores: [{ name, restored }] }.
// The drafts are every one in the draft fixtures (each saved record with an
// algebraDraftVersion), the grader fuzz harness's own algebra drafts (a fixed
// seed), and drafts with a move in progress on long sides and long operands
// of the shapes issue #559 measured.
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_EQUATION = Object.freeze({ left: '2x + 3', right: '7' });

// Every object in a fixture that is a saved algebra draft.
const draftsIn = (value, where, found = []) => {
  if (!value || typeof value !== 'object') return found;
  if (!Array.isArray(value) && 'algebraDraftVersion' in value) found.push({ name: where, draft: value });
  for (const [key, child] of Object.entries(value)) draftsIn(child, `${where}/${key}`, found);
  return found;
};

const JSON_FIXTURES = ['moduleDraftValidRecords.json', 'moduleDraftDamageCases.json', 'classworkQ2RuntimeCapture.json'];

// The shapes of a long side or operand: issue #559's like terms with varied
// coefficients, the harness's mixed letters, a division chain, and the ones
// the earlier fix measured.
export const LONG_TERMS = Object.freeze({
  likeTerms: (index) => `${index ? ' + ' : ''}${index + 2}x`,
  mixedLetters: (index) => `${index ? ' + ' : ''}${index + 2}${'xyz'[index % 3]}`,
  divisions: (index) => (index ? ` / ${index + 1}` : 'x'),
  ones: (index) => (index ? ' + 1' : '2x'),
  signs: (index) => (index ? (index % 2 ? ' - 2x' : ' + 3') : '5x'),
});
export const longExpression = (shape, terms) => Array.from({ length: terms }, (_, index) => LONG_TERMS[shape](index)).join('');
const MOVES = [['subtract', '3'], ['add', 'x'], ['multiply', '2'], ['divide', '2']];

export const longDrafts = (termCounts) => Object.keys(LONG_TERMS).flatMap((shape) => termCounts.flatMap((terms) => MOVES.flatMap(([operation, operand]) => [
  { name: `side ${shape} × ${terms}: ${operation} ${operand}`, equation: { left: longExpression(shape, terms), right: '7' }, operation, operand },
  { name: `operand ${shape} × ${terms}: ${operation}`, equation: { ...DEFAULT_EQUATION }, operation, operand: longExpression(shape, terms) },
]))).map(({ name, equation, operation, operand }) => ({
  name,
  draft: { algebraDraftVersion: 2, equation, pendingMove: { operation, operandExpression: operand }, workSteps: [] },
}));

export const collectDrafts = async ({ fuzzCount = 400, longTermCounts = [6, 10] } = {}) => {
  const sources = {};
  const all = [];
  const add = (source, drafts) => {
    sources[source] = drafts.length;
    all.push(...drafts.map((entry) => ({ ...entry, name: `${source}${entry.name.startsWith('/') ? '' : ': '}${entry.name}` })));
  };
  for (const file of JSON_FIXTURES) {
    add(file, draftsIn(JSON.parse(readFileSync(path.join(ROOT, 'tests/platform/fixtures', file), 'utf8')), ''));
  }
  const scenes = await import(path.join(ROOT, 'tests/platform/fixtures/toolDraftScenes.mjs'));
  add('toolDraftScenes.mjs', draftsIn(scenes, ''));

  const { createRng } = await import(path.join(ROOT, 'scripts/lib/graderFuzz/prng.mjs'));
  const { cases } = await import(path.join(ROOT, 'scripts/lib/graderFuzz/targets/drafts.mjs'));
  const fuzz = [];
  let index = 0;
  for (const fuzzCase of cases({ rng: createRng(559), count: fuzzCount })) {
    if (fuzzCase.kind === 'algebra') fuzz.push({ name: `${index}`, draft: fuzzCase.draft, initialEquation: fuzzCase.initialEquation });
    index += 1;
  }
  add('grader fuzz drafts (seed 559)', fuzz);
  add('long', longDrafts(longTermCounts));
  return { sources, drafts: all };
};

const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

export const restoreAll = async (drafts) => {
  const { rehydrateAlgebraDraft } = await import(path.join(ROOT, 'src/algebraDraftState.js'));
  return drafts.map(({ name, draft, initialEquation = DEFAULT_EQUATION }) => {
    try {
      // Each restore reads its own copy: a restore must not depend on another's.
      return { name, restored: plain(rehydrateAlgebraDraft({ draft: plain(draft), initialEquation: { ...initialEquation } })) };
    } catch (error) {
      return { name, threw: `${error?.name}: ${error?.message}` };
    }
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mathjsOwnSimplify = process.argv.includes('--mathjs-own-simplify');
  if (mathjsOwnSimplify) register('./mathjsOwnSimplify.mjs', import.meta.url);
  const { sources, drafts } = await collectDrafts();
  const restores = await restoreAll(drafts);
  process.stdout.write(`${JSON.stringify({ mathjsOwnSimplify, sources, restores })}\n`);
}
