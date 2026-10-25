/*
 * MY MATH PATH'S CHOICE CARDS ARE A REAL RADIO GROUP (AX37 follow-up).
 *
 * They were role="radio" buttons with a Tab stop on every card and no arrow
 * keys, and the chosen card was shown by border and fill alone. They now take
 * their props from the shared choice group (choiceGroup.js): one Tab stop, the
 * chosen card a ✓ and aria-checked. The keys themselves are the shared model's
 * (choiceGroup.test.mjs, radioGroupKeys); tests/browser/hostAccessibility.mjs
 * presses them on the real Path screen.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findAll, namesOfRole, parseMarkup, readableText } from './helpers/accessibleNames.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

let vite;
after(async () => { await vite?.close(); });
const loadFields = async () => {
  if (!vite) {
    const { createServer } = await import('vite');
    vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  }
  return (await vite.ssrLoadModule('/src/components/student/PathResponseFields.jsx')).default;
};

const choices = [{ id: 'a', label: '$3x + 4$' }, { id: 'b', label: '$3x + 12$' }, { id: 'c', label: 'None of these' }];
const render = async (props = {}) => {
  const PathResponseFields = await loadFields();
  const markup = renderToStaticMarkup(React.createElement(PathResponseFields, {
    fields: [{ id: 'pick', label: 'Which expression is equivalent?', inputProfile: 'choice', choices }],
    values: {},
    onChangeField: () => {},
    ...props,
  }));
  const root = parseMarkup(markup);
  return { markup, root, radios: findAll(root, (node) => node.attrs.role === 'radio') };
};

test('nothing chosen: one Tab stop, on the first card', async () => {
  const { radios } = await render();
  assert.equal(radios.length, 3);
  assert.deepEqual(radios.map((radio) => radio.attrs.tabindex), ['0', '-1', '-1']);
  assert.deepEqual(radios.map((radio) => radio.attrs['aria-checked']), ['false', 'false', 'false']);
});

test('a card chosen: it is the Tab stop, checked, and marked with a ✓ that is not read', async () => {
  const { radios } = await render({ values: { pick: 'b' } });
  assert.deepEqual(radios.map((radio) => radio.attrs.tabindex), ['-1', '0', '-1']);
  assert.deepEqual(radios.map((radio) => radio.attrs['aria-checked']), ['false', 'true', 'false']);
  const marks = radios.map((radio) => findAll(radio, (node) => 'data-choice-mark' in node.attrs));
  assert.deepEqual(marks.map((list) => list.length), [0, 1, 0], 'only the chosen card is marked');
  assert.equal(marks[1][0].attrs['aria-hidden'], 'true', 'aria-checked says it to a screen reader');
  assert.doesNotMatch(readableText(radios[1]), /✓/);
});

test('the group is named by its legend, and each card by its own words (the letter badge is decoration)', async () => {
  const { markup, root } = await render();
  const [group] = findAll(root, (node) => node.attrs.role === 'radiogroup');
  const legendId = group.attrs['aria-labelledby'];
  assert.ok(legendId, 'named by the legend, whose words are read as mathematics');
  const [legend] = findAll(root, (node) => node.attrs.id === legendId);
  assert.equal(legend.tag, 'legend');
  assert.match(readableText(legend), /Which expression is equivalent\?/);
  assert.equal(group.attrs['aria-label'], undefined);
  const names = namesOfRole(markup, 'radio');
  assert.equal(names.length, 3);
  names.forEach((name) => assert.doesNotMatch(name, /^[ABC]\b(?!one)/, `the badge letter is not in the name: ${name}`));
  assert.equal(names[2], 'None of these');
});

test('a locked screen disables every card', async () => {
  const { radios } = await render({ disabled: true, values: { pick: 'a' } });
  assert.ok(radios.every((radio) => 'disabled' in radio.attrs));
});

test('a numeric choice id is handed back as it was given, not as the group\'s string', () => {
  // The Path's answers are ids from the server; the shared group works in
  // strings, so the select looks the choice up by position and a number does
  // not become "2".
  const source = executableSource(componentSource('src/components/student/PathResponseFields.jsx'));
  const group = region(source, 'function ChoiceGroup(', '\n}\n', 'the choice group');
  assert.match(group, /onSelect: \(id, index\) => onChange\(choices\[index\]\.id\),/);
  assert.match(group, /ids: choices\.map\(\(choice\) => String\(choice\.id\)\),/);
});
