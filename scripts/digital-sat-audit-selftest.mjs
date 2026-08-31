#!/usr/bin/env node
// End-to-end self-test for the Digital SAT certification sweep.
//
// Five bugs were found in this sweep's own tooling while the sweep was running,
// and three of the fixes narrow what it reports. Unit tests cover the
// predicates (tests/platform/digitalSatAuditRules.test.mjs); this covers the
// whole pipeline, by appending deliberately defective families to the real bank
// and asserting the audit finds each one - and that the two controls, which the
// exemptions exist for, stay clean.
//
// It writes a temporary bank next to the repo root and runs the real audit
// against it, so it exercises the shipped code path rather than a copy.
//
//   node scripts/digital-sat-audit-selftest.mjs [--source drafts/digitalSAT.v2.1.json]
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const SOURCE = sourceIndex === -1 ? 'drafts/digitalSAT.v2.1.json' : args[sourceIndex + 1];

const shell = (id, code, role, band, dok) => ({
  id, active: true, alignmentKeys: [`texas:${code}`],
  assessmentContext: { framework: 'digitalSAT', examStyle: true, domainId: 'algebra' },
  familyId: `mathmaster:sat:${code}:${id}`, difficultyBand: band, dok,
  calculatorPolicy: 'graphing', assessedConstruct: code, ccmrFamilyRole: role,
  assessmentItemFormat: 'multipleChoice', taskType: 'selftest', representation: 'symbolic',
  prompt: '', generator: {}, choices: [],
  responseFields: [{ id: 'answer', label: 'Choose', inputProfile: 'choice', expected: 'choice-a' }],
});

const options = (...names) => names.map((name, index) => ({ id: `choice-${'abcd'[index]}`, label: `{{${name}}}` }));

// Each entry: the family, and the finding codes the audit must report for it.
// `expect: []` means the audit must stay silent - those are the exemptions.
const CASES = [
  {
    why: 'an arithmetic ladder that does not start at zero',
    expect: ['arithmeticLadderChoices'],
    docs: [{
      ...shell('selftest_ladder', 'ZZ.1', 'direct', 3, 2),
      prompt: 'What is ${{a}}+{{b}}$?',
      generator: {
        parameters: { a: { type: 'int', min: 20, max: 60 }, b: { type: 'int', min: 20, max: 60 } },
        derived: { ans: 'a+b', d1: 'a+b-1', d2: 'a+b+1', d3: 'a+b+2' },
      },
      choices: options('ans', 'd1', 'd2', 'd3'),
    }],
  },
  {
    why: 'a count item offering 0, 1, 2, 3 - the exemption the ladder rule needs',
    expect: [],
    docs: [{
      ...shell('selftest_count', 'ZZ.2', 'direct', 3, 2),
      prompt: 'How many distinct real solutions does the system have?',
      generator: {
        parameters: { kind: { type: 'int', min: 0, max: 2 } },
        derived: {
          count: 'kind', altOne: '(kind==0)*1',
          altTwo: '(kind<2)*2+(kind==2)*1', altThree: '3',
        },
      },
      choices: options('count', 'altOne', 'altTwo', 'altThree'),
    }],
  },
  {
    why: 'a challenge family reusing a direct family\'s real generator',
    expect: ['generatorClone', 'crossTierTaskClone'],
    docs: ['direct', 'challenge'].map((role) => ({
      ...shell(`selftest_gen_${role}`, 'ZZ.3', role, role === 'direct' ? 3 : 4, role === 'direct' ? 2 : 3),
      prompt: 'The expression $({{p}}x+{{q}})+({{p}}x+{{q}})$ is equivalent to $kx+m$. What is the value of $k$?',
      generator: {
        parameters: { p: { type: 'int', min: 2, max: 9 }, q: { type: 'int', min: 2, max: 9 } },
        derived: { ans: 'p+q', d1: 'p-q', d2: 'p', d3: 'q' },
      },
      choices: options('ans', 'd1', 'd2', 'd3'),
    })),
  },
  {
    why: 'two static families sharing the variant shuffle seed - the exemption the clone rules need',
    expect: [],
    docs: ['direct', 'challenge'].map((role) => ({
      ...shell(`selftest_var_${role}`, 'ZZ.4', role, role === 'direct' ? 3 : 4, role === 'direct' ? 2 : 3),
      prompt: role === 'direct'
        ? 'Which statement about the slope of a horizontal line is true?'
        : 'Which statement about the concavity of a parabola opening downward is true?',
      generator: { parameters: { variant: { type: 'int', min: 1, max: 4 } } },
      choices: [
        { id: 'choice-a', label: 'The first statement.' }, { id: 'choice-b', label: 'The second statement.' },
        { id: 'choice-c', label: 'The third statement.' }, { id: 'choice-d', label: 'The fourth statement.' },
      ],
    })),
  },
  {
    why: 'a key that is the largest of four in every draw',
    expect: ['answerKeyMagnitudeBias', 'answerKeyExtremeBias'],
    docs: [{
      ...shell('selftest_bias', 'ZZ.5', 'direct', 3, 2),
      prompt: 'What is the product ${{a}}\\times{{b}}$?',
      generator: {
        parameters: { a: { type: 'int', min: 5, max: 12 }, b: { type: 'int', min: 5, max: 12 } },
        derived: { ans: 'a*b', d1: 'a+b', d2: 'a', d3: 'b' },
      },
      choices: options('ans', 'd1', 'd2', 'd3'),
    }],
  },
  {
    why: 'a choice id that names the answer',
    expect: ['transparentChoiceId'],
    docs: [{
      ...shell('selftest_leak', 'ZZ.6', 'direct', 3, 2),
      prompt: 'What is ${{a}}+{{b}}$?',
      generator: {
        parameters: { a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 12, max: 30 } },
        derived: { ans: 'a+b', d1: 'a-b', d2: 'a*b', d3: 'a' },
      },
      choices: [
        { id: 'sat-correct', label: '{{ans}}' }, { id: 'choice-b', label: '{{d1}}' },
        { id: 'choice-c', label: '{{d2}}' }, { id: 'choice-d', label: '{{d3}}' },
      ],
      responseFields: [{ id: 'answer', label: 'Choose', inputProfile: 'choice', expected: 'sat-correct' }],
    }],
  },
];

