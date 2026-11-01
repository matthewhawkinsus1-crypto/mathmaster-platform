// LC07: a Graph Feature Rush round has no shared question, so it has no worked
// solution; what the whole room shares is what it was asked to find. Its
// results carry a short reading guide to those features — what each is, where
// it sits, when to choose "Does Not Exist", the slip to watch for — through the
// worked-solution pipeline. The text is pure (graphFeatureReading.mjs); the
// pipeline's wiring is read as source, and tests/integration/graphFeatureRush
// plays it for real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { getGraphFeature, listGraphFeatures, registerGraphFeature } from '../../functions/shared/graphFeatureRegistry.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS } from '../../functions/shared/graphFeatureRushConfig.mjs';
import {
  FEATURE_READING,
  rushReadingGuide,
  rushRoundSolutionRecord,
} from '../../functions/shared/graphFeatureReading.mjs';
import { publicSolutionDocument, roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import { PROJECTOR_GUIDE_STEPS, PROJECTOR_SOLUTION_STEPS, READING_GUIDE_TITLE, SOLUTION_TITLE, projectorStepLimit, solutionTitle } from '../../src/platform/liveChallenge/challengeSolutionModel.js';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const index = read('functions/index.js');
const ALL_FEATURES = ['xIntercept', 'yIntercept', 'vertex', 'maximum', 'minimum'];
const DNE = /Does Not Exist/;
const DNE_LINE = /^If the graph has no .+, choose Does Not Exist\.$/;

test('every feature the registry can ask for has a reading, and the guide says "Does Not Exist" exactly when a feature in the game can be absent', () => {
  const registered = listGraphFeatures();
  assert.ok(registered.length >= 5, 'the registry has its features');
  for (const feature of registered) {
    const reading = FEATURE_READING[feature.id];
    assert.ok(reading, `${feature.id} has a reading (add one to graphFeatureReading.mjs)`);
    assert.ok(reading.line.length > 20 && reading.slip.length > 20, `${feature.id} says something`);
    // A feature's own game: one line for it, and a line on "Does Not Exist" if it can be absent.
    const alone = rushReadingGuide({ features: [feature.id] }).solutionReview.reasoning;
    assert.equal(alone[0], reading.line, feature.id);
    assert.equal(alone.length, feature.canNotExist ? 2 : 1, `${feature.id}: "Does Not Exist" is named if and only if it can be the answer`);
    if (feature.canNotExist) assert.match(alone[1], DNE_LINE);
    assert.doesNotMatch(reading.line, DNE, `${feature.id}: the one line on it is the guide's, not repeated in each feature`);
  }
  // …and no reading for a feature the registry does not have.
  for (const id of Object.keys(FEATURE_READING)) assert.ok(getGraphFeature(id), `${id} is a registered feature`);
});

test('a game\'s guide has one line per feature it asks, in the registry\'s order, and one line on Does Not Exist naming the features that can be absent', () => {
  const guide = rushReadingGuide({ features: ['vertex', 'yIntercept', 'xIntercept'] });
  assert.deepEqual(guide.solutionReview.reasoning, [
    FEATURE_READING.xIntercept.line,
    FEATURE_READING.yIntercept.line,
    FEATURE_READING.vertex.line,
    'If the graph has no x-intercepts or y-intercept, choose Does Not Exist.',
  ]);
  assert.equal(guide.prompt, null, 'the lines name the features themselves');
  assert.equal(guide.solutionReview.headline, null, 'the card\'s title says what it is');
  // The names read as a list: one, two, three or four.
  const line = (features) => rushReadingGuide({ features }).solutionReview.reasoning.at(-1);
  assert.equal(line(['maximum']), 'If the graph has no maximum, choose Does Not Exist.');
  assert.equal(line(['maximum', 'minimum']), 'If the graph has no maximum or minimum, choose Does Not Exist.');
  assert.equal(line(['xIntercept', 'yIntercept', 'maximum']), 'If the graph has no x-intercepts, y-intercept or maximum, choose Does Not Exist.');
  assert.equal(line(ALL_FEATURES), 'If the graph has no x-intercepts, y-intercept, maximum or minimum, choose Does Not Exist.', 'the vertex is never absent: it is not named');
  // A game of features that are always there says nothing about Does Not Exist.
  assert.deepEqual(rushReadingGuide({ features: ['vertex'] }).solutionReview.reasoning, [FEATURE_READING.vertex.line]);
  // The review says nothing is the answer and nothing connects to anything: a reading, not a solution.
  assert.equal(guide.solutionReview.answerSummary, null);
  assert.equal(guide.solutionReview.connection, null);
  // One feature, one line. A repeated id is one feature.
  assert.equal(rushReadingGuide({ features: ['vertex', 'vertex'] }).solutionReview.reasoning.length, 1);
  // Every preset a teacher can start from yields a guide that covers all of its features.
  for (const preset of GRAPH_FEATURE_RUSH_PRESETS) {
    const lines = rushReadingGuide({ features: preset.features }).solutionReview.reasoning;
    const absentable = preset.features.some((id) => getGraphFeature(id).canNotExist);
    assert.equal(lines.length, preset.features.length + (absentable ? 1 : 0), preset.id);
  }
});

test('the slips to watch for are those of the features asked: the first two whole ones, not a paragraph', () => {
  assert.equal(rushReadingGuide({ features: ['vertex'] }).solutionReview.commonError, FEATURE_READING.vertex.slip);
  assert.equal(rushReadingGuide({ features: ['minimum'] }).solutionReview.commonError, FEATURE_READING.minimum.slip);
  const mixed = rushReadingGuide({ features: ['vertex', 'yIntercept'] }).solutionReview.commonError;
  assert.equal(mixed, `${FEATURE_READING.yIntercept.slip} ${FEATURE_READING.vertex.slip}`, 'in the registry\'s order');
  assert.ok(!mixed.includes(FEATURE_READING.maximum.slip));
  // All five features: as many whole slips as fit 150 characters, in order: the first two.
  const all = rushReadingGuide({ features: ALL_FEATURES }).solutionReview.commonError;
  assert.equal(all, ALL_FEATURES.slice(0, 2).map((id) => FEATURE_READING[id].slip).join(' '));
  assert.ok(all.length <= 150 && !all.includes(FEATURE_READING.vertex.slip));
  // A slip that does not fit whole is left out, never cut: the same for a later feature's longer slip.
  assert.equal(rushReadingGuide({ features: ['minimum', 'maximum'] }).solutionReview.commonError, `${FEATURE_READING.maximum.slip} ${FEATURE_READING.minimum.slip}`.length <= 150 ? `${FEATURE_READING.maximum.slip} ${FEATURE_READING.minimum.slip}` : FEATURE_READING.maximum.slip);
});

test('a game that asks for nothing the guide can read has no guide (nothing is published)', () => {
  for (const features of [[], undefined, null, 'xIntercept', ['axisOfSymmetry'], [''], [null]]) {
    assert.equal(rushReadingGuide({ features }), null, JSON.stringify(features));
  }
  assert.equal(rushReadingGuide(), null);
  assert.equal(rushRoundSolutionRecord({ features: [] }), null);
  // An unknown id beside a known one is left out; the known one is read.
  assert.equal(rushReadingGuide({ features: ['axisOfSymmetry', 'vertex'] }).solutionReview.reasoning.length, 1);
});

test('the guide is the same text for every student and every round: a function of the features alone, naming no graph', () => {
  const once = JSON.stringify(rushReadingGuide({ features: ALL_FEATURES }));
  assert.equal(JSON.stringify(rushReadingGuide({ features: [...ALL_FEATURES].reverse() })), once, 'the order a teacher picked them in does not matter');
  assert.equal(JSON.stringify(rushReadingGuide({ features: ALL_FEATURES })), once, 'and nothing varies between calls');
  // No coordinate of any graph, no seed, no id: a reading, not an answer.
  assert.doesNotMatch(once, /\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\)/, 'no ordered pair');
  assert.doesNotMatch(once, /\bseed\b|graphFeatureRush|playerKey|studentId/i);
});

