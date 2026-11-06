/*
 * THE LIVE CHALLENGE CONSOLE TELLS A SCREEN READER (teacher features walk, items 6 and 8).
 *
 * Two things changed the teacher's console with nothing for a screen reader:
 * the class memory card's "Use last settings" and "Use suggestion" fill in the
 * whole setup while focus stays on the button, and the game's report arrives
 * under "After the game" a moment after the game ends. The console now says
 * each once, politely, in its one live region.
 *
 *   - the words, and the report's rule: once for each finished room;
 *   - the card: each button fills in the setup, then says so, once (called with
 *     its hooks run once, helpers/shallowComponent.mjs);
 *   - the console: one polite live region on the setup screen and on a game's
 *     console, the cards given its voice through every setup, and the report's
 *     arrival said from an effect of its own (source: Node cannot mount the console).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { setupFromMemory, suggestNextSettings } from '../../functions/shared/liveChallengeClassMemory.mjs';
import { CONSOLE_ANNOUNCEMENT, reportArrivalAnnouncement } from '../../src/platform/liveChallenge/consoleAnnouncements.js';
import { startShallowLoader } from './helpers/shallowComponent.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (path) => executableSource(read(path));

let shallow = null;
let ClassMemoryCard = null;
before(async () => {
  shallow = await startShallowLoader();
  ClassMemoryCard = (await shallow.ssrLoadModule('/src/components/liveChallenge/ClassMemoryCard.jsx')).default;
});
after(async () => { await shallow?.close(); });

const elementsOf = (node, found = []) => {
  if (Array.isArray(node)) { node.forEach((child) => elementsOf(child, found)); return found; }
  if (node && typeof node === 'object' && 'props' in node) { found.push(node); elementsOf(node.props?.children, found); }
  return found;
};
const button = (tree, name) => elementsOf(tree).find((element) => element.type === 'button' && element.props.children === name);

// Period 5's last rush: 50% accuracy, so the card offers an easier game beside the same one again.
const memory = {
  version: 1,
  game: 'graphFeatureRush',
  classId: 'class-5',
  classLabel: 'Period 5',
  playedAtMs: Date.UTC(2026, 9, 28, 17, 0),
  settings: {
    presetId: 'custom', families: ['linear', 'quadratic'], features: ['xIntercept', 'yIntercept', 'vertex'],
    difficulty: 'standard', offScreen: false, roundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix',
  },
  results: { accuracyPercent: 50, completedPerStudent: 4.2, players: 24, weakest: { key: 'vertex', label: 'vertex', completionPercent: 41, accuracyPercent: 55 } },
};

test('the console\'s words are short and polite, and the report\'s arrival is said once for each finished room', () => {
  assert.deepEqual(Object.keys(CONSOLE_ANNOUNCEMENT).sort(), ['lastSettings', 'reportReady', 'suggestion']);
  Object.values(CONSOLE_ANNOUNCEMENT).forEach((words) => assert.match(words, /^[A-Z][^!]{10,60}\.$/, words));
  assert.equal(reportArrivalAnnouncement({ roomId: 'room-1', report: { playedCount: 3 } }), CONSOLE_ANNOUNCEMENT.reportReady, 'the report is on the console');
  assert.equal(reportArrivalAnnouncement({ roomId: 'room-1', report: { playedCount: 3 }, announcedRoomId: 'room-1' }), null, 'said once: not again for the same room');
  assert.equal(reportArrivalAnnouncement({ roomId: 'room-1', report: null }), null, 'not before it is written');
  assert.equal(reportArrivalAnnouncement({ roomId: null, report: { playedCount: 3 } }), null, 'nor without a room');
  assert.equal(reportArrivalAnnouncement({ roomId: 'room-2', report: { playedCount: 5 }, announcedRoomId: 'room-1' }), CONSOLE_ANNOUNCEMENT.reportReady, 'the next game\'s report is news again');
});

test('each of the card\'s buttons fills in the setup, then says so once', () => {
  const used = [];
  const said = [];
  const tree = ClassMemoryCard({ memory, onUse: (setup) => used.push(setup), onAnnounce: (words) => said.push(words) });
  const last = button(tree, 'Use last settings');
  const suggestion = button(tree, 'Use suggestion');
  assert.ok(last && suggestion, 'both buttons are offered: the suggestion is another game');
  last.props.onClick();
  assert.deepEqual(used, [setupFromMemory('graphFeatureRush', memory.settings)], 'last time\'s game, whole');
  assert.deepEqual(said, [CONSOLE_ANNOUNCEMENT.lastSettings]);
  suggestion.props.onClick();
  assert.deepEqual(used[1], setupFromMemory('graphFeatureRush', suggestNextSettings(memory).settings), 'the suggested game, whole');
  assert.deepEqual(said, [CONSOLE_ANNOUNCEMENT.lastSettings, CONSOLE_ANNOUNCEMENT.suggestion], 'one sentence for each press, after the setup is filled');
  // A card shown where nobody listens (a harness, a setup without a console) still fills the setup in.
  const alone = [];
  button(ClassMemoryCard({ memory, onUse: (setup) => alone.push(setup) }), 'Use last settings').props.onClick();
  assert.equal(alone.length, 1);
});

test('the console has one polite live region, on its setup screen and on a game\'s console, and nothing else speaks in it', () => {
  const teacher = code('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const announcer = region(teacher, 'const consoleAnnouncer = (', ');', 'the console\'s live region');
  assert.match(announcer, /<p role="status" aria-live="polite" aria-atomic="true" data-mm-console-announcer="" style=\{SR_ONLY_STYLE\}>\{announcement\}<\/p>/, 'polite, whole, and seen by nobody');
  // Present before anything is said, so what it says is heard: rendered on the setup screen and on the console.
  assert.equal((teacher.match(/\{consoleAnnouncer\}/g) || []).length, 2);
  const setupScreen = region(teacher, '<h3 style={{ marginTop: 0 }}>Create a challenge</h3>', '\n  }\n', 'the setup screen');
  assert.match(setupScreen, /\{consoleAnnouncer\}/, 'the setup screen, where the card is');
  const gameConsole = region(teacher, '<div style={{ display: \'grid\', gap: 16 }} data-mm-host-console=', '</header>', 'the game console\'s header');
  assert.ok(teacher.indexOf('{consoleAnnouncer}', teacher.indexOf(gameConsole)) > 0, 'and a game\'s console, where the report arrives');
  // Emptied, then filled a moment later: the same words said twice are heard twice.
  const announce = region(teacher, 'const announce = useCallback((words) => {', '}, []);', 'announce');
  assert.match(announce, /setAnnouncement\(''\);\s*announceTimerRef\.current = window\.setTimeout\(\(\) => \{\s*announceTimerRef\.current = null;\s*setAnnouncement\(words\);\s*\}, \d+\);/);
  assert.match(teacher, /useEffect\(\(\) => \{ setAnnouncement\(''\); \}, \[roomId\]\);/, 'leaving a room leaves nothing said about it');
  assert.equal((teacher.match(/setAnnouncement\(/g) || []).length, 3, 'only announce and leaving a room write to it');
});

test('every class memory card is given the console\'s voice, through every game\'s setup', () => {
  const teacher = code('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /<ClassMemoryCard memory=\{classMemory\} onUse=\{takeSolverRaceSetup\} onAnnounce=\{announce\} \/>/, 'Solver Race\'s card, on the console');
  for (const [setup, game] of [['GraphFeatureRushSetup', "'graphFeatureRush'"], ['InequalityRushSetup', "'inequalityRush'"], ['LineGraphSetup', 'LINE_GRAPH_GAME']]) {
    assert.match(teacher, new RegExp(`<${setup} [^\\n]*memory=\\{classMemory\\?\\.game === ${game} \\? classMemory : null\\} onAnnounce=\\{announce\\} />`), setup);
    const source = code(`src/components/liveChallenge/${setup}.jsx`);
    assert.match(source, new RegExp(`export default function ${setup}\\(\\{[^}]*\\bonAnnounce = null \\}\\)`), `${setup} takes it`);
    assert.match(source, /\{memory && <ClassMemoryCard memory=\{memory\} onUse=\{onChange\} onAnnounce=\{onAnnounce\} \/>\}/, `${setup} hands it to its card`);
  }
});

test('the report\'s arrival is said from an effect of its own, once for each room, and the watch is untouched', () => {
  const teacher = code('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const effect = region(teacher, 'const reportAnnouncedForRef = useRef(null);', '}, [report, announce]);', 'the report\'s arrival');
  assert.match(effect, /const words = reportArrivalAnnouncement\(\{ roomId: finishedRoomId, report, announcedRoomId: reportAnnouncedForRef\.current \}\);\s*if \(!words\) return;\s*reportAnnouncedForRef\.current = finishedRoomId;\s*announce\(words\);/);
  // The watch still hands the report straight to the screen (liveChallengeReport.test.mjs holds it).
  assert.match(teacher, /return watchChallengeReport\(\s*finishedRoomId,\s*setReport,/);
});
