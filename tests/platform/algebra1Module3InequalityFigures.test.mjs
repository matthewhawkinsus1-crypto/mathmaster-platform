/*
 * N38 (F-GRAPH-IN-WORDS, docs/qa/2026-11-03-pr537-walkthrough/findings.md):
 * THE GRAPHS IN ALGEBRA I M3 T2 LESSONS 4 AND 5 ARE DRAWN, AND EACH ONE SHOWS
 * WHAT ITS ITEM'S KEY HOLDS.
 *
 * "Write a linear inequality for graphs a, b and c" showed no graph: each was
 * a sentence ("a DASHED boundary line through (0, 2) and (1, 6); the shaded
 * half-plane contains (0, 0)"), so the item tested reading a description of a
 * graph. Nine items in each file now carry the figure itself. Held here, for
 * each figure, against the key the student is graded on (never against the
 * builder's own idea of the graph):
 *   - every boundary the key names is drawn, dashed for < and >, solid for
 *     ≤ and ≥;
 *   - the shading lies exactly where the key's inequality (or system) is true:
 *     at every grid point off the lines, a point is in a shaded region of the
 *     figure if and only if the key holds there;
 *   - the prompt no longer says what the picture shows.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { ALGEBRA1_M3_INEQUALITY_LESSONS } from '../../scripts/content/build-algebra1-m3-inequalities.mjs';
import { parsePolynomial } from '../../functions/shared/algebraicForm.mjs';
import { readGraphPointCoordinates } from '../../src/graphPointUtils.js';
import { staticGraphScaleViews } from '../../src/graphSpecUtils.js';
import { shadingPolygon, shadingRegions } from '../../src/platform/graph/halfPlaneShading.js';
import { compiled, readRepoFile } from './helpers/lessonFileChecks.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

/* ------------------------------------------------- a key, as the grader reads it */

// "y < 4x + 2" as a test at a point, read with the platform's polynomial parser.
const keyTest = (key) => {
  const [left, relation, right] = String(key).replace(/≤/g, '<=').replace(/≥/g, '>=').split(/(<=|>=|<|>)/);
  const sides = [parsePolynomial(left), parsePolynomial(right)];
  assert.ok(relation && sides.every(Boolean), `"${key}" is one linear inequality`);
  const value = (x, y) => [...sides[0]].reduce((sum, [name, c]) => sum + c * ({ x, y, '': 1 }[name]), 0)
    - [...sides[1]].reduce((sum, [name, c]) => sum + c * ({ x, y, '': 1 }[name]), 0);
  return {
    key,
    strict: !relation.includes('='),
    value,
    holds: (x, y) => ({ '<': value(x, y) < 0, '<=': value(x, y) <= 0, '>': value(x, y) > 0, '>=': value(x, y) >= 0 }[relation]),
  };
};

/* ------------------------------------------------------- the figure, as drawn */

// Every line the figure draws: y = m·x + b, or the vertical x = c.
const drawnLines = (graph) => [
  ...(graph.functions || []).filter((spec) => spec.type === 'line').map((spec) => ({ at: (t) => [t, Number(spec.m) * t + Number(spec.b)], dashed: spec.dashed === true })),
  ...(graph.verticalLines || []).map((line) => ({ at: (t) => [Number(line.x), t], dashed: line.dashed === true })),
];
const onLine = (key, line) => [0, 1, 7].every((t) => Math.abs(key.value(...line.at(t))) < 1e-9);

