import test from 'node:test';
import assert from 'node:assert/strict';

import buildDefault, {
  buildParabolaGeometryLabReview,
  implemented,
} from '../../src/tools/shared/reviews/parabolaGeometryLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { TOOLS_WITH_SOLUTION_REVIEW_BUILDER, buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * THE PARABOLA GEOMETRY REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Parabola Geometry Lab question is closed, its review lists the
 * results of the view the student saw — the focus, directrix and latus rectum;
 * the two distances from P and the Yes/No; the vertex and p from a focus and
 * directrix; or 4p and the opening — with the worked steps that reach them.
 * Every review here is turned back into the work a student following it would
 * submit (the numbers it states, typed into the lab's boxes, exact and
 * rounded; the Yes/No and the opening it names) and graded by the shared
 * grader the server records with (gradeToolWork). It must come back correct,
 * with full credit. All four graded views are covered.
 *
 * A question no answer can be right for, or that the lab cannot render, or
 * that sets nothing the view reads, gets no review at all — and no input
 * makes the builder throw.
 */

const TOOL_ID = 'parabolaGeometryLab';
const q = (fields) => ({ type: TOOL_ID, ...fields });
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

/* ------------------------------------------------------------ helpers */

const ascii = (text) => String(text).replace(/−/g, '-').trim();
const isTypedNumber = (text) => /^-?(?:\d+(?:\.\d+)?)(?:\/\d+)?$/.test(ascii(text));

// What a student can type for a stated value: the exact number or fraction
// before "≈", and the rounded decimal after it. A surd (√10) is not typeable,
// so only its decimal is.
const typings = (value) => {
  const [exact, rounded] = String(value).split('≈').map(ascii);
  const forms = {};
  if (isTypedNumber(exact)) forms.exact = exact;
  if (rounded !== undefined) {
    assert.ok(isTypedNumber(rounded), `the rounded value is a number: ${value}`);
    forms.rounded = rounded;
  }
  assert.ok(forms.exact || forms.rounded, `a stated value a student can type: ${value}`);
  return forms;
};
const pick = (value, form) => {
  const forms = typings(value);
  return forms[form] ?? forms.exact ?? forms.rounded;
};

const YES_NO = Object.freeze({ Yes: 'yes', No: 'no' });

// The lab work a student who follows the review submits, in each view.
const workFromReview = (view, model, form) => {
  const value = (label) => {
    const found = model.items.find((entry) => entry.label === label);
    assert.ok(found, `${view}: the review states ${label}`);
    return found.value;
  };
  if (view === 'features') {
    const directrix = value('Directrix');
    assert.match(directrix, /^[xy] = /, 'the directrix is named as a line');
    return {
      focusX: pick(value('Focus x'), form),
      focusY: pick(value('Focus y'), form),
      directrix: pick(directrix.replace(/^[xy] = /, ''), form),
      latus: pick(value('Latus rectum length'), form),
    };
  }
  if (view === 'equidistance') {
    const answer = value('Is P on the parabola?');
    assert.ok(answer in YES_NO, `Yes or No: ${answer}`);
    return {
      focusDistance: pick(value('Distance P → focus'), form),
      directrixDistance: pick(value('Distance P → directrix'), form),
      onCurve: YES_NO[answer],
    };
  }
  if (view === 'fromGeometry') {
    return { h: pick(value('Vertex h'), form), k: pick(value('Vertex k'), form), p: pick(value('p'), form) };
  }
  if (view === 'equation') return { coefficient: pick(value('Value of 4p'), form), opening: value('Opening direction') };
  return assert.fail(`unknown view ${view}`);
};

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 2, `${label}: items`);
  model.items.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ['label', 'value'], `${label}: an item is a label and a value`);
    assert.ok(typeof entry.label === 'string' && entry.label, `${label}: item label`);
    assert.ok(typeof entry.value === 'string' && entry.value, `${label}: item value`);
  });
  assert.ok(model.steps.length >= 3 && model.steps.length <= 12, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 30, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 30, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify(model), /NaN|undefined|Infinity|\[object|null\)|e[+-]\d/, `${label}: no broken value`);
  // Every $…$ is closed.
  [model.title, ...model.steps, model.why, model.note || '', ...model.items.map((entry) => entry.value)]
    .forEach((text) => assert.equal((text.match(/\$/g) || []).length % 2, 0, `${label}: balanced math in ${text}`));
};

