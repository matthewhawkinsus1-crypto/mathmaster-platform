import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const builder = path.join(repoRoot, 'scripts', 'build-tsia2-v2-1.mjs');
const releaseTarget = 'ccmr-fidelity-v2.1-authentic-language';

const QR_SCOPE = {
  rationalIrrationalMagnitude: 'crcAndDiagnostic',
  ratioProportionPercent: 'crcAndDiagnostic',
  proportionalContext: 'crcAndDiagnostic',
  linearExpressionsEquationsInterpretation: 'crcAndDiagnostic',
  basicNumberOperations: 'diagnosticOnly',
  roundingPlaceValue: 'diagnosticOnly',
  numberFormsComparison: 'diagnosticOnly',
};

const promptStems = [
  'Which value is equivalent to',
  'What is the result of evaluating',
  'A quantity is represented by',
  'Which number matches the value of',
  'Find the value produced by',
  'A calculation begins with',
  'Determine the outcome associated with',
  'Which choice gives the value of',
];

function makeDocument(index, nativeSkillId = 'ratioProportionPercent') {
  const role = index < 5 ? 'direct' : 'challenge';
  const token = `n${index}`;
  const answer = `ans${index}`;
  const d1 = `d1_${index}`;
  const d2 = `d2_${index}`;
  const d3 = `d3_${index}`;
  return {
    id: `mm_tsia2_qr_rpp_${index + 1}_v21`,
    active: true,
    alignmentKeys: [],
    alignments: [{ framework: 'tsia2', domainId: 'quantitativeReasoning', role: 'primary', evidenceMode: 'direct' }],
    assessmentContext: {
      framework: 'tsia2',
      examStyle: true,
      domainId: 'quantitativeReasoning',
      nativeSkillId,
      tsia2TestScope: 'crcAndDiagnostic',
    },
    familyId: `mathmaster:tsia2:native:${nativeSkillId}:fixture-${index + 1}`,
    familyVersion: 1,
    questionType: 'response',
    activityRole: 'practice',
    difficultyBand: index < 5 ? 2 : 4,
    dok: index < 5 ? 2 : 3,
    examCalculatorMode: 'none',
    assessedConstruct: `TSIA2-native:${nativeSkillId}`,
    taskType: `fixtureTask${index + 1}`,
    representation: index % 2 ? 'context' : 'symbolic',
    ccmrChallengeTier: role === 'direct' ? 1 : 2,
    ccmrFamilyRole: role,
    ccmrAuthenticLanguage: {
      version: '2.1',
      authored: true,
      nativeSkillId,
      stemProfile: `fixture-${index + 1}`,
      answerChoiceCount: 4,
      ...(role === 'challenge' ? { authoredChallenge: true } : {}),
    },
    prompt: `${promptStems[index]} {{${token}}}?`,
    generator: {
      parameters: { [token]: { type: 'int', min: 2, max: 9 } },
      derived: {
        [answer]: `${token}+${index + 2}`,
        [d1]: `${token}+${index + 3}`,
        [d2]: `${token}+${index + 4}`,
        [d3]: `${token}+${index + 5}`,
      },
      constraints: [`${answer}!=${d1}`, `${answer}!=${d2}`, `${answer}!=${d3}`],
    },
    assessmentItemFormat: 'multipleChoice',
    choices: [
      { id: 'tsia2-correct', label: `{{${answer}}}` },
      { id: 'tsia2-d1', label: `{{${d1}}}` },
      { id: 'tsia2-d2', label: `{{${d2}}}` },
      { id: 'tsia2-d3', label: `{{${d3}}}` },
    ],
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: 'tsia2-correct' }],
  };
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'mathmaster-tsia2-builder-'));
  const domainRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning');
  mkdirSync(domainRoot, { recursive: true });
  mkdirSync(path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT'), { recursive: true });
  mkdirSync(path.join(root, 'drafts', 'ccmr-v2.1', 'act'), { recursive: true });

  writeJson(path.join(domainRoot, 'TSIA2_QUANTITATIVE_REASONING_MAPPING.v2.1.json'), {
    schemaVersion: 2,
    artifactType: 'mappingLedger',
    releaseTarget,
    framework: 'tsia2',
    domainId: 'quantitativeReasoning',
    nativeSkills: Object.fromEntries(Object.entries(QR_SCOPE).map(([id, tsia2TestScope]) => [id, {
      status: id === 'ratioProportionPercent' ? 'authored' : 'author',
      tsia2TestScope,
      officialSkillArea: id,
    }])),
  });
  writeJson(path.join(domainRoot, 'TSIA2_QUANTITATIVE_REASONING_COMPLETION.v2.1.json'), {
    schemaVersion: 2,
    artifactType: 'completionManifest',
    releaseTarget,
    framework: 'tsia2',
    domainId: 'quantitativeReasoning',
    completedNativeSkills: ['ratioProportionPercent'],
  });
  const bankFile = path.join(domainRoot, 'TSIA2_NATIVE_ratioProportionPercent.v2.1.json');
  writeJson(bankFile, {
    schemaVersion: 2,
    releaseTarget,
    framework: 'tsia2',
    domainId: 'quantitativeReasoning',
    nativeSkillId: 'ratioProportionPercent',
    tsia2TestScope: 'crcAndDiagnostic',
    status: 'authored-pass-1',
    documents: Array.from({ length: 8 }, (_, index) => makeDocument(index)),
  });
  return { root, bankFile };
}

