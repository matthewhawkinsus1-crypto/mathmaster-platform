import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuestionRepairRequest,
  parseQuestionRepairResponse,
} from '../../src/platform/contract/questionRepairRequest.js';

const question = {
  questionId: 'q1',
  type: 'multiAnswer',
  prompt: 'Solve 2x + 1 = 9.',
  dok: 2,
  difficultyBand: 3,
  answerFields: [{ id: 'x', label: 'x', answer: '4' }],
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
};

test('repair request carries plain-language teacher intent and the complete existing question', () => {
  const request = buildQuestionRepairRequest({
    assignment: { title: 'Linear Equations', courseId: 'algebra1' },
    question,
    instruction: 'Equivalent answers are being rejected. Keep the same skill.',
    questionNumber: 3,
  });
  assert.match(request, /MathMaster question repair/);
  assert.match(request, /Assignment: Linear Equations/);
  assert.match(request, /Course: algebra1/);
  assert.match(request, /Question: 3/);
  assert.match(request, /Equivalent answers are being rejected/);
  assert.match(request, /"questionId": "q1"/);
  assert.match(request, /Return exactly ONE complete replacement question JSON object/);
  assert.match(request, /update the expected answer\/solution from the same changed mathematics/);
  assert.match(request, /Never add student IDs, accommodations, IEP\/504\/EB information/);
  assert.match(request, /CANONICAL V5 runtime question/);
  assert.match(request, /Reference information is part of the student task anchor/);
  assert.match(request, /Algebra I domain\/range[\s\S]*interval notation/);
  assert.match(request, /identify independent\/dependent quantities[\s\S]*at least two selectable quantities/);
  assert.match(request, /readGraph means technology\/displayed-graph analysis/);
  assert.match(request, /raw caret exponent prose such as x\^2 or 2\^x/);
});

test('repair request refuses a blank teacher instruction', () => {
  assert.throws(
    () => buildQuestionRepairRequest({ assignment: {}, question, instruction: '   ' }),
    /Describe what you want the AI to fix or rewrite first/,
  );
});

test('replacement parser accepts one direct JSON question', () => {
  const parsed = parseQuestionRepairResponse(JSON.stringify(question));
  assert.equal(parsed.questionId, 'q1');
  assert.equal(parsed.type, 'multiAnswer');
});

test('replacement parser accepts fenced JSON without exposing a manual JSON editor', () => {
  const parsed = parseQuestionRepairResponse(`\`\`\`json
${JSON.stringify(question, null, 2)}
\`\`\``);
  assert.equal(parsed.prompt, 'Solve 2x + 1 = 9.');
});

test('replacement parser tolerates a replacementQuestion wrapper', () => {
  const parsed = parseQuestionRepairResponse(JSON.stringify({ replacementQuestion: question }));
  assert.equal(parsed.type, 'multiAnswer');
});

test('replacement parser fails closed when AI output is not one usable question', () => {
  assert.throws(() => parseQuestionRepairResponse('No JSON here.'), /could not find one replacement question object/);
  assert.throws(() => parseQuestionRepairResponse('{"prompt":"Missing type"}'), /missing the question type/);
});

console.log('questionRepairRequest.test.mjs: all assertions passed');
