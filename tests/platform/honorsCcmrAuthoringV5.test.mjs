import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateAlignments } from '../../src/platform/contract/alignments.js';

const directSatIntent = ({ domainId = 'algebra', standard = 'A.5A' } = {}) => ({
  schemaVersion: 5,
  assignment: { title: 'Honors CCMR transfer', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  activities: [{
    role: 'practice',
    title: 'Practice',
    questions: [{
      standard,
      prompt: 'If $3x+4=40$, what is $x$?',
      studentActions: ['solveEquation'],
      equation: '3x+4=40',
      answer: '12',
      alignments: [
        { framework: 'teks', code: standard, role: 'primary', evidenceLevel: 'assessed' },
        { framework: 'digitalSAT', domainId, role: 'primary', evidenceMode: 'direct' },
      ],
      assessmentContext: { framework: 'digitalSAT', examStyle: true },
    }],
  }],
});

test('V5 compiler preserves authentic Honors CCMR metadata on the compiled Practice question', () => {
  const compiled = compileAuthoringIntentV5(directSatIntent()).package.activities[0].questions[0];
  assert.equal(compiled.activityRole, 'practice');
  assert.deepEqual(compiled.assessmentContext, { framework: 'digitalSAT', examStyle: true });
  assert.equal(compiled.alignments.some((entry) => entry.framework === 'teks' && entry.code === 'A.5A'), true);
  assert.equal(compiled.alignments.some((entry) => entry.framework === 'digitalSAT' && entry.domainId === 'algebra' && entry.evidenceMode === 'direct'), true);
  assert.deepEqual(validateAlignments(compiled).errors, []);
});

test('a valid exam domain id that does not match the TEKS crosswalk is rejected', () => {
  const compiled = compileAuthoringIntentV5(directSatIntent({ domainId: 'advancedMath' })).package.activities[0].questions[0];
  const { errors } = validateAlignments(compiled);
  assert.ok(errors.some((error) => /none of its TEKS alignments crosswalk to that domain/.test(error)));
});

test('exam-style context without an explicit exam alignment is rejected', () => {
  const source = directSatIntent();
  source.activities[0].questions[0].alignments = [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ];
  const compiled = compileAuthoringIntentV5(source).package.activities[0].questions[0];
  const { errors } = validateAlignments(compiled);
  assert.ok(errors.some((error) => /no explicit digitalSAT domain alignment/.test(error)));
});
