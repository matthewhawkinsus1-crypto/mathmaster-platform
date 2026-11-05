/*
 * CLASS MEMORY: WHAT A CLASS DID LAST TIME, AND WHAT TO TRY NEXT.
 *
 * When a game finishes, the server keeps one small record per class and
 * game — `liveChallengeClassMemory/{classId}__{game}` — saying when it was
 * played, with which settings, and how the class did: its accuracy, how many
 * each student completed, and what was weakest (a feature, a kind of
 * inequality, a form of line). The next time the teacher sets that game up
 * for that class, the setup card reads
 *
 *   Period 5 last played this on Oct 28 at Standard, 3 × 60 s, 86% accuracy → try Challenge.
 *
 * with two buttons, "Use last settings" and "Use suggestion". The suggestion
 * is a rule, worked out when the card is shown (so a better rule reaches every
 * memory already saved):
 *
 *   85% or higher   step up: the next difficulty; at the top, a shorter clock
 *   65% to 85%      repeat the same settings
 *   below 65%       step down: the easier difficulty; at the bottom — or where
 *                   the easier difficulty cannot play these settings — drop
 *                   the weakest feature; failing that, a longer clock
 *
 * Every suggestion is a game the server would create: each candidate passes
 * the game's own settings rule before it is offered.
 *
 * THE GAMES WITH A MEMORY (N80): the two rushes, Graph the Line (one memory
 * for its three formats: the format is one of its settings) and Solver Race
 * (by its difficulty bands; a Pace Race has no clock to shorten or lengthen).
 * Each is played on a difficulty ladder that its report's accuracy can be
 * read against. STANDARD CHALLENGE HAS NONE, on purpose: its questions come
 * from the bank by skill set and question style, with nothing easier or
 * harder to step to; its clock is no ladder either — the server fits each
 * round's length to its question, and only a round of 90 seconds or more lets
 * a multi-step (DOK 3) question in, so "a longer clock" for a class that
 * struggled can bring harder questions (liveChallengeDifficulty.mjs); and its
 * weakest standard, on a mixed review of one question a round, rests on one
 * or two questions. Its report says what happened; it has nothing honest to
 * say "try next" from.
 *
 * Class totals only: no student is named, so a student's deletion has nothing
 * here to reach. Pure: the finalization effect that writes it (Cloud
 * Functions), the teacher's setup card, and tests.
 */

import { getGraphFeature } from './graphFeatureRegistry.mjs';
import { RUSH_ROUND_LIMITS, normalizeGraphFeatureRushConfig } from './graphFeatureRushConfig.mjs';
import { INEQUALITY_RUSH_MODE_ID, RUSH_MODE_ID } from './graphFeatureRushRules.mjs';
import { INEQUALITY_ROUND_LIMITS, normalizeInequalityRushConfig } from './inequalityRush.mjs';
import { DEFAULT_SPRINT_LENGTH, LINE_ROUND_LIMITS, LINE_SPRINT_LENGTHS, normalizeLineGraphConfig } from './lineGraphConfig.mjs';
import { DEFAULT_LINE_TRIES, LINE_FORM_LABELS, LINE_GRAPH_FORMAT, LINE_GRAPH_FORMAT_IDS, LINE_GRAPH_MODE_IDS, lineGraphFormatOfMode } from './lineGraphRules.mjs';
import { CHALLENGE_MODE_ID, CLASSIC_SETUP_CHOICES } from './liveChallengeModes.mjs';
import { canonicalSolverRaceDifficulty, canonicalSolverRaceFocus } from './solverRace.mjs';

export const CLASS_MEMORY_COLLECTION = 'liveChallengeClassMemory';
export const CLASS_MEMORY_VERSION = 1;

// The suggestion rule's two lines, in accuracy percent.
export const STEP_UP_AT = 85;
export const REPEAT_FROM = 65;

export const DIFFICULTY_LABEL = Object.freeze({ easy: 'Easy', standard: 'Standard', challenge: 'Challenge', mixed: 'Mixed' });
// Mixed ramps from Easy to Challenge: a step up from it is Challenge, a step down Easy.
const LADDER = Object.freeze({
  harder: Object.freeze({ easy: 'standard', standard: 'challenge', mixed: 'challenge', challenge: null }),
  easier: Object.freeze({ challenge: 'standard', standard: 'easy', mixed: 'easy', easy: null }),
  labels: DIFFICULTY_LABEL,
});

