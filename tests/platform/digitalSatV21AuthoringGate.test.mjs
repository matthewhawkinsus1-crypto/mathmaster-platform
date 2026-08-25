import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const builder = path.join(repoRoot, 'scripts', 'build-digital-sat-v2-1.mjs');
const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';

function choices() {
  return [
    { id: 'correct', label: 'Correct response' },
    { id: 'd1', label: 'Distractor 1' },
    { id: 'd2', label: 'Distractor 2' },
    { id: 'd3', label: 'Distractor 3' },
  ];
}

function doc({ id, role = 'direct', taskType, representation, prompt, generator }) {
  const challenge = role === 'challenge';
  return {
    id,
    familyId: `fixture:${id}`,
    alignmentKeys: ['texas:A.1A'],
    alignments: [
      { framework: 'teks', code: 'A.1A', role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
    ],
    assessmentContext: { framework: 'digitalSAT', examStyle: true, domainId: 'algebra' },
    ccmrAuthenticLanguage: {
      version: '2.1',
      authored: true,
      ...(challenge ? { authoredChallenge: true } : {}),
    },
    ccmrFamilyRole: role,
    ccmrChallengeTier: challenge ? 2 : 1,
    taskType,
    representation,
    prompt,
    ...(generator ? { generator } : {}),
    assessmentItemFormat: 'multipleChoice',
    choices: choices(),
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'correct' }],
  };
}

function baseDocuments() {
  const sharedGenerator = { parameters: { n: { type: 'int', min: 2, max: 9 } } };
  return [
    doc({
      id: 'static_statement',
      taskType: 'classification',
      representation: 'verbal',
      prompt: 'Which statement correctly describes the slope of a horizontal line?',
    }),
    doc({
      id: 'templated_evaluation',
      taskType: 'evaluation',
      representation: 'equation',
      prompt: 'If $x={{n}}$, which value is equal to $x+1$?',
      generator: sharedGenerator,
    }),
    doc({
      id: 'shared_schema_distinct_task',
      taskType: 'modeling',
      representation: 'geometryContext',
      prompt: 'A square has side length {{n}} units. Which expression gives its perimeter?',
      generator: sharedGenerator,
    }),
    doc({
      id: 'linear_interpretation',
      taskType: 'interpretation',
      representation: 'context',
      prompt: 'A taxi fare increases by a constant amount for each mile. What does the constant rate represent?',
    }),
    doc({
      id: 'coordinate_reasoning',
      taskType: 'coordinateReasoning',
      representation: 'coordinatePlane',
      prompt: 'Which description identifies a point that lies on the y-axis?',
    }),
    doc({
      id: 'challenge_parameter',
      role: 'challenge',
      taskType: 'parameterReasoning',
      representation: 'equationSystem',
      prompt: 'For what condition on $k$ does a system of two linear equations have infinitely many solutions?',
    }),
    doc({
      id: 'challenge_structure',
      role: 'challenge',
      taskType: 'structuralReasoning',
      representation: 'table',
      prompt: 'A table shows a constant first difference. Which conclusion about the relationship is justified?',
    }),
    doc({
      id: 'challenge_context',
      role: 'challenge',
      taskType: 'multiStepModeling',
      representation: 'percentContext',
      prompt: 'A quantity increases by a fixed percent and then decreases by a different percent. Which expression represents the final quantity?',
    }),
  ];
}

function writeFixture(documents) {
  const root = mkdtempSync(path.join(tmpdir(), 'mm-sat-authoring-gate-'));
  const source = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT', 'algebra');
  mkdirSync(source, { recursive: true });
  const write = (name, value) => writeFileSync(path.join(source, name), `${JSON.stringify(value, null, 2)}\n`);

  write('ledger.v2.1.json', {
    schemaVersion: 1,
    framework: 'digitalSAT',
    releaseTarget: RELEASE_TARGET,
    domainId: 'algebra',
    standards: { 'A.1A': { status: 'authored' } },
  });
  write('completion.v2.1.json', {
    schemaVersion: 1,
    artifactType: 'completionManifest',
    framework: 'digitalSAT',
    releaseTarget: RELEASE_TARGET,
    domainId: 'algebra',
    completedStandards: ['A.1A'],
    completedNativeSkills: [],
  });
  write('bank.v2.1.json', {
    schemaVersion: 1,
    framework: 'digitalSAT',
    releaseTarget: RELEASE_TARGET,
    domainId: 'algebra',
    standard: 'A.1A',
    documents,
  });
  return root;
}

function runBuilder(documents) {
  const root = writeFixture(documents);
  return spawnSync(process.execPath, [builder, '--domain', 'algebra', '--check'], {
    cwd: repoRoot,
    env: { ...process.env, MATHMASTER_ROOT: root },
    encoding: 'utf8',
  });
}

test('static authored items may omit generators and shared parameter schemas are allowed for structurally distinct tasks', () => {
  const result = runBuilder(baseDocuments());
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('templated authored items still require a generator', () => {
  const documents = baseDocuments();
  delete documents[1].generator;
  const result = runBuilder(documents);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /templated item.*missing generator|missing generator/i);
});

test('true underlying-task clones remain blocked', () => {
  const documents = baseDocuments();
  documents[2].taskType = documents[1].taskType;
  documents[2].representation = documents[1].representation;
  const result = runBuilder(documents);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Exact underlying-task clone/i);
});