test('the guide is short enough for a projector: a line a feature, and nothing over 100 characters in a feature line', () => {
  for (const [id, reading] of Object.entries(FEATURE_READING)) {
    assert.ok(reading.line.length <= 100, `${id}: ${reading.line.length} characters`);
    assert.ok(reading.slip.length <= 80, `${id}'s slip: ${reading.slip.length} characters`);
  }
  const guide = rushReadingGuide({ features: ALL_FEATURES }).solutionReview;
  assert.ok(guide.reasoning.length <= 6, 'five features and the Does Not Exist line');
  assert.equal(guide.headline, null);
  // The whole card, at its longest, is under 650 characters: the projector's card is 12 to 15 lines.
  const total = guide.reasoning.join('').length + guide.commonError.length;
  assert.ok(total < 650, `${total} characters`);
});

test('what the guide says fits the worked-solution record whole: nothing is clipped on the way to the screens', () => {
  const guide = rushReadingGuide({ features: ALL_FEATURES });
  const record = roundSolutionRecord({ question: { prompt: guide.prompt }, solutionReview: guide.solutionReview, displayStandard: null });
  assert.equal(record.prompt, null);
  assert.deepEqual([...record.solutionReview.reasoning], [...guide.solutionReview.reasoning], 'every line');
  assert.equal(record.solutionReview.headline, null);
  assert.equal(record.solutionReview.commonError, guide.solutionReview.commonError);
  // The stored record says it is a guide, and the public document passes that on to the screens.
  const stored = rushRoundSolutionRecord({ features: ['xIntercept'] });
  assert.equal(stored.guide, true);
  assert.equal(stored.teksCode, null);
  const published = publicSolutionDocument({ roundIndex: 1, record: stored, revealedAtMs: 5 });
  assert.equal(published.guide, true);
  assert.equal(published.available, true, 'a card is drawn');
  assert.equal(published.roundIndex, 1);
  // A bank round's solution is not a guide, and only `true` says so.
  assert.equal('guide' in publicSolutionDocument({ roundIndex: 0, record: roundSolutionRecord({ question: { prompt: 'x' }, solutionReview: { reasoning: ['a'] } }) }), false);
  assert.equal('guide' in publicSolutionDocument({ roundIndex: 0, record: { ...stored, guide: 'yes' } }), false);
});

