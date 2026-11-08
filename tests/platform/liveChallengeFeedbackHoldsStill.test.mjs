/*
 * WHAT COMES AND GOES UNDER A LIVE CHALLENGE GRAPH KEEPS ITS ROOM ON A PHONE.
 *
 * Graph Feature Rush (and Inequality Graphing Rush, on the same screen) and
 * Graph the Line put a feedback line under the graph, and the graph takes what
 * is left of the screen. When a message took another line the graph shrank
 * under the student's finger: at 200% text a two-line miss took the rush graph
 * from 279 to 234 px, and at 100% a 360 x 740 phone's name-it grid went from
 * 336 to 320 px on "Not that one — the right equation is marked." Inequality
 * Graphing Rush's number line sits in the middle of its area, so it moved
 * (9 px at 390 px wide) as a dot was placed, a hint came and the cooldown's
 * bar appeared and went. A tap aimed at the graph then landed off it.
 *
 * Now the feedback line keeps the room of the longest things the round can
 * say (rushSession.feedbackReserve, lineGraphSession.lineFeedbackReserve),
 * drawn invisible in its own cell, the cooldown keeps its place, and a set's
 * notation keeps the room of its prompt and its widest set. The room comes
 * from the round's settings, never the graph on screen: a line kept taller for
 * a graph whose answer is "does not exist" would give that away.
 *
 * Node lays nothing out, so this holds each kept room against every message a
 * real round produces (the generators' own items, graded by the same
 * functions a student's device uses), and each stylesheet's rules as the
 * cascade reads them. The browser proof is the two game drivers CI runs
 * (graphFeatureRushGame.mjs, lineGraphGame.mjs), whose phone passes hold the
 * graph to a pixel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';
import {
  RUSH_FEEDBACK,
  bothNotations,
  feedbackMessage,
  feedbackReserve,
  lineNotation,
  setTargetOf,
  widestNotation,
} from '../../src/platform/liveChallenge/rushSession.js';
import { SET_TAP_TIP, setAxisOf } from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  LINE_FEEDBACK,
  lineFeedbackMessage,
  lineFeedbackReserve,
  widestAnswerEquation,
} from '../../src/platform/liveChallenge/lineGraphSession.js';
import { generateRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { INEQUALITY_RUSH_PRESETS, generateInequalityQuestion, inequalityHint, normalizeInequalityRushConfig } from '../../functions/shared/inequalityRush.mjs';
import { setFromPlain, setHint } from '../../functions/shared/numberLineSets.mjs';
import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { LINE_GRAPH_PRESETS, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { FORM_MESSAGES, checkChoiceAnswer, checkEquationAnswer, checkLineAnswer } from '../../functions/shared/lineGraphGrading.mjs';
import { LINE_ANSWER_STYLE, LINE_GRAPH_FORMAT, LINE_ITEM_TYPE, missesAllowed } from '../../functions/shared/lineGraphRules.mjs';

const SAMPLES = 48;
const longestOf = (lines) => Math.max(...lines.map((line) => line.length));

/* ------------------------------ the rush's line ----------------------------- */

