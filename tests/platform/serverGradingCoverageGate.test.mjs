/*
 * THE GRADING COVERAGE GATE.
 *
 * Every grade-bearing MathMaster surface must make an explicit grading
 * decision in functions/shared/serverGrading/gradingManifest.mjs:
 *
 *   shared-server-authoritative     a shared grader the browser AND server run
 *   specialized-server-subsystem    a dedicated server state machine owns it
 *   client-graded-documented-blocker  still on the device, with the reason
 *   non-graded-read-only            produces no academic result
 *
 * This test derives the list of surfaces from the code that RENDERS and
 * VALIDATES them — the registry tool catalog, the Work View inventory, the
 * assignment validator's supported types, the question-type catalog and
 * QuestionEngine's own type switch — so adding a tool or a question type
 * without a grading decision turns this red. A new tool cannot silently
 * inherit client-authoritative grading.
 *
 * It also holds every shared grader to having a parity suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY } from '../../src/tools/workViewInventory.js';
import { SUPPORTED_QUESTION_TYPES } from '../../src/assignmentBlueprint.js';
import { CATALOGUED_TYPES } from '../../functions/shared/questionTypeCatalog.mjs';
import {
  GRADING_MANIFEST,
  REGISTRY_TOOL_IDS,
  STRUCTURED_TYPE_DECLARATIONS,
  gradingCoverageSummary,
} from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY, GRADING_AUTHORITY_VALUES } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const sorted = (values) => [...new Set(values)].sort();

/** Every `case '<type>':` in QuestionEngine's type switch. */
const questionEngineCases = () => {
  const source = executableSource(read('src/QuestionEngine.jsx'));
  const start = source.indexOf('switch (processedQuestion.type) {');
  assert.ok(start > 0, 'QuestionEngine type switch not found — update this gate to the new dispatch');
  const end = source.indexOf('default:', start);
  return [...source.slice(start, end).matchAll(/case '([A-Za-z0-9]+)':/g)].map((match) => match[1]);
};

test('every registry tool in TOOL_CATALOG has a grading declaration, and nothing else is declared as a registry tool', () => {
  assert.deepEqual(sorted(REGISTRY_TOOL_IDS), sorted(TOOL_CATALOG_IDS));
});

test('every Work View tool is declared, and the read-only review is declared non-graded rather than given a grader', () => {
  Object.entries(WORK_VIEW_INVENTORY).forEach(([toolId, entry]) => {
    assert.ok(GRADING_MANIFEST[toolId], `${toolId} has no grading declaration`);
    if (entry.status === 'exempt') {
      assert.equal(GRADING_MANIFEST[toolId].authority, GRADING_AUTHORITY.NON_GRADED, `${toolId} is a read-only Work View exemption`);
    }
  });
});

test('every question type the assignment validator accepts, the type catalog lists, or QuestionEngine renders is declared', () => {
  const cases = questionEngineCases();
  assert.ok(cases.length >= 15, `found only ${cases.length} QuestionEngine cases — the parser broke`);
  const required = sorted([...SUPPORTED_QUESTION_TYPES, ...CATALOGUED_TYPES, ...cases, 'composedWorkflow']);
  const missing = required.filter((surface) => !GRADING_MANIFEST[surface]);
  assert.deepEqual(missing, [], `surfaces with no grading decision: ${missing.join(', ')}`);
});

test('every declaration names exactly one authority, and every non-shared one documents why', () => {
  gradingCoverageSummary().forEach((entry) => {
    assert.ok(GRADING_AUTHORITY_VALUES.includes(entry.authority), `${entry.surfaceId}: unknown authority ${entry.authority}`);
    const reasons = entry.kind === 'tool'
      ? entry.modes.filter((mode) => mode.authority !== GRADING_AUTHORITY.SHARED_SERVER).map((mode) => [`${entry.surfaceId}.${mode.mode}`, mode.blocker])
      : entry.authority === GRADING_AUTHORITY.SHARED_SERVER ? [] : [[entry.surfaceId, entry.blocker]];
    reasons.forEach(([where, blocker]) => {
      assert.ok(String(blocker || '').trim().length >= 40, `${where} must document a specific reason (got "${blocker || ''}")`);
      assert.doesNotMatch(String(blocker), /PENDING|TODO|TBD/i, `${where} still carries a placeholder: ${blocker}`);
    });
  });
});

