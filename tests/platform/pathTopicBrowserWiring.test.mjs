/*
 * BROWSE ALL TOPICS AND "WHY RECOMMENDED" — WIRING.
 *
 * Node cannot render these screens, so these contracts bind each screen to the
 * logic the behaviour tests cover (pathTopicBrowser.test.mjs,
 * pathRecommendationEvidence.test.mjs), anchored to the code that does the
 * work. The rendered result is checked in Chromium by
 * tests/browser/pathTopicBrowser.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const learningPath = read('src/components/student/StudentLearningPath.jsx');
const browser = read('src/components/student/MyMathPathTopicBrowser.jsx');
const app = read('src/components/student/MyMathPathApp.jsx');
const recommended = read('src/components/student/RecommendedSkills.jsx');

test('the Path tab reaches "Browse all topics", and the browser launches through the map\'s own launcher', () => {
  assert.match(learningPath, /import MyMathPathTopicBrowser from '\.\/MyMathPathTopicBrowser\.jsx';/);
  const topicsView = region(learningPath, "if (view === 'topics') {", 'const browseButton', 'the topics view');
  assert.match(topicsView, /return \(\s*<MyMathPathTopicBrowser\b/, 'the topics view must render the browser');
  // The SAME `choose` the map cards call, so a skill starts exactly as a map card does.
  assert.match(topicsView, /onChooseSkill=\{choose\}/);
  // The same coverage gate the map applies.
  assert.match(topicsView, /isCovered=\{isCovered\}/);
  assert.match(topicsView, /pathOptions=\{pathOptions\}/);
  assert.match(topicsView, /masteryProfilesByTEKS=\{masteryProfilesByTEKS \|\| \{\}\}/);
  assert.match(topicsView, /onBack=\{\(\) => \{[^}]*setView\('path'\)/);

  const button = region(learningPath, 'const browseButton = (', '\n  );', 'the browse button');
  assert.match(button, /onClick=\{\(\) => setView\('topics'\)\}/);
  // On the map's header AND on the empty map, where it is the only way to see the course.
  const empty = region(learningPath, 'if (!map || map.isEmpty) {', '\n  }\n', 'the empty map');
  assert.match(empty, /\{browseButton\}/);
  const header = region(learningPath, '<header', '</header>', 'the map header');
  assert.match(header, /\{browseButton\}/);
  // The launcher the browser receives is the one the map cards use.
  const choose = region(learningPath, 'const choose = onChooseSkill ?', '}) : null;', 'the launcher');
  assert.match(choose, /skillId: node\.skillId/);
  assert.match(choose, /status: node\.status/);
});

test('My Math Path hands the map the unified profiles and keeps one session launcher', () => {
  const element = region(app, '<StudentLearningPath', '/>', 'the Path tab');
  assert.match(element, /masteryProfilesByTEKS=\{masteryData\.masteryProfilesByTEKS\}/);
  // onChooseSkill still goes through startSession, whose coverage gate
  // (isSkillLaunchable) fails closed for the map and the browser alike.
  assert.match(element, /onChooseSkill=\{\(card\) => \{[^}]*startSession\(code/);
  assert.match(app, /\} else if \(!isSkillLaunchable\(coverage, teksCode\)\) \{/);
  // The map builds its cards with those profiles, so a card's score is the wheel's.
  const mapMemo = region(learningPath, 'const map = useMemo(', '\n  );', 'the map memo');
  assert.match(mapMemo, /masteryProfilesByTEKS \? \{ masteryProfilesByTEKS \} : \{\}/);
  assert.match(mapMemo, /\[pathOptions, limits, isCovered, masteryProfilesByTEKS\]/);
});

test('the browser renders the model, opens only launchable skills, and explains the rest', () => {
  assert.match(browser, /import \{ buildTopicBrowser, TOPIC_GROUPING \} from '\.\.\/\.\.\/platform\/path\/topicBrowser\.js';/);
  const model = region(browser, 'const browser = useMemo(() => buildTopicBrowser({', '}), [', 'the model');
  assert.match(model, /pathOptions, masteryProfilesByTEKS, skillProgressByTEKS, isCovered, groupBy, query/);

  const row = region(browser, 'function TopicSkill(', '\nexport function MyMathPathTopicBrowser', 'a skill row');
  assert.match(row, /const canStart = skill\.launchable && typeof onChooseSkill === 'function';/, 'only an open skill gets a start button');
  const start = region(row, '{canStart && (', '</button>', 'the start button');
  assert.match(start, /onClick=\{\(\) => onChooseSkill\(\{ skillId: skill\.skillId, title: skill\.title, status: skill\.pathStatus \}\)\}/);
  // A closed skill says why, in the model's sentence (explainLock / explainPacing / content).
  const closed = region(row, ') : (\n            <p data-why-not', '</p>', 'the closed explanation');
  assert.match(closed, /\{skill\.whyNot\}/);
  // The repair offered on a locked skill launches the repair, never the locked skill.
  const repair = region(row, '{skill.strengthen && typeof onChooseSkill', '</button>', 'the repair button');
  assert.match(repair, /onClick=\{\(\) => onChooseSkill\(skill\.strengthen\)\}/);
  // Both statuses, in their own words.
  assert.match(row, /\{skill\.masteryStatus\}/);
  assert.match(row, /\{skill\.statusLabel\}/);
  // Search is a real, labelled input bound to the model's query.
  assert.match(browser, /<label htmlFor="topic-browser-search"/);
  assert.match(browser, /id="topic-browser-search"[\s\S]{0,80}value=\{query\}[\s\S]{0,80}onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
});

test('map cards and Recommended cards show the named evidence in place of the verdict', () => {
  const node = region(learningPath, 'function PathNode(', '\nfunction PathSection', 'a map card');
  const condition = region(node, 'const showEvidence =', ';', 'when evidence shows');
  assert.match(condition, /node\.selectable/);
  assert.match(condition, /!node\.lockedExplanation/);
  assert.match(condition, /!node\.isRetentionCheck/);
  const evidence = region(node, '{showEvidence ? (', ') : (', 'the evidence list');
  assert.match(evidence, /node\.evidence\.map\(\(item\) => <li key=\{`\$\{item\.kind\}:\$\{item\.text\}`\}>\{item\.text\}<\/li>\)/);
  // The unit the class calls it by, computed by the map and now shown.
  assert.match(node, /\{showUnit && \(\s*<p data-class-unit[^>]*>\s*Class unit · \{node\.unitTitle\}/);

  const card = region(recommended, 'function SkillCard(', '\nexport default function RecommendedSkills', 'a Recommended card');
  assert.match(card, /const evidence = Array\.isArray\(card\.evidence\) \? card\.evidence : \[\];/);
  const list = region(card, '{evidence.length ? (', ') : (', 'the card evidence');
  assert.match(list, /evidence\.map\(\(item\) =>/);
  assert.match(list, /\{item\.text\}/);
});
