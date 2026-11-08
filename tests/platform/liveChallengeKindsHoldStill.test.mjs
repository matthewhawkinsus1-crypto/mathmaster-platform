/*
 * A RUSH'S GRAPH HOLDS STILL FROM ITEM TO ITEM, AND FROM KIND TO KIND.
 *
 * On a phone the graph takes what is left of the screen between what is asked
 * above it and the controls under it, so when either changed size from one
 * item to the next the graph moved under the student's finger. Measured in
 * CI's fonts at the default text size:
 *
 *   Inequality Graphing Rush: a prompt that took two lines where the last
 *   took one ("Solve, then graph: −3x + 1 ≤ 7" after "Graph: x ≥ −2") moved
 *   the number line 12 px as the item appeared (it sits in the middle of its
 *   area);
 *   Graph Feature Rush, a round of points to tap and sets to mark (Domain,
 *   Range & Intercepts): a set's longer hint and its notation's line moved
 *   the graph 23 px from kind to kind, on both phones.
 *
 * Now the prompt keeps the room of the widest the round can ask, and the hint
 * and the notation the room of every kind of item the round deals — from the
 * round's settings, never an item's (rushSession.promptReserve and
 * rushRoundKinds), drawn invisible in their own cells where the screen is
 * tall for its text (min-height: 36em, as the feedback line's room is).
 * Before GO the controls show the round's own kind, never the first item's,
 * which the countdown would give away; Graph the Line's countdown likewise
 * shows its round's own kind. (Graph the Line's rounds that deal lines to
 * graph and lines to name keep their own room per kind: holding the largest
 * kind's room on every item is the owner's to choose.)
 *
 * Node lays nothing out, so this holds each kept room against everything the
 * generators' own items ask with, and the screen's markup and rules as the
 * cascade reads them. The browser proof is graphFeatureRushGame.mjs's phone
 * passes (inequality-phones, kinds-on-phones), which hold the graph to a pixel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';
import {
  promptReserve,
  rushItemKind,
  rushRoundKinds,
} from '../../src/platform/liveChallenge/rushSession.js';
import { generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import {
  INEQUALITY_DIFFICULTY_OPTIONS,
  INEQUALITY_ITEM_IDS,
  INEQUALITY_RUSH_PRESETS,
  generateInequalityQuestion,
  normalizeInequalityRushConfig,
} from '../../functions/shared/inequalityRush.mjs';

const SAMPLES = 60;
const longestOf = (asks) => Math.max(...asks.map((ask) => ask.prompt.length));

/* ------------------------------ the rush's prompt ----------------------------- */

const inequalityRounds = [
  ...INEQUALITY_RUSH_PRESETS.map((preset) => ({ name: preset.id, config: normalizeInequalityRushConfig({ presetId: preset.id }) })),
  // Each kind alone, at each difficulty: its room is its own widest.
  ...INEQUALITY_ITEM_IDS.flatMap((itemType) => INEQUALITY_DIFFICULTY_OPTIONS.map(({ id: difficulty }) => ({
    name: `${itemType}, ${difficulty}`,
    config: normalizeInequalityRushConfig({ itemTypes: [itemType], difficulty }),
  }))),
];

for (const { name, config } of inequalityRounds) {
  test(`Inequality Graphing Rush (${name}): every prompt the round asks fits the room its prompt keeps`, () => {
    const room = promptReserve({ inequality: config });
    assert.equal(room.length, config.itemTypes.length, 'one widest prompt for each kind the round deals');
    for (let index = 0; index < SAMPLES * 4; index += 1) {
      const item = generateInequalityQuestion({ seed: `kinds-${name}`, studentKey: `s${index % 5}`, roundIndex: index % 3, questionIndex: index, config });
      assert.ok(item.prompt.length <= longestOf(room), `"${item.prompt}" (${item.prompt.length}) is wider than the room kept for ${name} (${longestOf(room)})`);
      // Asked with the same words as the room: its lead, and its inequality on one line.
      assert.ok(room.some((ask) => ask.prompt.startsWith(item.prompt.slice(0, item.prompt.indexOf(':') + 1)) && ask.prompt.endsWith(ask.inequality)), `${item.prompt}: its lead is in the room`);
    }
  });
}

