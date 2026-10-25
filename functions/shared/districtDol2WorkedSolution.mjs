/*
 * WORKED STEPS FOR THE ALGEBRA I DISTRICT DOL #2 REVIEW TASKS (CT02).
 *
 * THE PROBLEM. The seven review tasks of drafts/district-dol2/assignment.json
 * (48 variants each, 336 items) showed a student who closed one only the
 * answer: no authored steps, no tool and no support family covers them
 * (audit findings A3-142 / A1-58, tests/platform/kSteps_answerOnlyInventory).
 * They cannot carry authored steps: the stored assignment is 820 KB of the
 * 850 KB kept below Firestore's 1 MiB document limit
 * (districtDOL2Content.test.mjs), and copies a teacher already imported would
 * never get them.
 *
 * WHAT THIS DOES. It works THIS variant from what the student was shown —
 * each part's panel (the terms, the graph's points, the table, the numbers in
 * the part's words) — and holds every answer it states to the item's own key
 * with the shared field grader (matchesFieldAnswer) before anything is
 * returned. A part it does not recognise, cannot work exactly, or whose key it
 * does not reproduce makes the whole answer null, and the review keeps
 * today's answer list. Never a wrong step.
 *
 * A task is recognised by its parts alone: each part's answer-box ids (after
 * the "Part_N_" prefix of a multi-part task), paired in order with the panel
 * titled "Part N", and the wording of that panel as
 * scripts/content/build_district_dol2.py writes it. Never by an id or a title
 * of the task.
 *
 * WHERE IT IS READ. Only by closedQuestionReview.js, for a closed question
 * (right, or out of tries) that has no authored steps, no tool steps and no
 * support family's steps: the place a family's workedSolution is read. It
 * states the answer, so nothing shown while the item is open (hints, the
 * back-up step, a sibling) calls it. It is in functions/shared because the
 * secure retest asks the same thirteen skills and a released Test review is
 * built on the server (secureExamItems.js, releasedSolutionFor); today only
 * the closed review reads it, and it reads answer boxes (`answerFields`),
 * which a secure item does not have.
 *
 *   districtDol2ReviewWorkedSolution(question)
 *     -> { headline, steps: [text], answerSummary, answers: { fieldId: text } } | null
 *
 * `answers` is what the steps state for each box, as a student would type it.
 * Pure: no React, no I/O.
 */
import { matchesFieldAnswer } from './answerUtils.mjs';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const near = (a, b) => Math.abs(a - b) <= 1e-9;
/** A value read off a sampled graph, as the whole number it was drawn at; null when it is not one. */
const wholeNumber = (value) => (Number.isFinite(value) && Math.abs(value - Math.round(value)) <= 1e-6 ? Math.round(value) + 0 : null);

