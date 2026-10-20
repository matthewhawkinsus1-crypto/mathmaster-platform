#!/usr/bin/env node

/**
 * SYSTEMS SHAPES AUDIT — authored items the Systems Workspace cannot finish.
 *
 *   node scripts/audit-systems-shapes.mjs              # report, exit 0
 *   node scripts/audit-systems-shapes.mjs --draws 48   # more draws per generated template
 *   node scripts/audit-systems-shapes.mjs --json       # machine-readable report
 *
 * Read-only. No network, no Firestore: it reads tracked JSON banks from disk
 * and runs them through the platform's own routing, parsers and geometry.
 * It reports; it never fails the build (see the "Not done" section of
 * docs/handoffs/STUDENT_PASS3_SYSTEMS_TOOLS.md for why these are known gaps).
 *
 * Two shapes:
 *
 *   (a) separated2x2 — a stand-alone 2×2 algebraic system whose two equations
 *       each hold ONE variable, a different one (x = 3 and y = -2; 2x = 6 and
 *       5y = 10). The 2×2 workspace (src/tools/systemsWorkspace/
 *       AlgebraicSystemMode.jsx) has nothing to do with it:
 *         - substitution: `chooseSelection` only lets the student isolate a
 *           variable the equation holds, and `attemptSubstitution` only
 *           accepts a drop on that same variable written in the OTHER
 *           equation — which, here, does not hold it;
 *         - elimination: `applyEquationMultiplier` refuses a zero factor, so
 *           a·m1 + 0·m2 can never cancel (`eliminatesVariable`).
 *       The 3×3 elimination workflow detects exactly this pair of rows as a
 *       reduced 2×2 (`eliminationSeparatedReduction` in
 *       functions/shared/toolMath/systemsWorkspace/eliminationReduction.mjs)
 *       and routes around it; a stand-alone 2×2 has no such route. The rule
 *       below is that function's rule: read each row's coefficients with
 *       `linearEquationForm`, and each row must have exactly one variable with
 *       a nonzero coefficient, a different one per row.
 *
 *   (b) cornerlessVertices — a student-build inequality region that asks for
 *       the "Mark the vertices" step (`askVertices`) although the region has
 *       no corners (parallel boundaries, a single half-plane, an empty
 *       region). `verticesStepDone` in StudentBuildInequalityMode.jsx needs at
 *       least one checked mark (`reports.length > 0`), so the step can never
 *       show done. Corners come from `feasibleRegionVertices` — the same call
 *       the screen and the shared grader
 *       (serverGrading/tools/systemsWorkspace/graphical.mjs) make — on the
 *       task's expected constraints (`studentBuildInequalityTask`).
 *
 * Banks scanned: every tracked JSON under the roots in BANK_ROOTS. Generated
 * Path templates (generator / variants) are instantiated with the platform's
 * own generator (`generatePathInstance`), every variant, --draws seeds each;
 * an item matches if any draw does.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  algebraicSystemDimension,
  linearEquationForm,
  normalizeAlgebraicSystemConfig,
} from '../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import {
  classifyFeasibleRegion,
  feasibleRegionVertices,
  studentBuildInequalityEnabled,
  studentBuildInequalityTask,
} from '../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { resolveSystemsWorkspaceMode } from '../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import {
  effectivePathVariants,
  generatePathInstance,
  hasPathGenerator,
  hasPathVariants,
} from '../functions/shared/pathQuestionGeneration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Everything that holds authored questions the platform ships or imports.
// tests/ fixtures are deliberately excluded: they are not content.
export const BANK_ROOTS = Object.freeze([
  'teacher-import-jsons',
  'seed/pathQuestionBank',
  'functions/seeds',
  'docs/assignments',
  'drafts',
  'SAMPLE_*.json',
]);

const EPS = 1e-9;

/* ------------------------------------------------------------- detectors */

/** Is this object a Systems Workspace question (authored, or V5 intent)? */
export const isSystemsWorkspaceQuestion = (node) => Boolean(
  node && typeof node === 'object' && !Array.isArray(node) && (
    [node.type, node.toolId, node.tool].includes('systemsWorkspace')
    || (Array.isArray(node.studentActions) && node.studentActions.includes('solveSystem'))
  ),
);

