// The student's "Support tools": what they can use, in neutral words, with no
// need to know why they have it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getStudentSupportPresentation, studentSupportTools } from '../../src/studentSupport.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-09-30T15:00:00Z');
const profile = (accommodations, { status = 'active', modifications = [] } = {}) => buildSupportProjection({
  revisions: [{ id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart: '2026-08-17', inclusionStatus: false, accommodations, modifications }],
  todayKey: '2026-09-30',
});
const a = (id, params = {}) => ({ id, params, appliesTo: [] });

test('only student-facing tools appear, under their neutral names', () => {
  const tools = studentSupportTools(profile([
    a('text-to-speech'), a('calculator'), a('graph-paper'), a('extra-time', { dueDateExtension: { mode: 'school-days', value: 1 } }),
    a('check-for-understanding'), a('declutter-ui'),
  ], { modifications: [a('reduce-complexity')] }), { nowValue: NOW });
  assert.deepEqual(tools.tools.map((tool) => tool.label), ['Read aloud', 'Calculator', 'Graph paper']);
  const words = JSON.stringify(tools);
  assert.doesNotMatch(words, /\b(iep|504|mod|modif\w*|accommodat\w*|inclusion|extra time|special)\b/i);
});

test('teacher-attached materials are listed as links; none means nothing is shown', () => {
  const withLinks = studentSupportTools(profile([a('study-sheet', { resources: [{ label: 'Slope notes', url: 'https://docs.example.test/slope' }] })]), { nowValue: NOW });
  assert.deepEqual(withLinks.resources, [{ supportId: 'study-sheet', group: 'Study sheet', label: 'Slope notes', url: 'https://docs.example.test/slope' }]);
  assert.equal(withLinks.any, true);
  assert.equal(studentSupportTools(profile([a('study-sheet', { resources: [] })]), { nowValue: NOW }).any, false);
  // A link written straight to Firestore, around the editor's check, never renders.
  const smuggled = buildSupportProjection({
    revisions: [{ id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', inclusionStatus: false, modifications: [],
      accommodations: [{ id: 'study-sheet', appliesTo: [], params: { resources: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'y', url: 'http://plain.example.test' }] } }] }],
    todayKey: '2026-09-30',
  });
  assert.deepEqual(studentSupportTools(smuggled, { nowValue: NOW }).resources, []);
  assert.equal(studentSupportTools(profile([a('declutter-ui')]), { nowValue: NOW }).any, false, 'automatic supports need no tool');
  assert.equal(studentSupportTools(profile([a('text-to-speech')], { status: 'inactive' }), { nowValue: NOW }).any, false);
  assert.equal(studentSupportTools({}, { nowValue: NOW }).any, false);
});

test('graph paper reaches the scratchpad only for a student entitled to it', () => {
  assert.equal(getStudentSupportPresentation({ accommodations: ['graph-paper'] }).graphPaper, true);
  assert.equal(getStudentSupportPresentation({ accommodations: ['text-to-speech'] }).graphPaper, false);
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(engine, /gridBackground=\{supportPresentation\.graphPaper === true\}/);
  const open = region(engine, 'const openScratchpad = async () => {', '\n  };', 'openScratchpad');
  assert.match(open, /if \(supportPresentation\.graphPaper\) reportSupportEvidence\('graph-paper', 'used'\);/);
  const overlay = readFileSync(new URL('../../src/ScratchpadOverlay.jsx', import.meta.url), 'utf8');
  const redraw = region(overlay, 'const redraw = () => {', 'strokes.forEach', 'redraw');
  assert.match(redraw, /if \(gridBackground\) \{/);
});

test('the panel is for real student work only, and an opened link is a recorded use', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /import StudentSupportTools from '\.\/components\/student\/StudentSupportTools\.jsx';/);
  const mount = region(app, '{!preview && user?.role === \'student\' && (\n                <StudentSupportTools', '/>', 'Support tools mount');
  assert.match(mount, /onResourceOpened=\{\(supportId\) => recordStudentSupportEvidence\(\{ supportId, eventType: 'used'/);
  const panel = readFileSync(new URL('../../src/components/student/StudentSupportTools.jsx', import.meta.url), 'utf8');
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.match(panel, /onClick=\{\(\) => onResourceOpened\?\.\(resource\.supportId\)\}/);
  assert.match(panel, /if \(!any\) return null;/);
});