// Every message a question can bring, as its device says it: each target found
// and the graph finished on it, every kind of miss, each tip a set question
// gives, the hints a wrong set gets, the answer shown after the third miss.
const rushMessages = (question) => {
  const feedbacks = [
    ...(question.targets || []).flatMap((target) => [{ kind: RUSH_FEEDBACK.HIT, targetId: target.id }, { kind: RUSH_FEEDBACK.COMPLETE, targetId: target.id }]),
    { kind: RUSH_FEEDBACK.COMPLETE, doesNotExist: true },
    { kind: RUSH_FEEDBACK.MISS },
    { kind: RUSH_FEEDBACK.MISS, doesNotExist: true },
    { kind: RUSH_FEEDBACK.MISS, openDot: true },
    { kind: RUSH_FEEDBACK.AUTO_SKIPPED },
    { kind: RUSH_FEEDBACK.SKIPPED },
    { kind: RUSH_FEEDBACK.RESYNCED },
    { kind: RUSH_FEEDBACK.ALREADY_FOUND },
  ];
  if (question.offScreen) {
    feedbacks.push({ kind: RUSH_FEEDBACK.COMPLETE, offScreenPress: true }, { kind: RUSH_FEEDBACK.MISS, offScreenPress: true }, { kind: RUSH_FEEDBACK.MISS, doesNotExist: true, offScreen: true });
  }
  const axis = setAxisOf(question);
  const answer = setFromPlain(setTargetOf(question)?.set || (question.targets || [])[0]?.set || null);
  if (answer) feedbacks.push({ kind: RUSH_FEEDBACK.COMPLETE, checked: bothNotations(answer, axis === 'y' ? 'y' : 'x').join(' · ') });
  // A tap that means nothing on a graph's set is told so; a number line has no such tap.
  if (axis && question.kind !== 'inequality') {
    const line = `${axis === 'y' ? 'x' : 'y'} = −10`;
    feedbacks.push(...Object.values(SET_TAP_TIP).map((tip) => ({ kind: RUSH_FEEDBACK.TIP, tip, line })), { kind: RUSH_FEEDBACK.TIP });
  }
  // Wrong drawings: the answer with each end opened or closed, and turned the other way.
  if (answer?.length) {
    const flipped = answer.map((piece) => ({ ...piece, loClosed: !piece.loClosed, hiClosed: !piece.hiClosed }));
    const wrong = [flipped, setFromPlain([[0, true, null, false]]), setFromPlain([[null, false, 0, false]])];
    for (const drawn of wrong) {
      const hint = question.kind === 'inequality' ? inequalityHint(question, drawn) : setHint(drawn, answer, { axis: axis || 'x' });
      feedbacks.push({ kind: RUSH_FEEDBACK.MISS, hint });
    }
  }
  return feedbacks.map((feedback) => feedbackMessage({ questionIndex: question.questionIndex, ...feedback }, question)).filter(Boolean);
};

const rushRounds = [
  ...GRAPH_FEATURE_RUSH_PRESETS.map((preset) => ({ name: preset.id, config: normalizeGraphFeatureRushConfig({ presetId: preset.id }) })),
  // A game that offers "Off screen" on every graph.
  { name: 'off screen', config: normalizeGraphFeatureRushConfig({ families: ['quadratic', 'cubic', 'absolute'], features: ['xIntercepts', 'yIntercept', 'vertex'], difficulty: 'challenge', offScreen: true }) },
];

for (const { name, config } of rushRounds) {
  test(`Graph Feature Rush (${name}): every message its graphs bring fits the room its line keeps`, () => {
    const reserve = feedbackReserve({ features: config.features, offScreen: config.offScreen });
    assert.ok(reserve.length >= 3 && reserve.length <= 6, 'a few lines, longest first');
    assert.deepEqual([...reserve].sort((a, b) => b.length - a.length), [...reserve], 'longest first');
    let checked = 0;
    for (let index = 0; index < SAMPLES; index += 1) {
      const question = generateRushQuestion({ seed: `hold-${name}`, studentKey: 'student-a', roundIndex: index % 3, questionIndex: index, config });
      for (const message of rushMessages(question)) {
        checked += 1;
        assert.ok(message.length <= longestOf(reserve), `"${message}" (${message.length}) is longer than the room kept for ${name} (${longestOf(reserve)})`);
      }
    }
    assert.ok(checked > SAMPLES * 5, `${checked} messages checked`);
  });
}