/*
 * SOLVER RACE'S LADDER: its difficulty bands, as the teacher console names
 * them (a test holds them to its options). Ramp Up climbs from Foundation to
 * Challenge, so — like a rush's Mixed — a step up from it is Challenge and a
 * step down Foundation.
 */
export const SOLVER_RACE_DIFFICULTY_LABEL = Object.freeze({
  ramp: 'Ramp Up',
  foundation: 'Foundation',
  developing: 'Developing',
  advanced: 'Advanced',
  challenge: 'Challenge',
});
export const SOLVER_RACE_FOCUS_LABEL = Object.freeze({
  mixed: 'Mixed Solver Race',
  linearEquation: 'Linear Equations',
  literalEquation: 'Literal Equations',
  linearInequality: 'Linear Inequalities',
  absoluteValueEquation: 'Absolute Value Equations',
  absoluteValueInequality: 'Absolute Value Inequalities',
});
const SOLVER_RACE_LADDER = Object.freeze({
  harder: Object.freeze({ foundation: 'developing', developing: 'advanced', advanced: 'challenge', ramp: 'challenge', challenge: null }),
  easier: Object.freeze({ challenge: 'advanced', advanced: 'developing', developing: 'foundation', ramp: 'foundation', foundation: null }),
  labels: SOLVER_RACE_DIFFICULTY_LABEL,
});

// The classic setup's choices, as limits (CLASSIC_SETUP_CHOICES: the console's own lists).
const CLASSIC_LIMITS = Object.freeze({
  minRounds: Math.min(...CLASSIC_SETUP_CHOICES.roundCounts),
  maxRounds: Math.max(...CLASSIC_SETUP_CHOICES.roundCounts),
  defaultRounds: 10,
  defaultSeconds: 45,
  roundOptions: CLASSIC_SETUP_CHOICES.roundCounts,
  secondsOptions: CLASSIC_SETUP_CHOICES.roundSeconds,
});

// What a dropped kind of inequality is called in a suggestion.
const INEQUALITY_SHORT = Object.freeze({
  simple: 'simple inequalities',
  reversed: 'reversed inequalities',
  compoundAnd: '"and" compounds',
  compoundOr: '"or" compounds',
  oneStep: 'one-step solving',
  twoStep: 'two-step solving',
  absolute: 'absolute value',
});

const LINE_FORMAT_LABEL = Object.freeze({ [LINE_GRAPH_FORMAT.CLASSIC]: 'Classic', [LINE_GRAPH_FORMAT.SPRINT]: 'Sprint', [LINE_GRAPH_FORMAT.RUSH]: 'Rush' });
const lineFormatOr = (format) => (LINE_GRAPH_FORMAT_IDS.includes(format) ? format : LINE_GRAPH_FORMAT.CLASSIC);

const list = (value) => (Array.isArray(value) ? value.map(String) : []);

const joinedOf = (report) => (Array.isArray(report?.players) ? report.players : []).filter((player) => player.joined === true);

// A rush's report: graphs (or inequalities) completed, every attempt, and
// its breakdown rows hardest first (graphFeatureRush.buildRushReport).
const rushFacts = (rowsOf) => (report) => ({
  accuracyPercent: report?.accuracyPercent,
  completed: Number(report?.graphsCompleted) || 0,
  attempts: Number(report?.attempts) || 0,
  players: joinedOf(report).length,
  weakestRows: rowsOf(report),
});

const clock = (settings) => `${settings.roundCount} × ${settings.roundSeconds} s`;

/*
 * THE GAMES WITH A MEMORY, and what each one's memory is made of: which
 * modes play it, where a room keeps its settings and how the game's own rule
 * reads them, its difficulty ladder, which list "drop the weakest" takes
 * from, what its report says (accuracy, how much each student completed,
 * what was weakest), the setup's round choices, and the card's words.
 */
