/*
 * HOW TO READ EACH GRAPH FEATURE: what a Graph Feature Rush round publishes
 * once it has ended (LC07).
 *
 * A Rush round has no shared question: every student's graphs are their own,
 * so there is no worked solution to show without handing one student's answer
 * to the class. What every student in the room does share is WHAT they were
 * asked to find. So a Rush round's results carry a short reading guide to the
 * features in the game — what each one is and where it sits on a graph, when
 * to choose "Does Not Exist" (and "Off screen", in a game with off-screen
 * features), what an open dot means, and the slip students most often make. It
 * names no graph, no target and no coordinate of anyone's: it is the same text
 * for every student and every round, written from the feature definitions
 * (graphFeatureRegistry.mjs) and the game's settings alone, so it can never
 * tell a student the answer to a graph they are still working on.
 *
 * It is SHORT on purpose: the projector shows it to a class from the back of a
 * room beside the round's tables, where a card that runs past the screen is
 * cut off (a first draft of 40-word lines was, and so was a headline that only
 * repeated the card's title). One line a feature, one line on the answers that
 * are not a tap ("Does Not Exist", "Off screen", and above Easy what an open
 * dot means: graphs there can end in dots), one on the slips, nothing else.
 *
 * It rides the worked-solution pipeline: captured privately when the round
 * opens, published at the round's close (liveChallengeSolutionReveal.mjs), and
 * read by the screens that read a solution, which title it by `guide: true`
 * (challengeSolutionModel.solutionTitle). Rush has no Second Chance, so
 * nothing holds it back. The end-of-game recap does not repeat it.
 *
 * ADDING A FEATURE to the registry means adding its reading here: a test fails
 * until every registered feature has one, so a game never publishes a guide
 * with a feature missing from it.
 *
 * Pure: shared by Cloud Functions and tests.
 */

import { getGraphFeature, listGraphFeatures } from './graphFeatureRegistry.mjs';
import { roundSolutionRecord } from './liveChallengeSolutionReveal.mjs';

/*
 * `line` says what the feature is and where it sits; `slip` is the mistake to
 * watch for. Plain, short sentences. Where a feature can be absent (registry
 * `canNotExist`) the guide adds one line on "Does Not Exist", naming those
 * features, because choosing it well is part of the skill.
 */
export const FEATURE_READING = Object.freeze({
  xIntercept: Object.freeze({
    line: 'x-intercepts (zeros, roots): where the graph meets the x-axis, so y = 0. Tap every one.',
    slip: 'Stopping at the first x-intercept when the graph meets the axis again.',
  }),
  yIntercept: Object.freeze({
    line: 'y-intercept: where the graph meets the y-axis, so x = 0. There is at most one.',
    slip: 'Mixing up the axes: the y-intercept is on the y-axis.',
  }),
  vertex: Object.freeze({
    line: 'Vertex: the turning point of a parabola, or the corner of an absolute value graph.',
    slip: 'Tapping an intercept: the vertex is usually not on an axis.',
  }),
  maximum: Object.freeze({
    line: 'Maximum: the highest point of the whole graph; a graph that keeps rising has none.',
    slip: 'Calling the top of the screen the maximum when the graph keeps rising.',
  }),
  minimum: Object.freeze({
    line: 'Minimum: the lowest point of the whole graph; a graph that keeps falling has none.',
    slip: 'Calling the bottom of the screen the minimum when the graph keeps falling.',
  }),
  asymptote: Object.freeze({
    line: 'Asymptotes: lines the graph gets closer and closer to, like x = 2 or y = −1. Tap each line.',
    slip: 'Tapping the curve itself instead of the line it heads for.',
  }),
  domain: Object.freeze({
    line: 'Domain: every x it covers. Tap an arrow for ∞, a dot where it stops; an open dot leaves it out.',
    slip: 'Stopping at the edge of the screen when an arrow says the graph keeps going.',
  }),
  range: Object.freeze({
    line: 'Range: every y it reaches, bottom to top. Tap its lowest and highest points, or an arrow for ∞.',
    slip: 'Reading the range along the x-axis instead of the y-axis.',
  }),
  // Intervals: x-values, read left to right; turns and ends stay out (open).
  increasing: Object.freeze({
    line: 'Increasing: the x-values where it rises, left to right. Where it turns or stops is left out.',
    slip: 'Writing y-values: where it rises is read along the x-axis.',
  }),
  decreasing: Object.freeze({
    line: 'Decreasing: the x-values where it falls, left to right. Where it turns or stops is left out.',
    slip: 'Reading right to left: always move left to right along x.',
  }),
  constant: Object.freeze({
    line: 'Constant: the x-values where it is level. Where the level part starts or stops is left out.',
    slip: 'Closing the ends of a level stretch: they stay open.',
  }),
  positive: Object.freeze({
    line: 'Positive: the x-values where the graph is above the x-axis. A zero is left out.',
    slip: 'Marking where the graph rises instead of where it is above the axis.',
  }),
  negative: Object.freeze({
    line: 'Negative: the x-values where the graph is below the x-axis. A zero is left out.',
    slip: 'Counting a zero: on the x-axis the graph is neither above nor below.',
  }),
});

