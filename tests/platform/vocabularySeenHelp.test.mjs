/*
 * VOCABULARY ALSO EXPLAINS THE WORDS IN THE HELP A STUDENT HAS SEEN (AX43).
 *
 * It found its words in the prompt only, so a student who opened a hint that
 * said "slope" or read feedback that said "rate of change" could not look the
 * word up. It now also lists the words in the hints they have REVEALED and the
 * feedback on their screen. Never the rungs still waiting: a word in an
 * unrevealed hint is the hint, said early.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { seenHelpText } from '../../src/platform/language/seenHelpText.js';
import { TOOL_STATE, SUPPORT_TOOL, supportToolsForItem } from '../../src/platform/language/supportToolsModel.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const vocabulary = (model) => model.tools.find((tool) => tool.tool === SUPPORT_TOOL.VOCABULARY);
const entitlement = { tools: ['vocabulary'], language: 'es' };
// A prompt with no glossary word in it.
const PROMPT = 'Find the number.';
const LADDER = [
  { text: 'Look at how much y changes when x goes up by one: the slope.', source: 'authored' },
  { text: 'Then see where the line crosses the y-axis: the y-intercept.', source: 'authored' },
  { text: 'Last, compare with the rate of change in the table.', source: 'authored' },
];

test('only the hints the student opened are read: never a rung that is still waiting', () => {
  assert.equal(seenHelpText({ hints: LADDER, revealed: 0 }), '');
  assert.equal(seenHelpText({ hints: LADDER, revealed: 1 }), LADDER[0].text);
  assert.equal(seenHelpText({ hints: LADDER, revealed: 2 }), `${LADDER[0].text}\n${LADDER[1].text}`);
  assert.doesNotMatch(seenHelpText({ hints: LADDER, revealed: 2 }), /rate of change/, 'the third hint has not been opened');
  // A count that is not a count opens nothing.
  for (const revealed of [-1, Number.NaN, undefined, null, 'x', -Infinity]) assert.equal(seenHelpText({ hints: LADDER, revealed }), '', String(revealed));
  assert.equal(seenHelpText({ hints: LADDER, revealed: 99 }), seenHelpText({ hints: LADDER, revealed: 3 }), 'no more than the ladder holds');
  assert.equal(seenHelpText(), '');
});

test('the miss diagnosis once asked for, and the feedback on screen, are read too; nothing else is', () => {
  const text = seenHelpText({
    hints: LADDER, revealed: 1, diagnosis: { text: 'Check the sign of your answer.' },
    feedback: ['Not quite. You have 2 attempts remaining.', 'Your answer has the right size but the opposite sign.', '', null, 7],
  });
  assert.equal(text, `${LADDER[0].text}\nCheck the sign of your answer.\nNot quite. You have 2 attempts remaining.\nYour answer has the right size but the opposite sign.`);
  assert.equal(seenHelpText({ feedback: 'One message.' }), 'One message.');
  assert.equal(seenHelpText({ hints: [null, 5, { text: 4 }], revealed: 3 }), '', 'a hint with no words is nothing');
  assert.ok(seenHelpText({ feedback: 'x'.repeat(20000) }).length <= 4000, 'capped');
});

test('a word in a revealed hint makes Vocabulary available, and lists it', () => {
  const before = vocabulary(supportToolsForItem({ entitlement, prompt: PROMPT }));
  assert.equal(before.state, TOOL_STATE.NOT_APPLICABLE, 'the prompt has no word to define');
  const after = vocabulary(supportToolsForItem({ entitlement, prompt: PROMPT, seenText: seenHelpText({ hints: LADDER, revealed: 1 }) }));
  assert.equal(after.state, TOOL_STATE.AVAILABLE);
  assert.deepEqual(after.termIds, ['slope']);
});

test('a hint that has not been revealed adds no word', () => {
  const model = supportToolsForItem({ entitlement, prompt: PROMPT, seenText: seenHelpText({ hints: LADDER, revealed: 1 }) });
  assert.ok(!vocabulary(model).termIds.includes('y-intercept'), 'the second hint is still waiting');
  assert.ok(!vocabulary(model).termIds.includes('rate-of-change'), 'so is the third');
  const none = vocabulary(supportToolsForItem({ entitlement, prompt: PROMPT, seenText: seenHelpText({ hints: LADDER, revealed: 0 }) }));
  assert.equal(none.state, TOOL_STATE.NOT_APPLICABLE, 'no hint opened: the same as before');
});

test('feedback on screen adds its words too', () => {
  const seen = seenHelpText({ feedback: ['Not quite.', 'Check the rate of change between the two rows.'] });
  assert.deepEqual(vocabulary(supportToolsForItem({ entitlement, prompt: PROMPT, seenText: seen })).termIds, ['rate-of-change']);
});

test('the prompt\'s words come first and stay where they were; a repeated word is listed once', () => {
  const prompt = 'Find the slope of the line.';
  const plain = vocabulary(supportToolsForItem({ entitlement, prompt })).termIds;
  const seen = seenHelpText({ hints: LADDER, revealed: 2 });
  const helped = vocabulary(supportToolsForItem({ entitlement, prompt, seenText: seen })).termIds;
  assert.deepEqual(helped.slice(0, plain.length), plain);
  assert.deepEqual(helped, ['slope', 'axis', 'y-intercept'], 'then the help\'s words, as they first appear');
  assert.equal(new Set(helped).size, helped.length);
});

test('the tool\'s own words and the 10-word cap hold with help added', () => {
  const withTool = vocabulary(supportToolsForItem({ entitlement, prompt: 'Find the slope of the line.', toolType: 'graphing2' })).termIds;
  const helped = vocabulary(supportToolsForItem({ entitlement, prompt: 'Find the slope of the line.', toolType: 'graphing2', seenText: seenHelpText({ hints: LADDER, revealed: 3 }) })).termIds;
  assert.deepEqual(helped.slice(0, withTool.length), withTool, 'what was offered before is still offered, in order');
  assert.ok(helped.length <= 10);
  const flood = Object.keys({ slope: 1, domain: 1, range: 1, function: 1, input: 1, output: 1, axis: 1, origin: 1, solution: 1, equation: 1, expression: 1, variable: 1 }).join(', ');
  assert.ok(vocabulary(supportToolsForItem({ entitlement, prompt: PROMPT, seenText: flood })).termIds.length <= 10);
});

test('a secure test item defines its prompt\'s words only, whatever help is passed', () => {
  const secure = { tools: ['vocabulary'], language: null, showExamples: false, promptTermsOnly: true };
  const model = vocabulary(supportToolsForItem({ entitlement: secure, prompt: PROMPT, seenText: seenHelpText({ hints: LADDER, revealed: 3 }) }));
  assert.equal(model.state, TOOL_STATE.NOT_APPLICABLE);
  assert.deepEqual(model.termIds, []);
});

test('nothing is passed means nothing changes (the existing callers)', () => {
  for (const prompt of ['Find the slope of the line.', PROMPT, 'Solve $3(x+2)=18$.']) {
    assert.deepEqual(supportToolsForItem({ entitlement, prompt, toolType: 'stepAlgebra' }), supportToolsForItem({ entitlement, prompt, toolType: 'stepAlgebra', seenText: '' }));
  }
});

test('the real tray offers Vocabulary for a word only an opened hint uses, and not before', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const Tray = (await server.ssrLoadModule('/src/components/student/supportTools/SupportToolsTray.jsx')).default;
    const html = (seenText) => renderToStaticMarkup(React.createElement(Tray, { entitlement, prompt: PROMPT, seenText, itemKey: 'ax43', surface: 'assignment' }));
    assert.doesNotMatch(html(''), /data-support-tool="vocabulary"/, 'nothing in the prompt: no button');
    assert.doesNotMatch(html(seenHelpText({ hints: LADDER, revealed: 0 })), /data-support-tool="vocabulary"/, 'a hint nobody opened: no button');
    assert.match(html(seenHelpText({ hints: LADDER, revealed: 1 })), /data-support-tool="vocabulary"/, 'the opened hint uses "slope"');
  } finally {
    await server.close();
  }
});

test('the engine reads only the hints it has revealed, and feedback only where its screen shows it', () => {
  const engine = executableSource(componentSource('src/QuestionEngine.jsx'));
  const seen = region(engine, 'const seenHelp = seenHelpText({', '  });', 'the seen help');
  assert.match(seen, /hints: hintLadder\.hints,\s*revealed: hintLadder\.revealed,/, 'the ladder with its revealed count, the same pair the panel is given');
  assert.match(seen, /diagnosis: missRung\?\.shown \? missRung\.hint : '',/, '"What might have gone wrong" only once asked for');
  assert.match(seen, /feedback && !feedback\.blocked && showOutcomeFeedback/, 'the outcome words only where outcome feedback is shown');
  assert.match(seen, /!feedback && previousMiss && !locked && showOutcomeFeedback/, '"Your last try" under the same rule');
  assert.match(engine, /<StudentSupportTray[\s\S]{0,300}seenText=\{seenHelp\}/, 'the tray is given it');
  const panel = region(engine, '<HintPanel', '/>', 'the hint panel');
  assert.match(panel, /hints=\{hintLadder\.hints\}\s*revealed=\{hintLadder\.revealed\}/, 'and that pair is what the panel shows');
});

test('My Math Path passes the hint only once it is opened, and its feedback message', () => {
  const player = executableSource(componentSource('src/components/student/PathSessionPlayer.jsx'));
  const seen = region(player, 'seenText={seenHelpText({', '})}', 'the seen help');
  assert.match(seen, /hints: lastSupport\?\.hint && !finalized \? \[lastSupport\.hint\] : \[\],\s*revealed: hintOpen \? 1 : 0,/);
  assert.match(seen, /feedback: lastFeedback\?\.message \|\| '',/);
  const bar = executableSource(componentSource('src/components/student/PathSupportBar.jsx'));
  assert.match(region(bar, '<StudentSupportTray', '/>', 'the tray'), /seenText=\{seenText\}/);
});