const GAMES = Object.freeze({
  graphFeatureRush: Object.freeze({
    id: 'graphFeatureRush',
    modeIds: Object.freeze([RUSH_MODE_ID]),
    label: 'Graph Feature Rush',
    // The report the memory is read from (functions/index.js builds it from the match result).
    report: 'graphFeatureRush',
    listKey: 'features',
    units: Object.freeze({ one: 'graph', many: 'graphs' }),
    ladder: LADDER,
    limitsOf: () => RUSH_ROUND_LIMITS,
    configOf: ({ room }) => room?.graphFeatureRush?.config,
    facts: rushFacts((report) => report?.byFeature),
    weakestName: (weakest) => getGraphFeature(weakest.key)?.shortLabel || weakest.label,
    dropped: (id) => `the ${getGraphFeature(id)?.shortLabel || id}`,
    normalize: normalizeGraphFeatureRushConfig,
    settingsOf: (config) => ({
      presetId: String(config.presetId || 'custom'),
      families: list(config.families),
      features: list(config.features),
      difficulty: String(config.difficulty || 'standard'),
      offScreen: config.offScreen === true,
    }),
    // Off-screen features start at Standard: stepping down to Easy leaves them.
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty, ...(difficulty === 'easy' ? { offScreen: false } : {}) }),
  }),
  inequalityRush: Object.freeze({
    id: 'inequalityRush',
    modeIds: Object.freeze([INEQUALITY_RUSH_MODE_ID]),
    label: 'Inequality Graphing Rush',
    report: 'inequalityRush',
    listKey: 'itemTypes',
    units: Object.freeze({ one: 'inequality', many: 'inequalities' }),
    ladder: LADDER,
    limitsOf: () => INEQUALITY_ROUND_LIMITS,
    configOf: ({ room }) => room?.inequalityRush?.config,
    facts: rushFacts((report) => report?.byFamily),
    dropped: (id) => INEQUALITY_SHORT[id] || id,
    normalize: normalizeInequalityRushConfig,
    settingsOf: (config) => ({
      presetId: String(config.presetId || 'custom'),
      itemTypes: list(config.itemTypes),
      difficulty: String(config.difficulty || 'standard'),
    }),
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty }),
  }),
  /*
   * GRAPH THE LINE: Classic, Sprint and Rush are three modes of one game in
   * the teacher's menu, so one memory holds the format with the rest. Its
   * report (lineGraphAttempts.buildLineGraphReport) gives the accuracy of
   * every check, the lines completed, and the forms hardest first, which is
   * what "drop the weakest" takes from.
   */
  lineGraph: Object.freeze({
    id: 'lineGraph',
    modeIds: LINE_GRAPH_MODE_IDS,
    label: 'Graph the Line',
    report: 'lineGraph',
    listKey: 'forms',
    units: Object.freeze({ one: 'line', many: 'lines' }),
    ladder: LADDER,
    limitsOf: (settings) => LINE_ROUND_LIMITS[lineFormatOr(settings?.format)],
    configOf: ({ room, result }) => {
      const config = room?.lineGraph?.config;
      if (!config || typeof config !== 'object') return null;
      return { ...config, format: config.format || lineGraphFormatOfMode(result?.modeId) };
    },
    facts: (report) => ({
      accuracyPercent: report?.accuracyPercent,
      completed: Number(report?.itemsCompleted) || 0,
      attempts: Number(report?.attempts) || 0,
      players: joinedOf(report).length,
      weakestRows: report?.byForm,
    }),
    dropped: (id) => String(LINE_FORM_LABELS[id] || id).toLowerCase(),
    normalize: (settings) => normalizeLineGraphConfig(settings, { format: lineFormatOr(settings?.format) }),
    settingsOf: (config) => ({
      format: lineFormatOr(config.format),
      presetId: String(config.presetId || 'custom'),
      itemTypes: list(config.itemTypes),
      forms: list(config.forms),
      specialLines: config.specialLines === true,
      difficulty: String(config.difficulty || 'standard'),
      nameStyle: String(config.nameStyle || 'choice'),
      triesPerItem: Number.isInteger(Number(config.triesPerItem)) ? Number(config.triesPerItem) : DEFAULT_LINE_TRIES,
      // A Sprint's length; any other format keeps the setup's default for a switch to Sprint.
      sprintLength: LINE_SPRINT_LENGTHS.includes(Number(config.sprintLength)) ? Number(config.sprintLength) : DEFAULT_SPRINT_LENGTH,
      sameEquations: config.sameEquations === true,
      showMethod: config.showMethod === true,
      slopeHelper: config.slopeHelper === true,
    }),
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty }),
    clockPhrase: (settings) => `${LINE_FORMAT_LABEL[lineFormatOr(settings.format)]}, ${clock(settings)}`,
  }),
  /*
   * SOLVER RACE: one question a round for the whole class, so its report is
   * the classic one (liveChallengeReport.buildChallengeReport): the class's
   * accuracy over every answer, and each student's rounds solved. Its rounds
   * record no standard, so it has no weakest row and nothing to drop; its
   * focus is the teacher's and stays.
   */
  solverRace: Object.freeze({
    id: 'solverRace',
    modeIds: Object.freeze([CHALLENGE_MODE_ID.SOLVER_RACE]),
    label: 'Solver Race',
    report: 'classic',
    listKey: null,
    units: Object.freeze({ one: 'round solved', many: 'rounds solved' }),
    ladder: SOLVER_RACE_LADDER,
    limitsOf: () => CLASSIC_LIMITS,
    configOf: ({ room }) => (room && typeof room === 'object'
      ? { focus: room.solverRaceFocus, difficulty: room.solverRaceDifficulty, timingMode: room.timingMode }
      : null),
    facts: (report) => {
      const joined = joinedOf(report);
      return {
        accuracyPercent: report?.classAccuracyPercent,
        completed: joined.reduce((sum, player) => sum + (Number(player.correct) || 0), 0),
        attempts: joined.reduce((sum, player) => sum + (Number(player.answered) || 0), 0),
        players: joined.length,
        weakestRows: [],
      };
    },
    normalize: (settings) => settings,
    settingsOf: (config) => ({
      focus: canonicalSolverRaceFocus(config.focus),
      difficulty: canonicalSolverRaceDifficulty(config.difficulty),
      timingMode: config.timingMode === 'pace' ? 'pace' : 'timed',
    }),
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty }),
    // A Pace Race has no clock: nothing to shorten or lengthen.
    hasClock: (settings) => settings.timingMode !== 'pace',
    clockPhrase: (settings) => (settings.timingMode === 'pace' ? `${settings.roundCount} rounds, Pace Race` : clock(settings)),
    detailPrefix: (settings) => SOLVER_RACE_FOCUS_LABEL[settings.focus] || null,
  }),
});