test('a kind alone keeps exactly its widest: the room is never wider than the round can ask', () => {
  // A round of simple inequalities is never held to a two-step one's two lines.
  for (const itemType of INEQUALITY_ITEM_IDS) {
    for (const { id: difficulty } of INEQUALITY_DIFFICULTY_OPTIONS) {
      const config = normalizeInequalityRushConfig({ itemTypes: [itemType], difficulty });
      let widest = 0;
      for (let index = 0; index < 1_500; index += 1) {
        widest = Math.max(widest, generateInequalityQuestion({ seed: `exact-${itemType}-${difficulty}`, studentKey: `s${index % 7}`, roundIndex: index % 3, questionIndex: index, config }).prompt.length);
      }
      assert.equal(longestOf(promptReserve({ inequality: config })), widest, `${itemType} at ${difficulty}`);
    }
  }
});

for (const preset of GRAPH_FEATURE_RUSH_PRESETS) {
  test(`Graph Feature Rush (${preset.id}): every graph's prompt fits the room, and every item's kind is one the round deals`, () => {
    const config = normalizeGraphFeatureRushConfig({ presetId: preset.id });
    const room = promptReserve({ features: config.features });
    const kinds = rushRoundKinds({ features: config.features, offScreen: config.offScreen });
    for (let index = 0; index < SAMPLES; index += 1) {
      const question = publicRushQuestion(generateRushQuestion({ seed: `kinds-${preset.id}`, studentKey: 'a', roundIndex: index % 3, questionIndex: index, config }));
      assert.ok(question.prompt.length <= longestOf(room), `"${question.prompt}" is wider than the room kept`);
      const kind = rushItemKind(question, { offScreen: config.offScreen });
      assert.ok(kinds.some((each) => JSON.stringify(each) === JSON.stringify(kind)), `${question.feature}: its kind ${JSON.stringify(kind)} is one of the round's`);
    }
  });
}

test('the room and the kinds are the round\'s settings alone', () => {
  assert.equal(promptReserve.length, 0, 'settings only');
  assert.equal(rushRoundKinds.length, 0, 'settings only');
  const mixed = normalizeGraphFeatureRushConfig({ presetId: 'domainRangeIntercepts' });
  const kinds = rushRoundKinds({ features: mixed.features });
  // Intercepts to tap, a domain on x and a range on y to mark: three kinds.
  assert.deepEqual(kinds.map((kind) => [kind.set, kind.vertical]).sort(), [[false, false], [true, false], [true, true]]);
  assert.deepEqual(rushRoundKinds({ features: ['domain', 'range'], inequality: true }), rushRoundKinds({ inequality: true }), 'an inequality game deals one kind');
  // A game with "Off screen" asks a point's items with its own hint.
  assert.equal(rushRoundKinds({ features: ['xIntercepts'], offScreen: true })[0].offScreen, true);
});

/* --------------------------------- the screens -------------------------------- */

const TALL = '@media (min-height: 36em)';
const screen = (file, css) => {
  const source = componentSource(file);
  const sheet = parseCss(region(source, `const ${css} = \``, '\n`;', css).replace(new RegExp(`^const ${css} = \``), '').replace(/\$\{[^}]*\}/g, ''));
  const at = (selector, property, media = null) => rulesFor(sheet, selector)
    .filter((rule) => property in rule.declarations && (rule.atRules.join(' ') || null) === media)
    .map((rule) => rule.declarations[property].value);
  // A held copy is drawn by its real element's own rule: one rule names both.
  const shares = (real, held, property) => rulesFor(sheet, held).some((rule) => property in rule.declarations && rule.selectors.includes(real) && !rule.atRules.length);
  return { source, at, shares };
};
const rush = screen('src/components/liveChallenge/GraphFeatureRushRound.jsx', 'RUSH_CSS');