test('every structured surface has a grader whose modes match its declaration exactly (no drift)', () => {
  const structured = Object.entries(GRADING_MANIFEST).filter(([, declaration]) => declaration.kind === 'tool').map(([surfaceId]) => surfaceId);
  assert.deepEqual(sorted(Object.keys(TOOL_GRADERS)), sorted(structured));
  Object.entries(TOOL_GRADERS).forEach(([surfaceId, grader]) => {
    assert.deepEqual([...grader.problems], [], `${surfaceId}: ${grader.problems.join(' ')}`);
    assert.equal(grader.declaration, GRADING_MANIFEST[surfaceId], `${surfaceId}: grader bound to a different declaration`);
  });
  Object.keys(STRUCTURED_TYPE_DECLARATIONS).forEach((surfaceId) => assert.equal(GRADING_MANIFEST[surfaceId].kind, 'tool'));
});

test('every shared tool grader is exercised by a browser-vs-server parity suite', () => {
  const testFiles = ['tests/tools', 'tests/platform'].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir))
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => `${dir}/${file}`));
  const sources = testFiles.map((file) => ({ file, source: read(file) }));
  const graderModules = sorted(Object.values(TOOL_GRADERS)
    .filter((grader) => Object.values(grader.declaration.modes).some((mode) => mode.authority === GRADING_AUTHORITY.SHARED_SERVER))
    .map((grader) => grader.toolId));
  graderModules.forEach((toolId) => {
    const suite = sources.find(({ source }) => (
      new RegExp(`serverGrading/tools/${toolId}(\\.mjs|/)`).test(source)
      && /gradeServerResponse/.test(source)
    ));
    assert.ok(suite, `${toolId} has a shared grader but no test imports it AND checks it against gradeServerResponse`);
  });
});

test('the coverage document shows exactly what the manifest declares (regenerate with scripts/report-server-grading-coverage.mjs --write)', async () => {
  const { COVERAGE_DOC, renderCoverageDocument } = await import('../../scripts/report-server-grading-coverage.mjs');
  const current = fs.readFileSync(COVERAGE_DOC, 'utf8');
  assert.equal(current, renderCoverageDocument(current), 'docs/architecture/SERVER_GRADING_COVERAGE.md is stale: run node scripts/report-server-grading-coverage.mjs --write');
});

/** The directory of each registry tool's component, from the tool registry's own loaders. */
const toolComponentDirectories = () => {
  const registry = read('src/tools/toolRegistry.js');
  return Object.fromEntries([...registry.matchAll(/(\w+): \(\) => import\('\.\/([^']+)'\)/g)]
    .map(([, toolId, relative]) => [toolId, path.dirname(path.join('src/tools', relative))]));
};
const sourcesUnder = (relativeDir) => fs.readdirSync(path.join(ROOT, relativeDir), { recursive: true })
  .filter((file) => /\.(jsx?|mjs)$/.test(String(file)))
  .map((file) => read(path.join(relativeDir, String(file))));

test('every server-graded registry tool marks Check with its shared grader and reports its live work', () => {
  const directories = toolComponentDirectories();
  assert.deepEqual(sorted(Object.keys(directories)), sorted(REGISTRY_TOOL_IDS), 'the loader parser broke');
  const problems = [];
  REGISTRY_TOOL_IDS.forEach((toolId) => {
    const shared = Object.values(GRADING_MANIFEST[toolId].modes).some((mode) => mode.authority === GRADING_AUTHORITY.SHARED_SERVER);
    if (!shared) return;
    const code = sourcesUnder(directories[toolId]).map((source) => executableSource(source)).join('\n');
    // The browser's verdict comes from the same grader the server runs...
    if (!new RegExp(`serverGrading/tools/${toolId}(\\.mjs|/)`).test(code)) problems.push(`${toolId}: no component imports its shared grader`);
    // ...and a deadline can finalize what the student has not submitted yet.
    if (!/useReportToolWork\(/.test(code)) problems.push(`${toolId}: never reports live work (useReportToolWork)`);
  });
  assert.deepEqual(problems, []);
});