export const CLASS_MEMORY_GAME_IDS = Object.freeze(Object.keys(GAMES));
export const getClassMemoryGame = (id) => (Object.hasOwn(GAMES, String(id || '')) ? GAMES[String(id || '')] : null);
export const classMemoryGameOfMode = (modeId) => Object.values(GAMES).find((game) => game.modeIds.includes(String(modeId || ''))) || null;

/** A memory's document id: one per class and game. */
export const classMemoryId = (classId, game) => `${String(classId || '').trim()}__${String(game || '').trim()}`;

/**
 * Follow one class's memory for one game: `onValue` gets the record each time
 * it changes (null when there is none), so a game that has just finished and
 * writes it a moment after the room closes still reaches the setup card.
 * `listen(collection, id, next, fail)` is the database's own subscription
 * (Firestore's onSnapshot in the app) and returns its unsubscribe function.
 */
export const watchClassMemory = ({ classId, game, listen, onValue, onError }) => {
  if (!String(classId || '').trim() || !String(game || '').trim()) {
    onValue?.(null);
    return () => {};
  }
  return listen(
    CLASS_MEMORY_COLLECTION,
    classMemoryId(classId, game),
    (data) => onValue?.(data ?? null),
    onError,
  );
};

const percentOrNull = (value) => (Number.isFinite(Number(value)) && value !== null ? Math.round(Number(value)) : null);

/**
 * The memory a finished game leaves for its class, from its match result, its
 * room (the settings it was created with) and the game's report built from
 * the result (`game.report`: the rush's, Graph the Line's or the classic
 * one). Null when there is nothing to remember: not a game with a memory, not
 * finished, no class, no settings, or nobody played.
 */