const scratch = path.join(ROOT, '.digital-sat-selftest');
mkdirSync(scratch, { recursive: true });
try {
  const bank = JSON.parse(readFileSync(path.join(ROOT, SOURCE), 'utf8'));
  bank.documents = [...bank.documents, ...CASES.flatMap((c) => c.docs)];
  writeFileSync(path.join(scratch, 'bank.json'), JSON.stringify(bank));

  execFileSync('node', [
    path.join(here, 'audit-digital-sat-certification.mjs'),
    '--source', '.digital-sat-selftest/bank.json',
    '--samples', '300',
    '--json', '.digital-sat-selftest/report.json',
  ], { cwd: ROOT, stdio: 'ignore' });

  const report = JSON.parse(readFileSync(path.join(scratch, 'report.json'), 'utf8'));
  let failed = 0;
  for (const testCase of CASES) {
    const ids = new Set(testCase.docs.map((d) => d.id));
    const found = new Set(report.findings
      .filter((f) => ids.has(f.id) || [...ids].some((id) => String(f.detail || '').includes(id)))
      .map((f) => f.code));
    const missing = testCase.expect.filter((code) => !found.has(code));
    // Controls must be silent on the rules their exemption covers; a same-tier
    // similarity finding on two static items is a different rule and is fine.
    const unexpected = testCase.expect.length ? [] : [...found]
      .filter((code) => ['arithmeticLadderChoices', 'generatorClone', 'crossTierTaskClone'].includes(code));
    const ok = !missing.length && !unexpected.length;
    if (!ok) failed += 1;
    console.log(`${ok ? '  ok  ' : 'FAIL  '}${testCase.why}`);
    console.log(`        expected ${JSON.stringify(testCase.expect)}  saw ${JSON.stringify([...found])}`);
    if (missing.length) console.log(`        MISSING ${JSON.stringify(missing)}`);
    if (unexpected.length) console.log(`        UNEXPECTED ${JSON.stringify(unexpected)}`);
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} self-test cases behaved as intended`);
  process.exitCode = failed ? 1 : 0;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