// The index picks the builder up, and the platform's entry point returns
// exactly this model, by `toolId` and by `type`.
const assertWired = (question, model, label) => {
  const { type: _type, ...rest } = question;
  assert.deepEqual(buildToolSolutionReviewModel({ ...rest, toolId: TOOL_ID }), model, `${label}: by toolId`);
  assert.deepEqual(buildToolSolutionReviewModel({ ...rest, type: TOOL_ID }), model, `${label}: by type`);
};

// The review's answer, typed exactly and typed rounded, is full credit.
const assertGraderAccepts = (question, model, view, label) => {
  for (const form of ['exact', 'rounded']) {
    const work = workFromReview(view, model, form);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.mode, view, `${label}: graded as the ${view} view`);
    assert.equal(result.parts.length, model.items.length, `${label}: one item per marked part`);
    assert.equal(result.isCorrect, true, `${label} (${form}): the review's answer is correct ${JSON.stringify(work)}`);
    assert.equal(result.score, 1, `${label} (${form}): full credit`);
  }
};

const item = (model, label) => model.items.find((entry) => entry.label === label)?.value;

/* ------------------------------------------------------------ fixtures */

// Teacher-import V5 intents, compiled the way the platform compiles them.
const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Parabolas from focus and directrix', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Find the focus, directrix and latus rectum of the parabola with vertex (2, −3) and p = −1.5.', studentActions: ['analyzeParabolaGeometry'], parabola: { h: 2, k: -3, p: -1.5 } },
      { prompt: 'Find the vertex and p from the focus and directrix.', studentActions: ['analyzeParabolaGeometry'], parabola: { focus: [-4, 1], directrix: { kind: 'vertical', value: 2 } } },
      { prompt: 'Is P the same distance from the focus and the directrix?', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', parabola: { h: 1, k: 2, p: 1 } },
      { prompt: 'Give 4p and the opening direction.', studentActions: ['analyzeParabolaGeometry'], mode: 'equation', parabola: { h: 0, k: -2, p: 2, orientation: 'horizontal' } },
    ],
  }],
}).package.sections[0].questions;

