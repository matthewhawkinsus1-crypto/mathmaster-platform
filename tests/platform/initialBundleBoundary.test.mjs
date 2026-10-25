// WHAT EVERY SIGN-IN DOWNLOADS.
//
// Everything src/main.jsx reaches through STATIC imports is in the first load
// — the sign-in screen and the dashboard pay for it before a student sees a
// question. Two static imports put MathLive (782 KB) and html2canvas plus the
// PDF renderers in front of every sign-in: the student Test Cycle card (its
// secure exam player and calculator import MathLive) and the teacher's PDF
// helpers. Moving them behind on-demand loads took the initial JS from 4.4 MB
// to 3.3 MB and the first screen on a 4x-throttled CPU from ~3.6 s to ~2.7 s.
//
// This walks the same graph a bundler does (static `import … from` and
// `export … from`, never `import()`), from main.jsx, and fails if either
// package comes back. To use MathLive or a PDF renderer from a screen that is
// always loaded, load it with `import()` or `lazy()` at the point of use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { region } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const resolveSpecifier = (from, specifier) => {
  if (!specifier.startsWith('.')) {
    const parts = specifier.split('/');
    return `pkg:${specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]}`;
  }
  const base = path.resolve(path.dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const staticImports = (file) => {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
};

const staticGraph = (entry) => {
  const parent = new Map([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (file.startsWith('pkg:') || !/\.(m?jsx?)$/.test(file)) continue;
    for (const specifier of staticImports(file)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !parent.has(resolved)) {
        parent.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return parent;
};

const chainTo = (graph, target) => {
  const chain = [];
  for (let node = target; node; node = graph.get(node)) chain.unshift(node.startsWith('pkg:') ? node : path.relative(repo, node));
  return chain.join(' -> ');
};

// The first load of a signed-in student: main.jsx's static graph (the shell
// and the sign-in screen), then App.jsx's, which src/app/shell/AppShell.jsx
// loads the moment an account is signed in (and prefetches while the sign-in
// screen is up). Everything either reaches is "the first load" here.
const signInGraph = staticGraph(path.join(repo, 'src/main.jsx'));
const graph = new Map(signInGraph);
for (const [file, parent] of staticGraph(path.join(repo, 'src/App.jsx'))) {
  if (!graph.has(file)) graph.set(file, parent ?? path.join(repo, 'src/app/shell/AppShell.jsx'));
}

test('the sign-in screen does not wait for the app: main.jsx reaches App.jsx only by a lazy import', () => {
  assert.ok(!signInGraph.has(path.join(repo, 'src/App.jsx')), `App.jsx is statically reachable from main.jsx: ${chainTo(signInGraph, path.join(repo, 'src/App.jsx'))}`);
  assert.ok(signInGraph.has(path.join(repo, 'src/app/shell/AppShell.jsx')) && signInGraph.has(path.join(repo, 'src/LoginScreen.jsx')));
  // Nothing of the grading, tools or assignment runtime before sign-in.
  for (const heavy of ['pkg:mathjs', 'pkg:mathlive', 'src/QuestionEngine.jsx', 'src/assignmentLifecycle.js', 'src/platform/policies/activityPolicies.js']) {
    const key = heavy.startsWith('pkg:') ? heavy : path.join(repo, heavy);
    assert.ok(!signInGraph.has(key), `${heavy} is on the sign-in path: ${signInGraph.has(key) ? chainTo(signInGraph, key) : ''}`);
  }
  const shell = readFileSync(path.join(repo, 'src/app/shell/AppShell.jsx'), 'utf8');
  assert.match(shell, /export const loadApp = \(\) => import\('\.\.\/\.\.\/App\.jsx'\);/);
  assert.match(shell, /const App = lazy\(loadApp\);/);
});

test('the first load reaches App and the student and teacher shells (the walker works)', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')));
  assert.ok(graph.has('pkg:react') && graph.has('pkg:firebase'));
  assert.ok(graph.size > 200, `only ${graph.size} modules reached — the walker has stopped following imports`);
});

for (const [pkg, why] of [
  ['pkg:mathlive', 'MathLive is 782 KB; it arrives with the question runtime, the calculator or a Test Cycle'],
  ['pkg:html2canvas', 'html2canvas belongs to the PDF renderers, loaded when a teacher makes a PDF (src/platform/resources/pdfLoaders.js)'],
]) {
  test(`${pkg.slice(4)} is not in the first load`, () => {
    assert.ok(!graph.has(pkg), `${why}. Static chain: ${graph.has(pkg) ? chainTo(graph, pkg) : ''}`);
  });
}

// mathjs is not in the first load. It reached it through two of App's static
// imports, the question generator (for a student's printed worksheet) and the
// teacher's grader repair (for the Grades tab), and through them the shared
// tool mathematics and the hardened instance (functions/shared/algebra/
// safeMath.mjs): 174 KB gzip in front of every student's Home. Both now load
// where they run; the question screen brings mathjs with QuestionEngine. (Where
// it does load, it is still built lazily: tests/platform/mathjsInstance.test.mjs.)
test('mathjs is not in the first load', () => {
  assert.ok(!graph.has('pkg:mathjs'), `mathjs is in the first load: ${graph.has('pkg:mathjs') ? chainTo(graph, 'pkg:mathjs') : ''}`);
  for (const file of ['src/problemGenerator.js', 'src/platform/assignment/liveQuestionCorrection.js', 'functions/shared/algebra/safeMath.mjs']) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
});

// What App kept of the generator: whether a question can come back as a
// different one (the "Request New Question" rule) is the shared rule itself,
// and the generator loads when a student prints a worksheet, before any
// question is resolved, with a failed load reported like a failed render.
test('App loads the question generator where a student prints, not with Home', () => {
  const app = readFileSync(path.join(repo, 'src/App.jsx'), 'utf8');
  // Whether a question can vary comes with the family engine (familyDelivery.js),
  // not from a static import: its rules resolve a family's definition.
  assert.doesNotMatch(app, /^import [^\n]*questionVariability\.mjs';$/m);
  assert.match(app, /const isPersonalizedBlueprint = \(question\) => Boolean\(familyDelivery\?\.canGenerateDistinctVariants\(question\)\);/);
  const exportPdf = region(app, 'const exportAssignmentWorksheetPdf = async', 'const resolvedQuestion = normalizeContextualQuestion(generateQuestion(', 'the student worksheet export');
  assert.match(exportPdf, /let generateQuestion;\s*let buildStudentFamilyContext;\s*try \{[^}]*\(\{ generateQuestion \} = await import\('\.\/problemGenerator'\)\);\s*\(\{ buildStudentFamilyContext \} = await loadFamilyDelivery\(\)\);\s*\} catch \(error\) \{[^}]*toastError\('Could not export PDF'[^}]*return;/);
});

// Every family's generator (the registry and its family modules) loads with
// the question runtime. App reads a slot's key and whether it is family-backed
// from questionFamilySlot.mjs, device pins from familyDeliveryPins.js, and the
// context builder lazily (loadFamilyDelivery); before, the registry was 64 KB
// gzip of every student's Home.
test('the Question Family registry and its families are not in the first load', () => {
  const families = readdirSync(path.join(repo, 'functions/shared')).filter((name) => /^questionFamilies[A-Z]\w*\.mjs$/.test(name));
  assert.ok(families.length >= 10, `${families.length} family modules`);
  for (const file of ['functions/shared/questionFamilyRegistry.mjs', 'functions/shared/questionFamilyInstance.mjs', 'functions/shared/questionFamilyGrading.mjs', 'src/platform/generation/familyDelivery.js', ...families.map((name) => `functions/shared/${name}`)]) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
  const app = readFileSync(path.join(repo, 'src/App.jsx'), 'utf8');
  assert.match(app, /import\('\.\/platform\/generation\/familyDelivery\.js'\)/, 'the context builder is loaded, not imported');
  // A question waits for it rather than render with its pin unchecked (and,
  // with no pin, for the server's pins: RT15, familyServerDeliveryPin.test.mjs).
  assert.match(app, /const familyEngineLoading = !familyDelivery;/);
  // The engine's own code loads under its own boundary, in the same words, so
  // a question that mounts after the workspace never blanks the app (the root
  // boundary is the full-screen "Loading your MathMaster workspace…").
  assert.match(app, /\{familyEngineLoading(?: \|\| familyPinPending)? \? <p role="status"[^>]*>Loading this question…<\/p> : <Suspense fallback=\{<p role="status"[^>]*>Loading this question…<\/p>\}><QuestionEngine/);
  assert.match(app, /\n\s*\/><\/Suspense>\}\n\s*\{\/\* SAVE HEALTH, IN THE STUDENT'S WORDS\./, 'the boundary closes right after the engine');
});

// The worksheet and answer-key builders run when someone asks for a PDF, so
// they load with it (src/platform/resources/pdfLoaders.js). App imported the
// worksheet model statically, so every tool whose answer key it can print —
// the Matrix Lab's whole model, 6 KB gzip — joined every student's first load.
test('the worksheet and answer-key builders are not in the first load', () => {
  for (const file of [
    'src/platform/resources/assignmentWorksheetPdfModel.js',
    'src/platform/resources/teacherAssignmentWorksheetExport.js',
    'functions/shared/toolMath/matrixLab/matrixLabModel.mjs',
  ]) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
});

// The student Test Cycle card names a skill with one small helper; reaching
// it through the secure exam results model put that model, the score
// predictor and the exam policies (about 8 KB gzip) on every first load.
test('the secure exam results model is not in the first load (only its skill names are)', () => {
  for (const file of [
    'src/platform/assessment/secureExamResultsModel.js',
    'src/platform/assessment/examScorePredictor.js',
  ]) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
  assert.ok(graph.has(path.join(repo, 'src/platform/assessment/studentSkillName.js')), 'the skill names the card uses are');
});

// A question's reference sheet (TL07) comes with the question runtime. Its
// registry holds the sheets' formulas as data, so it grows with each sheet
// registered: it must stay where QuestionEngine is, and the panel (a lazy chunk
// of its own) must never be a static import of anything a student loads first.
test('the reference sheet registry and its panel are not in the first load', () => {
  for (const file of ['src/platform/assessment/referenceSheets.js', 'src/components/assessment/AssignmentReferenceSheet.jsx']) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
});
