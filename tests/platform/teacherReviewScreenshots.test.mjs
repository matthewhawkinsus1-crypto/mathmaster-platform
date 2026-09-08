import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCREENSHOT_DATA_URL_BYTES,
  attachScreenshotToFlag,
  buildTeacherReviewScreenshotRecord,
  detachScreenshotFromFlag,
  screenshotIdsInContext,
} from '../../src/platform/preflight/teacherReviewScreenshot.js';
import { addTeacherReviewFlag, emptyTeacherReviewContext } from '../../src/platform/preflight/teacherReviewContext.js';
import { buildQuestionRepairRequest } from '../../src/platform/contract/questionRepairRequest.js';
import { buildAssignmentRepairCenterModel } from '../../src/platform/preflight/assignmentRepairCenterModel.js';
import { buildQuestionBatchRepairPacket } from '../../src/platform/contract/questionBatchRepairPacket.js';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const contextWithFlag = () => addTeacherReviewFlag(emptyTeacherReviewContext(), {
  scope: 'question',
  targetId: 'q-1',
  category: 'rendering',
  severity: 'needsEditing',
  note: 'The axis labels overlap the plotted points.',
  flagId: 'flag-1',
}, { flagId: 'flag-1' });

test('a screenshot is stored as its own record, owned and traceable', () => {
  const record = buildTeacherReviewScreenshotRecord({
    dataUrl: pixel,
    ownerUid: 'teacher-uid',
    assignmentId: 'assignment-1',
    questionId: 'q-1',
    flagId: 'flag-1',
  });

  assert.equal(record.ownerUid, 'teacher-uid');
  assert.equal(record.assignmentId, 'assignment-1');
  assert.equal(record.questionId, 'q-1');
  assert.equal(record.mediaType, 'image/png');
  assert.ok(record.id, 'a screenshot needs an id the flag can point at');
  assert.ok(record.byteSize > 0);
});

test('a screenshot too large for a Firestore document is refused with a way forward', () => {
  const huge = `data:image/png;base64,${'A'.repeat(MAX_SCREENSHOT_DATA_URL_BYTES + 10)}`;
  assert.throws(
    () => buildTeacherReviewScreenshotRecord({ dataUrl: huge, ownerUid: 'teacher-uid', assignmentId: 'assignment-1' }),
    /over the \d+KB limit/,
    'an oversized image must be refused here with an explanation, not written and bounced by Firestore',
  );
});

test('non-image and unowned attachments are refused', () => {
  assert.throws(
    () => buildTeacherReviewScreenshotRecord({ dataUrl: 'data:text/html;base64,PHNjcmlwdD4=', ownerUid: 'u', assignmentId: 'a' }),
    /must be a base64 image data URL/,
  );
  assert.throws(
    () => buildTeacherReviewScreenshotRecord({ dataUrl: pixel, ownerUid: '', assignmentId: 'a' }),
    /must record the teacher who captured it/,
  );
});

test('a flag points at one screenshot, and replacing swaps it rather than accumulating', () => {
  let context = attachScreenshotToFlag(contextWithFlag(), 'flag-1', 'shot-a');
  assert.deepEqual(screenshotIdsInContext(context), ['shot-a']);

  context = attachScreenshotToFlag(context, 'flag-1', 'shot-b');
  assert.deepEqual(screenshotIdsInContext(context), ['shot-b'], 'replacing must leave exactly one screenshot on the flag');

  context = detachScreenshotFromFlag(context, 'flag-1');
  assert.deepEqual(screenshotIdsInContext(context), [], 'removing must leave the flag with no screenshot');
  assert.equal(context.flags[0].note, 'The axis labels overlap the plotted points.', 'removing the picture must not touch the words');
});

test('the note survives the screenshot: evidence supplements it, never replaces it', () => {
  const context = attachScreenshotToFlag(contextWithFlag(), 'flag-1', 'shot-a');
  const flag = context.flags[0];
  assert.equal(flag.note, 'The axis labels overlap the plotted points.');
  assert.equal(flag.screenshotId, 'shot-a');
  assert.equal(flag.status, 'open', 'attaching evidence must not close the teacher flag');
});

/*
 * THE COST REQUIREMENT, ASSERTED WHERE IT WOULD ACTUALLY BREAK.
 *
 * The compact package is what gets pasted into a model. Base64 image data in it
 * is expensive and useless — the image cannot help a text repair, and a single
 * screenshot can dwarf the question JSON it is attached to.
 *
 * This holds structurally rather than by discipline: the flag stores an id and
 * the bytes live in another collection, so there is nothing in the review
 * context for the builder to leak. These assertions are what would catch
 * somebody deciding to "just inline it" later.
 */
const assignmentV5 = {
  schemaVersion: 5,
  title: 'Screenshot cost',
  sections: [{ id: 'sec-1', role: 'classwork', questions: [{ questionId: 'q-1' }] }],
};

test('the single-question repair request carries the note and no image data', () => {
  const context = attachScreenshotToFlag(contextWithFlag(), 'flag-1', 'shot-a');
  const request = buildQuestionRepairRequest({
    assignment: { title: 'Screenshot cost', courseId: 'algebra1' },
    question: { questionId: 'q-1', prompt: 'Describe the translation.' },
    instruction: context.flags[0].note,
    questionNumber: 1,
  });

  assert.match(request, /axis labels overlap/, 'the written note is what the AI is asked to act on');
  assert.doesNotMatch(request, /data:image/, 'a repair request must never carry base64 image data to a model');
  assert.doesNotMatch(request, /iVBORw0KGgo/, 'no PNG payload may reach the prompt');
});

