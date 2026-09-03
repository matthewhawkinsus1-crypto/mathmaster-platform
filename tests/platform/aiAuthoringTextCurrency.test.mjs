import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { REPRESENTATIONS } from '../../src/platform/contract/questionTypeCatalog.js';
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
import { buildFixRequest } from '../../src/platform/contract/authoringContract.js';
import {
  DEFAULT_QUESTION_WEIGHT,
  MAX_QUESTION_WEIGHT,
  MIN_QUESTION_WEIGHT,
} from '../../src/platform/grading/questionWeights.js';

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

test('the contract teaches what a question must DO, not which renderer to reach for', () => {
  // The public contract deliberately does not carry a renderer/type catalog.
  // Naming internal types taught outside AI to author plumbing, which then
  // contradicted the semantic contract and failed import. The vocabulary an
  // author actually needs is studentActions.
  assert.match(CONTRACT, /## Common studentActions/);
  assert.match(CONTRACT, /studentActions/);
  assert.doesNotMatch(
    CONTRACT,
    /## How to build each question type|## Interactive tool types/,
    'public guidance must not reintroduce internal renderer or tool catalogs',
  );
});

test('every representation a source can demand is still described', () => {
  // Representation fidelity IS semantic — a graph task must show a graph — so
  // these survive even though renderer types do not. They are described in the
  // author's words rather than as enum ids, which is the point of the semantic
  // contract, so this checks the words a person would actually write.
  const PROSE = Object.freeze({
    graph: 'graph',
    numberLine: 'number line',
    table: 'table',
    mapping: 'mapping',
    orderedPairs: 'ordered pair',
    symbolic: 'symbolic',
    text: 'text',
    interactive: 'interactive',
  });
  const lower = CONTRACT.toLowerCase();
  const known = Object.values(REPRESENTATIONS);
  // Every representation the platform defines must have a phrase here, so a new
  // one cannot be added without deciding how an author is told about it.
  const undocumented = known.filter((value) => !PROSE[value]);
  assert.deepEqual(undocumented, [], 'a new representation needs author-facing wording');

  const missing = known.filter((value) => !lower.includes(PROSE[value].toLowerCase()));
  assert.deepEqual(missing, [], 'a representation the contract never describes cannot be honoured');
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
    const slice = buildContractSlice({ sections, courseId: 'algebra1' });
    assert.ok(slice.length < 20000, `${kind} slice is ${slice.length} chars, too big to paste`);
    assert.ok(slice.length > 0, `${kind} slice is empty`);
  }
  assert.ok(CONTRACT.length > 40000, 'the full contract is still the complete document');
});

test('a question repair tells an outside AI the rules for that question type', () => {
  const request = buildQuestionRepairRequest({
    assignment: { title: 'Linear Equations', courseId: 'algebra1' },
    question: { type: 'algebra', prompt: 'Solve 2x + 3 = 11.', expected: '4' },
    instruction: 'The equivalent answer 4.0 is being rejected.',
    questionNumber: 3,
  });

  assert.match(request, /## Question authoring/, 'the authoring rules must travel with the repair');
  assert.match(request, /## Common studentActions/);
  assert.match(request, /Live assignment repair boundary/);
  assert.match(request, /## What to return/);
  // The fields MathMaster owns are named, so they are not invented back in.
  for (const field of ['questionId', 'attempts', 'alignmentKeys']) {
    assert.ok(request.includes(field), `platform-owned field ${field} must be named`);
  }
  // The repair carries the semantic rules, never a renderer catalog.
  assert.doesNotMatch(request, /## How to build each question type/);
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


test('a field the schema validates is a field the contract explains', () => {
  // questionWeight was validated by assignmentSchemaV5 and never mentioned in
  // the contract, so every AI-authored assignment arrived with everything
  // weighted equally and a teacher had to run a separate review to fix work the
  // author already understood. This is the general shape of that bug.
  assert.match(CONTRACT, /questionWeight/);
  assert.ok(
    CONTRACT.includes(`${MIN_QUESTION_WEIGHT} to ${MAX_QUESTION_WEIGHT}`),
    'the documented range must be the range the validator enforces',
  );
  assert.ok(CONTRACT.includes(`defaults to ${DEFAULT_QUESTION_WEIGHT}`));
});

test('teacher decisions about a live assignment are never authoring input', () => {
  // Setting these overrides a choice a person made in the UI.
  for (const field of ['teacherExcluded', 'archived']) {
    assert.ok(PLATFORM_OWNED_FIELDS.includes(field), `${field} must be platform-owned`);
  }
});

test('a rejected import is returned with the rules for the types it contains', () => {
  // A model asked to fix an import whose rules it cannot see tends to "fix" it
  // by switching to a type it does remember, which fails the next import for a
  // brand new reason.
  const rawJson = JSON.stringify({
    schemaVersion: 5,
    sections: [{ role: 'practice', questions: [{ type: 'algebra', prompt: 'Solve.' }] }],
  });
  const request = buildFixRequest({ rawJson, errors: ['Question 1 is missing studentActions.'] });

  assert.match(request, /## Question authoring/);
  assert.match(request, /## Common studentActions/);
  assert.doesNotMatch(request, /## How to build each question type/, 'a rejected import gets semantic rules, not plumbing');
  assert.match(request, /## The V5 JSON to fix/);
});