for (const preset of INEQUALITY_RUSH_PRESETS) {
  test(`Inequality Graphing Rush (${preset.id}): every message its items bring fits the room its line keeps`, () => {
    const config = normalizeInequalityRushConfig({ presetId: preset.id });
    const reserve = feedbackReserve({ inequality: true });
    for (let index = 0; index < SAMPLES; index += 1) {
      const question = generateInequalityQuestion({ seed: `hold-${preset.id}`, studentKey: 'student-a', roundIndex: 0, questionIndex: index, config });
      for (const message of rushMessages(question)) {
        assert.ok(message.length <= longestOf(reserve), `"${message}" (${message.length}) is longer than the room kept (${longestOf(reserve)})`);
      }
      // The notation keeps the room of its prompt and of its widest set.
      const notation = lineNotation(question, null, { revealing: true }) || [];
      assert.ok(notation.join(' · ').length <= widestNotation({ axis: 'x' }).join(' · ').length, `${notation.join(' · ')} is wider than the notation's room`);
    }
  });
}

test('the room is the round\'s, never the graph\'s: no item, no answer, goes into it', () => {
  // Two graphs of one round, one whose answer is "does not exist": one room.
  const config = normalizeGraphFeatureRushConfig({ presetId: 'algebra2Challenge' });
  const reserve = feedbackReserve({ features: config.features });
  assert.deepEqual(feedbackReserve({ features: [...config.features] }), reserve);
  assert.equal(feedbackReserve.length, 0, 'it takes the round\'s settings only');
  assert.ok(reserve.includes(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, doesNotExist: true }, { feature: 'vertex' })), '"does not exist" is kept for every graph that can not exist');
  // A set question's room holds its tips; an inequality's its hints.
  assert.ok(feedbackReserve({ features: ['domain'] }).includes(feedbackMessage({ kind: RUSH_FEEDBACK.TIP }, { feature: 'domain', setAxis: 'x' })));
  assert.match(feedbackReserve({ inequality: true })[0], /^Open or closed at the right end\?/);
  assert.deepEqual(widestNotation({ axis: 'y' }), ['y < −10.5 or y > 10.5', '(−∞, −10.5) ∪ (10.5, ∞)']);
});

/* --------------------------- Graph the Line's line -------------------------- */

const lineMessages = (question, config) => {
  const left = Math.max(1, missesAllowed({ triesPerItem: config.triesPerItem, answerStyle: question.answerStyle }) - 1);
  const messages = [
    lineFeedbackMessage({ kind: LINE_FEEDBACK.CORRECT }, question),
    lineFeedbackMessage({ kind: LINE_FEEDBACK.REVEALED }, question),
    lineFeedbackMessage({ kind: LINE_FEEDBACK.SKIPPED }, question),
    lineFeedbackMessage({ kind: LINE_FEEDBACK.RESYNCED }, question),
  ];
  const miss = (check) => check?.message && messages.push(lineFeedbackMessage({ kind: LINE_FEEDBACK.MISS, message: check.message }, question, { left }));
  if (question.answerStyle === LINE_ANSWER_STYLE.CHOICE) {
    for (const choice of question.choices || []) if (choice.id !== question.answerChoice) checkChoiceAnswer({ question, choiceId: choice.id });
  } else if (question.itemType === LINE_ITEM_TYPE.NAME) {
    messages.push(lineFeedbackMessage({ kind: LINE_FEEDBACK.REPEATED }, question), ...Object.values(FORM_MESSAGES));
    for (const fields of [{}, { m: '1', b: '0' }, { m: '-2', b: '3' }, { A: '1', B: '1', C: '1' }, { x1: '1', y1: '1', m: '2' }]) {
      const check = checkEquationAnswer({ question, fields });
      if (check?.verdict === 'incorrect') miss(check);
    }
  } else {
    messages.push(lineFeedbackMessage({ kind: LINE_FEEDBACK.REPEATED }, question));
    // Every wrong line through two lattice points of a small set.
    const points = [-4, -1, 0, 2, 5].flatMap((x) => [-3, 0, 1, 4].map((y) => ({ x, y })));
    for (let at = 0; at < points.length; at += 1) {
      for (let to = at + 1; to < points.length; to += 7) {
        const check = checkLineAnswer({ question, points: [points[at], points[to]], showMethod: config.showMethod === true });
        if (check?.verdict === 'incorrect') miss(check);
        else if (check?.message) messages.push(check.message);
      }
    }
  }
  return messages.filter(Boolean);
};

