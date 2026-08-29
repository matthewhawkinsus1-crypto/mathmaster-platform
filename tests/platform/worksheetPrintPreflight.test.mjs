import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditAssignmentWorksheetPrintability,
  auditWorksheetPrintQuestion,
} from '../../src/platform/preflight/worksheetPrintPreflight.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

test('graph analysis with a renderable function is printable', () => {
  const result = auditWorksheetPrintQuestion({
    type: 'graphAnalysis',
    prompt: 'Use the graph to identify the vertex.',
    functionSpec: { type: 'quadratic', a: 1, h: 2, k: -3 },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.studentVisualKinds.includes('graph'));
});

test('function graph construction prints a blank workspace rather than failing representation fidelity', () => {
  const result = auditWorksheetPrintQuestion({
    type: 'functionGraph',
    prompt: 'Graph the function.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graph: { xMin: -5, xMax: 5, yMin: -6, yMax: 8 },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.studentVisualKinds.includes('blankGraph'));
});

test('oversized worksheet tables are blocked before export', () => {
  const result = auditWorksheetPrintQuestion({
    type: 'table',
    prompt: 'Complete the table.',
    table: {
      columns: Array.from({ length: 3 }, (_, index) => ({ key: 'c' + index, label: 'C' + index })),
      rows: Array.from({ length: 19 }, (_, index) => ({ c0: index, c1: '', c2: '' })),
    },
  }, { label: 'Large table' });
  assert.ok(result.errors.some((message) => /19 table rows/.test(message)));
});

test('too many graph choices are blocked instead of being shrunk into unreadable thumbnails', () => {
  const result = auditWorksheetPrintQuestion({
    type: 'graphScenarioMatch',
    prompt: 'Match each situation to a graph.',
    graphs: Array.from({ length: 7 }, (_, index) => ({
      id: 'g' + index,
      graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'line', m: index + 1, b: 0 }] },
    })),
  });
  assert.ok(result.errors.some((message) => /7 graph choices/.test(message)));
});

test('a long graph question that would exceed one card is blocked predictably', () => {
  const result = auditWorksheetPrintQuestion({
    type: 'graphAnalysis',
    prompt: 'Use the graph. ' + 'Explain the relationship carefully. '.repeat(110),
    functionSpec: { type: 'line', m: 1, b: 0 },
  });
  assert.ok(result.errors.some((message) => /too tall for one printable question card/.test(message)));
});

test('print audit is skipped when every worksheet PDF output is intentionally disabled', () => {
  const assignment = {
    outputProfiles: {
      studentWorksheetPdf: { enabled: false },
      teacherWorksheetPdf: { enabled: false },
      answerKeyPdf: { enabled: false },
    },
  };
  const result = auditAssignmentWorksheetPrintability(assignment, [{
    type: 'table',
    table: {
      columns: Array.from({ length: 9 }, (_, index) => ({ key: 'c' + index, label: 'C' + index })),
      rows: [{ c0: 1 }],
    },
  }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.enabledProfiles, []);
});

test('native V5 Preflight carries print overflow into publish blockers', () => {
  const assignment = {
    schemaVersion: 5,
    assignment: {
      title: 'Print Preflight',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    outputProfiles: {
      studentWorksheetPdf: { enabled: true },
      teacherWorksheetPdf: { enabled: false },
      answerKeyPdf: { enabled: false },
      lessonNotesPdf: { enabled: false },
    },
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        type: 'table',
        prompt: 'Complete the table.',
        table: {
          columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
          rows: Array.from({ length: 19 }, (_, index) => ({ x: index, y: '' })),
          answers: Object.fromEntries(Array.from({ length: 19 }, (_, index) => [index + ':y', index * 2])),
        },
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    }],
  };
  const model = buildAssignmentV5PreflightModel(assignment);
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((message) => /19 table rows/.test(message)));
});

console.log('worksheetPrintPreflight.test.mjs: all assertions passed');


test('default digital V5 skips print-only blockers until a PDF is enabled', () => {
  const assignment = {
    schemaVersion: 5,
    assignment: {
      title: 'Digital Library First',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        type: 'table',
        prompt: 'Complete the table.',
        table: {
          columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
          rows: Array.from({ length: 19 }, (_, index) => ({ x: index, y: '' })),
          answers: Object.fromEntries(Array.from({ length: 19 }, (_, index) => [index + ':y', index * 2])),
        },
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    }],
  };

  const model = buildAssignmentV5PreflightModel(assignment);
  assert.equal(model.assignmentV5.outputProfiles.studentWorksheetPdf.enabled, false);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.ok(!model.errors.some((message) => /19 table rows/.test(message)));
});
