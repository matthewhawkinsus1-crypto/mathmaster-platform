// Support-use telemetry from the student's client: what reaches the evidence
// record, from where, and what never does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyStudentSupportToQuestion, buildSupportUsage } from '../../src/studentSupport.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('a configured modification that changes nothing leaves the item at grade level', () => {
  const profile = { modifications: ['reduce-complexity', 'prefill-first-step'] };
  const graph = buildSupportUsage(profile, { type: 'functionGraph', prompt: 'Graph y = 2x + 1' });
  assert.equal(graph.modified, false);
  assert.deepEqual(graph.modifications, []);
  assert.deepEqual(graph.modificationsConfigured, ['reduce-complexity', 'prefill-first-step']);
  const oneStep = applyStudentSupportToQuestion({ type: 'stepAlgebra', generator: { kind: 'stepLinearEquation' } }, profile);
  assert.equal(oneStep.usage.modified, true);
  assert.deepEqual(oneStep.usage.modifications, ['reduce-complexity', 'prefill-first-step']);
  assert.equal(oneStep.question.generator.modifiedOneStep, true, 'the transformation itself is unchanged');
  const mc = buildSupportUsage(profile, { type: 'multipleChoice', choices: ['a', 'b', 'c'] });
  assert.deepEqual(mc.modifications, ['reduce-complexity']);
  // Accommodations keep their long-standing "configured / presented" meaning.
  assert.deepEqual(buildSupportUsage({ accommodations: ['text-to-speech'] }, { type: 'functionGraph' }).accommodations, ['text-to-speech']);
});

test('the question engine reports read-aloud use at the button and calculator use on every open path', () => {
  const readAloud = region(engine, 'aria-label="Read aloud"', '</button>', 'Read aloud button');
  assert.match(readAloud, /onClick=\{\(\) => \{ speakText\(referenceSpeechText\); reportSupportEvidence\('text-to-speech', 'used'\); \}\}/);
  const control = region(engine, 'const handleCalculatorControl = () => {', '\n  };', 'calculator control');
  assert.match(control, /markCalculatorOpened\(\);\n    setCalculatorOpen\(true\);/);
  const marker = region(engine, 'const markCalculatorOpened = () => {', '};', 'markCalculatorOpened');
  assert.match(marker, /reportSupportEvidence\('calculator', 'used'\)/);
  assert.match(engine, /onCalculatorOpened=\{markCalculatorOpened\}/);
  const itemEffect = region(engine, "if (supportPresentation.textToSpeech) reportSupportEvidence('text-to-speech', 'available');", '}, [', 'item evidence effect');
  assert.match(itemEffect, /\(supportUsage\.modifications \|\| \[\]\)\.forEach\(\(modificationId\) => reportSupportEvidence\(modificationId, 'provided'\)\)/);
  assert.match(engine, /if \(calculatorPolicy\?\.available\) reportSupportEvidence\('calculator', 'available'\);/);
});

test('only real student credit work records evidence; previews and post-deadline practice never do', () => {
  const mount = region(app, '<QuestionEngine', '/>', 'QuestionEngine mount');
  assert.match(mount, /onSupportEvidence=\{preview \|\| lifecycle\.isPracticeOnly\s*\? null/);
  const recorder = region(app, 'const recordStudentSupportEvidence = (', '\n  };', 'student recorder');
  assert.match(recorder, /if \(user\?\.role !== 'student' \|\| !user\.id \|\| !activeAssignmentId \|\| isPracticeMode\) return;/);
  assert.match(recorder, /if \(!studentMayRecordSupport\(user\.profile, supportId\)\) return;/);
  assert.match(recorder, /assignedTeacherEmail: user\.assignedTeacherEmail/);
  assert.match(recorder, /const deterministic = eventType !== 'used';/);
});

test('launch records come from the shared rules, and every called module is imported', () => {
  assert.match(app, /import \{ recordStudentSupportEvidence as saveStudentSupportEvidence \} from '\.\/platform\/supportEvidence\/supportEvidenceStore\.js';/);
  // The live-class signal writer (studentSupportStore) keeps its own name; the
  // two must never collide in App.jsx (a duplicate import fails only the build).
  const recorder = region(app, 'const recordStudentSupportEvidence = (', '\n  };', 'student recorder');
  assert.match(recorder, /saveStudentSupportEvidence\(\{/);
  assert.match(app, /import \{ launchSupportRecords, studentMayRecordSupport, usedRecordKey \} from '\.\/platform\/supportEvidence\/studentSupportTelemetry\.js';/);
  const launch = region(app, 'const launchedSupportKeyRef = useRef', '// eslint-disable-line', 'launch effect');
  assert.match(launch, /if \(!isStudentAssignment \|\| !activeAssignmentData \|\| isPracticeMode\) return;/);
  // The launch records describe what THIS student received: the questions in
  // their own required set (a reduced-item accommodation omits some) and the
  // resolved reduced-item projection, so "provided" is recorded only when
  // items were actually omitted (studentSupportTelemetry.js).
  assert.match(launch, /workload = studentRequiredFor\(activeAssignmentData, \{ hasPracticePass: hasPracticePassFor\(activeAssignmentId\) \}\);/);
  assert.match(launch, /workload = \{ failed: true,/, 'a projection that throws is recorded as unavailable, never as provided');
  assert.match(launch, /const presentedQuestions = activeQuestions\.filter\(\(_, index\) => required\.has\(index\)\);/);
  assert.match(launch, /launchSupportRecords\(\{ profile: user\.profile, assignment: activeAssignmentData, roles, questions: presentedQuestions, workload \}\)/);
  // The roster teacher email the rules compare against is loaded verbatim.
  assert.match(executableSource(app), /assignedTeacherEmail: studentData\.assignedTeacherEmail \|\| null,/);
});
