/*
 * A DEVICE PIN THE QUESTION DROPPED IS REPLACED BY WHAT WAS SHOWN (Batch 3).
 *
 * A device pin that the server would refuse, or that no longer replays, is
 * dropped for the render and the student is shown a fresh allocation
 * (problemGenerator.js, `familyPinNotice`). Before this, writeLocalDeliveryPin
 * refused to overwrite ANY stored pin, so the dropped one stayed and was
 * dropped again on every render: the question followed whatever the
 * allocation was at that moment. A provisional student seated by the teacher's
 * app a minute later was handed different numbers mid-question (PR #430
 * review). The same held for a stored pin this build cannot read at all.
 *
 * What must hold:
 *   - the shown delivery replaces a dropped or unreadable pin, so the next
 *     render — whatever the seat map says by then — shows the same question;
 *   - a pin the device can still use is never overwritten (the first render
 *     is the one the student may be working on);
 *   - the student's work is not keyed by the instance, so it stays put.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateQuestion } from '../../src/problemGenerator.js';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { buildStudentFamilyContext, localDeliveryPinKey, readLocalDeliveryPin, writeLocalDeliveryPin } from '../../src/platform/generation/familyDelivery.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const CLASS = 'class-p2';
const ASSIGNMENT_ID = 'asg-device-pins';
const TWO_STEP = { questionId: 'q1-two-step', type: 'stepAlgebra', prompt: 'Solve for x.', activityRole: 'classwork', questionFamily: { id: 'linear.twoStepEquation' } };

const memoryStore = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    snapshot: () => JSON.stringify([...map.entries()].sort()),
  };
};

const assignmentSeating = (students) => {
  const assignment = { id: ASSIGNMENT_ID, schemaVersion: 5, generationSeats: { version: 1, byClassId: {} } };
  assignment.generationSeats.byClassId[CLASS] = planSeatAdditions({ assignment, classId: CLASS, studentIds: students });
  return assignment;
};

// What App.jsx does for one render: build the context, generate, and pin what
// QuestionEngine reports as shown (handleFamilyDelivery).
const renderAndPin = ({ assignment, studentId, store }) => {
  const context = buildStudentFamilyContext({ assignment, question: TWO_STEP, storageIndex: 0, studentId, classId: CLASS, store });
  const rendered = generateQuestion(TWO_STEP, `${assignment.id}|${studentId}|0|variant:0`, null, null, context);
  assert.ok(rendered.familyDelivery, 'a family question reports what it showed');
  writeLocalDeliveryPin({ studentId, delivery: rendered.familyDelivery, store, devicePinDropped: Boolean(rendered.familyPinNotice) });
  return rendered;
};

// A student who is not seated yet, whose seated allocation (once seated) is a
// different instance from their provisional one — the case where a swap shows.
const provisionalThenSeated = () => {
  for (let index = 0; index < 40; index += 1) {
    const studentId = `stu-late-${index}`;
    const before = assignmentSeating(['stu-ana', 'stu-ben']);
    const after = assignmentSeating(['stu-ana', 'stu-ben', studentId]);
    const provisional = renderAndPin({ assignment: before, studentId, store: memoryStore() }).familyDelivery;
    const seated = renderAndPin({ assignment: after, studentId, store: memoryStore() }).familyDelivery;
    if (provisional.fingerprint !== seated.fingerprint) return { studentId, before, after, provisional, seated };
  }
  throw new Error('no student whose provisional and seated instances differ');
};

test('a dropped device pin is replaced by the shown delivery, so seating the student later swaps nothing', () => {
  const { studentId, before, after, provisional, seated } = provisionalThenSeated();
  assert.equal(provisional.basis, 'provisional');
  assert.equal(seated.basis, 'seated');
  const store = memoryStore();
  // A pin on this device that no longer replays (its family was re-tuned).
  writeLocalDeliveryPin({ studentId, delivery: { ...provisional, fingerprint: 'linear.twoStepEquation:1|1|1' }, store });

  const first = renderAndPin({ assignment: before, studentId, store });
  assert.ok(first.familyPinNotice, 'the stale pin was dropped for this render');
  assert.equal(first.familyDelivery.fingerprint, provisional.fingerprint, 'the student is shown their provisional allocation');
  assert.equal(readLocalDeliveryPin({ studentId, slotKey: provisional.slot, variant: 0, store })?.fingerprint, provisional.fingerprint,
    'the dropped pin is replaced by what was shown');

  // The teacher's app seats the student a minute later, before any submission.
  const second = renderAndPin({ assignment: after, studentId, store });
  assert.equal(second.familyDelivery.fingerprint, provisional.fingerprint, 'the question the student started stays on screen');
  assert.notEqual(second.familyDelivery.fingerprint, seated.fingerprint);
  assert.equal(second.familyPinNotice, undefined, 'and nothing is dropped any more');
});

test('a stored pin this build cannot read is replaced, deterministically, by the shown delivery', () => {
  const { studentId, before, after, provisional } = provisionalThenSeated();
  const store = memoryStore();
  const key = localDeliveryPinKey({ studentId, slotKey: provisional.slot, variant: 0 });
  store.setItem(key, '{"familyId":"linear.twoStepEquation"');
  const first = renderAndPin({ assignment: before, studentId, store });
  assert.equal(first.familyDelivery.fingerprint, provisional.fingerprint);
  assert.equal(JSON.parse(store.getItem(key)).fingerprint, provisional.fingerprint, 'the unreadable pin is overwritten');
  assert.equal(renderAndPin({ assignment: after, studentId, store }).familyDelivery.fingerprint, provisional.fingerprint);
  // A truncated but parseable pin is just as unreadable.
  const other = memoryStore();
  other.setItem(key, JSON.stringify({ familyId: 'linear.twoStepEquation' }));
  renderAndPin({ assignment: before, studentId, store: other });
  assert.equal(JSON.parse(other.getItem(key)).fingerprint, provisional.fingerprint);
});

test('a pin the device can still use is never overwritten, whatever is reported', () => {
  const { studentId, before, after, provisional, seated } = provisionalThenSeated();
  const store = memoryStore();
  renderAndPin({ assignment: before, studentId, store });
  const pinned = store.snapshot();
  // A different delivery reported without the question having dropped the pin.
  assert.equal(writeLocalDeliveryPin({ studentId, delivery: seated, store }), false);
  // Reported as dropped, but naming the very pin that is stored: nothing to replace.
  assert.equal(writeLocalDeliveryPin({ studentId, delivery: provisional, store, devicePinDropped: true }), false);
  assert.equal(store.snapshot(), pinned);
  assert.equal(renderAndPin({ assignment: after, studentId, store }).familyDelivery.fingerprint, provisional.fingerprint);
});

test('the student\'s work is keyed by question and variant, never by the instance, so a replacement keeps it', () => {
  const key = buildQuestionDraftKey({ studentId: 'stu-ana', assignmentId: ASSIGNMENT_ID, questionIndex: 0, variantIndex: 0 });
  assert.doesNotMatch(key, /linear\.twoStep|fingerprint/);
  const source = readFileSync(new URL('../../src/questionDraftStorage.js', import.meta.url), 'utf8');
  const builder = region(executableSource(source), 'export const buildQuestionDraftKey', '};');
  assert.doesNotMatch(builder, /fingerprint|familyDelivery|delivery/);
});

test('App.jsx pins what was shown and says when the question dropped the device pin', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\bwriteLocalDeliveryPin\b[^}]*\} from '\.\/platform\/generation\/familyDelivery\.js'/);
  const handler = region(app, 'const handleFamilyDelivery = useCallback(', '}, [');
  assert.match(handler, /\(delivery, renderedQuestion\) =>/);
  assert.match(handler, /writeLocalDeliveryPin\(\{ studentId: user\.id, delivery, devicePinDropped: Boolean\(renderedQuestion\?\.familyPinNotice\) \}\)/);
  // QuestionEngine hands the rendered question (which carries the notice) with the delivery.
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  assert.match(engine, /onFamilyDelivery\(familyDelivery, processedQuestion\)/);
});
