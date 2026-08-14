import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSectionBalanceRigor } from '../../src/platform/quality/sectionBalanceRigor.js';

const q = (type, standard, dok = 2, extra = {}) => ({ type, standard, dok, ...extra });

test('flags thin practice compared with rich classwork', () => {
  const bundle = {
    lessonMetadata: { lessons: [3, 4] },
    activities: [
      { role: 'classwork', questions: [
        q('relationMapping', 'A.12A', 2), q('graphComparison', 'A.12A', 2), q('representationMatch', 'A.12A', 2),
        q('graphAnalysis', 'A.7A', 2), q('graphAnalysis', 'A.7A', 2), q('graphComparison', 'A.9D', 2),
        q('relationMapping', 'A.12A', 2), q('multiAnswer', 'A.7A', 2), q('graphComparison', 'A.9D', 2),
      ] },
      { role: 'practice', questions: [
        q('multiAnswer', 'A.12A', 1), q('graphAnalysis', 'A.7A', 2), q('multiAnswer', 'A.7A', 1), q('multiAnswer', 'A.12A', 1),
      ] },
    ],
  };
  const report = analyzeSectionBalanceRigor(bundle);
  assert.equal(report.status, 'warning');
  assert(report.issues.some((entry) => entry.id === 'practice-volume'));
  assert(report.issues.some((entry) => entry.id === 'rigor-drop'));
});

test('passes a balanced bundle with comparable independent practice', () => {
  const classwork = [
    q('relationMapping', 'A.12A', 2, { guidedNotes: { steps: [{ instruction: 'Use inputs and outputs.' }] } }),
    q('graphComparison', 'A.7A', 2),
    q('representationMatch', 'A.12A', 2),
    q('graphAnalysis', 'A.7A', 2),
    q('graphComparison', 'A.9D', 2),
    q('multiAnswer', 'A.12A', 2),
  ];
  const practice = [
    q('relationMapping', 'A.12A', 2), q('graphComparison', 'A.7A', 2), q('representationMatch', 'A.12A', 2),
    q('graphAnalysis', 'A.7A', 2), q('graphComparison', 'A.9D', 2), q('multiAnswer', 'A.12A', 2),
    q('relationMapping', 'A.12A', 2), q('graphAnalysis', 'A.7A', 2),
  ];
  const report = analyzeSectionBalanceRigor({ lessonMetadata: { lessons: [3, 4] }, activities: [{ role: 'classwork', questions: classwork }, { role: 'practice', questions: practice }] });
  assert.equal(report.status, 'pass');
  assert.equal(report.issues.length, 0);
});

test('balance warnings remain advisory and do not behave like scope blockers', () => {
  const report = analyzeSectionBalanceRigor({ activities: [
    { role: 'classwork', questions: [q('graphAnalysis', 'A.3C', 2), q('graphAnalysis', 'A.3C', 2)] },
    { role: 'practice', questions: [q('multiAnswer', 'A.3C', 1)] },
  ] });
  assert(report.issues.length > 0);
  assert(report.issues.every((entry) => ['warning', 'suggestion'].includes(entry.severity)));
});
