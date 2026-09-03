import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildQuestionRepairRequest } from '../../src/platform/contract/questionRepairRequest.js';

const preflight = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
const editor = fs.readFileSync('src/AssignmentQuestionEditor.jsx', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');

// The site now carries real student records. Nothing on an AI path may carry a
// student identity, an IEP/504/EB designation, an accommodation list or a grade
// to the provider — the authoring contract already forbids it, and these
// assertions keep the repair packet honest as the surrounding code changes.
test('a question repair packet carries lesson content only, never student state', () => {
  const assignment = {
    schemaVersion: 5,
    assignment: { title: 'Linear Equations', courseId: 'algebra1' },
    // Shapes that live alongside an assignment in memory and must not travel.
    roster: [{ studentId: 'S-10432', name: 'Jordan Vega', iep: true, accommodations: ['extended time'] }],
    gradesByStudent: { 'S-10432': 88 },
  };
  const request = buildQuestionRepairRequest({
    assignment,
    question: { type: 'multiAnswer', prompt: 'Solve 2x + 3 = 11.', expected: '4' },
    instruction: 'The equivalent answer 4.0 is being rejected.',
    questionNumber: 3,
  });

  assert.match(request, /Linear Equations/);
  assert.match(request, /Solve 2x \+ 3 = 11/);
  for (const forbidden of ['S-10432', 'Jordan Vega', 'extended time', 'iep', '88']) {
    assert.ok(!request.includes(forbidden), `repair packet must not contain ${forbidden}`);
  }
  assert.match(request, /Never add student IDs, accommodations, IEP\/504\/EB information/);
});

test('per-question repair runs through MathMaster AI and the outside-AI path with one acceptance check', () => {
  // A replacement is only taken when it clears its own blockers and introduces
  // no new one; both routes must reach that check rather than each having its own.
  assert.match(preflight, /const acceptQuestionRepairReplacement = /);
  assert.match(preflight, /repairQuestionWithAI\(request\)/);
  assert.match(preflight, /Repair with MathMaster AI/);
  assert.match(preflight, /acceptQuestionRepairReplacement\(built\.question, issue, 'MathMaster AI'\)/);
  assert.match(preflight, /acceptQuestionRepairReplacement\(parseQuestionRepairResponse\(raw\), issue, 'Outside AI'\)/);

  assert.match(editor, /const acceptRepairReplacement = /);
  assert.match(editor, /await acceptRepairReplacement\(built\.question\)/);
  assert.match(editor, /await acceptRepairReplacement\(parseQuestionRepairResponse\(text\)\)/);
});

test('both repair routes stay behind the live-student protections', () => {
  // Preflight refuses any question rewrite once a student has a grade for the
  // assignment; the editor additionally proves that only response-entry
  // mechanics changed before touching a live question.
  const internal = preflight.indexOf('const repairQuestionWithMathMasterAi');
  const body = preflight.slice(internal, internal + 400);
  assert.match(body, /if \(!allowQuestionRepair\) return;/);

  const accept = editor.indexOf('const acceptRepairReplacement');
  const acceptBody = editor.slice(accept, accept + 900);
  assert.match(acceptBody, /hasLiveProtection && historicalQuestion/);
  assert.match(acceptBody, /analyzeResponseEntryRepair/);
  assert.match(acceptBody, /MathMaster blocked this live rewrite/);
});

test('the AI question repair callable is teacher-gated and never reads student collections', () => {
  const start = functionsIndex.indexOf('exports.repairAssignmentQuestionWithAI');
  assert.ok(start >= 0);
  const block = functionsIndex.slice(start, start + 700);
  assert.match(block, /runAssignmentAiRequest\(request/);
  assert.match(block, /mode: "question"/);
  for (const collection of ['"students"', '"grades"', '"presence"', '"studentDirectory"']) {
    assert.ok(!block.includes(collection), `the repair callable must not read ${collection}`);
  }
});
