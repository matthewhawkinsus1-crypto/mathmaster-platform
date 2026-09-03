import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CORE_QUESTION_TYPES, SUPPORTED_QUESTION_TYPES } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import { QUESTION_TYPE_CATALOG, REPRESENTATIONS } from '../../src/platform/contract/questionTypeCatalog.js';
import {
  CONTRACT_SLICES,
  PLATFORM_OWNED_FIELDS,
  authoringContractSections,
  buildAuthoringContract,
  buildContractSlice,
} from '../../src/platform/contract/authoringContract.js';
import { buildQuestionRepairRequest } from '../../src/platform/contract/questionRepairRequest.js';
import { buildHonorsDepthAiRepairRequest } from '../../src/platform/contract/honorsDepthAiRepair.js';
import { buildAssignmentWeightReviewRequest } from '../../src/platform/grading/weightReviewPack.js';

const CONTRACT = buildAuthoringContract({ courseId: 'algebra1' });

/*
 * The internal AI is not the path any more; everything goes out to ChatGPT,
 * Claude or Gemini through the clipboard. That makes this text the product. An
 * outside model has no access to the codebase, so anything it is not told, it
 * invents — and an invented question type or platform-owned field comes back as
 * JSON that looks authoritative and fails import.
 *
 * These tests fail when a registry gains something the AI-facing text never
 * mentions, which is the only way this stays current without someone
 * remembering to check.
 */

test('the contract names every question type the platform actually supports', () => {
  const missing = [...SUPPORTED_QUESTION_TYPES].filter((type) => !CONTRACT.includes(type));
  assert.deepEqual(missing, [], 'a supported type the contract never names will be invented or avoided');

  const core = [...CORE_QUESTION_TYPES].filter((type) => !CONTRACT.includes(type));
  assert.deepEqual(core, []);
});

test('the contract names every tool and representation a question can use', () => {
  const tools = Object.keys(TOOL_CATALOG).filter((id) => !CONTRACT.includes(id));
  assert.deepEqual(tools, [], 'a tool the contract never names cannot be authored for');

  const representations = Object.values(REPRESENTATIONS).filter((value) => !CONTRACT.includes(value));
  assert.deepEqual(representations, []);
});

test('every catalogued question type has its own build instructions', () => {
  // Naming a type is not the same as telling an AI how to build one.
  const missing = Object.keys(QUESTION_TYPE_CATALOG)
    .filter((type) => !CONTRACT.includes(`### \`${type}\``));
  assert.deepEqual(missing, [], 'a catalogued type with no build entry produces guesswork');
});

test('every slice name resolves to a real contract section', () => {
  // A renamed section would silently drop its rules out of every repair prompt.
  const sections = authoringContractSections({ courseId: 'algebra1' });
  for (const [kind, wanted] of Object.entries(CONTRACT_SLICES)) {
    const missing = wanted.filter((name) => !sections.includes(name));
    assert.deepEqual(missing, [], `${kind} names sections that no longer exist`);
  }
});

test('a slice is cut from the contract, never a second copy of the rules', () => {
  const slice = buildContractSlice({
    sections: ['Live assignment repair boundary'],
    courseId: 'algebra1',
  });
  const body = slice.split('## Live assignment repair boundary')[1];
  assert.ok(body, 'the section must be present');
  // Every line of the slice appears verbatim in the full contract, so the two
  // cannot drift apart.
  for (const line of body.split('\n').filter((entry) => entry.trim())) {
    assert.ok(CONTRACT.includes(line), `slice line not found in the contract: ${line.slice(0, 60)}`);
  }
});

test('a slice stays small enough to paste beside the actual request', () => {
  // The full contract is ~91KB. Prefixing that onto "fix question 3" buries the
  // instruction and hits chat-window limits before the teacher gets to ask.
  for (const [kind, sections] of Object.entries(CONTRACT_SLICES)) {
    const slice = buildContractSlice({ sections, questionTypes: ['algebra'], courseId: 'algebra1' });
    assert.ok(slice.length < 20000, `${kind} slice is ${slice.length} chars, too big to paste`);
    assert.ok(slice.length > 0, `${kind} slice is empty`);
  }
  assert.ok(CONTRACT.length > 60000, 'the full contract is still the complete document');
});

test('a question repair tells an outside AI the rules for that question type', () => {
  const request = buildQuestionRepairRequest({
    assignment: { title: 'Linear Equations', courseId: 'algebra1' },
    question: { type: 'algebra', prompt: 'Solve 2x + 3 = 11.', expected: '4' },
    instruction: 'The equivalent answer 4.0 is being rejected.',
    questionNumber: 3,
  });

  assert.match(request, /### `algebra`/, 'the rules for the type being repaired must travel with it');
  assert.match(request, /Live assignment repair boundary/);
  assert.match(request, /## What to return/);
  // The fields MathMaster owns are named, so they are not invented back in.
  for (const field of ['questionId', 'attempts', 'alignmentKeys']) {
    assert.ok(request.includes(field), `platform-owned field ${field} must be named`);
  }
  // Only the relevant type's build entry, not all twenty-one.
  assert.ok(!request.includes('### `functionInvestigation`'), 'unrelated type entries must not be included');
});

test('every outside-AI request names its audience, its output, and the student-data line', () => {
  const requests = {
    questionRepair: buildQuestionRepairRequest({
      assignment: { title: 'T', courseId: 'algebra1' },
      question: { type: 'algebra', prompt: 'Solve.' },
      instruction: 'Fix the tolerance.',
    }),
    honorsDepth: buildHonorsDepthAiRepairRequest({
      assignmentV5: {
        assignment: { title: 'T', courseId: 'algebra1' },
        sections: [{ id: 's', questions: [{ type: 'algebra' }] }],
      },
      honorsReport: { missing: ['multiRepresentation'] },
    }),
    weightReview: buildAssignmentWeightReviewRequest({
      assignment: { id: 'a1', title: 'T', courseId: 'algebra1' },
      questions: [{ questionId: 'q1', type: 'algebra', prompt: 'Solve.' }],
    }),
  };

  for (const [kind, request] of Object.entries(requests)) {
    assert.match(request, /^# MathMaster/, `${kind} must open by naming itself`);
    assert.match(request, /JSON/, `${kind} must say the output is JSON`);
    // Every one of these states the student-data line rather than staying
    // silent about it. Checking for the ABSENCE of those words would pass on a
    // prompt that never mentions the rule at all, and fail on one that
    // correctly forbids it.
    assert.match(
      request,
      /student (?:information|IDs|names)|Never add student|Do not include student/i,
      `${kind} must state the student-data prohibition`,
    );
  }
});

test('no outside-AI prompt explains the internal endpoint to a teacher', () => {
  // These are pasted into someone else's chat window. Internal plumbing in that
  // text means nothing to the teacher and nothing to the model reading it.
  const surfaces = [
    'src/platform/contract/questionRepairRequest.js',
    'src/platform/contract/honorsDepthAiRepair.js',
    'src/platform/grading/weightReviewPack.js',
    'src/components/teacher/LessonPreflightModal.jsx',
  ];
  for (const path of surfaces) {
    const source = fs.readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /embedded AI endpoint/i, `${path} still explains internal plumbing in a portable prompt`);
  }
});

test('the platform-owned field list is shared, not restated per prompt', () => {
  assert.ok(PLATFORM_OWNED_FIELDS.length > 10);
  assert.ok(PLATFORM_OWNED_FIELDS.includes('questionId'));
  assert.ok(PLATFORM_OWNED_FIELDS.includes('attemptPolicy'));
});
