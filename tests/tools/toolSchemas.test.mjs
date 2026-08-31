import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const sample=JSON.parse(fs.readFileSync(new URL('../../SAMPLE_MISSING_MATH_TOOLS.json', import.meta.url),'utf8'));

test('all sample missing-tool questions pass hard validation',()=>{
  for(const q of sample.questions){
    const result=validateToolQuestion(q);
    assert.equal(result.isValid,true,`${q.toolId}: ${result.errors.join('; ')}`);
  }
});

test('guard impossible tool configs',()=>{
  assert.equal(validateToolQuestion({toolId:'parabolaGeometryLab',p:0}).isValid,false);
  assert.equal(validateToolQuestion({toolId:'exponentialLogBridge',base:1}).isValid,false);
  assert.equal(validateToolQuestion({toolId:'stepAlgebra2',equation:{a:0}}).isValid,false);
});

test('sequenceExplorer accepts the integrated table-plot-rule bridge',()=>{
  const result=validateToolQuestion({
    toolId:'sequenceExplorer',
    mode:'fullBridge',
    sequence:{kind:'arithmetic',first:4,difference:3},
    targetN:12,
    displayCount:5,
    masteryEvidenceKeys:['texas:A.12D'],
  });
  assert.equal(result.isValid,true,result.errors.join('; '));
});

test('representationMatch completeSet requires authored sets instead of hidden fallback content',()=>{
  const missing=validateToolQuestion({toolId:'representationMatch',mode:'completeSet',targetId:'linear',masteryEvidenceKeys:['texas:A.12A']});
  assert.equal(missing.isValid,false);
  assert.ok(missing.errors.some((error)=>/explicit sets array/.test(error)));

  const valid=validateToolQuestion({
    toolId:'representationMatch',mode:'completeSet',targetId:'linear',masteryEvidenceKeys:['texas:A.12A'],
    sets:[
      {id:'linear',equation:'y=x',table:'(0,0)',context:'same input and output'},
      {id:'quadratic',equation:'y=x²',table:'(0,0)',context:'square the input'},
    ],
  });
  assert.equal(valid.isValid,true,valid.errors.join('; '));
});

test('a graphing2 standard-form V5 intent keeps its coefficients through the blueprint parse', async () => {
  // In Assignment V5, top-level `standard` is a TEKS shorthand. Line
  // coefficients belong to the mathematical line intent. The compiler should
  // route constructLine to graphing2 and preserve A/B/C without converting
  // them into an alignment.
  const { parseAssignmentBlueprintText } = await import('../../src/assignmentBlueprint.js');
  const parsed = parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 5,
    assignment: {
      title: 'Tool schema regression',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [
        {
          prompt: 'Construct the line represented by 2x + y = 4.',
          studentActions: ['constructLine'],
          lineIntent: {
            mode: 'standardForm',
            standard: { A: 2, B: 1, C: 4 },
          },
        },
        {
          prompt: 'Solve for x.',
          studentActions: ['solveStepByStep'],
          equation: '2x = 8',
          answer: '4',
          standard: 'A.5A',
        },
      ],
    }],
  }));

  assert.deepEqual(parsed.questions[0].standard, { A: 2, B: 1, C: 4 }, 'coefficients must survive');
  assert.equal(parsed.questions[0].alignments, undefined, 'line coefficients are not a standards alignment');
  assert.equal(parsed.questions[0].type, 'graphing2');
  assert.equal(parsed.questions[0].mode, 'standardForm');
  assert.equal(validateToolQuestion(parsed.questions[0]).isValid, true);

  // The genuine TEKS shorthand still compiles and is consumed as alignment.
  assert.deepEqual(parsed.questions[1].alignments, [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ]);
  assert.equal(parsed.questions[1].standard, undefined);
});