/**
 * (a) The stand-alone 2×2 with one different variable per row, or null.
 * Returns `{ variables, rows: [{ equation, variable }] }` on a match.
 */
export const separatedTwoByTwo = (question = {}) => {
  if (!isSystemsWorkspaceQuestion(question)) return null;
  if (resolveSystemsWorkspaceMode(question) !== 'algebraic') return null;
  if (algebraicSystemDimension(question) !== 2) return null;
  // normalizeAlgebraicSystemConfig substitutes a default system when the
  // authored one is missing; only the authored one is in question here.
  if (!Array.isArray(question.equations) || question.equations.length !== 2) return null;
  const { variables, equations } = normalizeAlgebraicSystemConfig(question);
  const rows = [];
  for (const equation of equations) {
    const form = linearEquationForm(equation, variables);
    if (!form) return null;
    const present = variables.filter((name) => Math.abs(form.coefficients[name] || 0) > EPS);
    if (present.length !== 1) return null;
    if (rows.some((row) => row.variable === present[0])) return null;
    rows.push({ equation, variable: present[0] });
  }
  return { variables, rows };
};

/**
 * (b) A student-build region that asks for vertices but has no corners, or
 * null. Returns `{ constraints, classification }` on a match.
 */
export const cornerlessVerticesRegion = (question = {}) => {
  if (!isSystemsWorkspaceQuestion(question)) return null;
  if (resolveSystemsWorkspaceMode(question) !== 'inequalities') return null;
  if (!studentBuildInequalityEnabled(question)) return null;
  let task;
  try {
    task = studentBuildInequalityTask(question);
  } catch {
    return null;
  }
  if (!task.askVertices) return null;
  const constraints = task.expectedConstraints;
  // An unreadable constraint has no corners for a bad reason; that is a
  // different defect, not this shape.
  if (!constraints.length || constraints.some((c) => ![c?.A, c?.B, c?.C].every((v) => Number.isFinite(Number(v))))) return null;
  if (feasibleRegionVertices(constraints).length > 0) return null;
  return { constraints, classification: classifyFeasibleRegion(constraints) };
};

export const SHAPES = Object.freeze({
  separated2x2: {
    label: '(a) stand-alone 2×2, each equation a different single variable',
    // The population the shape is drawn from, so a zero reads as "looked".
    examines: (question) => isSystemsWorkspaceQuestion(question)
      && resolveSystemsWorkspaceMode(question) === 'algebraic'
      && algebraicSystemDimension(question) === 2
      && Array.isArray(question.equations) && question.equations.length === 2,
    detect: separatedTwoByTwo,
    describe: (match) => match.rows.map((row) => row.equation).join(' ; '),
  },
  cornerlessVertices: {
    label: '(b) inequality region with a vertices step but no corners',
    examines: (question) => isSystemsWorkspaceQuestion(question)
      && resolveSystemsWorkspaceMode(question) === 'inequalities'
      && studentBuildInequalityEnabled(question)
      && studentBuildInequalityTask(question).askVertices,
    detect: cornerlessVerticesRegion,
    describe: (match) => `${match.classification}; ${match.constraints.map((c) => `${+Number(c.A).toFixed(4)}x + ${+Number(c.B).toFixed(4)}y + ${+Number(c.C).toFixed(4)} ${c.relation} 0`).join(' ; ')}`,
  },
});

/* ----------------------------------------------------------------- banks */

/** The question items of a parsed bank file, whatever its envelope. */
export const bankItems = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['documents', 'items', 'questions']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  if (Array.isArray(parsed.sections)) {
    return parsed.sections.flatMap((section) => section?.questions || section?.items || []);
  }
  return [];
};

const itemId = (node, fallback) => String(node?.id ?? node?.questionId ?? node?.familyId ?? fallback);