test('a screen titles a guide as one, and any other solution as a worked solution', () => {
  assert.equal(solutionTitle({ guide: true, solutionReview: {} }), READING_GUIDE_TITLE);
  assert.equal(READING_GUIDE_TITLE, 'How to read the features');
  for (const solution of [{ solutionReview: {} }, { guide: false }, { guide: 1 }, { guide: 'true' }, {}, null, undefined]) assert.equal(solutionTitle(solution), SOLUTION_TITLE);
  assert.equal(SOLUTION_TITLE, 'Worked solution');
});

test('the rush planner captures the guide when a round opens, and the reveal publishes it at the round\'s close', () => {
  const planner = region(index, 'const GRAPH_FEATURE_RUSH_PLANNER = Object.freeze({', '\n});\n', 'the rush planner');
  const open = region(planner, 'async openRound(', '\n  },', 'the rush openRound');
  assert.match(open, /const \{ reading \} = await graphFeatureRushRules\(\);/);
  // The guide is of the room's own config — its features, and its difficulty
  // and off-screen setting (what it says about dots and "Off screen") — and is
  // the round's `solution` in what the opening returns (kept privately by it).
  assert.match(open, /const config = privateState\.graphFeatureRush\?\.config \|\| room\.graphFeatureRush\?\.config \|\| \{\};/);
  const opening = region(open, 'return {', '\n    };', 'what the opening returns');
  assert.match(opening, /\n\s*solution: reading\.rushRoundSolutionRecord\(\{ features: config\.features, difficulty: config\.difficulty, offScreen: config\.offScreen === true \}\),/);
  // The module is loaded with the rush's other rules.
  assert.match(region(index, 'async function graphFeatureRushRules() {', '\n}\n', 'the rush modules'), /import\("\.\/shared\/graphFeatureReading\.mjs"\)/);

  const revealable = region(index, 'function liveChallengeRevealableRounds(', '\n}\n', 'revealable rounds');
  const rush = region(revealable, 'QUESTION_SOURCE.GRAPH_FEATURE_GENERATOR', '    const sharedLineKeys = privateState.lineGraph?.sharedLineKeys;', 'the rush branch');
  // Rush has no Second Chance and no replay plan to wait for: nothing holds a guide back …
  assert.match(rush, /secondChancePossible: false, replayOf: \{\}, finished,/);
  assert.match(rush, /closedThrough, scheduledRoundCount: scheduled,/);
  // … never a round the match did not reach, and never one with no guide captured (a game opened before this existed).
  assert.match(rush, /\.filter\(\(round\) => round <= reached && privateState\.roundSolutions\?\.\[String\(round\)\]\)/);
  // Graph the Line's shared rounds keep their own branch, after it.
  assert.ok(revealable.indexOf('privateState.lineGraph?.sharedLineKeys') > revealable.indexOf('GRAPH_FEATURE_GENERATOR'));
});