const insidePolygon = ([x, y], polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * Whether `graph` draws exactly what `keys` hold. `shade` is 'each' (one
 * shaded half-plane per key), 'overlap' (one region where all hold) or 'none'.
 */
const figureFindings = (graph, keyTexts, { shade = 'each', where = '' } = {}) => {
  const problems = [];
  const keys = keyTexts.map(keyTest);
  const lines = drawnLines(graph);
  keys.forEach((key) => {
    const line = lines.find((candidate) => onLine(key, candidate));
    if (!line) problems.push(`${where}: no line is drawn for the boundary of ${key.key}`);
    else if (line.dashed !== key.strict) problems.push(`${where}: the boundary of ${key.key} is drawn ${line.dashed ? 'dashed' : 'solid'}`);
  });
  if (lines.length !== keys.length) problems.push(`${where}: ${lines.length} lines drawn for ${keys.length} inequalities`);
  // The window GraphDisplay draws (an equal-unit fit of the authored one).
  const { scaled } = staticGraphScaleViews(graph);
  const window = { xMin: scaled.xMin, xMax: scaled.xMax, yMin: scaled.yMin, yMax: scaled.yMax };
  const regions = shadingRegions(graph.shading).map((region) => ({ region, polygon: shadingPolygon(region, window) }));
  const expected = shade === 'none' ? 0 : shade === 'overlap' ? 1 : keys.length;
  if (regions.length !== expected) problems.push(`${where}: ${regions.length} shaded regions, expected ${expected}`);
  // Each region against the keys its boundaries are: in it exactly where they all hold.
  regions.forEach(({ region, polygon }, index) => {
    const own = region.boundaries.map((boundary) => keys.find((key) => onLine(key, boundary.vertical
      ? { at: (t) => [boundary.x, t] }
      : { at: (t) => [t, boundary.m * t + boundary.b] })));
    if (own.some((key) => !key)) {
      problems.push(`${where}: shaded region ${index + 1} is bounded by a line no key names`);
      return;
    }
    // Every grid point inside the window (one on its edge is on the region's edge).
    for (let x = Math.floor(window.xMin) + 1; x < window.xMax; x += 1) {
      for (let y = Math.floor(window.yMin) + 1; y < window.yMax; y += 1) {
        if (keys.some((key) => Math.abs(key.value(x, y)) < 1e-9)) continue;
        const shaded = insidePolygon([x, y], polygon);
        const holds = own.every((key) => key.holds(x, y));
        if (shaded !== holds) {
          problems.push(`${where}: (${x}, ${y}) is ${shaded ? '' : 'not '}shaded, but ${own.map((key) => key.key).join(' and ')} ${holds ? 'holds' : 'fails'} there`);
          return;
        }
      }
    }
  });
  return problems;
};

/* --------------------------------------------------------------- the lessons */

const lessonOf = (entry) => entry.lesson.assignment.folder.split('/').pop();
const fileOf = (entry) => {
  const { questions } = compiled(readRepoFile(entry.file));
  const P = questions[0].questionId.replace(/-wu-1$/, '');
  const item = (suffix) => {
    const question = questions.find((candidate) => candidate.questionId === `${P}-${suffix}`);
    assert.ok(question, `${P}-${suffix} is in ${entry.file}`);
    return question;
  };
  return { item, P };
};
const answer = (question, id) => {
  const field = question.answerFields.find((candidate) => candidate.id === id);
  assert.ok(field, `${question.questionId} asks for ${id}`);
  return String(field.answer);
};
const card = (question, id) => {
  const found = (question.candidateGraphs || []).find((candidate) => candidate.id === id);
  assert.ok(found?.graph, `${question.questionId} draws graph ${id}`);
  return found;
};

for (const entry of ALGEBRA1_M3_INEQUALITY_LESSONS.filter((candidate) => lessonOf(candidate) === 'Lesson 4')) {
  test(`${entry.lesson.assignment.title}: each graph a box asks about is drawn from that box's key`, () => {
    const { item } = fileOf(entry);
    const problems = [];
    // Graphs named in the prompt, each answered in the box with its own id, in order.
    [['cw-7', ['a', 'b', 'c']], ['cw-13', ['a', 'b', 'c']], ['p-6', ['a', 'b']]].forEach(([suffix, ids]) => {
      const question = item(suffix);
      assert.deepEqual(question.candidateGraphs.map((candidate) => candidate.id), ids, `${suffix}: the graphs the prompt names, in its order`);
      assert.equal(question.candidateGraphsInOrder, true, `${suffix}: figures to read, not choices to shuffle`);
      ids.forEach((id) => {
        assert.equal(card(question, id).label, `Graph ${id}`);
        problems.push(...figureFindings(card(question, id).graph, [answer(question, id)], { where: `${suffix} graph ${id}` }));
      });
    });
    // One graph, read in one box.
    [['cw-12', 'inequality'], ['p-10', 'graphed'], ['p-12', 'inequality']].forEach(([suffix, id]) => {
      const question = item(suffix);
      problems.push(...figureFindings(question.graph, [answer(question, id)], { where: suffix }));
    });
    assert.deepEqual(problems, []);
    // The worked example's words name the figure's style and side: they must be its key's.
    const worked = item('cw-12');
    const symbol = worked.answerFields.find((field) => field.id === 'symbol');
    const [line] = drawnLines(worked.graph);
    const key = keyTest(answer(worked, 'inequality'));
    assert.match(symbol.label, /^Solid line, shaded above:/);
    assert.equal(line.dashed, false, 'the line the label calls solid');
    assert.equal(key.holds(0, 9), true, 'above the line is where the key holds');
    // The sentence that said what the picture shows is gone.
    ['cw-7', 'cw-12', 'cw-13', 'p-6', 'p-10', 'p-12'].forEach((suffix) => {
      assert.doesNotMatch(item(suffix).prompt, /dashed|solid|shaded|half-plane/i, `${suffix}: ${item(suffix).prompt}`);
    });
  });
}

// "System A: y < (3/5)x + 3 and y > −(3/5)x + 3." as the student reads it in the prompt.
const systemsInPrompt = (prompt) => Object.fromEntries([...prompt.matchAll(/System ([A-D]): (.+?) and (.+?)\./g)].map(([, name, first, second]) => [name, [first, second]]));

for (const entry of ALGEBRA1_M3_INEQUALITY_LESSONS.filter((candidate) => lessonOf(candidate) === 'Lesson 5')) {
  test(`${entry.lesson.assignment.title}: each graph shows the system its key matches it with`, () => {
    const { item } = fileOf(entry);
    const problems = [];

    // CW 12: Graph Y shades the solutions of the system whose key is "Graph Y".
    const matching = item('cw-12');
    const systems = systemsInPrompt(matching.prompt);
    assert.deepEqual(Object.keys(systems), ['A', 'B', 'C', 'D']);
    assert.deepEqual(matching.candidateGraphs.map((candidate) => candidate.id), ['A', 'B', 'C', 'D']);
    assert.equal(matching.candidateGraphsInOrder, true);
    Object.keys(systems).forEach((system) => {
      const graph = /^Graph ([A-D])/.exec(answer(matching, `sys${system}`))[1];
      const { graph: drawn } = card(matching, graph);
      if (graph === 'D') {
        // The blank graph the student completes next (CW 14).
        assert.deepEqual([drawn.functions, drawn.verticalLines, drawn.shading, drawn.points], [undefined, undefined, undefined, undefined], 'Graph D is blank');
      } else {
        problems.push(...figureFindings(drawn, systems[system], { shade: 'overlap', where: `cw-12 Graph ${graph} (System ${system})` }));
      }
    });
    assert.doesNotMatch(matching.prompt, /Graph [A-D] shades/, 'the picture says what each graph shades');

    // CW 13: Possible Solutions Y are solutions of the system whose key is Y,
    // plotted with that system's (dashed) boundary lines; D is blank.
    const sets = item('cw-13');
    const setSystems = systemsInPrompt(sets.prompt);
    Object.keys(setSystems).forEach((system) => {
      const set = /^Possible Solutions ([A-D])/.exec(answer(sets, `sol${system}`))[1];
      const { graph: drawn, label } = card(sets, set);
      assert.equal(label, `Possible Solutions ${set}`);
      problems.push(...figureFindings(drawn, setSystems[system], { shade: 'none', where: `cw-13 Possible Solutions ${set}` }));
      const points = (drawn.points || []).map(readGraphPointCoordinates);
      if (set === 'D') assert.equal(points.length, 0, 'Possible Solutions D is blank');
      else assert.equal(points.length, 2, `Possible Solutions ${set} plots two points`);
      const keys = setSystems[system].map(keyTest);
      points.forEach(([x, y]) => {
        if (!keys.every((key) => key.holds(x, y))) problems.push(`cw-13: (${x}, ${y}) in Possible Solutions ${set} does not solve System ${system}`);
      });
    });
    assert.doesNotMatch(sets.prompt, /Possible Solutions [A-C]: \(/, 'the plotted points are not listed again');

    // PR 10: the solid line and its shading are the solid box's key; the dashed, the dashed box's.
    const system = item('p-10');
    problems.push(...figureFindings(system.graph, [answer(system, 'solid'), answer(system, 'dashed')], { where: 'p-10' }));
    // Each box is named for the line it asks about: its key is drawn that way.
    assert.equal(keyTest(answer(system, 'solid')).strict, false, 'the solid boundary\'s inequality includes its line');
    assert.equal(keyTest(answer(system, 'dashed')).strict, true, 'the dashed boundary\'s inequality leaves its line out');
    assert.doesNotMatch(system.prompt, /dashed|solid|shaded|slope/i, system.prompt);
    assert.deepEqual(problems, []);
  });
}

/*
 * The graphs a prompt names in order are drawn in that order, each with its
 * name: graphs to choose among are shuffled so their order cannot point to an
 * answer, but these are read, each in its own box ("Graph a" first).
 */
test('the graphs a prompt names are shown in its order, named as it names them', async () => {
  const { server } = await loadEngine();
  const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
  const shown = async (question) => {
    const markup = await withBrowser(() => render(React.createElement(MultiAnswerGrader, { question, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null })));
    const group = markup.slice(markup.indexOf('role="group"'));
    return {
      label: /aria-label="([^"]+)"/.exec(group)?.[1],
      cards: [...group.matchAll(/<div style="[^"]*font-weight:900[^"]*">([^<]+)<\/div>/g)].map((match) => match[1]),
      figures: (markup.match(/data-graph-description=""/g) || []).length,
    };
  };
  const [lesson4, lesson5] = ['Lesson 4', 'Lesson 5'].map((name) => fileOf(ALGEBRA1_M3_INEQUALITY_LESSONS.find((entry) => lessonOf(entry) === name)));
  const graphs = lesson4.item('cw-13');
  assert.deepEqual(await shown(graphs), { label: 'Graphs', cards: ['Graph a', 'Graph b', 'Graph c'], figures: 3 });
  assert.deepEqual((await shown(lesson5.item('cw-12'))).cards, ['Graph A', 'Graph B', 'Graph C', 'Graph D']);
  // Graphs to choose among keep their shuffle.
  const choices = await shown({ ...graphs, candidateGraphsInOrder: undefined });
  assert.equal(choices.label, 'Candidate graphs');
  assert.notDeepEqual(choices.cards, ['Graph a', 'Graph b', 'Graph c']);
  assert.deepEqual([...choices.cards].sort(), ['Graph a', 'Graph b', 'Graph c']);
});