export const buildClassMemory = ({ result = {}, room = {}, report = {} } = {}) => {
  const game = classMemoryGameOfMode(result.modeId);
  if (!game || result.status !== 'finished' || !result.classId) return null;
  const config = game.configOf({ room, result });
  if (!config || typeof config !== 'object') return null;
  const facts = game.facts(report);
  if (!facts.players || !(facts.attempts > 0)) return null;
  // The report's rows come hardest first: what the class completed least often.
  const weakestRow = (Array.isArray(facts.weakestRows) ? facts.weakestRows : []).find((row) => Number(row.questions ?? row.items) > 0) || null;
  return Object.freeze({
    version: CLASS_MEMORY_VERSION,
    classId: String(result.classId),
    teacherEmail: result.teacherEmail ? String(result.teacherEmail) : null,
    game: game.id,
    modeId: String(result.modeId),
    roomId: String(result.roomId || ''),
    classLabel: String(result.className || result.classPeriod || '') || null,
    playedAtMs: Number.isFinite(Number(result.finalizedAtMs)) ? Number(result.finalizedAtMs) : null,
    settings: Object.freeze({
      ...game.settingsOf(config),
      roundCount: Math.max(1, Math.round(Number(result.roomRoundCount || room.requestedRoundCount || room.roundCount) || 1)),
      roundSeconds: Math.max(1, Math.round(Number(result.roundSeconds || room.roundSeconds) || game.limitsOf(game.settingsOf(config)).defaultSeconds)),
      scoringStrategyId: String(result.scoringStrategyId || room.scoringStrategyId || 'grandPrix'),
    }),
    results: Object.freeze({
      accuracyPercent: percentOrNull(facts.accuracyPercent),
      completedPerStudent: Math.round((facts.completed / facts.players) * 10) / 10,
      players: facts.players,
      weakest: weakestRow ? Object.freeze({
        key: String(weakestRow.key),
        label: String(weakestRow.label || weakestRow.key),
        completionPercent: percentOrNull(weakestRow.completionPercent),
        accuracyPercent: percentOrNull(weakestRow.accuracyPercent),
      }) : null,
    }),
  });
};

/** Whether the stored memory is of a later game than `next` (a late or repeated run never replaces it). */
export const memoryIsNewer = (stored, next) => Boolean(stored && next)
  && String(stored.roomId || '') !== String(next.roomId || '')
  && Number(stored.playedAtMs) > Number(next.playedAtMs);

/* ------------------------------- suggestion ------------------------------- */

// The game's settings, normalized by its own rule, with the round settings
// beside them; null when the rule refuses them.
const playable = (game, settings) => {
  try {
    const config = game.normalize(settings);
    return Object.freeze({
      ...game.settingsOf(config),
      roundCount: settings.roundCount,
      roundSeconds: settings.roundSeconds,
      scoringStrategyId: settings.scoringStrategyId,
    });
  } catch (error) {
    if (error?.name?.endsWith('ConfigError')) return null;
    throw error;
  }
};

// The clock one notch shorter (−1) or longer (+1) among the setup's choices;
// none for a game with no clock.
const clockNotch = (game, settings, direction) => {
  if (game.hasClock && !game.hasClock(settings)) return null;
  const options = game.limitsOf(settings).secondsOptions;
  const current = Number(settings.roundSeconds);
  const candidates = direction < 0 ? options.filter((option) => option < current) : options.filter((option) => option > current);
  if (!candidates.length) return null;
  return direction < 0 ? candidates[candidates.length - 1] : candidates[0];
};

const suggestion = (kind, settings, phrase) => Object.freeze({ kind, settings, phrase });

/**
 * What to play next, from a memory: { kind, settings, phrase } —
 * kind `stepUp`, `faster`, `repeat`, `stepDown`, `drop` or `slower`;
 * settings the full setup (the game's settings, rounds, seconds, scoring);
 * phrase the card's "try Challenge". Null when the memory says nothing usable.
 */
export const suggestNextSettings = (memory) => {
  const game = getClassMemoryGame(memory?.game);
  const accuracy = memory?.results?.accuracyPercent;
  if (!game || !memory?.settings || accuracy === null || accuracy === undefined || !Number.isFinite(Number(accuracy))) return null;
  const last = playable(game, memory.settings);
  if (!last) return null;
  const { harder, easier, labels } = game.ladder;
  const repeat = suggestion('repeat', last, 'run it again');
  if (Number(accuracy) >= STEP_UP_AT) {
    const up = harder[last.difficulty] ? playable(game, game.atDifficulty(last, harder[last.difficulty])) : null;
    if (up) return suggestion('stepUp', up, `try ${labels[harder[last.difficulty]]}`);
    const shorter = clockNotch(game, last, -1);
    if (shorter) return suggestion('faster', { ...last, roundSeconds: shorter }, `try ${shorter} s rounds`);
    return repeat;
  }
  if (Number(accuracy) >= REPEAT_FROM) return repeat;
  const down = easier[last.difficulty] ? playable(game, game.atDifficulty(last, easier[last.difficulty])) : null;
  if (down) return suggestion('stepDown', down, `try ${labels[easier[last.difficulty]]}`);
  const weakest = memory.results?.weakest?.key;
  const items = game.listKey ? list(last[game.listKey]) : [];
  if (weakest && items.length > 1 && items.includes(weakest)) {
    const dropped = playable(game, { ...last, [game.listKey]: items.filter((id) => id !== weakest) });
    if (dropped) return suggestion('drop', dropped, `try it without ${game.dropped(weakest)}`);
  }
  const longer = clockNotch(game, last, 1);
  if (longer) return suggestion('slower', { ...last, roundSeconds: longer }, `try ${longer} s rounds`);
  return repeat;
};