test('the rush\'s prompt and hint keep the room of what the round can ask, drawn as they are and never read', () => {
  const prompt = region(rush.source, '<section className="mm-rush-prompt" aria-live="polite">', '</section>', 'the prompt');
  assert.match(prompt, /<div className="mm-rush-hold">\s*<h2>\{playing && question \? promptWords\(question\) : noun\.game\}<\/h2>\s*\{promptRoom\.map\(\(ask\) => <div key=\{ask\.prompt\} className="mm-rush-ask-held" aria-hidden="true">\{promptWords\(ask\)\}<\/div>\)\}\s*<\/div>/);
  assert.match(prompt, /<div className="mm-rush-hold">\s*<p className="mm-rush-hint">\{promptHint\}<\/p>\s*\{hintRoom\.map\(\(words\) => <p key=\{words\} className="mm-rush-hint mm-rush-hint-held" aria-hidden="true">\{words\}<\/p>\)\}\s*<\/div>/);
  // The room is the round's settings: its features, or its kinds of inequality and difficulty.
  assert.match(rush.source, /const inequalityKinds = \(room\.inequalityRush\?\.config\?\.itemTypes \|\| \[\]\)\.join\(' '\);/);
  assert.match(rush.source, /promptReserve\(inequalityGame\s*\? \{ inequality: \{ itemTypes: inequalityKinds \? inequalityKinds\.split\(' '\) : \[\], difficulty: inequalityDifficulty \} \}\s*: \{ features: roundFeatures \? roundFeatures\.split\(' '\) : \[\] \}\)/);
  assert.match(rush.source, /const hintRoom = useMemo\(\(\) => \[\.\.\.new Set\(roundKinds\.map\(rushHint\)\)\], \[roundKinds\]\);/);
  // Drawn as the heading is; kept, unseen, where the screen is tall for its text.
  for (const property of ['font-size', 'line-height', 'font-weight', 'margin']) assert.ok(rush.shares('.mm-rush-prompt h2', '.mm-rush-ask-held', property), `the room's ${property}`);
  for (const held of ['.mm-rush-ask-held', '.mm-rush-hint-held']) {
    assert.deepEqual(rush.at(held, 'display'), ['none'], `${held}: no room on a short screen (150-200% text)`);
    assert.deepEqual(rush.at(held, 'display', TALL), ['block']);
    assert.deepEqual(rush.at(held, 'visibility', TALL), ['hidden']);
  }
});

test('before GO the rush shows the round\'s own kind, from GO the item\'s', () => {
  assert.match(rush.source, /const shownKind = started && question\s*\? rushItemKind\(question, \{ offScreen: offScreenGame \}\)\s*: roundKinds\.find\(\(kind\) => !kind\.set\) \|\| roundKinds\[0\] \|\| rushItemKind\(null, \{ offScreen: offScreenGame \}\);/);
  assert.match(rush.source, /const promptHint = rushHint\(shownKind\);/);
  assert.match(rush.source, /\{shownKind\.set \? \(/, 'the controls');
  // An inequality game's countdown says the number line's words (it said a graph's "Does Not Exist").
  assert.equal(rushRoundKinds({ inequality: true })[0].inequality, true);
});

test('before GO Graph the Line shows the round\'s own kind, from GO the item\'s', () => {
  const line = componentSource('src/components/liveChallenge/LineGraphRound.jsx');
  // The first item is on the device during the countdown: neither the
  // feedback line's room nor Start over may say what kind it is.
  assert.match(line, /const kindItemType = started && question \? question\.itemType : \(startsDrawing \? LINE_ITEM_TYPE\.GRAPH : LINE_ITEM_TYPE\.NAME\);/);
  assert.match(line, /const kindAnswerStyle = started && question \? question\.answerStyle : \(startsDrawing \? LINE_ANSWER_STYLE\.GRAPH : /);
  assert.match(line, /const drawsNow = started && question \? graphing : startsDrawing;/);
  assert.match(line, /\{drawsNow && <button type="button" className="mm-line-button" disabled=\{disabled\}[^\n]*>Start over<\/button>\}/);
  assert.doesNotMatch(executableSource(line), /\{graphing && <button[^\n]*>Start over/, 'never the first item\'s kind');
});