test('a student\'s end-of-game recap lists no guide: the recap is for answers and worked solutions', () => {
  const recap = executableSource(read('functions/lib/liveChallengeRecap.js'));
  assert.match(recap, /const guide = solution\?\.guide === true;\s*const available = !solutionsWithheld && !guide && Boolean\(solution\?\.available && solution\.solutionReview\);/);
  assert.match(recap, /prompt: guide \? null : solution\?\.prompt \|\| null,/);
});

test('the three screens that show a solution title it from the document', () => {
  const parts = read('src/components/liveChallenge/ChallengeSolutionParts.jsx');
  const panel = region(parts, 'export function RoundSolutionPanel(', '\n}\n', 'the student panel');
  assert.match(panel, /title=\{solutionTitle\(solution\)\}/);
  const host = region(read('src/components/liveChallenge/ChallengeHostConsole.jsx'), 'export function HostSolutionPanel(', '\n}\n', 'the console panel');
  assert.match(host, /const title = solutionTitle\(solution\);/);
  assert.match(host, /aria-label=\{title\}/);
  assert.match(host, /marginBottom: 8 \}\}>\{title\}<\/div>/, 'and the heading says it');
  const projector = region(read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx'), 'function ProjectorSolution(', '\n}\n', 'the projector panel');
  assert.match(projector, /const title = solutionTitle\(solution\);/);
  assert.equal((projector.match(/aria-label=\{title\}/g) || []).length, 1);
  assert.equal((projector.match(/<div style=\{labelStyle\}>\{title\}<\/div>/g) || []).length, 2, 'the held/loading card and the ready card');
});

test('the projector draws every line of a guide, up to seven, and the first five of any other solution', () => {
  // Seven since asymptotes: a game asking for all six features has six lines
  // and the answers line, which is the one a cut would lose.
  assert.equal(projectorStepLimit({ guide: true }), 7);
  assert.equal(PROJECTOR_GUIDE_STEPS, 7);
  assert.equal(PROJECTOR_SOLUTION_STEPS, 5);
  for (const solution of [{}, null, undefined, { guide: false }, { guide: 'true' }, { guide: 1 }]) assert.equal(projectorStepLimit(solution), 5);
  // The longest guide the registry's features can make is within it: its last line is the one on Does Not Exist.
  const every = rushReadingGuide({ features: listGraphFeatures().map((feature) => feature.id) }).solutionReview.reasoning;
  assert.ok(every.length <= PROJECTOR_GUIDE_STEPS, `${every.length} lines for every feature: raise PROJECTOR_GUIDE_STEPS, or shorten, before the projector cuts the last one off`);
  assert.match(every.at(-1), DNE_LINE);
  // The projector takes its limit from the model.
  const projector = region(read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx'), 'function ProjectorSolution(', '\n}\n', 'the projector panel');
  assert.match(projector, /\.filter\(Boolean\)\.slice\(0, projectorStepLimit\(solution\)\);/);
});

// Last in the file, because it adds a feature to the registry (for this process only).
test('a feature the registry has and the guide cannot read is left out of the guide, never an error that stops a round opening', () => {
  registerGraphFeature({ id: 'axisOfSymmetryProbe', label: 'axis of symmetry', vocabulary: [{ id: 'axisProbe', prompt: 'Find the axis of symmetry' }] });
  assert.ok(getGraphFeature('axisOfSymmetryProbe'), 'the registry has it');
  assert.equal(FEATURE_READING.axisOfSymmetryProbe, undefined, 'and the guide does not');
  const guide = rushReadingGuide({ features: ['axisOfSymmetryProbe', 'vertex'] });
  assert.deepEqual(guide.solutionReview.reasoning, [FEATURE_READING.vertex.line]);
  assert.equal(rushReadingGuide({ features: ['axisOfSymmetryProbe'] }), null);
  assert.equal(rushRoundSolutionRecord({ features: ['axisOfSymmetryProbe'] }), null);
});