test('the batch repair packet carries teacher constraints and no image data', () => {
  const context = attachScreenshotToFlag(contextWithFlag(), 'flag-1', 'shot-a');
  const packet = buildQuestionBatchRepairPacket({
    assignmentV5,
    repairCenterModel: buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [], teacherReviewContext: context }),
    selectedQuestionIds: ['q-1'],
    assignmentId: 'assignment-1',
    baseRevision: 1,
  });

  const serialized = JSON.stringify(packet);
  assert.match(serialized, /axis labels overlap/, 'the note must travel with the packet');
  assert.doesNotMatch(serialized, /data:image/, 'the packet must never carry base64 image data');

  // The id may travel — it is a short string and it is how Repair Center finds
  // the evidence. What must never travel is the image itself.
  assert.ok(serialized.length < 20_000, `packet stayed compact: ${serialized.length} bytes`);
});

/*
 * WIRING. The logic above is worthless if no screen reaches it.
 */
import { readFileSync } from 'node:fs';
import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';

const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

test('a teacher can attach, replace and remove a screenshot where they see the student view', () => {
  assert.match(panelSource, /prepareScreenshotDataUrl/, 'captured images must be shrunk before storage, not refused for being a normal screenshot');
  assert.match(panelSource, /screenshotFileFromPaste/, 'pasting is how a teacher actually attaches a screenshot');
  assert.match(panelSource, /saveTeacherReviewScreenshot/);
  assert.match(panelSource, /removeSavedScreenshot/);
  assert.match(panelSource, /replaceSavedScreenshot/);
  assert.match(panelSource, /Attach screenshot/i);
});

/*
 * The gesture teachers actually use: take the screenshot, click into the note,
 * Ctrl-V. The first version of this feature put the paste target on a dashed
 * box beside the note field, which meant pasting while writing the note did
 * nothing at all — the textarea is a sibling, so the event never reached it.
 * A paste target the teacher has to go and find first is one that does not get
 * used.
 */
test('pasting a screenshot into the note field attaches it', () => {
  const start = panelSource.indexOf('<textarea');
  assert.notEqual(start, -1, 'the panel must have a note field');
  const field = panelSource.slice(start, panelSource.indexOf('/>', start));

  assert.match(field, /onPaste=\{handleScreenshotPaste\}/,
    'the note field itself must accept a pasted image; a paste area beside it is not where a teacher pastes');
  assert.match(field, /Ctrl-V/,
    'the placeholder should say so, because nothing else on screen reveals it');
});

test('pasting ordinary text into the note still behaves normally', () => {
  const start = panelSource.indexOf('const handleScreenshotPaste');
  const handler = panelSource.slice(start, panelSource.indexOf('const attachScreenshot', start));

  assert.match(handler, /if \(!file\) return;/,
    'a paste with no image must fall through untouched');
  assert.ok(
    handler.indexOf('if (!file) return;') < handler.indexOf('preventDefault'),
    'preventDefault must come after the image check, or pasting text into the note would silently do nothing',
  );
});

test('the note is still required, so evidence supplements it rather than replacing it', () => {
  const start = panelSource.indexOf('const saveFlag');
  const handler = panelSource.slice(start, panelSource.indexOf('const attachScreenshot', start));
  assert.match(handler, /Write the repair note before saving the flag/,
    'a screenshot with no words gives a repairing AI nothing to act on; the note is what becomes the constraint');

  // Matched on the guarantee, not the spelling: `!String(note||'').trim()` and
  // `!clean(note)` are the same rule, and pinning one of them makes an ordinary
  // refactor look like a regression while a real one — dropping note from the
  // condition entirely — is what must fail.
  const button = panelSource.slice(panelSource.indexOf('onClick={saveFlag}'));
  const disabled = button.slice(button.indexOf('disabled={'), button.indexOf('style='));
  assert.match(disabled, /\bnote\b/,
    'saving must stay disabled until the note is written, screenshot or not');
});

test('the screenshot is written before the flag that points at it', () => {
  const start = panelSource.indexOf('const saveFlag');
  const handler = panelSource.slice(start, panelSource.indexOf('const attachScreenshot', start));
  assert.ok(
    handler.indexOf('saveTeacherReviewScreenshot') < handler.indexOf('addTeacherReviewFlag'),
    'writing the flag first would leave it pointing at a screenshot that does not exist if the image write fails',
  );
});

test('Repair Center shows the evidence beside the note it belongs to', () => {
  const editor = assignmentQuestionEditorSource();
  assert.match(editor, /loadTeacherReviewScreenshot/, 'the Repair Center must fetch the images it displays');
  assert.match(editor, /screenshotIdsInContext/, 'it must know which screenshots a context references');
  assert.match(editor, /<img/, 'the screenshot must actually be rendered, not merely fetched');
  assert.match(editor, /flag\.note/, 'the written note must appear beside it');
});

test('Repair Center loads images only while it is open', () => {
  const editor = assignmentQuestionEditorSource();
  const start = editor.indexOf('if (!repairOpen) return undefined;');
  assert.notEqual(start, -1,
    'screenshot loading must be gated on the Repair Center being open; fetching them with the review context would drag base64 into every read of a teacher note');
});
