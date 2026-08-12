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