function runBuilder(root, args = ['--domain', 'quantitativeReasoning', '--check']) {
  return spawnSync(process.execPath, [builder, ...args], {
    cwd: repoRoot,
    env: { ...process.env, MATHMASTER_ROOT: root },
    encoding: 'utf8',
  });
}

function mutateBank(bankFile, mutate) {
  const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
  mutate(bank);
  writeJson(bankFile, bank);
}

function withFixture(fn) {
  const fixture = createFixture();
  try { return fn(fixture); }
  finally { rmSync(fixture.root, { recursive: true, force: true }); }
}

test('TSIA2 domain builder accepts a valid partially-authored official strand', () => withFixture(({ root }) => {
  const result = runBuilder(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.framework, 'tsia2');
  assert.equal(summary.domain, 'quantitativeReasoning');
  assert.equal(summary.scopeUnits, 1);
  assert.equal(summary.documents, 8);
  assert.equal(summary.direct, 5);
  assert.equal(summary.challenge, 3);
}));

test('TSIA2 builder rejects fabricated Texas alignment on a native bank', () => withFixture(({ root, bankFile }) => {
  mutateBank(bankFile, (bank) => { bank.documents[0].alignmentKeys = ['texas:A.2A']; });
  const result = runBuilder(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must not carry a texas: alignment/i);
}));

test('TSIA2 builder rejects scientific calculator mode', () => withFixture(({ root, bankFile }) => {
  mutateBank(bankFile, (bank) => { bank.documents[0].examCalculatorMode = 'scientific'; });
  const result = runBuilder(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /invalid TSIA2 calculator mode/i);
}));

test('TSIA2 builder rejects CRC/Diagnostic scope mismatch', () => withFixture(({ root, bankFile }) => {
  mutateBank(bankFile, (bank) => { bank.documents[0].assessmentContext.tsia2TestScope = 'diagnosticOnly'; });
  const result = runBuilder(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /tsia2TestScope mismatch/i);
}));

test('TSIA2 builder rejects generator placeholders that cannot resolve', () => withFixture(({ root, bankFile }) => {
  mutateBank(bankFile, (bank) => { bank.documents[0].prompt += ' {{missingValue}}'; });
  const result = runBuilder(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /unresolved generator placeholder.*missingValue/i);
}));

test('full TSIA2 release remains fail-closed while official scope is incomplete', () => withFixture(({ root }) => {
  const result = runBuilder(root, ['--release', '--check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /(missing TSIA2 V2\.1 mapping ledger|full TSIA2 release blocked)/i);
}));