for (const preset of LINE_GRAPH_PRESETS) {
  for (const nameStyle of ['choice', 'build']) {
    if (nameStyle === 'build' && !preset.itemTypes.includes(LINE_ITEM_TYPE.NAME)) continue;
    test(`Graph the Line (${preset.id}${preset.itemTypes.includes(LINE_ITEM_TYPE.NAME) ? `, ${nameStyle}` : ''}): every message an item brings fits the room its kind keeps`, () => {
      const config = normalizeLineGraphConfig({ presetId: preset.id, nameStyle, showMethod: true }, { format: LINE_GRAPH_FORMAT.RUSH });
      let checked = 0;
      for (let index = 0; index < SAMPLES; index += 1) {
        const question = generateLineQuestion({ seed: `hold-${preset.id}`, studentKey: 'student-a', roundIndex: 0, questionIndex: index, config });
        const reserve = lineFeedbackReserve({ itemType: question.itemType, answerStyle: question.answerStyle, forms: config.forms, specialLines: config.specialLines, triesPerItem: config.triesPerItem });
        for (const message of lineMessages(question, config)) {
          checked += 1;
          assert.ok(message.length <= longestOf(reserve), `${question.itemType}/${question.answerStyle}/${question.form}: "${message}" (${message.length}) is longer than the room kept (${longestOf(reserve)})`);
        }
      }
      assert.ok(checked > SAMPLES * 4, `${checked} messages checked`);
    });
  }
}

test('a built item\'s shown answer keeps room for its widest equation, stacked fraction and all', () => {
  for (const form of ['slopeIntercept', 'standard', 'pointSlope']) {
    const equation = widestAnswerEquation(form);
    assert.ok(equation?.tokens?.length, form);
    if (form !== 'standard') assert.ok(equation.tokens.some((token) => token.kind === 'frac'), `${form}: a stacked fraction is taller than words`);
  }
  // A choice has one try: no hint, and its room is that much shorter.
  const choice = lineFeedbackReserve({ itemType: LINE_ITEM_TYPE.NAME, answerStyle: LINE_ANSWER_STYLE.CHOICE, forms: ['slopeIntercept'] });
  const drawn = lineFeedbackReserve({ itemType: LINE_ITEM_TYPE.GRAPH, answerStyle: LINE_ANSWER_STYLE.GRAPH, forms: ['slopeIntercept'], triesPerItem: 3 });
  assert.equal(choice[0], 'Not that one — the right equation is marked.');
  assert.ok(longestOf(drawn) > longestOf(choice));
  assert.match(drawn.join('\n'), /tries left\./, 'a hint is kept with its tries left');
});

/* ------------------------------- the screens -------------------------------- */

const ROUNDS = Object.freeze({
  rush: { file: 'src/components/liveChallenge/GraphFeatureRushRound.jsx', css: 'RUSH_CSS' },
  line: { file: 'src/components/liveChallenge/LineGraphRound.jsx', css: 'LINE_CSS' },
});
for (const round of Object.values(ROUNDS)) {
  round.source = componentSource(round.file);
  round.sheet = parseCss(region(round.source, `const ${round.css} = \``, '\n`;', round.css).replace(new RegExp(`^const ${round.css} = \``), '').replace(/\$\{[^}]*\}/g, ''));
}
const at = (round, selector, property, media) => rulesFor(ROUNDS[round].sheet, selector)
  .filter((rule) => property in rule.declarations && (rule.atRules.join(' ') || null) === media)
  .map((rule) => rule.declarations[property].value);
