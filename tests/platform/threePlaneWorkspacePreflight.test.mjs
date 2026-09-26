/*
 * ISSUE #359, PARTS C & E — THREE-PLANE VISUALIZER PREFLIGHT RECOGNITION.
 *
 * Confirms the compiled spatial-model question is never classified as a
 * plain/text-only question by the platform's section-richness audit, and
 * gets its own distinct, bonus-weighted family — never silently folded into
 * the ordinary systemsWorkspace "systems" bucket or a plain type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { analyzeSectionBalanceRigor } from '../../src/platform/quality/sectionBalanceRigor.js';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';

const DAY1_SYSTEM = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'];

const compileSpatial = () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Three-plane preflight recognition', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A2.3B',
        prompt: 'Explore the three planes for this system.',
        studentActions: ['connectRepresentations'],
        equations: DAY1_SYSTEM,
        variables: ['x', 'y', 'z'],
        spatialModel: { kind: 'threePlanes' },
      }],
    }],
  });
  return compiled.package.sections[0].questions[0];
};

test('the compiled spatial question resolves to the spatial systemsWorkspace mode at runtime', () => {
  const question = compileSpatial();
  assert.equal(resolveSystemsWorkspaceMode(question), 'spatial');
});

test('section-balance richness treats the three-plane exploration as its own rich family, never a plain type', () => {
  const question = compileSpatial();
  const bundle = { sections: [{ role: 'classwork', title: 'Classwork', questions: [question] }] };
  const audit = analyzeSectionBalanceRigor(bundle);
  assert.equal(audit.classwork.count, 1);
  assert.equal(audit.classwork.richShare, 1, 'a spatial systemsWorkspace question must count as rich, never plain');
  assert.ok(audit.classwork.families.includes('three-plane spatial model'), `expected a distinct spatial family, got: ${audit.classwork.families.join(', ')}`);
  // The bonus-weighted family must score at least as rich as the platform's
  // other bonus interaction families (relationshipModel, modelingLab, etc.),
  // never merely the ordinary "systems" weight.
  assert.ok(audit.classwork.opportunityUnits >= 1.6, `expected a bonus-weighted opportunity score, got ${audit.classwork.opportunityUnits}`);
});

test('a plain 2×2 systemsWorkspace question is unaffected and keeps the ordinary "systems" family', () => {
  const question = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: '2x2 unaffected', courseId: 'algebra1' },
    sections: [{ role: 'classwork', title: 'Classwork', questions: [{
      standard: 'A.3C',
      prompt: 'Solve the system.',
      studentActions: ['solveSystem'],
      equations: ['x + y = 2', 'x - y = 0'],
    }] }],
  }).package.sections[0].questions[0];
  const audit = analyzeSectionBalanceRigor({ sections: [{ role: 'classwork', title: 'Classwork', questions: [question] }] });
  assert.ok(audit.classwork.families.includes('systems'));
  assert.equal(audit.classwork.richShare, 1);
});
