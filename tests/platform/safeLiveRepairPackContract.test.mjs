import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SAFE_LIVE_REPAIR_PACK_KIND,
  buildSafeLiveRepairPackRequest,
} from '../../src/platform/contract/safeLiveRepairPackContract.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';

const liveQuestion = {
  questionId: 'q-live-1',
  type: 'multiAnswer',
  prompt: 'State the domain in words.',
  answerFields: [
    {
      id: 'domainWords',
      label: 'Domain in words',
      acceptedAnswers: ['all real numbers from 0 through 4'],
      inputProfile: 'expression',
    },
  ],
};

test('Safe Live Repair Pack prompt names the dedicated pack schema and rejects Assignment V5 output', () => {
  const request = buildSafeLiveRepairPackRequest({
    assignment: { title: 'Live Review', courseId: 'algebra1' },
    questions: [liveQuestion],
  });

  assert.equal(SAFE_LIVE_REPAIR_PACK_KIND, 'mathmasterSafeLiveRepairPack');
  assert.match(request, /"kind": "mathmasterSafeLiveRepairPack"/);
  assert.match(request, /"replacementQuestions"/);
  assert.match(request, /Do NOT return a normal Assignment V5 object/i);
  assert.match(request, /q-live-1/);
  assert.match(request, /State the domain in words\./);
  assert.match(request, /questionWeight, teacherExcluded/);
  assert.match(request, /Exactly ONE previously accepted correct wording/i);
});

test('Safe Live Repair Pack prompt requires the protected live before-state', () => {
  assert.throws(
    () => buildSafeLiveRepairPackRequest({ assignment: { title: 'No questions' }, questions: [] }),
    /protected live questions/i,
  );
});

test('standard Assignment V5 authoring contract routes live-history repairs to the dedicated pack', () => {
  const contract = buildAuthoringContract({ courseId: 'algebra1' });
  assert.match(contract, /Live assignment repair boundary/);
  assert.match(contract, /mathmasterSafeLiveRepairPack/);
  assert.match(contract, /do not return a full repaired Assignment V5 JSON/i);
});

test('live assignment editor exposes copy-prompt and import actions together', async () => {
  const source = await readFile(new URL('../../src/AssignmentQuestionEditor.jsx', import.meta.url), 'utf8');
  assert.match(source, /buildSafeLiveRepairPackRequest/);
  assert.match(source, /Copy Safe Repair Pack Prompt/);
  assert.match(source, /Import Safe Repair Pack/);
});