const nearestOf = (options, value) => options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best), options[0]);

/**
 * A memory's settings as the game's setup holds them: the same fields, with
 * the rounds and seconds held to what the setup offers (a room's own values
 * always are; this keeps an odd one from showing a blank choice).
 */
export const setupFromMemory = (gameId, settings = {}) => {
  const game = getClassMemoryGame(gameId);
  if (!game) return null;
  const own = game.settingsOf(settings);
  const { minRounds, maxRounds, defaultRounds, roundOptions, secondsOptions } = game.limitsOf(own);
  const seconds = Number(settings.roundSeconds);
  const rounds = Math.max(minRounds, Math.min(maxRounds, Math.round(Number(settings.roundCount) || defaultRounds)));
  return {
    ...own,
    roundCount: roundOptions ? nearestOf(roundOptions, rounds) : rounds,
    roundSeconds: secondsOptions.includes(seconds) ? seconds : nearestOf(secondsOptions, seconds),
    scoringStrategyId: String(settings.scoringStrategyId || 'grandPrix'),
  };
};

/** Whether two setups are the same game (the card hides "Use suggestion" when it is the last one). */
export const sameSettings = (left, right) => {
  const keys = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].filter((key) => key !== 'presetId');
  const normal = (value) => (Array.isArray(value) ? [...value].sort().join('|') : String(value ?? ''));
  return keys.every((key) => normal(left?.[key]) === normal(right?.[key]));
};

/* --------------------------------- words --------------------------------- */

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** "Oct 28", or "Oct 28, 2025" for another year — in the reader's own time zone. */
export const memoryDate = (playedAtMs, nowMs = Date.now()) => {
  const played = new Date(Number(playedAtMs));
  if (Number.isNaN(played.getTime())) return null;
  const sameYear = played.getFullYear() === new Date(Number(nowMs)).getFullYear();
  return `${MONTHS[played.getMonth()]} ${played.getDate()}${sameYear ? '' : `, ${played.getFullYear()}`}`;
};

/**
 * The card's sentence: "Period 5 last played this on Oct 28 at Standard,
 * 3 × 60 s, 86% accuracy → try Challenge." (Graph the Line names its format,
 * "at Standard, Sprint, 2 × 180 s"; a Pace Race, "10 rounds, Pace Race".)
 */
export const classMemorySentence = (memory, next = suggestNextSettings(memory), { nowMs = Date.now() } = {}) => {
  if (!memory?.settings) return '';
  const game = getClassMemoryGame(memory.game);
  const who = memory.classLabel || 'This class';
  const when = memoryDate(memory.playedAtMs, nowMs);
  const { settings, results } = memory;
  const level = game?.ladder.labels[settings.difficulty] || settings.difficulty;
  const parts = [
    `${who} last played this${when ? ` on ${when}` : ''} at ${level}`,
    game?.clockPhrase ? game.clockPhrase(settings) : clock(settings),
    ...(results?.accuracyPercent !== null && results?.accuracyPercent !== undefined ? [`${results.accuracyPercent}% accuracy`] : []),
  ];
  return `${parts.join(', ')}${next ? ` → ${next.phrase}` : ''}.`;
};

/** The card's second line: "4.2 graphs per student · weakest: the vertex (41% completed)". */
export const classMemoryDetail = (memory) => {
  const game = getClassMemoryGame(memory?.game);
  const results = memory?.results;
  if (!game || !results) return '';
  const prefix = game.detailPrefix?.(memory.settings || {});
  const per = `${prefix ? `${prefix} · ` : ''}${results.completedPerStudent} ${results.completedPerStudent === 1 ? game.units.one : game.units.many} per student`;
  const weakest = results.weakest;
  if (!weakest) return per;
  const name = game.weakestName ? game.weakestName(weakest) : weakest.label;
  return `${per} · weakest: ${name}${weakest.completionPercent !== null ? ` (${weakest.completionPercent}% completed)` : ''}`;
};
