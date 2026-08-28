import assert from 'node:assert/strict';
import {
  normalizeAssignmentV5,
  validateAssignmentV5,
  flattenV5Sections,
  rebuildV5SectionsFromQuestions,
} from '../../src/platform/contract/assignmentSchemaV5.js';

const source = normalizeAssignmentV5({
  schemaVersion: 5,
  assignment: { title: 'V5 schema smoke', courseId: 'algebra1' },
  variantPolicy: { mode: 'personalized', sectionModes: { classwork: 'shared', practice: 'personalized' } },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [{ prompt: 'A', type: 'algebra' }] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [{ prompt: 'B', type: 'algebra' }] },
  ],
});

assert.equal(source.schemaVersion, 5);
assert.equal(source.differentiationPolicy.allowStandardChange, false);
assert.equal(source.differentiationPolicy.honors.mode, 'inheritDestinationClass');
assert.equal(source.differentiationPolicy.honors.ccmrPracticeTargetShare, 0.15);
assert.equal(source.supportPolicy.mode, 'inheritStudentProfile');
assert.equal(source.outputProfiles.studentWorksheetPdf.enabled, false);
assert.equal(source.outputProfiles.teacherWorksheetPdf.enabled, false);
assert.equal(source.outputProfiles.answerKeyPdf.enabled, false);
assert.deepEqual(validateAssignmentV5(source).errors, []);

const flat = flattenV5Sections(source);
assert.equal(flat.length, 2);
assert.equal(flat[0].sectionId, 'cw');
assert.equal(flat[1].activityRole, 'practice');

const enriched = [...flat, { prompt: 'Honors transfer', type: 'algebra', activityRole: 'practice' }];
const rebuilt = rebuildV5SectionsFromQuestions(source, enriched);
assert.equal(rebuilt.find((section) => section.id === 'cw').questions.length, 1);
assert.equal(rebuilt.find((section) => section.id === 'practice').questions.length, 2);

const old = validateAssignmentV5({ schemaVersion: 4, assignment: { title: 'old', courseId: 'algebra1' }, sections: [{ role: 'practice', questions: [{}] }] });
assert.ok(old.errors.some((error) => /V4 and earlier assignments are intentionally unsupported/.test(error)));

console.log('assignmentSchemaV5.test.mjs: all assertions passed');