// `expect`: values a teacher would state for the question; `mentions`: this
// question's own numbers, which the worked steps must show.
const FIXTURES = [
  // features
  { label: 'sample features (SAMPLE_BATCH_B_DEEP_DIVE)', view: 'features', question: q({ mode: 'features', h: 1, k: -1, p: 2, orientation: 'vertical' }), expect: { 'Focus x': '1', 'Focus y': '1', Directrix: 'y = −3', 'Latus rectum length': '8' }, mentions: ['$(1, -1)$', '$y = -1 - 2 = -3$'] },
  { label: 'no mode (SAMPLE_MISSING_MATH_TOOLS)', view: 'features', question: q({ h: 1, k: -1, p: 2 }), expect: { 'Focus y': '1', Directrix: 'y = −3' }, mentions: ['$(1, -1)$'] },
  { label: 'V5 features, p negative', view: 'features', question: compiled[0], expect: { 'Focus x': '2', 'Focus y': '−4.5', Directrix: 'y = −1.5', 'Latus rectum length': '6' }, mentions: ['$-3 + (-1.5) = -4.5$', '$4|p| = 4 \\cdot 1.5 = 6$'] },
  { label: 'horizontal, opens right', view: 'features', question: q({ mode: 'features', h: -2, k: 1, p: 0.5, orientation: 'horizontal' }), expect: { 'Focus x': '−1.5', 'Focus y': '1', Directrix: 'x = −2.5', 'Latus rectum length': '2' }, mentions: ['opens right', '$x = -2 - 0.5 = -2.5$'] },
  { label: 'horizontal, opens left', view: 'features', question: q({ mode: 'features', h: 3, k: -2, p: -2, orientation: 'horizontal' }), expect: { 'Focus x': '1', 'Focus y': '−2', Directrix: 'x = 5', 'Latus rectum length': '8' }, mentions: ['opens left'] },
  { label: 'k left out: the lab and grader use k = −1', view: 'features', question: q({ mode: 'features', h: 2, p: 1 }), expect: { 'Focus y': '0', Directrix: 'y = −2' }, mentions: ['$(2, -1)$'] },
  { label: 'a padded mode renders (and is graded as) Features', view: 'features', question: q({ mode: ' equation ', h: 0, k: 0, p: 1 }), expect: { 'Focus y': '1', Directrix: 'y = −1', 'Latus rectum length': '4' }, mentions: ['$(0, 0)$'] },
  // equidistance
  { label: 'sample equidistance (SAMPLE_BATCH_B_DEEP_DIVE)', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: 2, orientation: 'vertical', offset: 4 }), expect: { 'Distance P → focus': '4', 'Distance P → directrix': '4', 'Is P on the parabola?': 'Yes' }, mentions: ['$P = (4, 2)$', '$|2 - (-2)| = 4$'] },
  { label: 'V5 equidistance, P sampled', view: 'equidistance', question: compiled[2], expect: { 'Distance P → focus': '5', 'Distance P → directrix': '5', 'Is P on the parabola?': 'Yes' }, mentions: ['$P = (5, 6)$', '\\sqrt{25} = 5'] },
  { label: 'P with a fractional coordinate', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: 3 }), expect: { 'Distance P → focus': '13/3 ≈ 4.33', 'Distance P → directrix': '13/3 ≈ 4.33', 'Is P on the parabola?': 'Yes' }, mentions: ['\\frac{4}{3}'], note: /rounded to two decimal places, as \(4, 1\.33\).*\(4, 4\/3\)/ },
  { label: 'authored P off the parabola, irrational distance', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: 2, point: [3, 1] }), expect: { 'Distance P → focus': '√10 ≈ 3.16', 'Distance P → directrix': '3', 'Is P on the parabola?': 'No' }, mentions: ['\\sqrt{10}', '$|1 - (-2)| = 3$'] },
  { label: 'authored P off the parabola, whole distances', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: 2, point: [3, 6] }), expect: { 'Distance P → focus': '5', 'Distance P → directrix': '8', 'Is P on the parabola?': 'No' }, mentions: ['$P = (3, 6)$'] },
  { label: 'authored P on a downward parabola', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: -1, point: [2, -1] }), expect: { 'Distance P → focus': '2', 'Distance P → directrix': '2', 'Is P on the parabola?': 'Yes' }, mentions: ['$F = (0, -1)$'] },
  { label: 'authored P as numeric strings', view: 'equidistance', question: q({ mode: 'equidistance', h: 0, k: 0, p: 2, point: ['3', '1'] }), expect: { 'Distance P → focus': '√10 ≈ 3.16', 'Is P on the parabola?': 'No' }, mentions: ['$P = (3, 1)$'] },
  { label: 'horizontal parabola, P sampled', view: 'equidistance', question: q({ mode: 'equidistance', h: 1, k: 2, p: 1, orientation: 'horizontal' }), expect: { 'Distance P → focus': '5', 'Distance P → directrix': '5', 'Is P on the parabola?': 'Yes' }, mentions: ['$x = 0$', '$|5 - 0| = 5$'] },
  // fromGeometry
  { label: 'sample fromGeometry (SAMPLE_BATCH_B_DEEP_DIVE)', view: 'fromGeometry', question: q({ mode: 'fromGeometry', focus: [5, 2], directrix: { kind: 'vertical', value: 1 } }), expect: { 'Vertex h': '3', 'Vertex k': '2', p: '2' }, mentions: ['$h = \\frac{5 + 1}{2} = 3$'] },
  { label: 'V5 fromGeometry, focus left of the directrix', view: 'fromGeometry', question: compiled[1], expect: { 'Vertex h': '−1', 'Vertex k': '1', p: '−3' }, mentions: ['$h = \\frac{-4 + 2}{2} = -1$', 'opens left'] },
  { label: 'focus below a horizontal directrix', view: 'fromGeometry', question: q({ mode: 'fromGeometry', focus: [0, -1], directrix: { kind: 'horizontal', value: 3 } }), expect: { 'Vertex h': '0', 'Vertex k': '1', p: '−2' }, mentions: ['opens down'] },
  { label: 'decimal vertex', view: 'fromGeometry', question: q({ mode: 'fromGeometry', focus: [1, 2.5], directrix: { kind: 'horizontal', value: 0 } }), expect: { 'Vertex h': '1', 'Vertex k': '1.25', p: '1.25' }, mentions: ['$k = \\frac{2.5 + 0}{2} = 1.25$'] },
  { label: 'only the directrix authored: the lab’s focus (2, 3)', view: 'fromGeometry', question: q({ mode: 'fromGeometry', directrix: { kind: 'horizontal', value: 5 } }), expect: { 'Vertex h': '2', 'Vertex k': '4', p: '−1' }, mentions: ['$(2, 3)$'] },
  // equation
  { label: 'sample equation (SAMPLE_BATCH_B_DEEP_DIVE)', view: 'equation', question: q({ mode: 'equation', h: -2, k: 1, p: -1.5, orientation: 'horizontal' }), expect: { 'Value of 4p': '−6', 'Opening direction': 'left' }, mentions: ['$(y - 1)^2 = -6(x + 2)$'] },
  { label: 'V5 equation, opens right', view: 'equation', question: compiled[3], expect: { 'Value of 4p': '8', 'Opening direction': 'right' }, mentions: ['$(y + 2)^2 = 8x$'] },
  { label: 'vertical, opens up', view: 'equation', question: q({ mode: 'equation', h: -2, k: 1, p: 1.5 }), expect: { 'Value of 4p': '6', 'Opening direction': 'up' }, mentions: ['$(x + 2)^2 = 6(y - 1)$'] },
  { label: 'vertical, opens down, 4p = −1', view: 'equation', question: q({ mode: 'equation', h: 3, k: 0, p: -0.25 }), expect: { 'Value of 4p': '−1', 'Opening direction': 'down' }, mentions: ['$(x - 3)^2 = -y$'] },
  { label: 'small p', view: 'equation', question: q({ mode: 'equation', h: 0, k: 0, p: 0.125 }), expect: { 'Value of 4p': '0.5', 'Opening direction': 'up' }, mentions: ['$x^2 = 0.5y$'] },
];

