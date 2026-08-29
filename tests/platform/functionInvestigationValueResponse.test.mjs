import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
} from '../../functions/shared/pathToolContracts.mjs';

const question = {
  type: 'functionInvestigation',
  prompt: 'Graph f(x)=2x-3, then give the inverse point.',
  functionSpec: { type: 'linear', m: 2, b: -3 },
  pointTasks: [
    { id: 'p0', x: 0, expected: [0, -3] },
    { id: 'px', x: 1, expected: [1, -1] },
  ],
  analysisRequests: [
    {
      id: 'inverse',
      label: 'Give the corresponding inverse point.',
      kind: 'value',
      responseMode: 'text',
      expected: ['(-1,1)'],
    },
  ],
};

test('secure function-investigation value response is graded from answers, not selections', () => {
  const privateGrading = buildPrivateToolGrading(question);
  const result = gradePathResponse({
    privateGrading,
    raw: {
      placements: { p0: [0, -3], px: [1, -1] },
      answers: { inverse: '(-1,1)' },
      selections: {},
    },
  });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, true);
});

test('public payload keeps value semantics but does not expose the expected inverse point', () => {
  const payload = buildPublicToolPayload(question);
  assert.equal(payload.tool.analysisRequests[0].kind, 'value');
  assert.equal(payload.tool.analysisRequests[0].id, 'inverse');
  assert.equal('expected' in payload.tool.analysisRequests[0], false);
  assert.equal(JSON.stringify(payload).includes('(-1,1)'), false);
});

test('graph renderer preserves value responses as typed answers and supplies ordered-pair keys', () => {
  const source = readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
  assert.match(source, /if \(request\.kind === 'value'\)/);
  assert.match(source, /kind: 'value'/);
  assert.match(source, /answerFormat=\{analysisAnswerFormatFor\(part\)\}/);
  assert.match(source, /inverse\\s\*point|inverse\\\\s\*point|inverse\\s\*point/i);
});
