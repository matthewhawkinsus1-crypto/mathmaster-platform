#!/usr/bin/env node

/**
 * SYSTEMS SHAPES AUDIT — authored items the Systems Workspace cannot finish.
 *
 *   node scripts/audit-systems-shapes.mjs              # report, exit 0
 *   node scripts/audit-systems-shapes.mjs --draws 48   # more draws per generated template
 *   node scripts/audit-systems-shapes.mjs --json       # machine-readable report
 *   node scripts/audit-systems-shapes.mjs --project <id>   # the teachers' own assignments in Firestore
 *
 * Read-only. By default no network, no Firestore: it reads tracked JSON banks
 * from disk and runs them through the platform's own routing, parsers and
 * geometry.
 *
 * `--project <id>` (CI17, B-51) counts what the banks cannot see: the items
 * teachers authored straight into Firestore. It reads the `assignments`
 * collection, paged, with a field mask (title, sections, questions: no
 * per-student field is ever read), through firebase-admin from functions/ and
 * Application Default Credentials (a Firestore viewer role is enough); it
 * writes nothing, anywhere. Run `npm --prefix functions ci` first. A match
 * whose item id also ships in a tracked bank is marked, so the count that is
 * new is the one without the mark. Under FIRESTORE_EMULATOR_HOST it reads the
 * emulator.
 *
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
import { createRequire } from 'node:module';
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

export const itemId = (node, fallback) => String(node?.id ?? node?.questionId ?? node?.familyId ?? fallback);

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

const summarize = (banks, unreadable) => {
  const totals = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, banks.flatMap((bank) => bank.matches[key])]));
  const examined = Object.fromEntries(Object.keys(SHAPES).map((key) => [key, banks.reduce((sum, bank) => sum + bank.examined[key], 0)]));
  return { banks, unreadable, totals, examined };
};

/** Every tracked bank file, parsed once: the ones read and the ones that would not parse. */
const readBanks = (roots) => {
  const read = [];
  const unreadable = [];
  for (const file of bankFiles(roots)) {
    try {
      read.push({ file, parsed: JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')) });
    } catch (error) {
      unreadable.push({ file, error: error.message });
    }
  }
  return { read, unreadable };
};

export const runAudit = ({ draws = 24, roots = BANK_ROOTS } = {}) => {
  const { read, unreadable } = readBanks(roots);
  return summarize(read.map(({ file, parsed }) => scanBank(parsed, file, { draws })), unreadable);
};

/*
 * THE TEACHERS' OWN ASSIGNMENTS, IN FIRESTORE (CI17, B-51).
 *
 * The banks above are what the repository tracks. An assignment a teacher
 * imports lives in Firestore, and one authored there never was in a bank, so
 * the bank count does not see it. Only the fields below are read (a field mask
 * on every page): the per-student fields an assignment can still carry are
 * never in this process. `db` is a Firestore (Admin SDK); only collection /
 * orderBy / select / limit / startAfter / get are used.
 */
export const ASSIGNMENT_FIELDS = Object.freeze(['title', 'sections', 'questions']);

/** The ids of every item the tracked banks ship, to tell the Firestore-only ones apart. */
export const shippedItemIds = (roots = BANK_ROOTS) => {
  const ids = new Set();
  readBanks(roots).read.forEach(({ file, parsed }) => {
    bankItems(parsed).forEach((item, index) => ids.add(itemId(item, `${file}#${index}`)));
  });
  return ids;
};

export const runFirestoreAudit = async ({ db, draws = 24, pageSize = 100, documentIdField = '__name__', shipped = shippedItemIds() } = {}) => {
  const banks = [];
  let last = null;
  for (;;) {
    let page = db.collection('assignments').orderBy(documentIdField).select(...ASSIGNMENT_FIELDS).limit(pageSize);
    if (last) page = page.startAfter(last);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await page.get();
    snapshot.docs.forEach((doc) => banks.push(scanBank(doc.data(), `assignments/${doc.id}`, { draws })));
    if (snapshot.docs.length < pageSize) break;
    last = snapshot.docs[snapshot.docs.length - 1];
  }
  const report = summarize(banks, []);
  // A match is new unless the same item id ships in a tracked bank (an imported lesson).
  Object.values(report.totals).forEach((list) => list.forEach((match) => {
    match.alsoInBank = shipped.has(match.id) || shipped.has(match.itemId);
  }));
  return report;
};

/* ------------------------------------------------------------------ main */

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

/** The report for `--project`: the assignments in Firestore, read through the Admin SDK. */
const firestoreReport = async ({ project, draws }) => {
  // firebase-admin lives in functions/ (CommonJS).
  const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
  let admin;
  try {
    admin = functionsRequire('firebase-admin');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('audit-systems-shapes: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exit(2);
    }
    throw error;
  }
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin SDK reads the emulator.
  const app = admin.initializeApp({ projectId: project }, 'audit-systems-shapes');
  try {
    return await runFirestoreAudit({ db: app.firestore(), draws, documentIdField: admin.firestore.FieldPath.documentId() });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const draws = Math.max(1, Number(argOf('--draws', '24')) || 24);
  const project = process.argv.includes('--project') ? String(argOf('--project', '') || '').trim() : null;
  if (project === '' || (project && project.startsWith('--'))) {
    console.error('audit-systems-shapes: --project needs a Firebase project id, e.g. --project mathmaster-aleks');
    process.exit(2);
  }
  const report = project ? await firestoreReport({ project, draws }) : runAudit({ draws });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      draws,
      ...(project ? { project, source: 'firestore assignments' } : {}),
      banks: report.banks.map(({ file, itemCount, examined }) => ({ file, itemCount, examined })),
      unreadable: report.unreadable,
      shapes: Object.fromEntries(Object.entries(report.totals).map(([key, list]) => [key, { examined: report.examined[key], count: list.length, matches: list }])),
    }, null, 2));
  } else {
    const items = report.banks.reduce((sum, bank) => sum + bank.itemCount, 0);
    console.log('MathMaster Systems Shapes Audit (read-only)\n');
    if (project) {
      console.log(`Firestore project ${project}${process.env.FIRESTORE_EMULATOR_HOST ? ` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})` : ''}: ${report.banks.length} assignments, ${items} items (${draws} draws per generated template)`);
    } else {
      console.log(`Banks scanned: ${report.banks.length} files, ${items} items (${draws} draws per generated template)`);
    }
    if (report.unreadable.length) console.log(`Unreadable JSON skipped: ${report.unreadable.map((entry) => entry.file).join(', ')}`);
    for (const [key, shape] of Object.entries(SHAPES)) {
      const list = report.totals[key];
      const alsoInBank = list.filter((match) => match.alsoInBank).length;
      console.log(`\n${shape.label}: ${list.length}${project ? ` (${list.length - alsoInBank} not in any tracked bank, ${alsoInBank} also shipped in one)` : ''}  (of ${report.examined[key]} items of that kind examined)`);
      list.forEach((match) => console.log(`  - ${match.id}  ${match.file}${match.alsoInBank ? '  [also in a tracked bank]' : ''}\n      ${match.detail}`));
    }
  }
  process.exit(0);
}
