/*
 * One choice group for every tool (student pass 3, TOOL-6).
 *
 * The defect: ten tool choice groups were role="radiogroup" with a tab stop on
 * every option and no arrow keys, and Representation Match showed the chosen
 * option by its border colour alone. Each now takes its options' props from
 * platform/interaction/choiceGroup.js, on the keyboard model in
 * radioGroupKeys.js (tested in liveChallengeChoiceRadioGroup.test.mjs).
 *
 * The props factory is tested as behaviour against fake key events and option
 * elements. The components cannot be rendered in node, so each group's wiring
 * is asserted against the region that draws it; the real tools are driven by
 * the keyboard browser drivers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidElement } from 'react';
import { ChoiceMark, choiceOptionProps } from '../../src/platform/interaction/choiceGroup.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const group = ({ ids = ['a', 'b', 'c', 'd'], value, disabled = false } = {}) => {
  const selected = [];
  const focused = [];
  const refs = { current: [] };
  const optionProps = choiceOptionProps({ refs, ids, value, onSelect: (id, index) => selected.push([id, index]), disabled });
  const options = ids.map((_, index) => {
    const props = optionProps(index);
    props.ref({ focus: () => focused.push(index) });
    return props;
  });
  const press = (index, key, modifiers = {}) => {
    let prevented = false;
    options[index].onKeyDown({ key, preventDefault: () => { prevented = true; }, ...modifiers });
    return prevented;
  };
  return { options, selected, focused, press };
};

test('every option is a radio; only the chosen one is checked', () => {
  const { options } = group({ value: 'c' });
  assert.deepEqual(options.map((option) => option.role), ['radio', 'radio', 'radio', 'radio']);
  assert.deepEqual(options.map((option) => option['aria-checked']), [false, false, true, false]);
  assert.deepEqual(group({ value: '' }).options.map((option) => option['aria-checked']), [false, false, false, false]);
  assert.deepEqual(group({ ids: [0, 1, 2], value: 1 }).options.map((option) => option['aria-checked']), [false, true, false], 'an index group (the sort\'s groups)');
});

test('one tab stop: the chosen option, else the first', () => {
  assert.deepEqual(group({ value: 'c' }).options.map((option) => option.tabIndex), [-1, -1, 0, -1]);
  assert.deepEqual(group({ value: undefined }).options.map((option) => option.tabIndex), [0, -1, -1, -1]);
});

test('arrows move focus AND select, wrapping; Home and End go to the ends', () => {
  const g = group({ value: 'a' });
  assert.equal(g.press(0, 'ArrowDown'), true, 'the key is taken from the page (no scroll)');
  assert.equal(g.press(0, 'ArrowRight'), true);
  g.press(0, 'ArrowUp');
  g.press(3, 'ArrowLeft');
  g.press(1, 'End');
  g.press(2, 'Home');
  // The fixture's value stays 'a': Home onto 'a' moves focus and selects nothing.
  assert.deepEqual(g.selected, [['b', 1], ['b', 1], ['d', 3], ['c', 2], ['d', 3]]);
  assert.deepEqual(g.focused, [1, 1, 3, 2, 3, 0]);
});

// Review B1: Figure Match's select toggles (pressing the chosen chip clears
// it), so a key that re-selected the checked option deleted the answer.
test('Home / End / Space on the checked option, or an arrow in a one-option group, calls nothing', () => {
  const first = group({ value: 'a' });
  assert.equal(first.press(0, 'Home'), true, 'the key is still the group\'s (no page scroll)');
  assert.equal(first.press(0, ' '), true);
  assert.deepEqual(first.selected, []);
  const last = group({ value: 'd' });
  last.press(3, 'End');
  last.press(3, ' ');
  assert.deepEqual(last.selected, []);
  assert.deepEqual(last.focused, [3], 'End still puts focus on the last option');
  const one = group({ ids: ['only'], value: 'only' });
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ']) one.press(0, key);
  assert.deepEqual(one.selected, []);
});

test('Space selects where focus is; Enter, Tab and letters are left alone; nothing submits', () => {
  const g = group({ value: 'a' });
  assert.equal(g.press(2, ' '), true);
  assert.deepEqual(g.selected, [['c', 2]]);
  assert.deepEqual(g.focused, [], 'Space does not move focus');
  for (const key of ['Enter', 'Tab', 'Escape', 'x', '1']) assert.equal(g.press(1, key), false, `${key} is not the group's`);
  assert.deepEqual(g.selected, [['c', 2]]);
});

test('a disabled group, or a key with a modifier, does nothing', () => {
  const off = group({ value: 'a', disabled: true });
  assert.equal(off.press(0, 'ArrowDown'), false);
  assert.deepEqual(off.selected, []);
  const on = group({ value: 'a' });
  for (const modifiers of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) assert.equal(on.press(0, 'ArrowDown', modifiers), false);
  assert.deepEqual(on.selected, []);
});

test('the chosen option carries a ✓ besides its colour; the mark is not read aloud', () => {
  const mark = ChoiceMark({ selected: true });
  assert.ok(isValidElement(mark));
  assert.equal(mark.props.children, '✓');
  assert.equal(mark.props['aria-hidden'], 'true', 'aria-checked says it to a screen reader');
  assert.equal(ChoiceMark({ selected: false }), null);
});

// ---------------------------------------------------------------- wiring
// Every group named in TOOL-6: its buttons spread the shared option props
// (role, aria-checked, tabIndex, keys) and draw the ✓ mark.
const GROUPS = [
  ['src/MultiAnswerGrader.jsx', 'function ChoiceFieldOptions(', 'every choice field'],
  ['src/platform/workflow/FigureMatchStage.jsx', 'function CategoryChoices(', 'a figure\'s categories'],
  ['src/tools/matrixLab/matrixLabUi.jsx', 'export function ChoiceRadios(', 'Matrix Lab\'s choices'],
  ['src/tools/representationBridge/process/processUi.jsx', 'export function ChoiceChips(', 'Process Mode\'s chips'],
  ['src/tools/representationMatch/RepresentationMatch.jsx', 'function EquationChoices(', 'the equation choices'],
  ['src/tools/representationMatch/RepresentationMatch.jsx', 'function GraphChoices(', 'the graph choices'],
  ['src/tools/representationMatch/RepresentationMatch.jsx', 'function SortSlotChoices(', 'the groups a card sorts into'],
  // VH-12: Find the Mismatch, Check the Table and the mismatched line's cards.
  ['src/tools/representationMatch/RepresentationMatch.jsx', 'function PickOneCards(', 'the card or row that does not belong'],
  ['src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx', 'export function ZeroVariableChoice(', 'which variable equals 0'],
  // AX37: "Is this relation a function?" and every analysis question with choices.
  ['src/tools/relationMapping/RelationMapping.jsx', 'function RelationChoiceGroup(', 'Relation Mapping\'s function and analysis choices'],
  // The last group TOOL-6 left without arrow keys (AX37 follow-up): My Math Path's own response cards.
  ['src/components/student/PathResponseFields.jsx', 'function ChoiceGroup(', 'My Math Path\'s response choices'],
];

for (const [file, start, what] of GROUPS) {
  test(`${what} (${file}) is one shared radio group with a ✓`, () => {
    const body = region(executableSource(componentSource(file)), start, '\n}\n', what);
    assert.match(body, /const optionProps = useChoiceGroup\(\{/, 'the group takes its options\' props from the shared choice group');
    assert.match(body, /role="radiogroup"/);
    const button = region(body, '<button', '</button>', 'the option button');
    assert.match(button, /\{\.\.\.optionProps\(index\)\}/, 'each option spreads its props');
    assert.doesNotMatch(button, /role="radio"|aria-checked=|tabIndex=/, 'nothing overrides the shared role, checked state or tab stop');
    assert.match(button, /<ChoiceMark selected=\{[^}]+\}/, 'the chosen option is marked, not only coloured');
  });
}

test('the old per-site groups are gone: each place uses its shared group', () => {
  const lab = executableSource(componentSource('src/tools/matrixLab/MatrixLab.jsx'));
  assert.doesNotMatch(lab, /role="radio"/, 'Matrix Lab draws no radio of its own');
  assert.equal((lab.match(/<ChoiceRadios\b/g) || []).length, 2, 'the constants and the solution count');
  assert.match(executableSource(componentSource('src/tools/matrixLab/matrixLabUi.jsx')), /export function YesNo\([^)]*\) \{\s*return <ChoiceRadios /);
  for (const file of ['src/tools/stepAlgebra2/LinearIntercepts.jsx', 'src/LinearInterceptsOrchestrator.jsx']) {
    const source = executableSource(componentSource(file));
    assert.doesNotMatch(source, /role="radio"/, `${file} draws no radio of its own`);
    assert.match(source, /<ZeroVariableChoice\s[\s\S]*?onSelect=\{selectZeroChoice\}/, `${file}: x = 0 / y = 0 is the shared group`);
  }
  const match = executableSource(componentSource('src/tools/representationMatch/RepresentationMatch.jsx'));
  assert.equal((match.match(/role="radio"/g) || []).length, 0, 'Representation Match draws no radio of its own');
  for (const name of ['EquationChoices', 'GraphChoices', 'SortSlotChoices']) assert.match(match, new RegExp(`<${name}\\b`), `${name} is drawn`);
  // VH-12: the three "which one does not belong" questions are that group, each named.
  assert.equal((match.match(/<PickOneCards\b/g) || []).length, 3, 'Find the Mismatch, Check the Table and the mismatched line');
  for (const label of ['Which card does not belong\\?', 'Which row does not fit the rule\\?', 'Which card does not describe the same line\\?']) {
    assert.match(match, new RegExp(`<PickOneCards\\s+label="${label}"`), label);
  }
  assert.doesNotMatch(match, /mismatchKind === |badRow === |mismatchSelection === /, 'no selection drawn by colour alone');
  for (const file of ['src/MultiAnswerGrader.jsx', 'src/platform/workflow/FigureMatchStage.jsx', 'src/components/student/PathResponseFields.jsx']) {
    assert.doesNotMatch(executableSource(componentSource(file)), /role="radio"/, `${file} draws no radio of its own`);
  }
  // Relation Mapping (AX37): both of its choice questions are the one group.
  const relation = executableSource(componentSource('src/tools/relationMapping/RelationMapping.jsx'));
  assert.doesNotMatch(relation, /role="radio"/, 'Relation Mapping draws no radio of its own');
  assert.equal((relation.match(/<RelationChoiceGroup\b/g) || []).length, 2, 'the function question and the analysis choices');
  assert.match(relation, /<RelationChoiceGroup\s[^>]*legend="Is this relation a function\?"/, 'the function question is a group');
});
