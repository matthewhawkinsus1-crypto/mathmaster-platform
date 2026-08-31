import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import {
  buildSafeLibraryContentRepair,
  inspectLibraryContentRepair,
  prepareStoredAssignmentForReuse,
} from '../../src/platform/assignments/libraryAssignmentReuse.js';

const buildCanonicalLibraryLesson = () => {
  const canonical = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Module 1 Topic 1 Review — Quantities and Relationships',
      courseId: 'algebra1',
      folder: 'Algebra I/Module 1/Quantities and Relationships',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    outputProfiles: {
      digital: { enabled: true },
      lessonNotesPdf: {
        enabled: true,
        targetPages: 2,
        sections: [{
          heading: 'Constant-rate relationships',
          bullets: ['Independent quantities are inputs.', 'Dependent quantities respond to the input.'],
          equations: ['V=12t'],
        }],
      },
    },
    classroomIntegration: {
      enabled: true,
      topic: { name: 'Module 1 • Quantities and Relationships' },
      assignmentPost: {
        title: 'Topic 1 Review',
        instructions: 'Open MathMaster and complete the Warm-Up, Classwork, and Practice.',
      },
      resourcesPost: { postingMode: 'separateMaterial' },
    },
    sections: [{
      id: 'section-2',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        questionId: '0cc8d298-a87d-49d2-82ac-fc71d4aaec09',
        standard: 'A.3C',
        prompt: 'Natalia is filling a bathtub with water at a constant rate of 12 gallons per minute. Let t represent time in minutes and V represent the amount of water added in gallons. Identify the quantities, label the axes with units, write an equation for V in terms of t, determine the corresponding V-values for t = 0, 1, 2, 3, 4, graph the relationship, state the domain and range for the first 4 minutes, and classify the relationship as discrete or continuous.',
        studentActions: [
          'identifyQuantities',
          'configureAxes',
          'writeEquation',
          'completeTable',
          'constructGraph',
          'stateDomain',
          'stateRange',
          'classifyContinuity',
        ],
        quantities: [
          { id: 'time', label: 'Time', unit: 'minutes' },
          { id: 'waterAdded', label: 'Amount of water added', unit: 'gallons' },
        ],
        correctIndependentId: 'time',
        correctDependentId: 'waterAdded',
        function: {
          family: 'linear',
          m: 12,
          b: 0,
          domain: { min: 0, max: 4, minClosed: true, maxClosed: true },
        },
        axisRequirements: {
          requireScale: true,
          x: { label: 'Time', unit: 'minutes', countBy: 1 },
          y: { label: 'Amount of water added', unit: 'gallons', countBy: 12 },
        },
        table: {
          columns: [{ key: 't', label: 't (minutes)' }, { key: 'V', label: 'V(t) (gallons)' }],
          rows: [{ t: 0 }, { t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }],
        },
        continuity: 'continuous',
        answerModel: {
          equation: 'V = 12t',
          domain: '0 ≤ t ≤ 4',
          range: '0 ≤ V ≤ 48',
        },
      }],
    }],
  }).package;

  return {
    id: 'library-source',
    ...canonical,
    title: canonical.assignment.title,
    courseId: canonical.assignment.courseId,
    folder: canonical.assignment.folder,
    assignedClassIds: [],
    assignedClassPeriods: [],
  };
};

test('stored Library reuse preserves a composed workflow instead of recompiling it as y=x', () => {
  const library = buildCanonicalLibraryLesson();
  const before = getStoredAssignmentQuestions(library)[0];
  assert.equal(before.type, 'functionGraph');
  assert.equal(before.workflow.length, 8);
  assert.equal(before.grading.equation, 'V = 12t');

  const prepared = prepareStoredAssignmentForReuse(library);
  const after = prepared.questions[0];
  assert.equal(after.type, 'functionGraph');
  assert.equal(after.workflow.length, 8);
  assert.deepEqual(after.workflow, before.workflow);
  assert.deepEqual(after.grading, before.grading);
  assert.equal(after.studentChoosesX, undefined);
});