/* --------------------------------------------------------------- tests */

test('the builder is implemented and the index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildParabolaGeometryLabReview);
  assert.equal(buildDefault, buildParabolaGeometryLabReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
});

test('every graded view: the review states the answer the shared grader accepts, with this question’s numbers', () => {
  const views = new Set();
  for (const { label, view, question, expect, mentions, note } of FIXTURES) {
    const model = buildParabolaGeometryLabReview(question);
    assertTextOnly(model, label);
    assertWired(question, model, label);
    assertGraderAccepts(question, model, view, label);
    views.add(view);
    for (const [itemLabel, value] of Object.entries(expect)) {
      assert.equal(item(model, itemLabel), value, `${label}: ${itemLabel}`);
    }
    const shown = [...model.steps, model.why].join(' ');
    for (const text of mentions) assert.ok(shown.includes(text), `${label}: the worked solution shows ${text}\n${shown}`);
    if (note) assert.match(model.note || '', note, `${label}: note`);
    else assert.equal(model.note, null, `${label}: no note`);
  }
  assert.deepEqual([...views].sort(), ['equation', 'equidistance', 'features', 'fromGeometry']);
});

test('a stated answer that is changed is no longer accepted — the grading check can fail', () => {
  const question = q({ mode: 'features', h: 2, k: -3, p: -1.5 });
  const model = buildParabolaGeometryLabReview(question);
  const work = workFromReview('features', model, 'exact');
  assert.equal(grade(question, work).isCorrect, true);
  assert.equal(grade(question, { ...work, directrix: '-4.5' }).isCorrect, false);
  const offCurve = q({ mode: 'equidistance', h: 0, k: 0, p: 2, point: [3, 1] });
  const offWork = workFromReview('equidistance', buildParabolaGeometryLabReview(offCurve), 'rounded');
  assert.equal(grade(offCurve, offWork).isCorrect, true);
  assert.equal(grade(offCurve, { ...offWork, onCurve: 'yes' }).isCorrect, false);
});

test('a sweep of vertices, p values and orientations: always a review, always accepted', () => {
  let count = 0;
  for (const orientation of ['vertical', 'horizontal']) {
    for (const h of [-3, 0, 1.5]) {
      for (const k of [-2, 0, 2.25]) {
        for (const p of [-2, -0.5, 0.25, 1, 3]) {
          for (const [view, extra] of [['features', {}], ['equation', {}], ['equidistance', { offset: 4 }], ['equidistance', { offset: -1 }], ['equidistance', { point: [h + 1, k - 1] }]]) {
            const question = q({ mode: view, h, k, p, orientation, ...extra });
            const label = JSON.stringify(question);
            const model = buildParabolaGeometryLabReview(question);
            assertTextOnly(model, label);
            assertGraderAccepts(question, model, view, label);
            count += 1;
          }
        }
      }
    }
  }
  for (const focus of [[0, 0], [2, -3], [-1.5, 4]]) {
    for (const kind of ['horizontal', 'vertical']) {
      for (const value of [-4, 1, 2.5]) {
        const question = q({ mode: 'fromGeometry', focus, directrix: { kind, value } });
        const label = JSON.stringify(question);
        const model = buildParabolaGeometryLabReview(question);
        assertTextOnly(model, label);
        assertGraderAccepts(question, model, 'fromGeometry', label);
        count += 1;
      }
    }
  }
  assert.ok(count > 300, `swept ${count} questions`);
});

