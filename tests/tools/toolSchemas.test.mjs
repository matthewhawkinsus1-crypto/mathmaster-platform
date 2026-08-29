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

test('a graphing2 standard-form question keeps its coefficients through the blueprint parse', async () => {
  // `standard` means two different things in this codebase: a TEKS shorthand on
  // an ordinary question, and the A/B/C coefficients of Ax + By = C on
  // graphing2. Reading the object as a code stringified it into an alignment of
  // "[object Object]" and deleted the coefficients, so the question reached the
  // student with no equation and reported mastery against a standard that does
  // not exist.
  const { parseAssignmentBlueprintText } = await import('../../src/assignmentBlueprint.js');
  const parsed = parseAssignmentBlueprintText(JSON.stringify([
    { toolId: 'graphing2', mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } },
    { type: 'algebra', prompt: 'Solve for x.', equationLatex: '2x = 8', answer: '4', standard: 'A.5A' },
  ]));

  assert.deepEqual(parsed.questions[0].standard, { A: 2, B: 1, C: 4 }, 'coefficients must survive');
  assert.equal(parsed.questions[0].alignments, undefined, 'coefficients are not a standards alignment');
  assert.equal(validateToolQuestion(parsed.questions[0]).isValid, true);

  // The genuine shorthand still compiles, and is still consumed.
  assert.deepEqual(parsed.questions[1].alignments, [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ]);
  assert.equal(parsed.questions[1].standard, undefined);
});