test('safe repair restores only the collapsed live workflow and keeps question identity/order', () => {
  const library = buildCanonicalLibraryLesson();
  const sourceQuestion = getStoredAssignmentQuestions(library)[0];
  const brokenQuestion = {
    ...sourceQuestion,
    type: 'functionGraph',
    functionSpec: { type: 'linear', m: 1, b: 0 },
    studentChoosesX: true,
  };
  delete brokenQuestion.workflow;
  delete brokenQuestion.grading;

  const live = {
    ...library,
    id: 'live-assignment',
    assignedClassIds: ['class-1'],
    assignedClassPeriods: ['1st'],
    sections: [{
      ...library.sections[0],
      questions: [brokenQuestion],
    }],
  };

  const inspection = inspectLibraryContentRepair(live, [live, library]);
  assert.equal(inspection.source.id, 'library-source');
  assert.deepEqual(inspection.questionIds, ['0cc8d298-a87d-49d2-82ac-fc71d4aaec09']);

  const repair = buildSafeLibraryContentRepair(live, inspection.source);
  const repaired = getStoredAssignmentQuestions({ ...live, sections: repair.sections });
  assert.deepEqual(repaired.map((question) => question.questionId), [
    '0cc8d298-a87d-49d2-82ac-fc71d4aaec09',
  ]);
  assert.equal(repaired[0].workflow.length, 8);
  assert.equal(repaired[0].grading.equation, 'V = 12t');
  assert.equal(repair.repairedQuestionIds.length, 1);
});

test('stored reuse recovers Classroom post details and authored note sections kept in runtime metadata', () => {
  const library = buildCanonicalLibraryLesson();
  const runtimeOnly = {
    ...library,
    outputProfiles: {
      ...library.outputProfiles,
      lessonNotesPdf: { enabled: true, targetPages: 2 },
    },
    classroomIntegration: { enabled: true },
    classroomPackage: {
      enabled: true,
      topic: { name: 'Module 1 • Quantities and Relationships' },
      assignmentPost: {
        title: 'Topic 1 Review',
        instructions: 'Preserve these Google Classroom directions.',
        publishMode: 'whenAssigned',
      },
      resourcesPost: {
        enabled: true,
        postingMode: 'separateMaterial',
        title: 'Topic 1 Review — Notes & Resources',
      },
      gradePassback: { enabled: true },
      additionalLinks: [{ title: 'Reference', url: 'https://example.com/reference' }],
    },
    lessonResources: {
      notesPdf: {
        enabled: true,
        title: 'Topic 1 Review — Student Notes',
        targetPages: 2,
        sections: [{
          id: 'notes-1',
          heading: 'Quantity roles',
          bullets: ['Inputs are independent quantities.'],
        }],
        asset: { url: 'https://example.com/old-delivery.pdf' },
      },
    },
  };

  const reusable = storedAssignmentToV5(runtimeOnly, { resetAssignmentKey: true });
  assert.equal(reusable.classroomIntegration.assignmentPost.instructions, 'Preserve these Google Classroom directions.');
  assert.equal(reusable.outputProfiles.lessonNotesPdf.sections.length, 1);
  assert.equal(reusable.outputProfiles.lessonNotesPdf.sections[0].heading, 'Quantity roles');
  assert.equal(reusable.outputProfiles.lessonNotesPdf.asset, undefined, 'delivery-specific generated PDF assets are not copied into a new class delivery');
});


test('MathMaster portable self-export re-import keeps the exact composed workflow contract', () => {
  const library = buildCanonicalLibraryLesson();
  const sourceQuestion = getStoredAssignmentQuestions(library)[0];
  const portable = {
    ...storedAssignmentToV5(library, { resetAssignmentKey: true }),
    portableContract: {
      kind: 'mathmasterCanonicalAssignmentV5',
      version: 1,
    },
  };

  const imported = parseAssignmentBlueprintText(JSON.stringify(portable));
  const importedQuestion = imported.questions[0];
  assert.equal(importedQuestion.type, 'functionGraph');
  assert.deepEqual(importedQuestion.workflow, sourceQuestion.workflow);
  assert.deepEqual(importedQuestion.grading, sourceQuestion.grading);
  assert.equal(importedQuestion.studentChoosesX, undefined);
  assert.ok(imported.repairs.some((message) => /preserved MathMaster canonical V5 renderer contracts/i.test(message)));
});
