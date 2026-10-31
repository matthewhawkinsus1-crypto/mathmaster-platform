/*
 * A11Y-8 (pass 3, 04-tools-and-accessibility.md): the legacy graders say which
 * entries are wrong in words, not by border colour alone.
 *
 * TableGrader and GraphLine drew a red or green border and told the student
 * "Incorrect blanks are outlined" while every box had an outline. A graded
 * entry now carries "✗ Check this" / "✓ Correct", aria-invalid when wrong, and
 * the mark as its description. Rendered through Vite SSR with the part grades
 * QuestionEngine hands them after a submit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { gradedEntryState } from '../../src/components/common/gradedEntryState.js';

const withModules = async (paths, run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run(await Promise.all(paths.map((path) => server.ssrLoadModule(path))));
  } finally {
    await server.close();
  }
};

// Each <input …> with the mark that describes it.
const entries = (markup) => [...markup.matchAll(/<input\b[^>]*>/g)].map(([tag]) => {
  const attr = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
  const describedBy = attr('aria-describedby');
  const escaped = describedBy?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // GradedEntryMark: <span id=…><span aria-hidden="true">✗ </span>Check this</span>
  const mark = escaped ? markup.match(new RegExp(`<span id="${escaped}"[^>]*><span aria-hidden="true">[^<]*</span>([^<]*)</span>`)) : null;
  const markText = mark ? mark[1].trim() : null;
  return { label: attr('aria-label') || attr('id'), invalid: attr('aria-invalid'), mark: markText };
});

const noop = () => {};

test('a graded entry is right or wrong in words', () => {
  assert.equal(gradedEntryState(null), null, 'nothing is said before a grade');
  assert.deepEqual(gradedEntryState({ isCorrect: false }), { invalid: true, symbol: '✗', text: 'Check this' });
  assert.deepEqual(gradedEntryState({ isCorrect: true }), { invalid: false, symbol: '✓', text: 'Correct' });
});

test('TableGrader marks the wrong cell in words and as invalid, and the right one as correct', async () => {
  await withModules(['/src/TableGrader.jsx'], async ([{ default: TableGrader }]) => {
    const question = {
      prompt: 'Complete the table for y = 2x.',
      table: {
        columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
        rows: [{ x: 1, y: '' }, { x: 2, y: '' }],
        answers: { '0:y': '2', '1:y': '4' },
      },
    };
    const before = renderToStaticMarkup(React.createElement(TableGrader, { question, onStateChange: noop }));
    assert.ok(entries(before).every((entry) => entry.invalid === null && entry.mark === null), 'no marks before a submit');
    const feedback = { partGrades: [{ id: '0:y', isCorrect: true }, { id: '1:y', isCorrect: false }] };
    const markup = renderToStaticMarkup(React.createElement(TableGrader, { question, onStateChange: noop, feedback }));
    const [first, second] = entries(markup);
    assert.deepEqual(first, { label: 'Row 1, y', invalid: null, mark: 'Correct' });
    assert.deepEqual(second, { label: 'Row 2, y', invalid: 'true', mark: 'Check this' });
    assert.match(markup, /✗ Check this/);
    assert.doesNotMatch(markup, /outlined/, 'the directions no longer point at the outline colour');
  });
});

test('GraphLine names its boxes and marks a wrong slope in words', async () => {
  await withModules(['/src/GraphLine.jsx'], async ([{ default: GraphLine }]) => {
    const question = { m: 2, b: -3, prompt: 'Identify the slope and y-intercept.' };
    const feedback = { partGrades: [{ id: 'slope', isCorrect: false }, { id: 'intercept', isCorrect: true }] };
    const markup = renderToStaticMarkup(React.createElement(GraphLine, { question, onStateChange: noop, feedback }));
    const [slope, intercept] = entries(markup);
    assert.equal(slope.invalid, 'true');
    assert.equal(slope.mark, 'Check this');
    assert.equal(intercept.invalid, null);
    assert.equal(intercept.mark, 'Correct');
    // Each label is tied to its input.
    for (const id of [slope.label, intercept.label]) assert.match(markup, new RegExp(`<label for="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  });
});

// VH-13: the multi-answer grader drew each field's verdict as a border and
// fill colour with no sign at the field for a screen reader or a colour-blind
// student; the engine's "still to fix: …" line names the parts elsewhere. Each
// field now carries the same mark, and its control is described by it and is
// aria-invalid when wrong — a choice group, a plain box and a math field alike.
test('MultiAnswerGrader marks each graded field in words and as invalid (VH-13)', async () => {
  const { findAll, parseMarkup, readableText } = await import('./helpers/accessibleNames.mjs');
  await withModules(['/src/MultiAnswerGrader.jsx'], async ([{ default: MultiAnswerGrader }]) => {
    const question = {
      type: 'multiAnswer',
      questionId: 'vh13',
      prompt: 'Answer each part.',
      answerFields: [
        { id: 'pick', label: 'Pick one', answer: 'yes', options: ['yes', 'no'] },
        { id: 'word', label: 'Word', type: 'text', answer: 'cat' },
        { id: 'value', label: 'Value', answer: '5' },
        { id: 'other', label: 'Other value', answer: '7' },
      ],
    };
    const controls = (root) => [
      ...findAll(root, (node) => node.attrs.role === 'radiogroup'),
      ...findAll(root, (node) => node.tag === 'input' && node.attrs.type === 'text'),
      ...findAll(root, (node) => node.tag === 'math-field'),
    ];
    const markOf = (root, control) => {
      const id = control.attrs['aria-describedby'];
      const [mark] = id ? findAll(root, (node) => node.attrs.id === id) : [];
      return mark ? { kind: mark.attrs['data-graded-entry-mark'], text: readableText(mark) } : null;
    };

    const before = parseMarkup(renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question, onStateChange: noop })));
    assert.equal(controls(before).length, 4, 'a choice group, a text box and two math fields');
    assert.ok(controls(before).every((control) => control.attrs['aria-invalid'] === undefined && markOf(before, control) === null), 'nothing is said before a grade');
    assert.equal(findAll(before, (node) => 'data-graded-entry-mark' in node.attrs).length, 0);

    const feedback = { partGrades: [
      { id: 'pick', isCorrect: false },
      { id: 'word', isCorrect: true },
      { id: 'value', isCorrect: false },
      { id: 'other', isCorrect: true },
    ] };
    const root = parseMarkup(renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question, onStateChange: noop, feedback })));
    const [pick, word, value, other] = controls(root);
    assert.deepEqual([pick.attrs['aria-invalid'], markOf(root, pick)], ['true', { kind: 'wrong', text: 'Check this' }], 'the choice group');
    assert.deepEqual([word.attrs['aria-invalid'], markOf(root, word)], [undefined, { kind: 'right', text: 'Correct' }], 'the text box, right');
    assert.deepEqual([value.attrs['aria-invalid'], markOf(root, value)], ['true', { kind: 'wrong', text: 'Check this' }], 'the math field');
    assert.deepEqual([other.attrs['aria-invalid'], markOf(root, other)], [undefined, { kind: 'right', text: 'Correct' }], 'the math field, right');
    assert.equal(new Set(controls(root).map((control) => control.attrs['aria-describedby'])).size, 4, 'each field has a mark of its own');
  });
});

// The marks say right or wrong in words and set aria-invalid, so they must
// reach the graders only where outcomes are shown: never on a DOL, quiz or
// test before release (pass 3 review). QuestionEngine is their only host that
// passes grades (WorkflowRunner's table passes no feedback).
test('the marks reach the legacy graders only where outcome feedback is shown', async () => {
  const { readFileSync } = await import('node:fs');
  const { executableSource, region } = await import('./helpers/sourceContract.mjs');
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  const props = region(engine, 'const commonModuleProps = {', '\n  };', 'commonModuleProps');
  assert.match(props, /\n\s*feedback: showOutcomeFeedback \? feedback : null,/, 'held feedback never reaches a grader');
  assert.doesNotMatch(props, /\n\s*feedback,/);
  assert.match(engine, /const showOutcomeFeedback = resolvedActivityPolicy\?\.feedback === 'immediate' \|\| feedbackReleased === true;/);
  assert.match(engine, /return <GraphLine \{\.\.\.commonModuleProps\} \/>;/);
  assert.match(engine, /return <TableGrader \{\.\.\.commonModuleProps\} \/>;/);
  // The multi-answer grader (VH-13) is handed the same held-or-shown feedback.
  assert.match(engine, /return <MultiAnswerGrader \{\.\.\.commonModuleProps\} \/>;/);
  const workflow = executableSource(readFileSync(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8'));
  const table = region(workflow, '<TableGrader', '/>', 'workflow table');
  assert.doesNotMatch(table, /\bfeedback=/, 'a workflow table shows no marks');
});