test('no review where no answer can be right, the lab cannot render, or nothing is authored', () => {
  const NONE = [
    // not a question
    null, undefined, {}, [], 'parabolaGeometryLab', 42, true,
    // only the lab's demonstration values
    q({}), q({ mode: 'equation' }), q({ mode: 'fromGeometry' }), q({ mode: 'equidistance' }), q({ mode: 'features', h: null, k: null, p: null }),
    // the lab cannot render it (the grader marks it invalid-question)
    q({ mode: 'features', h: 1, k: 1, p: 0 }), q({ mode: 'features', h: 1, k: 1, p: '' }), q({ mode: 'equation', p: 'abc' }),
    q({ mode: 'equation', h: 1, k: 1, p: 1e-7 }), q({ mode: 'equidistance', p: 2, point: { x: 3, y: 1 } }),
    // a vertex that is not a number
    q({ mode: 'features', h: 'abc', k: 1, p: 2 }), q({ mode: 'equation', h: 1, k: Number.NaN, p: 2 }),
    // more precision than the review states exactly
    q({ mode: 'features', h: 0.1234567, k: 0, p: 1 }),
    // no answer is right: the focus is on its own directrix
    q({ mode: 'fromGeometry', focus: [2, 3], directrix: { kind: 'horizontal', value: 3 } }),
    q({ mode: 'fromGeometry', focus: [4, 0], directrix: { kind: 'vertical', value: 4 } }),
    // focus or directrix the lab cannot read, or would print as something else
    q({ mode: 'fromGeometry', focus: { x: 1, y: 2 }, directrix: { kind: 'horizontal', value: 0 } }),
    q({ mode: 'fromGeometry', focus: [1, 2], directrix: { kind: 'diagonal', value: 0 } }),
    q({ mode: 'fromGeometry', focus: ['a', 1], directrix: { kind: 'horizontal', value: 0 } }),
    q({ mode: 'fromGeometry', focus: [null, 3], directrix: { kind: 'horizontal', value: 0 } }),
    q({ mode: 'fromGeometry', focus: [1, 3], directrix: { kind: 'horizontal', value: '' } }),
    q({ mode: 'fromGeometry', focus: [1, 2, 3], directrix: { kind: 'horizontal', value: 0 } }),
    // P not written as exactly two numbers (the review declines a third
    // coordinate the grader ignores), or an offset that is not a number
    q({ mode: 'equidistance', p: 2, point: [3] }), q({ mode: 'equidistance', p: 2, point: [3, 1, 2] }),
    q({ mode: 'equidistance', p: 2, point: ['3', 'one'] }), q({ mode: 'equidistance', p: 2, offset: 'abc' }),
    // P so near the parabola that the grader's tolerance and the exact
    // arithmetic disagree, or the distances only differ past two decimals
    q({ mode: 'equidistance', h: 0, k: 0, p: 3, point: [4, 1.333333] }),
    q({ mode: 'equidistance', h: 0, k: 0, p: 2, point: [4, 2.001] }),
  ];
  for (const question of NONE) {
    const label = JSON.stringify(question) ?? String(question);
    assert.doesNotThrow(() => buildParabolaGeometryLabReview(question), label);
    assert.equal(buildParabolaGeometryLabReview(question), null, label);
    if (question && typeof question === 'object' && !Array.isArray(question)) {
      assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null, `${label}: through the index`);
    }
  }
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
});

test('malformed input never throws', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'h', { enumerable: true, get() { throw new Error('boom'); } });
  const hostileMode = {};
  Object.defineProperty(hostileMode, 'mode', { enumerable: true, get() { throw new Error('boom'); } });
  const odd = [
    hostile, hostileMode, Object.create(null), q({ mode: ['equation'], h: 1, k: 1, p: 1 }), q({ mode: 5, h: {}, k: [], p: '2' }),
    q({ mode: 'equidistance', p: 2, point: 'P' }), q({ mode: 'fromGeometry', focus: 'F', directrix: 'y = 0' }),
    q({ mode: 'equation', h: 1e300, k: 1, p: 1 }), q({ mode: 'features', h: 1, k: 1, p: Number.POSITIVE_INFINITY }),
    q({ mode: 'equidistance', h: 1e15, k: 1e15, p: 3, point: [1e15, 1e15] }),
  ];
  for (const question of odd) {
    assert.doesNotThrow(() => buildParabolaGeometryLabReview(question));
    const model = buildParabolaGeometryLabReview(question);
    if (model) assertTextOnly(model, 'odd input');
  }
  assert.equal(buildParabolaGeometryLabReview(hostile), null);
  assert.equal(buildParabolaGeometryLabReview(hostileMode), null);
});