/** A number as the steps write it: at most six decimals, an ASCII minus, never -0. */
const dec = (value) => {
  const rounded = Math.round(Number(value) * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};
/** A negative number inside a sum or a product goes in brackets: 38 - (-5). */
const signed = (value) => (value < 0 ? `(${dec(value)})` : dec(value));
/** Hundredths as money: 2350 -> "23.50". */
const money = (cents) => (cents / 100).toFixed(2);
const toCents = (value) => {
  const number = finite(value);
  if (number === null) return null;
  const cents = Math.round(number * 100);
  return Math.abs(cents - number * 100) <= 1e-6 ? cents : null;
};
const joinWords = (words) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const setText = (values) => `{${values.join(', ')}}`;
/** "4n" with its sign as a term after another: "- 4n", "+ 5n". */
const termText = (coefficient, variable) => {
  const size = Math.abs(coefficient) === 1 ? '' : dec(Math.abs(coefficient));
  return `${coefficient < 0 ? '-' : '+'} ${size}${variable}`;
};
/** "-4n + 46", "5n - 3", "5n". */
const linearText = (coefficient, variable, constant) => {
  const lead = `${coefficient < 0 ? '-' : ''}${Math.abs(coefficient) === 1 ? '' : dec(Math.abs(coefficient))}${variable}`;
  if (constant === 0) return lead;
  return `${lead} ${constant < 0 ? '-' : '+'} ${dec(Math.abs(constant))}`;
};
/** Two decimal numbers added exactly in the places they are written with: 13.4 + 2.4 = 15.8, not 15.799999. */
const placesOf = (value) => (String(value).split('.')[1] || '').length;
const addExactly = (a, b) => {
  const scale = 10 ** Math.max(placesOf(dec(a)), placesOf(dec(b)));
  return Math.round(a * scale + b * scale) / scale;
};

const pointsOf = (entries) => list(entries).map((point) => [finite(point?.x), finite(point?.y)]);
const allNumbers = (pairs) => pairs.every((pair) => pair.length === 2 && pair.every((value) => value !== null));

/* ------------------------------------------------------------ the skills */
// Each takes one part ({ panel, note, fields }) and returns
// { steps, answers: [[boxId, text]], summary } or null.

/* Original question 1: an association is not a cause. */
const SAYS_TOGETHER = /\btend to\b|\bboth\b|\bincreases?\b|\brises?\b|\bassociated\b|\bopposite directions\b/i;
const OBSERVED_ONLY = /\bobserv/i;
// An experiment that was run, or a random assignment, could support a cause.
// "No controlled experiment was conducted." says the opposite, so it is read
// out first.
const NO_EXPERIMENT = /\bno (?:controlled )?experiment was (?:conducted|done|run)\b/gi;
const EXPERIMENT_RUN = /\brandom|\bexperiment/i;
const association = (part) => {
  const { note, fields } = part;
  if (!SAYS_TOGETHER.test(note) || !OBSERVED_ONLY.test(note) || EXPERIMENT_RUN.test(note.replace(NO_EXPERIMENT, ''))) return null;
  const asked = (id) => text(fields.get(id)?.label);
  if (!asked('association') || !asked('causation')) return null;
  return {
    steps: [
      `The report says that two quantities tend to change together. That is an association, so "${asked('association')}" is Yes.`,
      `The report only summarizes observations. Something else could be affecting both quantities, so observations alone cannot show that one causes the other: "${asked('causation')}" is No.`,
    ],
    answers: [['association', 'Yes'], ['causation', 'No']],
    summary: 'Association: Yes; causation: No',
  };
};

/* Original question 2: the explicit rule of an arithmetic sequence. */
const explicitRule = (part) => {
  const { panel, note } = part;
  if (panel.kind !== 'expressions' || !/the first term has n = 1/i.test(note) || !/aₙ = \[coefficient\]n \+ \[constant\]/.test(note)) return null;
  const terms = text(list(panel.expressions)[0]).split(',').map((entry) => finite(entry.trim()));
  if (terms.length < 3 || terms.some((value) => value === null || !Number.isInteger(value))) return null;
  const difference = terms[1] - terms[0];
  if (difference === 0 || terms.some((value, index) => index > 0 && value - terms[index - 1] !== difference)) return null;
  const [first] = terms;
  const constant = first - difference;
  const rule = linearText(difference, 'n', constant);
  return {
    steps: [
      `Each term is ${dec(Math.abs(difference))} ${difference < 0 ? 'less' : 'more'} than the one before (${dec(terms[1])} - ${signed(first)} = ${dec(difference)}), so the common difference is d = ${dec(difference)}.`,
      `The first term, ${dec(first)}, is at n = 1, so aₙ = a₁ + (n - 1)·d = ${dec(first)} + (n - 1)·${signed(difference)}.`,
      `Multiply out and combine: ${dec(first)} ${termText(difference, 'n')} ${-difference < 0 ? '-' : '+'} ${dec(Math.abs(difference))} = ${rule}. The coefficient of n is ${dec(difference)} and the constant is ${dec(constant)}.`,
    ],
    answers: [['coefficient', dec(difference)], ['constant', dec(constant)]],
    summary: `aₙ = ${rule}`,
  };
};

/* Original question 5: terms from a recursive rule. */
const RECURSIVE_RULE = /a₁ = (-?\d+(?:\.\d+)?) and aₙ = aₙ₋₁ ([+-]) (\d+(?:\.\d+)?) for n ≥ 2/;
const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄'];
const recursiveTerms = (part) => {
  const match = RECURSIVE_RULE.exec(part.note);
  if (!match) return null;
  const first = Number(match[1]);
  const sign = match[2];
  const size = Number(match[3]);
  if (!Number.isFinite(first) || !(size > 0)) return null;
  const step = sign === '-' ? -size : size;
  const terms = [first];
  for (let n = 2; n <= 4; n += 1) terms.push(addExactly(terms[n - 2], step));
  const name = (n) => `a${SUBSCRIPTS[n]}`;
  const line = (n) => `${name(n)} = ${name(n - 1)} ${sign} ${dec(size)} = ${dec(terms[n - 2])} ${sign} ${dec(size)} = ${dec(terms[n - 1])}.`;
  return {
    steps: [
      `Start from a₁ = ${dec(first)} and ${sign === '-' ? 'subtract' : 'add'} ${dec(size)} for each next term: ${line(2)}`,
      line(3),
      line(4),
    ],
    answers: [['a2', dec(terms[1])], ['a3', dec(terms[2])], ['a4', dec(terms[3])]],
    summary: [2, 3, 4].map((n) => `${name(n)} = ${dec(terms[n - 1])}`).join(', '),
  };
};

/* Original questions 3, 4 and 8, on one graph: both intercepts and the zero of a line. */
const lineThrough = (graph) => {
  if (list(graph?.lines).length !== 1) return null;
  const points = pointsOf(graph.lines[0]?.points);
  if (points.length !== 2 || !allNumbers(points)) return null;
  const [[x1, y1], [x2, y2]] = points;
  if (x1 === x2) return null;
  const slope = (y2 - y1) / (x2 - x1);
  return { slope, intercept: y1 - slope * x1 };
};
const insideWindow = (graph, x, y) => [graph?.xMin, graph?.xMax, graph?.yMin, graph?.yMax].every((edge) => finite(edge) !== null)
  && x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax;
const linearFeatures = (part) => {
  const { panel } = part;
  if (panel.kind !== 'graph') return null;
  const line = lineThrough(panel.graph);
  if (!line || near(line.slope, 0)) return null;
  // Read on the grid: each crossing is a whole number inside the window drawn.
  const yIntercept = wholeNumber(line.intercept);
  const xIntercept = wholeNumber(-line.intercept / line.slope);
  if (yIntercept === null || xIntercept === null) return null;
  if (!insideWindow(panel.graph, 0, yIntercept) || !insideWindow(panel.graph, xIntercept, 0)) return null;
  return {
    steps: [
      `The y-intercept is where the line crosses the y-axis, where x = 0. The line crosses it at y = ${dec(yIntercept)}, so the y-intercept is (0, ${dec(yIntercept)}).`,
      `The x-intercept is where the line crosses the x-axis, where y = 0. The line crosses it at x = ${dec(xIntercept)}, so the x-intercept is (${dec(xIntercept)}, 0).`,
      `A zero is an input that makes the output 0: the x-value of the x-intercept. The zero is x = ${dec(xIntercept)}.`,
    ],
    answers: [['xIntercept', `(${dec(xIntercept)}, 0)`], ['yIntercept', `(0, ${dec(yIntercept)})`], ['zero', dec(xIntercept)]],
    summary: `x-intercept (${dec(xIntercept)}, 0), y-intercept (0, ${dec(yIntercept)}), zero x = ${dec(xIntercept)}`,
  };
};

/* Original question 6: the range of a context with whole-number inputs, from its table. */
const GROUP_COSTS = /costs \$(\d+(?:\.\d+)?) per person plus \$(\d+(?:\.\d+)?) for one vehicle\. This vehicle may carry (\d+) through (\d+) people, in whole numbers\./;
const discreteRange = (part) => {
  const { panel, note } = part;
  const match = GROUP_COSTS.exec(note);
  if (panel.kind !== 'table' || !match) return null;
  const perPerson = toCents(match[1]);
  const vehicle = toCents(match[2]);
  const fewest = Number(match[3]);
  const most = Number(match[4]);
  const rows = list(panel.table?.rows).map((row) => list(row?.cells).map(finite));
  // The table lists every allowed group size once, in order, at the cost the words give.
  if (perPerson === null || vehicle === null || rows.length !== most - fewest + 1) return null;
  if (rows.some((row, index) => row.length !== 2 || row[0] !== fewest + index || toCents(row[1]) !== vehicle + perPerson * row[0])) return null;
  // The set is written as the table writes its costs (59.5, 96), which is how a student types it.
  const costs = rows.map((row) => dec(row[1]));
  const [people, cost] = rows[Math.min(1, rows.length - 1)];
  return {
    steps: [
      'The range is the set of outputs: the total costs c, not the numbers of people.',
      `Each total is the vehicle plus the cost for each person: for ${people} ${people === 1 ? 'person' : 'people'}, ${money(vehicle)} + ${money(perPerson)} × ${people} = ${money(toCents(cost))} dollars. The table lists the total for every allowed group size.`,
      `Only whole numbers of people from ${fewest} through ${most} can go, so the total is always one of these ${rows.length} costs, never a value between two of them. The range is ${setText(costs)}.`,
    ],
    answers: [['range', setText(costs)]],
    summary: `Range ${setText(costs)}`,
  };
};

/* Original question 7: the range of a continuous graph, as an inequality. */
const continuousRange = (part) => {
  const { panel, note } = part;
  if (panel.kind !== 'graph' || !/inequality describing the range/i.test(note)) return null;
  const ends = pointsOf(panel.graph?.points);
  const curve = pointsOf(list(panel.graph?.curves)[0]?.points);
  if (ends.length !== 2 || !allNumbers(ends) || curve.length < 2 || !allNumbers(curve)) return null;
  const [[startX, top], [endX, bottom]] = ends;
  // One piece, drawn from its first end to its last, falling the whole way.
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (!(startX < endX) || !(top > bottom) || !near(first[0], startX) || !near(first[1], top) || !near(last[0], endX) || !near(last[1], bottom)) return null;
  if (curve.some(([, y], index) => index > 0 && y > curve[index - 1][1] + 1e-9)) return null;
  const quantity = text(panel.graph.yAxisLabel).replace(/,\s*y$/i, '').toLowerCase();
  return {
    steps: [
      `The range is the set of outputs. The outputs are on the vertical axis${quantity ? ` (${quantity})` : ''}, so the variable is y.`,
      `The graph starts at (${dec(startX)}, ${dec(top)}) and goes down to (${dec(endX)}, ${dec(bottom)}). Both ends are part of the graph.`,
      `So y takes every value from ${dec(bottom)} to ${dec(top)}, both ends included: the range is ${dec(bottom)} ≤ y ≤ ${dec(top)}.`,
    ],
    answers: [['lower', dec(bottom)], ['leftComparison', '≤'], ['variable', 'y'], ['rightComparison', '≤'], ['upper', dec(top)]],
    summary: `Range ${dec(bottom)} ≤ y ≤ ${dec(top)}`,
  };
};

/* Original question 9: the domain and range of a context, as sets. */
const ROOM_HOURS = /costs \$(\d+) per hour\. It can be reserved only for the following whole-hour durations: (\d+(?:, \d+)*)\./;
const contextDomainRange = (part) => {
  const match = ROOM_HOURS.exec(part.note);
  if (!match || !/the input is hours reserved and the output is cost/i.test(part.note)) return null;
  const rate = Number(match[1]);
  const hours = match[2].split(',').map((entry) => Number(entry.trim()));
  if (!(rate > 0) || hours.some((value) => !Number.isInteger(value) || value <= 0) || new Set(hours).size !== hours.length) return null;
  const costs = hours.map((value) => rate * value);
  return {
    steps: [
      `The input is the number of hours reserved, so the domain is the set of allowed durations: ${setText(hours)}.`,
      `The output is the cost, ${rate} dollars for each hour: ${joinWords(hours.map((value, index) => `${rate} × ${value} = ${costs[index]}`))}.`,
      `So the range is the set of those costs: ${setText(costs)}.`,
    ],
    answers: [['domain', setText(hours)], ['range', setText(costs)]],
    summary: `Domain ${setText(hours)}, range ${setText(costs)}`,
  };
};

/* Original question 10: both zeros of a quadratic, read from its graph. */
const quadraticZeros = (part) => {
  const { panel, note } = part;
  if (panel.kind !== 'graph' || !/both zeros of the quadratic/i.test(note) || list(panel.graph?.curves).length !== 1) return null;
  const curve = pointsOf(panel.graph.curves[0]?.points);
  if (curve.length < 5 || !allNumbers(curve)) return null;
  const zeros = curve.filter(([, y]) => Math.abs(y) <= 1e-9).map(([x]) => wholeNumber(x));
  if (zeros.length !== 2 || zeros.includes(null)) return null;
  const [left, right] = [...zeros].sort((a, b) => a - b);
  // The graph is on one side of the x-axis between the zeros and on the other side outside them:
  // it crosses at exactly these two x-values.
  const between = curve.filter(([x]) => x > left + 1e-9 && x < right - 1e-9);
  const outside = curve.filter(([x]) => x < left - 1e-9 || x > right + 1e-9);
  if (!between.length || !outside.length) return null;
  const inside = Math.sign(between[0][1]);
  if (!inside || between.some(([, y]) => Math.sign(y) !== inside) || outside.some(([, y]) => Math.sign(y) !== -inside)) return null;
  if (!insideWindow(panel.graph, left, 0) || !insideWindow(panel.graph, right, 0)) return null;
  return {
    steps: [
      'A zero is an x-value where the graph meets the x-axis, where y = 0.',
      `The parabola crosses the x-axis twice: at (${dec(left)}, 0) and at (${dec(right)}, 0).`,
      `So the zeros are x = ${dec(left)} and x = ${dec(right)}: ${setText([dec(left), dec(right)])}.`,
    ],
    answers: [['zeros', setText([dec(left), dec(right)])]],
    summary: `Zeros ${setText([dec(left), dec(right)])}`,
  };
};

/* Original question 11: the axis of symmetry of a parabola, from its graph. */
const axisOfSymmetry = (part) => {
  const { panel, note } = part;
  if (panel.kind !== 'graph' || !/equation of the axis of symmetry/i.test(note) || list(panel.graph?.curves).length !== 1) return null;
  const ends = pointsOf(panel.graph.points);
  const curve = pointsOf(panel.graph.curves[0]?.points);
  if (ends.length !== 2 || !allNumbers(ends) || curve.length < 3 || !allNumbers(curve)) return null;
  const [[start, startHeight], [land, landHeight]] = ends;
  if (!(start < land) || !near(startHeight, 0) || !near(landHeight, 0)) return null;
  const middle = (start + land) / 2;
  // The highest point drawn is exactly halfway between the two ends.
  const highest = curve.reduce((best, point) => (point[1] > best[1] ? point : best), curve[0]);
  if (!near(highest[0], middle) || curve.filter(([, y]) => near(y, highest[1])).length !== 1) return null;
  return {
    steps: [
      'The axis of symmetry is the vertical line through the vertex, the highest point of the path. A vertical line has an equation x = a number, so the variable is x.',
      `The path starts at (${dec(start)}, 0) and lands at (${dec(land)}, 0), both at height 0, so the vertex is halfway between them: (${dec(start)} + ${dec(land)}) ÷ 2 = ${dec(middle)}.`,
      `So the axis of symmetry is x = ${dec(middle)}.`,
    ],
    answers: [['variable', 'x'], ['value', dec(middle)]],
    summary: `Axis of symmetry x = ${dec(middle)}`,
  };
};

/* Original question 12: is each relation a function, and an input that breaks the rule. */
const relationOf = (panel) => {
  const id = /^Relation ([A-Z])$/.exec(text(panel?.title))?.[1];
  const pairs = panel?.kind === 'graph' ? pointsOf(panel.graph?.points)
    : panel?.kind === 'table' ? list(panel.table?.rows).map((row) => list(row?.cells).map(finite))
      : [];
  if (!id || !pairs.length || !allNumbers(pairs)) return null;
  const outputs = new Map();
  pairs.forEach(([x, y]) => outputs.set(x, [...new Set([...(outputs.get(x) || []), y])]));
  return { id, kind: panel.kind, pairs, outputs };
};
const pairWord = (relation) => (relation.kind === 'graph' ? 'points' : 'pairs');
const functionTest = (part) => {
  const { panel, note } = part;
  if (panel.kind !== 'panels' || !/classify each relation as function or not a function/i.test(note)) return null;
  const relations = list(panel.panels).map(relationOf);
  if (!relations.length || relations.includes(null)) return null;
  relations.sort((a, b) => a.id.localeCompare(b.id));
  const asked = [...part.fields.keys()].filter((id) => id !== 'conflictInput').sort();
  if (asked.join('|') !== relations.map((relation) => relation.id).join('|')) return null;
  const breaks = relations.flatMap((relation) => [...relation.outputs].filter(([, ys]) => ys.length > 1).map(([x, ys]) => ({ relation, x, ys })));
  // Exactly one input anywhere has two different outputs: it is the answer, and the only one.
  if (breaks.length !== 1 || breaks[0].ys.length !== 2) return null;
  const [broken] = breaks;
  const steps = relations.map((relation) => {
    const inputs = joinWords([...relation.outputs.keys()].map(dec));
    if (relation === broken.relation) {
      const [one, two] = broken.ys;
      return `Relation ${relation.id}: the input ${dec(broken.x)} has two different outputs, ${dec(one)} and ${dec(two)} (the ${pairWord(relation)} (${dec(broken.x)}, ${dec(one)}) and (${dec(broken.x)}, ${dec(two)})), so Relation ${relation.id} is not a function.`;
    }
    const repeated = relation.pairs.find(([x, y], index) => relation.pairs.findIndex(([x2, y2]) => x2 === x && y2 === y) !== index);
    const shared = new Set(relation.pairs.map(([, y]) => y)).size < relation.outputs.size;
    if (repeated) return `Relation ${relation.id}: the pair (${dec(repeated[0])}, ${dec(repeated[1])}) is listed twice, but that is the same output again, not a second one. Each input (${inputs}) has exactly one output, so Relation ${relation.id} is a function.`;
    if (shared) return `Relation ${relation.id}: each input (${inputs}) has exactly one output. Different inputs may share an output, so Relation ${relation.id} is a function.`;
    return `Relation ${relation.id}: each input (${inputs}) has exactly one output, so Relation ${relation.id} is a function.`;
  });
  steps.push(`An input with two different outputs is ${dec(broken.x)}, from Relation ${broken.relation.id}.`);
  const verdict = (relation) => (relation === broken.relation ? 'Not a function' : 'Function');
  return {
    steps,
    answers: [...relations.map((relation) => [relation.id, verdict(relation)]), ['conflictInput', dec(broken.x)]],
    summary: `${relations.map((relation) => `${relation.id}: ${verdict(relation)}`).join('; ')}; input ${dec(broken.x)}`,
  };
};

/* Original question 13: predictions from a line of best fit. */
const PREDICTIONS = /Use linear regression to find a line of best fit\. Predict the number sold at \$(\d+\.\d{2}) and at \$(\d+\.\d{2})\. Round each prediction to the nearest whole item\./;
const regressionPrediction = (part) => {
  const { panel, note, fields } = part;
  const match = PREDICTIONS.exec(note);
  if (panel.kind !== 'table' || !match) return null;
  const rows = list(panel.table?.rows).map((row) => list(row?.cells).map(toCents));
  if (rows.length < 3 || !allNumbers(rows)) return null;
  // Least squares in hundredths, exactly: every sum is a whole number well inside 2^53.
  const count = rows.length;
  const sumX = rows.reduce((sum, [x]) => sum + x, 0);
  const sumY = rows.reduce((sum, [, y]) => sum + y, 0);
  const spreadX = count * rows.reduce((sum, [x]) => sum + x * x, 0) - sumX * sumX;
  const spreadXY = count * rows.reduce((sum, [x, y]) => sum + x * y, 0) - sumX * sumY;
  if (spreadX === 0) return null;
  // The slope and the intercept, in ten-thousandths; the line is shown only when both are exact.
  const slope4 = (spreadXY * 10000) / spreadX;
  if (!Number.isInteger(slope4)) return null;
  const intercept4 = (10000 * sumY - slope4 * sumX) / (100 * count);
  if (!Number.isInteger(intercept4)) return null;
  const slope = slope4 / 10000;
  const intercept = intercept4 / 10000;
  if (slope === 0) return null;
  const prices = [match[1], match[2]];
  const ids = ['prediction1', 'prediction2'];
  // Each box is the prediction at the price its label names.
  if (ids.some((id, index) => !text(fields.get(id)?.label).includes(`$${prices[index]}`))) return null;
  const predictions = prices.map((price) => {
    // m·p + b in millionths: (slope4/10^4)(cents/10^2) + intercept4/10^4.
    const millionths = slope4 * toCents(price) + 100 * intercept4;
    return { price, value: millionths / 1e6, whole: Math.floor((millionths + 500000) / 1e6) };
  });
  if (predictions.some((entry) => entry.whole < 0)) return null;
  const lineText = linearText(slope, 'x', intercept);
  const plugged = (price) => `${dec(slope)}(${price}) ${intercept < 0 ? '-' : '+'} ${dec(Math.abs(intercept))}`;
  return {
    steps: [
      `Use all ${count} (price, number sold) pairs in linear regression, with x the price and y the number sold. The line of best fit is y = ${lineText}.`,
      ...predictions.map(({ price, value, whole }) => (near(value, whole)
        ? `At a price of ${price}: y = ${plugged(price)} = ${dec(value)}, so about ${whole} sold.`
        : `At a price of ${price}: y = ${plugged(price)} = ${dec(value)}, which rounds to ${whole}, so about ${whole} sold.`)),
    ],
    answers: predictions.map((entry, index) => [ids[index], String(entry.whole)]),
    summary: `About ${predictions[0].whole} sold at ${prices[0]} and about ${predictions[1].whole} sold at ${prices[1]}`,
  };
};

/* ------------------------------------------------------------ the tasks */

const HEADLINES = Object.freeze({
  association: 'Things that change together are associated; that alone does not show that one causes the other.',
  sequence: 'An arithmetic sequence adds the same number each time.',
  line: 'Intercepts and zeros are read where the line meets an axis.',
  domainRange: 'The domain is the set of inputs; the range is the set of outputs.',
  zeros: 'A zero is where the graph meets the x-axis.',
  axis: 'The axis of symmetry is the vertical line through the vertex.',
  function: 'A function gives each input exactly one output.',
  regression: 'A line of best fit turns the trend in the data into a prediction.',
});

// Each part is matched by its exact set of answer boxes.
const SKILLS = Object.freeze([
  { boxes: ['association', 'causation'], topic: 'association', work: association },
  { boxes: ['coefficient', 'constant'], topic: 'sequence', work: explicitRule },
  { boxes: ['a2', 'a3', 'a4'], topic: 'sequence', work: recursiveTerms },
  { boxes: ['xIntercept', 'yIntercept', 'zero'], topic: 'line', work: linearFeatures },
  { boxes: ['range'], topic: 'domainRange', work: discreteRange },
  { boxes: ['lower', 'leftComparison', 'variable', 'rightComparison', 'upper'], topic: 'domainRange', work: continuousRange },
  { boxes: ['domain', 'range'], topic: 'domainRange', work: contextDomainRange },
  { boxes: ['zeros'], topic: 'zeros', work: quadraticZeros },
  { boxes: ['variable', 'value'], topic: 'axis', work: axisOfSymmetry },
  { boxes: ['A', 'B', 'C', 'conflictInput'], topic: 'function', work: functionTest },
  { boxes: ['prediction1', 'prediction2'], topic: 'regression', work: regressionPrediction },
].map((skill) => ({ ...skill, signature: [...skill.boxes].sort().join('|') })));

const PART_PREFIX = /^Part_(\d+)_(.+)$/;

/** The task's parts, each with its panel and its boxes by id; null when they do not pair up. */
const partsOf = (question) => {
  const fields = list(question?.answerFields);
  const panels = list(question?.stimulus?.panels);
  if (!fields.length || !panels.length || !fields.every((field) => isObject(field) && text(field.id)) || !panels.every(isObject)) return null;
  const prefixes = fields.map((field) => PART_PREFIX.exec(text(field.id)));
  const multi = prefixes.every(Boolean);
  if (!multi && (prefixes.some(Boolean) || panels.length !== 1)) return null;
  // A multi-part task titles each panel "Part N" (build_district_dol2.py, review_native).
  if (multi && panels.some((panel, index) => text(panel.title) !== `Part ${index + 1}`)) return null;
  const parts = panels.map((panel) => ({ panel, note: text(panel.note), fields: new Map() }));
  for (const [index, field] of fields.entries()) {
    const part = parts[multi ? Number(prefixes[index][1]) - 1 : 0];
    const id = multi ? prefixes[index][2] : text(field.id);
    if (!part || part.fields.has(id)) return null;
    part.fields.set(id, field);
  }
  if (parts.some((part) => !part.fields.size)) return null;
  return { multi, parts };
};

// What a step must never print: a leaked JS value or a doubled sign.
const SLOPPY = /NaN|Infinity|undefined|\bnull\b|\[object|[-+] [-+]|--|\+-/;

const graded = (field, answer) => {
  try {
    return Boolean(text(answer)) && matchesFieldAnswer(answer, field);
  } catch {
    return false;
  }
};

export const districtDol2ReviewWorkedSolution = (question) => {
  try {
    if (text(question?.type) !== 'multiAnswer') return null;
    const shape = partsOf(question);
    if (!shape) return null;
    const steps = [];
    const summaries = [];
    const topics = [];
    const answers = {};
    for (const [index, part] of shape.parts.entries()) {
      const signature = [...part.fields.keys()].sort().join('|');
      const skill = SKILLS.find((entry) => entry.signature === signature);
      const worked = skill ? skill.work(part) : null;
      if (!worked || worked.answers.length !== part.fields.size) return null;
      // Every box is stated once, and the item's own key accepts what is stated.
      for (const [id, answer] of worked.answers) {
        const field = part.fields.get(id);
        if (!field || Object.hasOwn(answers, field.id) || !graded(field, answer)) return null;
        answers[field.id] = answer;
      }
      const label = shape.multi ? `Part ${index + 1}: ` : '';
      worked.steps.forEach((step, position) => steps.push(position === 0 ? `${label}${step}` : step));
      summaries.push(`${label}${worked.summary}`);
      if (!topics.includes(skill.topic)) topics.push(skill.topic);
    }
    const answerSummary = `${summaries.join('. ')}.`;
    if ([...steps, answerSummary].some((entry) => SLOPPY.test(entry))) return null;
    return { headline: topics.map((topic) => HEADLINES[topic]).join(' '), steps, answerSummary, answers };
  } catch {
    return null;
  }
};

export default districtDol2ReviewWorkedSolution;
