import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const simulator = fs.readFileSync(new URL('../../src/components/teacher/PathSimulator.jsx', import.meta.url), 'utf8');
const experience = fs.readFileSync(new URL('../../src/components/teacher/SimulatedStudentExperience.jsx', import.meta.url), 'utf8');
const coverage = fs.readFileSync(new URL('../../src/components/teacher/PathCoverageAudit.jsx', import.meta.url), 'utf8');

test('Path Simulator no longer blocks Student Experience when there are zero assignments', () => {
  assert.doesNotMatch(simulator, /Create an assignment first\. The simulator runs real questions/);
  assert.match(simulator, /No classroom assignment exists yet[\s\S]*does <strong>not<\/strong> block My Math Path/);
  assert.match(simulator, /Course[\s\S]*Starting skill[\s\S]*Starting state/);
});

test('simulated student path reads the secure Path bank rather than assignment content', () => {
  assert.match(experience, /fetchTeacherPathBankSnapshot/);
  assert.match(experience, /pathBankQuestions/);
  assert.match(experience, /Classroom assignments are evidence only/);
});

test('root admin gets production-safe built-in activation controls without seed-file selection', () => {
  assert.match(coverage, /Refresh course Path bank/);
  assert.match(coverage, /Refresh ASVAB release/);
  assert.match(coverage, /Refresh SAT \/ ACT \/ TSIA2 release/);
  assert.match(coverage, /Fresh installation only/);
  assert.match(coverage, /Initialize complete built-in bank/);
  assert.match(coverage, /initializeBundledPathBankStarter/);
  assert.match(coverage, /refreshBundledCoursePathBank/);
  assert.match(coverage, /refreshReleasedAsvabPathBank/);
  assert.match(coverage, /refreshReleasedCcmrPathBanks/);
});

test('built-in Path starter answers stay server-side rather than in public hosting assets', () => {
  const functionsIndex = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(functionsIndex, /initializeStarterPathQuestionBank/);
  assert.match(functionsIndex, /seeds["'],\s*["']pathQuestionBank/);
  assert.equal(fs.existsSync(new URL('../../public/path-bank-seed', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../../functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json', import.meta.url)), true);
});