const TALL = '@media (min-height: 36em)';

test('each round draws its feedback line over the room it keeps, and the room is never read', () => {
  for (const [round, { source }] of Object.entries(ROUNDS)) {
    const hold = region(source, `<div className="mm-${round}-hold">\n            <div className="mm-${round}-feedback"`, `\n          </div>\n          {/* The `, `the ${round} feedback line`);
    // The line a screen reader hears, then the room: the reserve's lines, hidden from it.
    assert.match(hold, new RegExp(`<div className="mm-${round}-feedback" data-kind=\\{feedback\\?\\.kind \\|\\| ''\\} aria-live="polite">`));
    assert.match(hold, new RegExp(`\\{feedbackRoom\\.map\\(\\(words\\) => <div key=\\{words\\} className="mm-${round}-feedback-held" aria-hidden="true">\\{words\\}</div>\\)\\}`));
    // One cell: the line and its room share it.
    assert.deepEqual(at(round, `.mm-${round}-hold`, 'display', null), ['grid']);
    assert.deepEqual(at(round, `.mm-${round}-hold > *`, 'grid-area', null), ['1 / 1']);
    // The room has the line's own size of words.
    for (const property of ['font-size', 'font-weight', 'min-height']) {
      const shared = rulesFor(ROUNDS[round].sheet, `.mm-${round}-feedback-held`).filter((rule) => property in rule.declarations && rule.selectors.includes(`.mm-${round}-feedback`));
      assert.equal(shared.length, 1, `${round}: the room and the line share ${property}`);
    }
    // Kept where the screen is tall for its text, and never seen.
    assert.deepEqual(at(round, `.mm-${round}-feedback-held`, 'display', null), ['none']);
    assert.deepEqual(at(round, `.mm-${round}-feedback-held`, 'display', TALL), ['block']);
    assert.deepEqual(at(round, `.mm-${round}-feedback-held`, 'visibility', TALL), ['hidden']);
  }
  // The rush's room is the round's settings; the line's, its item's kind and the round's forms.
  assert.match(ROUNDS.rush.source, /feedbackReserve\(\{ features: roundFeatures \? roundFeatures\.split\(' '\) : \[\], offScreen: offScreenGame, inequality: inequalityGame \}\)/);
  assert.match(ROUNDS.line.source, /lineFeedbackReserve\(\{\s*itemType: kindItemType,\s*answerStyle: kindAnswerStyle,\s*forms: roundForms \? roundForms\.split\(' '\) : \[\],/);
  assert.match(ROUNDS.line.source, /const kindItemType = question \? question\.itemType : /);
});

test('the cooldown keeps its place between pauses, and is said only while it runs', () => {
  for (const [round, { source }] of Object.entries(ROUNDS)) {
    const slot = region(source, `<div className="mm-${round}-cooldown-slot">`, '\n          </div>', `the ${round} cooldown`);
    assert.match(slot, new RegExp(`\\{input === ${round === 'rush' ? 'RUSH' : 'LINE'}_INPUT\\.LOCKED && playing && \\(\\s*<div className="mm-${round}-cooldown" role="status" aria-label="Short pause after misses">`));
    assert.deepEqual(at(round, `.mm-${round}-cooldown-slot:empty`, 'display', null), ['none']);
    assert.deepEqual(at(round, `.mm-${round}-cooldown-slot:empty`, 'display', TALL), ['block']);
    // As tall as the bar itself.
    assert.deepEqual(at(round, `.mm-${round}-cooldown-slot:empty`, 'height', TALL), at(round, `.mm-${round}-cooldown`, 'height', null));
  }
});

test('a set\'s notation keeps the room of its prompt and its widest set', () => {
  const { source } = ROUNDS.rush;
  // On every item of a round that deals sets (a point's item shows only the room).
  const notation = region(source, '{roundSets.length > 0 && (', '\n          )}', 'the notation');
  assert.match(notation, /\{shownKind\.set && \(\s*<div className="mm-rush-notation" data-empty=\{notation \? '0' : '1'\} aria-live="polite">/);
  assert.match(notation, /: notationPrompt\(shownKind\.inequality\)\}/, 'the prompt it shows');
  assert.match(notation, /<div className="mm-rush-notation-held" data-empty="1" aria-hidden="true">\{notationPrompt\(inequalityGame\)\}<\/div>/);
  // The widest set on each axis the round marks.
  assert.match(notation, /\{notationAxes\.map\(\(axis\) => \(\s*<div key=\{axis\} className="mm-rush-notation-held" data-empty="0" aria-hidden="true">\s*\{widestNotation\(\{ axis \}\)\.map\(/);
  assert.match(source, /const notationAxes = \[\.\.\.new Set\(roundSets\.map\(\(kind\) => \(kind\.vertical \? 'y' : 'x'\)\)\)\];/);
  for (const [selector, property] of [['.mm-rush-notation-held', 'font-size'], ['.mm-rush-notation-held[data-empty="1"]', 'font-size'], ['.mm-rush-notation-held > span', 'white-space']]) {
    const shared = rulesFor(ROUNDS.rush.sheet, selector).filter((rule) => property in rule.declarations && rule.selectors.includes(selector.replace('-held', '')));
    assert.ok(shared.length >= 1, `${selector}: drawn as the notation is (${property})`);
  }
  assert.deepEqual(at('rush', '.mm-rush-notation-held', 'display', TALL), ['block']);
});

test('a name-it item\'s answer moves nothing either: what the boxes spell keeps its room, and a choice\'s mark takes none', () => {
  const { source, sheet } = ROUNDS.line;
  // Typing: the prompt took two lines at 360 px and an equation one, and the
  // grid grew 21 px as the first box was filled.
  const preview = region(source, '<div className="mm-line-hold">\n        <div className="mm-line-preview"', '\n      </div>\n      <button', 'the built equation');
  assert.match(preview, /<div className="mm-line-preview" aria-live="polite">\s*\{preview \? <>You wrote <LineEquation equation=\{preview\} \/><\/> : BUILD_PROMPT\}/);
  assert.match(preview, /<div className="mm-line-preview-held" aria-hidden="true">\{BUILD_PROMPT\}<\/div>/);
  assert.match(preview, /<div className="mm-line-preview-held" aria-hidden="true">You wrote <LineEquation equation=\{widestAnswerEquation\(question\.build\?\.form\)\} \/><\/div>/);
  assert.deepEqual(at('line', '.mm-line-preview-held', 'display', TALL), ['block']);
  assert.ok(rulesFor(sheet, '.mm-line-preview-held').some((rule) => rule.selectors.includes('.mm-line-preview') && 'font-size' in rule.declarations), 'drawn as the preview is');
  // The ✓ or ✗ on a chosen equation: on its corner, out of the flow, never read
  // (its words are the hidden "Right answer: " / "Your answer: ").
  const choice = region(source, 'function ChoiceAnswer(', '\n}\n', 'the choices');
  assert.match(choice, /\{state === 'right' && <><span className="mm-line-mark" aria-hidden="true">✓<\/span><span style=\{SR_ONLY_STYLE\}>Right answer: <\/span><\/>\}/);
  assert.match(choice, /\{state === 'wrong' && <><span className="mm-line-mark" aria-hidden="true">✗<\/span><span style=\{SR_ONLY_STYLE\}>Your answer: <\/span><\/>\}/);
  assert.deepEqual(at('line', '.mm-line-mark', 'position', null), ['absolute']);
  assert.deepEqual(at('line', '.mm-line-choice', 'position', null), ['relative']);
  assert.deepEqual(at('line', '.mm-line-mark', 'pointer-events', null), ['none']);
});