// The sentences of the answers line beyond "Does Not Exist".
export const OFF_SCREEN_READING = 'If one is past the edge of the screen, choose Off screen.';
export const OPEN_DOT_READING = 'An open dot is not on the graph.';

// A game's features in the registry's own order, whatever order the teacher
// chose them in, each once; ids the registry does not know (or this module has
// no reading for) are left out.
const featuresInGame = (features) => {
  const wanted = new Set((Array.isArray(features) ? features : []).map((id) => String(id ?? '').trim()));
  return listGraphFeatures().map((feature) => feature.id).filter((id) => wanted.has(id) && FEATURE_READING[id]);
};

const labelOf = (id) => getGraphFeature(id)?.shortLabel || id;

// "x-intercepts", "x-intercepts or maximum", "x-intercepts, y-intercept or maximum".
const orList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);

// As many of the slips as the review's "watch out" line takes here, whole, in
// feature order: the first two, not a paragraph.
const SLIPS_MAX = 150;
const joinSlips = (ids) => {
  let text = '';
  for (const id of ids) {
    const next = text ? `${text} ${FEATURE_READING[id].slip}` : FEATURE_READING[id].slip;
    if (next.length > SLIPS_MAX) break;
    text = next;
  }
  return text;
};

/*
 * The answers that are not a tap, as one line: "Does Not Exist" when a feature
 * in the game can be absent; "Off screen" when the game turns off-screen
 * features on; and, above Easy, where a graph can end in a dot (a ray, a
 * segment, a piecewise split), that an open dot is not on the graph. Null when
 * there is nothing to say.
 */
const answersLine = ({ absentable, offScreen, dots }) => {
  const sentences = [];
  if (absentable.length) sentences.push(`If the graph has no ${orList(absentable.map(labelOf))}, choose Does Not Exist.`);
  if (offScreen) sentences.push(OFF_SCREEN_READING);
  if (dots && absentable.length) sentences.push(OPEN_DOT_READING);
  return sentences.length ? sentences.join(' ') : null;
};

/**
 * The guide for a game: the review a solution card draws (a line per feature
 * it asks for, the answers line, and the slips to watch for). `difficulty` and
 * `offScreen` are the game's settings (graphFeatureRushConfig); left out, the
 * guide is an Easy game's without off-screen features. Null when the game asks
 * for none this module can read: nothing is published then.
 */
export const rushReadingGuide = ({ features = [], difficulty = 'easy', offScreen = false } = {}) => {
  const ids = featuresInGame(features);
  if (!ids.length) return null;
  const absentable = ids.filter((id) => getGraphFeature(id)?.canNotExist);
  const answers = answersLine({ absentable, offScreen: offScreen === true, dots: Boolean(difficulty) && difficulty !== 'easy' });
  const reasoning = [
    ...ids.map((id) => FEATURE_READING[id].line),
    ...(answers ? [answers] : []),
  ];
  return Object.freeze({
    // The card's title says what it is and the lines name the features themselves: nothing to say above them.
    prompt: null,
    solutionReview: Object.freeze({
      headline: null,
      reasoning: Object.freeze(reasoning),
      commonError: joinSlips(ids) || null,
      connection: null,
      answerSummary: null,
    }),
  });
};

/**
 * What the Rush planner stores privately when a round opens: the guide as a
 * worked-solution record (liveChallengeSolutionReveal.roundSolutionRecord),
 * marked `guide` so the screens title it as one. Null when there is no guide.
 */
export const rushRoundSolutionRecord = ({ features = [], difficulty = 'easy', offScreen = false } = {}) => {
  const guide = rushReadingGuide({ features, difficulty, offScreen });
  if (!guide) return null;
  return Object.freeze({
    ...roundSolutionRecord({ question: { prompt: guide.prompt }, solutionReview: guide.solutionReview, displayStandard: null }),
    guide: true,
  });
};
