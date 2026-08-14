import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const pkg = {
  schemaVersion: 5,
  assignment: { courseId: 'algebra1', title: 'Representation test' },
  lessonMetadata: { provider: 'Bluebonnet', course: 'Algebra I', module: 1, topic: 1, lessons: [1,2] },
  activities: [{
    role: 'practice',
    questions: [{
      prompt: 'Use the displayed graph to classify its behavior and shape.',
      assessedConstruct: 'graphicalBehavior',
      studentActions: ['multipleResponses'],
      function: { family: 'linear', m: -4, b: 7 },
      responses: [
        { id: 'behavior', label: 'Behavior', answer: 'decreasing', options: ['increasing','decreasing','constant'] },
        { id: 'shape', label: 'Graph shape', answer: 'straight line', options: ['straight line','smooth curve','isolated points'] },
      ],
    }],
  }],
};

test('V5 multiAnswer turns a supplied function into a visible static graph', () => {
  const { package: compiled } = compileAuthoringIntentV5(pkg);
  const question = compiled.activities[0].questions[0];
  assert.equal(question.type, 'multiAnswer');
  assert.deepEqual(question.graph?.functions?.[0], { type: 'line', m: -4, b: 7 });
  assert.equal(question.assessedConstruct, 'graphicalBehavior');
});
