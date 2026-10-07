import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { practiceSkillLaunch } from '../../src/platform/assessment/practiceSkillLaunch.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

/*
 * "PRACTISE THIS SKILL" FROM A RELEASED TEST REVIEW OR THE TEST CYCLE CARD.
 *
 * The results screens name a destination; App turns it into the same My Math
 * Path launch a recommended-skill card uses. App.jsx is imported by nothing,
 * so a call with no import would pass every other check and throw a
 * ReferenceError in a student's browser — the import is asserted here, next
 * to the call.
 */

test('a course standard opens Path practice on its TEKS code', () => {
  assert.deepEqual(practiceSkillLaunch({ alignmentKey: 'texas:A.5A' }), { teksCode: 'A.5A', tab: null });
  assert.deepEqual(practiceSkillLaunch({ alignmentKey: 'A.5A', framework: 'digitalSAT' }), { teksCode: 'A.5A', tab: null });
});

test('a practice test domain with no course standard opens the CCMR tab', () => {
  assert.deepEqual(practiceSkillLaunch({ alignmentKey: null, framework: 'digitalSAT', domainId: 'algebra' }), { teksCode: null, tab: 'ccmr' });
  // A namespaced non-TEKS key is not a standard to practise.
  assert.deepEqual(practiceSkillLaunch({ alignmentKey: 'sat:algebra', framework: 'digitalSAT' }), { teksCode: null, tab: 'ccmr' });
});

test('nowhere to go means no launch', () => {
  assert.equal(practiceSkillLaunch({}), null);
  assert.equal(practiceSkillLaunch(), null);
  assert.equal(practiceSkillLaunch({ alignmentKey: 'sat:algebra' }), null);
});

test('App wires the handler to both results screens, imported next to the call', () => {
  assert.match(app, /^import \{ practiceSkillLaunch \} from '\.\/platform\/assessment\/practiceSkillLaunch\.js';$/m);
  const handler = region(app, 'const practiseSkillFromResults = (destination) => {', '};', 'practise handler');
  assert.match(handler, /const launch = practiceSkillLaunch\(destination\);\s*if \(!launch\) return;/);
  assert.match(handler, /openStudentDashboardMode\('mathPath'\);\s*setPathLaunchTeks\(launch\.teksCode\);\s*setPathLaunchTab\(launch\.tab\);/);
  const exec = executableSource(app);
  assert.match(exec, /<TestCycleCard[\s\S]{0,900}onPracticeSkill=\{practiseSkillFromResults\}/);
  assert.match(exec, /<StudentSecureExamDashboard[\s\S]{0,600}onPracticeSkill=\{practiseSkillFromResults\}/);
  assert.match(exec, /<MyMathPathApp[\s\S]{0,500}initialTab=\{pathLaunchTab \|\| 'path'\}/);
  // A stale CCMR tab never outlives the launch it was set for.
  const open = region(app, 'const openStudentDashboardMode = (mode) => {', '};', 'open mode');
  assert.match(open, /setPathLaunchTab\(null\);/);
});