/** The concrete questions one authored item can become: itself, or its generated draws. */
export const itemInstances = (item, draws = 24) => {
  if (!item || typeof item !== 'object') return [];
  if (!hasPathGenerator(item) && !hasPathVariants(item)) return [item];
  const instances = [];
  for (const row of effectivePathVariants(item)) {
    if (!hasPathGenerator(row.template)) { instances.push(row.template); continue; }
    for (let draw = 0; draw < draws; draw += 1) {
      const { question } = generatePathInstance(row.template, `audit-systems-shapes-${draw}`);
      if (question) instances.push(question);
    }
  }
  return instances;
};

/** Every Systems Workspace question inside a node (a composed item may nest one). */
const systemsQuestionsIn = (node, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (isSystemsWorkspaceQuestion(node)) found.push(node);
  for (const value of Object.values(node)) systemsQuestionsIn(value, found);
  return found;
};

/** Run every shape over one parsed bank. */
export const scanBank = (parsed, file, { draws = 24 } = {}) => {
  const items = bankItems(parsed);
  // A file with no recognised envelope is still searched, as one item.
  const units = items.length ? items : [parsed];
  const matches = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, []]));
  const examined = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, new Set()]));
  units.forEach((item, index) => {
    const id = itemId(item, `${file}#${index}`);
    // Only an item that can open the Systems Workspace is worth generating.
    if (!/"(?:systemsWorkspace|solveSystem)"/.test(JSON.stringify(item))) return;
    const seen = new Set();
    for (const instance of itemInstances(item, draws)) {
      for (const question of systemsQuestionsIn(instance)) {
        for (const [key, shape] of Object.entries(SHAPES)) {
          const questionKey = `${key}|${itemId(question, id)}`;
          if (shape.examines(question)) examined[key].add(itemId(question, id));
          if (seen.has(questionKey)) continue;
          const match = shape.detect(question);
          if (!match) continue;
          seen.add(questionKey);
          matches[key].push({ id: itemId(question, id), itemId: id, file, detail: shape.describe(match) });
        }
      }
    }
  });
  return {
    file,
    itemCount: items.length,
    matches,
    examined: Object.fromEntries(Object.entries(examined).map(([key, ids]) => [key, ids.size])),
  };
};

export const bankFiles = (roots = BANK_ROOTS) => {
  const listed = execFileSync('git', ['ls-files', '--', ...roots], { cwd: ROOT, encoding: 'utf8' });
  return listed.split('\n').filter((file) => file.endsWith('.json')).sort();
};

export const runAudit = ({ draws = 24, roots = BANK_ROOTS } = {}) => {
  const banks = [];
  const unreadable = [];
  for (const file of bankFiles(roots)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
    } catch (error) {
      unreadable.push({ file, error: error.message });
      continue;
    }
    banks.push(scanBank(parsed, file, { draws }));
  }
  const totals = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, banks.flatMap((bank) => bank.matches[key])]));
  const examined = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, banks.reduce((sum, bank) => sum + bank.examined[key], 0)]));
  return { banks, unreadable, totals, examined };
};

/* ------------------------------------------------------------------ main */

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const draws = Math.max(1, Number(argOf('--draws', '24')) || 24);
  const report = runAudit({ draws });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      draws,
      banks: report.banks.map(({ file, itemCount, examined }) => ({ file, itemCount, examined })),
      unreadable: report.unreadable,
      shapes: Object.fromEntries(Object.entries(report.totals).map(([key, list]) => [key, { examined: report.examined[key], count: list.length, matches: list }])),
    }, null, 2));
  } else {
    const items = report.banks.reduce((sum, bank) => sum + bank.itemCount, 0);
    console.log('MathMaster Systems Shapes Audit (read-only)\n');
    console.log(`Banks scanned: ${report.banks.length} files, ${items} items (${draws} draws per generated template)`);
    if (report.unreadable.length) console.log(`Unreadable JSON skipped: ${report.unreadable.map((entry) => entry.file).join(', ')}`);
    for (const [key, shape] of Object.entries(SHAPES)) {
      const list = report.totals[key];
      console.log(`\n${shape.label}: ${list.length}  (of ${report.examined[key]} items of that kind examined)`);
      list.forEach((match) => console.log(`  - ${match.id}  ${match.file}\n      ${match.detail}`));
    }
  }
  process.exit(0);
}
