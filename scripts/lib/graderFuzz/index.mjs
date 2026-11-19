/*
 * THE GRADER FUZZ AND PARITY HARNESS.
 *
 * Seeded cases through every grader, held to properties the platform
 * promises students and teachers: a typed value never throws, the screen's
 * verdict is the gradebook's, an unfinished answer is not a right one, a
 * saved draft reads back as it was saved. See docs/architecture/GRADER_FUZZ.md.
 *
 *   runGraderFuzz({ seed, count, targets, ... }) -> { cases, summary, perTarget }
 *
 * A target is a module with:
 *
 *   id                      its name
 *   cases({ rng, count })   a generator of plain-JSON cases, drawn from `rng`
 *                           alone, so a seed names its cases
 *   check(case, options)    the findings that case meets (findings.mjs)
 *
 * A case is self-contained JSON (its question and the value typed), so a
 * finding's repro runs again with replayCase, on any checkout, with no seed
 * and no corpus.
 */
import { readKnownFindings, summarizeFindings } from './findings.mjs';
import { createRng } from './prng.mjs';

const TARGET_LOADERS = Object.freeze({
  typedFields: () => import('./targets/typedFields.mjs'),
  structuredWork: () => import('./targets/structuredWork.mjs'),
  questionResponses: () => import('./targets/questionResponses.mjs'),
  drafts: () => import('./targets/drafts.mjs'),
  readers: () => import('./targets/readers.mjs'),
});

export const TARGET_IDS = Object.freeze(Object.keys(TARGET_LOADERS));

export const loadTarget = async (targetId) => {
  if (!TARGET_LOADERS[targetId]) throw new Error(`Unknown fuzz target "${targetId}". Targets: ${TARGET_IDS.join(', ')}.`);
  return TARGET_LOADERS[targetId]();
};

/** Run one case again, from a finding's repro. */
export const replayCase = async (fuzzCase, options = {}) => {
  const target = await loadTarget(fuzzCase?.target);
  return target.check(fuzzCase, options);
};

/**
 * Run `count` seeded cases of each target (or until `budgetMs` is spent on a
 * target; a run cut short says so in `perTarget[].cutShort`).
 */
export const runGraderFuzz = async ({
  seed = 'pr',
  count = 200,
  counts = {},
  targets = TARGET_IDS,
  budgetMs = Infinity,
  known = readKnownFindings(),
  checkOptions = {},
  caseOptions = {},
} = {}) => {
  const findings = [];
  const perTarget = [];
  let total = 0;
  for (const targetId of targets) {
    const target = await loadTarget(targetId);
    const rng = createRng(`${seed}/${targetId}`);
    const started = performance.now();
    let ran = 0;
    let cutShort = false;
    for (const fuzzCase of target.cases({ rng, count: counts[targetId] ?? count, ...caseOptions })) {
      if (performance.now() - started > budgetMs) { cutShort = true; break; }
      let found;
      try {
        found = await target.check(fuzzCase, checkOptions);
      } catch (error) {
        // A target that throws is a bug in the harness, not a finding to file.
        throw new Error(`Fuzz target ${targetId} threw outside a grader on case ${JSON.stringify(fuzzCase).slice(0, 600)}: ${error?.stack || error}`);
      }
      findings.push(...found);
      ran += 1;
    }
    total += ran;
    perTarget.push({ target: targetId, cases: ran, ms: Math.round(performance.now() - started), cutShort });
  }
  return { seed: String(seed), cases: total, perTarget, findings, summary: summarizeFindings(findings, known) };
};
