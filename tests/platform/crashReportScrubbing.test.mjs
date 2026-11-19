/*
 * WHAT A CRASH REPORT CAN CARRY, TESTED AS AN ADVERSARY WOULD.
 *
 * functions/shared/crashReport.mjs builds the only thing that may leave a
 * device on its own: a count in a bucket. These tests feed it what must never
 * leave (emails, student numbers, names, typed answers, question text, URLs,
 * tokens, long content) through every field, and check the whole bucket, not a
 * field at a time. Synthetic values only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRASH_KINDS,
  SCREEN_WORDS,
  SIGNATURE_LIMIT,
  SIGNATURE_VOCABULARY,
  WIDESPREAD_REPORTERS,
  clampCrashCount,
  crashBucketId,
  crashSignature,
  normalizeCrashBucket,
  resolveCrashReportingMode,
  safeIdentifier,
  screenTemplate,
  summarizePlatformHealth,
} from '../../functions/shared/crashReport.mjs';
import { MATH_PATH_TABS, TEACHER_ADMIN_TABS, TEACHER_TABS, studentPathFor, teacherPathFor } from '../../src/app/routes/appUrl.js';

// What must never appear in anything sent. Each is distinctive enough that
// finding it in a bucket means it leaked.
const SECRETS = [
  'rowan.example@school.example', 'Rowan', 'Example', 'Quillfeather',
  '4417829931', '90210077', 'S_48213',
  '\\frac{3}{\\sqrt{7}}', 'sqrt', 'frac', '3x+7=22', 'x=5',
  'How many apples does Priya have', 'Priya', 'apples',
  'SECRETTOKEN', 'eyJhbGciOi', 'https://', 'web.app',
  'abc123XYZassignment', 'lmr-wu-1',
];

const hostileMessages = [
  'Failed for student 4417829931 (rowan.example@school.example) at https://x.web.app/a?token=SECRETTOKEN',
  "Unexpected token '\\frac{3}{\\sqrt{7}}' in Rowan Quillfeather's answer 3x+7=22",
  'Undefined symbol Priya while evaluating "How many apples does Priya have"',
  "Cannot read properties of undefined (reading 'Quillfeather')",
  'x=5 is not a function for S_48213 / 90210077',
  `Error: ${'Rowan Example '.repeat(200)}`,
  'TypeError\n    at Quillfeather (https://x.web.app/assets/index-abc123XYZassignment.js:1:2)',
  'eyJhbGciOi.SECRETTOKEN.Example',
  'r o w a n . e x a m p l e @ s c h o o l',
  'ROWAN EXAMPLE rowan EXAMPLE',
];

const assertClean = (value, label) => {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) {
    assert.ok(!text.toLowerCase().includes(secret.toLowerCase()), `${label}: "${secret}" left the device in ${text}`);
  }
  assert.doesNotMatch(text, /@/, `${label}: an @ survived`);
  assert.doesNotMatch(text, /\d{5,}/, `${label}: a long digit run survived in ${text}`);
};

test('an error signature holds only words from the fixed list, "_" and "#"', () => {
  for (const message of hostileMessages) {
    const signature = crashSignature(message);
    assert.ok(signature.length <= SIGNATURE_LIMIT);
    for (const word of signature.match(/[A-Za-z]+/g) || []) {
      assert.ok(SIGNATURE_VOCABULARY.has(word), `"${word}" is not in the vocabulary (from ${message.slice(0, 60)})`);
    }
    assert.doesNotMatch(signature, /\d/, 'a digit survived');
    assert.match(signature, /^[a-z_#(): ]+$/);
    assertClean(signature, 'signature');
  }
});

test('a signature still says what went wrong', () => {
  assert.equal(crashSignature("TypeError: Cannot read properties of undefined (reading 'latex')"), "typeerror: cannot read properties of undefined (reading _)");
  assert.equal(crashSignature('Maximum call stack size exceeded'), 'maximum call stack size exceeded');
  assert.equal(crashSignature('Unexpected token < in JSON at position 4417'), 'unexpected token in json at position #');
  assert.equal(crashSignature('4417829931 Rowan'), 'none', 'nothing recognisable is "none", not a row of blanks');
  assert.equal(crashSignature(null), 'none');
});

test('the signature is idempotent: the server re-applies it to what it is sent', () => {
  for (const message of [...hostileMessages, "Cannot read properties of null (reading 'x')", 'a (b) c: d, e.', "can't read 'x' (of y) :z", '( ( a ) ) . , :']) {
    const once = crashSignature(message);
    assert.equal(crashSignature(once), once);
  }
});

test('the vocabulary has no digits, no capitals and none of the names it deliberately leaves out', () => {
  for (const word of SIGNATURE_VOCABULARY) assert.match(word, /^[a-z]+$/);
  for (const name of ['max', 'may', 'will', 'mark', 'page', 'case', 'long', 'rowan', 'grace', 'hunter']) {
    assert.ok(!SIGNATURE_VOCABULARY.has(name), `"${name}" can be a person's name`);
  }
});

test('an identifier refuses anything that could be a person', () => {
  assert.equal(safeIdentifier('radical-step-algebra'), 'radical-step-algebra');
  assert.equal(safeIdentifier('StepByStepAlgebra'), 'StepByStepAlgebra');
  for (const bad of ['rowan.example@school.example', 'Rowan Example', 'S_4417829931', '4417829931', 'a'.repeat(49), '', null, { toString: () => 'x y' }, '<script>']) {
    assert.equal(safeIdentifier(bad), 'none', JSON.stringify(bad));
  }
});

test('a screen is a route template: every id in the address is replaced', () => {
  assert.equal(screenTemplate('/assignments/abc123XYZassignment/warm-up/3'), '/assignments/:id/:id/:id');
  assert.equal(screenTemplate('/student/rowan.example@school.example/assignments'), '/:id/:id/assignments');
  assert.equal(screenTemplate('/path/session/A.5A?launch=SECRETTOKEN#x=5'), '/path/session/:id');
  assert.equal(screenTemplate('/teacher/admin/coverage'), '/teacher/admin/coverage');
  assert.equal(screenTemplate(''), '/');
  assert.equal(screenTemplate('/a/b/c/d/e/f/g/h/i'), '/:id/:id/:id/:id/:id/:id', 'bounded depth');
});

test('every fixed word of a real address is kept: appUrl has no route word this list lacks', () => {
  const paths = [
    ...['assignments', 'assignmentsCenter', 'grades', 'rewards', 'mathPath', 'secureExams', 'testCycle', 'liveChallenge'].map((dashboardMode) => studentPathFor({ surface: 'dashboard', dashboardMode })),
    ...MATH_PATH_TABS.map((tab) => studentPathFor({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab } })),
    ...TEACHER_TABS.map((tab) => teacherPathFor({ surface: 'workspace', tab })),
    ...TEACHER_ADMIN_TABS.map((adminTab) => teacherPathFor({ surface: 'administration', adminTab })),
  ];
  assert.ok(paths.length > 30);
  for (const path of paths) assert.equal(screenTemplate(path), path === '/' ? '/' : path, `${path} has a segment SCREEN_WORDS lacks`);
  for (const word of SCREEN_WORDS) assert.match(word, /^[a-z-]+$/);
});

test('a whole bucket built from hostile input carries nothing identifying, in either mode', () => {
  for (const mode of ['family', 'question']) {
    for (const message of hostileMessages) {
      const bucket = normalizeCrashBucket({
        build: 'rowan.example@school.example',
        kind: 'Rowan Example crashed',
        source: 'S_4417829931',
        role: 'rowan.example@school.example',
        screen: '/assignments/abc123XYZassignment/Rowan/4417829931?token=SECRETTOKEN',
        family: 'How many apples does Priya have',
        questionType: 'rowan.example@school.example',
        signature: message,
        message,
        assignmentId: 'Rowan Example',
        questionId: 'rowan.example@school.example',
        studentId: 'S_48213', name: 'Rowan Example', answer: 'x=5', stack: 'at Quillfeather', email: 'rowan.example@school.example',
      }, { mode, role: 'rowan.example@school.example' });
      assertClean(bucket, `${mode} bucket`);
      const allowed = ['build', 'kind', 'source', 'role', 'screen', 'family', 'questionType', 'signature', 'assignmentId', 'questionId'];
      assert.deepEqual(Object.keys(bucket).filter((key) => !allowed.includes(key)), [], 'no field outside the closed shape');
      assert.equal(bucket.kind, 'other');
      assert.equal(bucket.build, 'unknown');
      assert.equal(bucket.role, 'student');
    }
  }
});

test('the question is named only in question mode, and only as a content id', () => {
  const raw = { build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', screen: '/assignments/a1/practice/2', family: 'radical-step', questionType: 'StepByStepAlgebra', message: 'x is not a function', assignmentId: 'a1B2c3', questionId: 'q-7' };
  const family = normalizeCrashBucket(raw, { mode: 'family' });
  assert.equal('assignmentId' in family, false);
  assert.equal('questionId' in family, false);
  assert.deepEqual(family, { build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', role: 'student', screen: '/assignments/:id/:id/:id', family: 'radical-step', questionType: 'StepByStepAlgebra', signature: '_ is not a function' });
  const question = normalizeCrashBucket(raw, { mode: 'question', role: 'teacher' });
  assert.equal(question.assignmentId, 'a1B2c3');
  assert.equal(question.questionId, 'q-7');
  assert.equal(question.role, 'teacher');
  assert.notEqual(crashBucketId(family), crashBucketId(question));
  assert.match(crashBucketId(family), /^[0-9a-f]{16}$/);
  assert.equal(crashBucketId(family), crashBucketId(normalizeCrashBucket(family, { mode: 'family' })), 'rebuilding a bucket on the server names the same bucket');
});

test('counts and modes are bounded', () => {
  assert.equal(clampCrashCount(1e9), 25);
  for (const bad of [0, -4, NaN, 'x', null, undefined, Infinity]) assert.equal(clampCrashCount(bad), 1);
  assert.equal(resolveCrashReportingMode(null), 'off');
  assert.equal(resolveCrashReportingMode({}), 'off');
  assert.equal(resolveCrashReportingMode({ mode: 'everything' }), 'off');
  assert.equal(resolveCrashReportingMode({ mode: 'question' }), 'question');
  assert.ok(CRASH_KINDS.includes('question-module-error'));
});

const bucketOf = (overrides = {}) => ({
  build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', role: 'student', screen: '/assignments/:id/:id/:id',
  family: 'radical-step', questionType: 'StepByStepAlgebra', signature: '_ is not a function', count: 1, reporters: 1, ...overrides,
});

test('the view is told what is new, what is widespread and what is rising', () => {
  const steady = bucketOf({ family: 'steady', count: 3, reporters: 2 });
  const days = [
    { day: '2026-11-13', total: 3, buckets: { a: steady } },
    { day: '2026-11-14', total: 3, buckets: { a: steady } },
    { day: '2026-11-15', total: 5, buckets: { a: steady, r: bucketOf({ family: 'rising', count: 2 }) } },
    {
      day: '2026-11-16', total: 60, overflow: 2,
      buckets: {
        a: steady,
        r: bucketOf({ family: 'rising', count: 12, reporters: 3 }),
        n: bucketOf({ family: 'brand-new', count: 1 }),
        w1: bucketOf({ family: 'stuck-question', count: 30, reporters: WIDESPREAD_REPORTERS }),
        w2: bucketOf({ family: 'stuck-question', count: 4, reporters: 2, screen: '/path/session/:id' }),
      },
    },
  ];
  const summary = summarizePlatformHealth({ days, today: '2026-11-16' });
  const byFamily = Object.fromEntries(summary.issues.map((issue) => [issue.family, issue]));
  assert.deepEqual(byFamily.steady.signals, []);
  assert.deepEqual(byFamily.rising.signals, ['rising']);
  assert.deepEqual(byFamily['brand-new'].signals, ['new']);
  assert.deepEqual(byFamily['stuck-question'].signals, ['widespread', 'new']);
  assert.equal(byFamily['stuck-question'].today, 34, 'one issue across two screens');
  assert.equal(byFamily['stuck-question'].reportersToday, WIDESPREAD_REPORTERS, 'accounts are not double counted across buckets');
  assert.equal(summary.issues[0].family, 'stuck-question', 'the widespread failure is first');
  assert.deepEqual(summary.alerts.map((issue) => issue.family).sort(), ['brand-new', 'rising', 'stuck-question']);
  assert.deepEqual(summary.totals.at(-1), { day: '2026-11-16', total: 60, overflow: 2 });
  // Yesterday's failure is not an alert today.
  assert.deepEqual(summarizePlatformHealth({ days, today: '2026-11-17' }).alerts, []);
  assert.deepEqual(summarizePlatformHealth({}).issues, []);
});
