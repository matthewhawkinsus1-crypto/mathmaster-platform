/*
 * UNITS 1–3: functions, domain and range; rate of change and the forms of a
 * line; scatterplots and sequences.
 *
 * Each unit goes from the building block to grade level. New numbers and new
 * situations throughout: no item here is an item of a taught lesson.
 */
import { sortBoard } from '../lib/lessonKit.mjs';
import { WINDOW, board, item, meaning, teks, unit } from './shared.mjs';

/* ------------------------------------------------------------------ Unit 1 */

const FUNCTION_SORT = sortBoard([
  {
    id: 'function',
    label: 'Functions',
    cards: [
      ['age', 'Card A'],
      ['tableRepeatOutput', 'Card C'],
      ['vee', 'Card E'],
    ],
  },
  {
    id: 'notFunction',
    label: 'Not functions',
    cards: [
      ['sameAge', 'Card B'],
      ['tableRepeatInput', 'Card D'],
      ['vertical', 'Card F'],
    ],
  },
], ['age', 'sameAge', 'tableRepeatOutput', 'tableRepeatInput', 'vee', 'vertical']);
const FUNCTION_CARDS = {
  age: { text: 'Words: Each person at a party is paired with their age today.' },
  sameAge: { text: 'Words: Each age is paired with every person at the party who is that age.' },
  tableRepeatOutput: { table: { x: [1, 2, 3, 4], y: [5, 7, 5, 9] } },
  tableRepeatInput: { table: { x: [2, 5, 2, 8], y: [1, 3, 6, 4] } },
  vee: { graphSpec: { type: 'absolute', a: 1, h: 0, k: -2 } },
  vertical: { text: 'Equation: x = −2' },
};

const UNIT_1 = unit({
  number: 1,
  title: 'Unit 1 — Functions, domain and range',
  minutes: 30,
  honorsMinutes: 36,
  questions: [
    item({
      id: 'tg-u1-q1',
      alignment: teks('A.12A'),
      actions: ['buildMapping', 'classifyFunction'],
      dok: 1,
      band: 1,
      prompt: 'Draw an arrow from each input to its output. Then decide whether the relation is a function.',
      pairs: [{ x: -3, y: 2 }, { x: -1, y: 5 }, { x: 2, y: 2 }, { x: 4, y: -1 }],
      hints: [
        'The first number of each ordered pair is the input. The second number is the output.',
        'Look at each input. How many arrows leave it?',
        'Two arrows may point to the same output. That does not break the rule for a function.',
      ],
      backUp: ['In the ordered pair (4, −1), the input is…', ['4', '−1'], '4'],
      notes: [
        ['Function', 'A relation is a function when every input has exactly one output. Two inputs may share an output.'],
        ['Worked example', '(1, 6), (2, 6), (3, 9): each input has one arrow, so it is a function, even though 1 and 2 share the output 6.'],
      ],
      solution: {
        reasoning: [
          'Draw one arrow for each pair: −3 → 2, −1 → 5, 2 → 2 and 4 → −1.',
          'Check the inputs: −3, −1, 2 and 4 each have exactly one arrow leaving them.',
          'The output 2 is used twice, by −3 and by 2. That is allowed: no input has two outputs, so the relation is a function.',
        ],
        commonError: 'Saying it is not a function because the output 2 appears twice; a function may repeat an output, but it may not give one input two outputs.',
      },
      example: 'ex-mapping',
    }),
    item({
      id: 'tg-u1-q2',
      alignment: teks('A.12A'),
      actions: ['sortIntoOwnGroups'],
      dok: 2,
      band: 2,
      prompt: 'Sort the cards into exactly two groups: relations that are functions and relations that are not. Name each group and explain your rule.',
      items: FUNCTION_SORT.items.map((card) => ({ ...card, ...FUNCTION_CARDS[card.id] })),
      validSchemes: [{ id: 'functionOrNot', label: 'Function or not', groups: FUNCTION_SORT.validSchemes[0].groups.map((group, index) => ({ id: group.id, label: FUNCTION_SORT.categories[index].label, itemIds: group.itemIds })) }],
      minGroups: 2,
      maxGroups: 2,
      hints: [
        'A relation is a function when every input is paired with exactly one output.',
        'In a table, look for an x-value that appears twice with two different y-values.',
        'For a graph or an equation, ask: can one x-value go with two different y-values?',
      ],
      backUp: ['A relation is NOT a function when…', ['one input has two different outputs', 'two inputs have the same output'], 'one input has two different outputs'],
      notes: [
        ['One rule for every form', 'Words, table, graph or equation: ask whether any input goes with more than one output.'],
        ['Worked example', 'x: 1, 1, 2 with y: 3, 4, 5 is not a function, because the input 1 has two outputs, 3 and 4.'],
      ],
      solution: {
        reasoning: [
          'For each card, ask whether any input is paired with more than one output.',
          'Functions: Card A (each person has one age), Card C (every x-value has one y-value; the output 5 may repeat) and Card E (the V-shaped graph has one y-value above or below each x-value).',
          'Not functions: Card B (one age can be paired with several people), Card D (the input 2 has two outputs, 1 and 6) and Card F (the input −2 is paired with every y-value).',
        ],
        commonError: 'Putting Card C with the relations that are not functions because the output 5 repeats; only a repeated input with different outputs, as in Card D, breaks the rule.',
      },
      example: 'ex-function-sort',
    }),
    item({
      id: 'tg-u1-q3',
      alignment: teks('A.3C'),
      actions: ['readGraph', 'findXIntercepts', 'findZeros', 'findYIntercept'],
      dok: 1,
      band: 2,
      prompt: 'Use the graph of the line. Find its x-intercept, its zero and its y-intercept.',
      function: { family: 'linear', m: 0.5, b: -2 },
      graph: {
        xMin: -4,
        xMax: 8,
        yMin: -6,
        yMax: 4,
        accessibleDescription: 'A line that rises from left to right. It crosses the vertical axis below the origin and the horizontal axis to the right of the origin.',
      },
      xIntercepts: [{ x: 4, y: 0 }],
      yIntercept: [0, -2],
      hints: [
        'The x-intercept is the point where the line crosses the x-axis. What is y at every point on the x-axis?',
        'The zero is a number, not a point: it is the x-value that makes y equal 0.',
        'The y-intercept is the point where the line crosses the y-axis. What is x at every point on the y-axis?',
      ],
      backUp: ['Every point on the y-axis has…', ['an x-value of 0', 'a y-value of 0'], 'an x-value of 0'],
      notes: [
        ['Intercepts', 'x-intercept: where the graph crosses the x-axis, written (a, 0). y-intercept: where it crosses the y-axis, written (0, b). The zero is the x-value a.'],
        ['Worked example', 'A line crosses the x-axis at 3 and the y-axis at 6: x-intercept (3, 0), zero 3, y-intercept (0, 6).'],
      ],
      solution: {
        reasoning: [
          'Find where the line crosses the x-axis: at x = 4. The x-intercept is the point (4, 0).',
          'The zero is the x-value of that point, where y = 0: the zero is 4.',
          'Find where the line crosses the y-axis: at y = −2. The y-intercept is the point (0, −2).',
        ],
        commonError: 'Writing the x-intercept as (0, 4); a point on the x-axis has y = 0, so the 0 goes second: (4, 0).',
      },
      example: 'ex-intercepts-graph',
    }),
    item({
      id: 'tg-u1-q4',
      alignment: teks('A.2A'),
      actions: ['readGraph', 'analyzeDomain', 'analyzeRange'],
      dok: 2,
      band: 2,
      prompt: 'The graph is a line segment with a closed dot at each end. Write its domain and its range as inequalities.',
      function: { family: 'linear', m: -2, b: 4, domain: { min: -1, max: 3, minClosed: true, maxClosed: true } },
      graph: {
        xMin: -4,
        xMax: 6,
        yMin: -4,
        yMax: 8,
        accessibleDescription: 'A line segment that falls from left to right. It starts at a closed dot in the upper left and ends at a closed dot in the lower right.',
      },
      correctDomain: '-1 <= x <= 3',
      correctRange: '-2 <= y <= 6',
      notation: 'inequality',
      hints: [
        'The domain is every x-value the graph covers. Read from the left end of the segment to the right end.',
        'The range is every y-value the graph covers. Read from the lowest point of the segment to the highest point.',
        'A closed dot means that endpoint is included, so use ≤. Write the smaller number on the left.',
      ],
      backUp: ['The domain of a graph is the set of its…', ['x-values', 'y-values'], 'x-values'],
      notes: [
        ['Domain and range', 'Domain: the x-values, read left to right. Range: the y-values, read bottom to top. A closed dot is included (≤); an open dot is not (<).'],
        ['Worked example', 'A segment from the closed dot (0, 1) to the closed dot (4, 9) has domain 0 ≤ x ≤ 4 and range 1 ≤ y ≤ 9.'],
      ],
      solution: {
        reasoning: [
          'Domain: the segment starts at x = −1 and ends at x = 3. Both dots are closed, so −1 ≤ x ≤ 3.',
          'Range: the lowest point of the segment is at y = −2 and the highest is at y = 6.',
          'Both dots are closed, so the range is −2 ≤ y ≤ 6.',
        ],
        commonError: 'Writing the range in the order the graph is drawn, 6 ≤ y ≤ −2; an inequality goes from the smaller number to the larger one: −2 ≤ y ≤ 6.',
      },
      example: 'ex-domain-range',
    }),
    item({
      id: 'tg-u1-q5',
      alignment: teks('A.2A'),
      actions: ['readGraph', 'analyzeDomain', 'analyzeRange'],
      dok: 2,
      band: 3,
      prompt: 'A hose fills a small pool for 8 minutes and then is turned off. The graph shows the water in the pool, y gallons, after x minutes. Write the domain and the range for this situation as inequalities.',
      function: { family: 'linear', m: 5, b: 10, domain: { min: 0, max: 8, minClosed: true, maxClosed: true } },
      graph: {
        xMin: -1,
        xMax: 10,
        yMin: -5,
        yMax: 60,
        xAxisLabel: 'Time filling',
        xAxisUnit: 'minutes',
        yAxisLabel: 'Water in the pool',
        yAxisUnit: 'gallons',
        accessibleDescription: 'A line segment that rises from left to right. It starts at a closed dot on the vertical axis, above the origin, and ends at a closed dot to the right. The horizontal axis is time filling in minutes. The vertical axis is water in the pool in gallons.',
      },
      correctDomain: '0 <= x <= 8',
      correctRange: '10 <= y <= 50',
      notation: 'inequality',
      hints: [
        'The domain is the time the hose is on. At what time does the graph start, and at what time does it end?',
        'The range is the amount of water. Read the least amount and the greatest amount the graph reaches.',
        'Look at where the graph starts on the y-axis. Is the pool empty at the start?',
      ],
      backUp: ['In this situation, the range tells you…', ['how much water can be in the pool', 'how long the hose is on'], 'how much water can be in the pool'],
      solution: {
        reasoning: [
          'Domain: the hose runs from 0 minutes to 8 minutes, and both dots are closed: 0 ≤ x ≤ 8.',
          'Range: the graph starts at 10 gallons, not at 0, and it ends at 50 gallons.',
          'Both of those amounts are reached, so the range is 10 ≤ y ≤ 50.',
        ],
        commonError: 'Starting the range at 0; the pool already holds 10 gallons when the hose is turned on, so the least value of y is 10.',
      },
    }),
  ],
  honors: [
    item({
      id: 'tg-u1-h1',
      alignment: teks('A.2A'),
      actions: ['readGraph', 'analyzeDomain', 'analyzeRange'],
      dok: 2,
      band: 4,
      prompt: 'Honors. The graph is a line segment with an open dot at its left end and a closed dot at its right end. Write its domain and its range as inequalities.',
      function: { family: 'linear', m: -0.5, b: 3, domain: { min: -4, max: 6, minClosed: false, maxClosed: true } },
      graph: {
        xMin: -6,
        xMax: 8,
        yMin: -2,
        yMax: 7,
        accessibleDescription: 'A line segment that falls from left to right. It starts at an open dot in the upper left and ends at a closed dot on the horizontal axis.',
      },
      correctDomain: '-4 < x <= 6',
      correctRange: '0 <= y < 5',
      notation: 'inequality',
      hints: [
        'Read the domain from the left end to the right end. Which end is left out?',
        'The graph falls, so its highest point is at its left end. Is that point part of the graph?',
        'An open dot uses < or >. A closed dot uses ≤ or ≥. Decide for each end of each inequality.',
      ],
      backUp: ['An open dot at the end of a graph means that point is…', ['not part of the graph', 'part of the graph'], 'not part of the graph'],
      solution: {
        reasoning: [
          'Domain: the segment runs from x = −4 (open dot, left out) to x = 6 (closed dot, included): −4 < x ≤ 6.',
          'The line falls, so the open dot is the HIGHEST point, at y = 5, and the closed dot is the lowest, at y = 0.',
          'The lowest value 0 is included and the highest value 5 is not: 0 ≤ y < 5.',
        ],
        commonError: 'Keeping the open end on the left of the range, 0 < y ≤ 5; the open dot is at the top of this graph, so it is the 5 that is left out: 0 ≤ y < 5.',
      },
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 2 */

const UNIT_2 = unit({
  number: 2,
  title: 'Unit 2 — Rate of change and the forms of a line',
  minutes: 60,
  honorsMinutes: 70,
  questions: [
    item({
      id: 'tg-u2-q1',
      alignment: teks('A.3B', 'A.3C'),
      actions: ['connectLinearRepresentations'],
      dok: 1,
      band: 1,
      prompt: 'The graph shows a line. Use two of its marked points to find the slope as rise over run. Then find the y-intercept.',
      ...board({
        source: { kind: 'graph', points: [{ x: -1, y: -3 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 2, y: 3 }] },
        bounds: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
        cards: ['slope', 'yIntercept'],
      }),
      hints: [
        'Pick two marked points. Count how far up or down you move (the rise) and how far right (the run).',
        'Slope is rise divided by run. A line that goes up from left to right has a positive slope.',
        'The y-intercept is the marked point on the y-axis, where x = 0.',
      ],
      backUp: ['Slope is…', ['rise divided by run', 'run divided by rise'], 'rise divided by run'],
      notes: [
        ['Slope from a graph', 'Slope = rise ÷ run: the change in y divided by the change in x between any two points of the line.'],
        ['Worked example', 'From (0, 4) to (3, 13) the rise is 9 and the run is 3, so the slope is 9 ÷ 3 = 3.'],
      ],
      solution: {
        reasoning: [
          'Use the marked points (0, −1) and (1, 1). The rise is 1 − (−1) = 2 and the run is 1 − 0 = 1.',
          'Slope = rise ÷ run = 2 ÷ 1 = 2.',
          'The line crosses the y-axis at (0, −1), so the y-intercept is (0, −1).',
        ],
        commonError: 'Dividing the run by the rise, which gives 1/2; slope is the change in y over the change in x: 2 ÷ 1 = 2.',
      },
      example: 'ex-slope-graph',
    }),
    item({
      id: 'tg-u2-q2',
      alignment: teks('A.3B'),
      actions: ['proveConstantRate'],
      dok: 2,
      band: 2,
      prompt: 'Lena saves money each week. The table shows her savings, y dollars, after x weeks. Find the rate of change for three different pairs of rows. Then decide whether the rate of change is constant.',
      mode: 'constantRate',
      requiredComparisons: 3,
      xAxisLabel: 'Time (weeks)',
      yAxisLabel: 'Savings (dollars)',
      rows: [{ x: 1, y: 35 }, { x: 2, y: 50 }, { x: 4, y: 80 }, { x: 7, y: 125 }],
      hints: [
        'Pick two rows. Δx is how many more weeks, and Δy is how many more dollars.',
        'The rate of change is Δy ÷ Δx. Here its unit is dollars per week.',
        'The weeks do not always go up by 1, so divide every time. Then compare your three rates.',
      ],
      backUp: ['For two rows of a table, Δy is…', ['the change in y from one row to the other', 'the change in x from one row to the other'], 'the change in y from one row to the other'],
      notes: [
        ['Rate of change from a table', 'For any two rows, rate of change = Δy ÷ Δx. If every pair of rows gives the same rate, the rate is constant and the table is linear.'],
        ['Worked example', 'Rows (2, 9) and (5, 21): Δy = 12 and Δx = 3, so the rate of change is 12 ÷ 3 = 4.'],
      ],
      solution: {
        reasoning: [
          'Rows 1 and 2: Δx = 2 − 1 = 1 and Δy = 50 − 35 = 15, so the rate is 15 ÷ 1 = 15.',
          'Rows 2 and 3: Δx = 2 and Δy = 30, so the rate is 30 ÷ 2 = 15. Rows 3 and 4: Δx = 3 and Δy = 45, so the rate is 45 ÷ 3 = 15.',
          'Every pair gives 15 dollars per week, so the rate of change is constant.',
        ],
        commonError: 'Comparing only the changes in y (15, 30, 45) and calling the rate not constant; the weeks jump by different amounts, so each change in y must be divided by its change in x.',
      },
      example: 'ex-rate-table',
    }),
    item({
      id: 'tg-u2-q3',
      alignment: teks('A.3C', 'A.3B'),
      actions: ['constructLine'],
      dok: 1,
      band: 2,
      prompt: 'Graph y = 2x − 3. Plot the y-intercept first. Then use the slope to plot a second point.',
      mode: 'slopeIntercept',
      line: { m: 2, b: -3 },
      graphBounds: { ...WINDOW },
      hints: [
        'In y = mx + b, the number b is where the line crosses the y-axis. Plot that point first.',
        'The slope m is rise over run. Write a whole-number slope over 1.',
        'From the y-intercept, move up by the rise and right by the run. Plot that point and draw the line.',
      ],
      backUp: ['In y = 4x + 1, the y-intercept is…', ['1', '4'], '1'],
      notes: [
        ['Graph from y = mx + b', 'Start at the y-intercept (0, b). Then use the slope m as rise over run to find a second point.'],
        ['Worked example', 'y = 3x + 1: plot (0, 1). The slope is 3/1, so go up 3 and right 1 to (1, 4). Draw the line through both points.'],
      ],
      solution: {
        reasoning: [
          'The y-intercept is −3, so plot (0, −3).',
          'The slope is 2, which is 2/1: from (0, −3) go up 2 and right 1 to (1, −1).',
          'Draw the line through (0, −3) and (1, −1). Check: 2(1) − 3 = −1.',
        ],
        commonError: 'Plotting the y-intercept at (0, 2); in y = 2x − 3 the 2 is the slope, and the y-intercept is −3.',
      },
      example: 'ex-graph-slope-intercept',
    }),
    item({
      id: 'tg-u2-q4',
      alignment: teks('A.2C', 'A.3B', 'A.3C'),
      actions: ['connectLinearRepresentations'],
      dok: 2,
      band: 2,
      prompt: 'Read the bowling situation. Decide what x and y stand for, write the equation in slope-intercept form, and graph it.',
      ...board({
        xAxisLabel: 'Games bowled',
        yAxisLabel: 'Total cost (dollars)',
        source: {
          kind: 'scenario',
          prompt: 'A bowling alley charges $4 to rent shoes plus $3 for each game. Let x be the number of games bowled and y be the total cost, in dollars.',
          rate: 3,
          initialValue: 4,
        },
        bounds: { xMin: -2, xMax: 8, yMin: -1, yMax: 22 },
        cards: ['slope', 'yIntercept', 'slopeIntercept', 'graphSlopeIntercept'],
        context: {
          independentQuantity: meaning('games bowled', ['games bowled', 'total cost (dollars)', 'cost of each game (dollars)']),
          dependentQuantity: meaning('total cost (dollars)', ['games bowled', 'total cost (dollars)', 'cost of each game (dollars)']),
          slopeMeaning: meaning('The total cost goes up $3 for each game.', [
            'The total cost goes up $3 for each game.',
            'The total cost goes up $4 for each game.',
            'The shoes cost $3 to rent.',
            'The group bowls 3 games.',
          ]),
          yInterceptMeaning: meaning('The cost is $4 before any game is bowled.', [
            'The cost is $4 before any game is bowled.',
            'The cost is $3 before any game is bowled.',
            'Each game costs $4.',
            'The group bowls 4 games.',
          ]),
        },
      }),
      hints: [
        'Which amount is paid again for every game? That amount is the rate of change, so it is the slope.',
        'Which amount is paid one time, even when x = 0? That amount is the y-intercept.',
        'Put your slope and y-intercept into y = mx + b. To graph, start at the y-intercept and use the slope.',
      ],
      backUp: ['In y = mx + b, which letter is the amount for each one?', ['m, the slope', 'b, the y-intercept'], 'm, the slope'],
      notes: [
        ['Words to y = mx + b', 'The amount "for each" or "per" is the slope m. The one-time or starting amount is the y-intercept b.'],
        ['Worked example', 'A $5 entry fee plus $2 for each ride: m = 2 and b = 5, so y = 2x + 5.'],
      ],
      solution: {
        reasoning: [
          'x is the number of games bowled (the input) and y is the total cost (the output).',
          'The cost goes up $3 for each game, so the slope is 3. The $4 for shoes is paid once, when x = 0, so the y-intercept is (0, 4).',
          'The equation is y = 3x + 4.',
          'Graph it: plot (0, 4), then go up 3 and right 1 to (1, 7).',
        ],
        commonError: 'Writing y = 4x + 3; the $4 for shoes is paid once, so it is the y-intercept, and the $3 for each game is the slope.',
      },
      example: 'ex-equation-from-words',
    }),
    item({
      id: 'tg-u2-q5',
      alignment: teks('A.2C', 'A.3B'),
      actions: ['proveConstantRate'],
      dok: 2,
      band: 3,
      prompt: 'The table shows values of a linear function. Use three different pairs of rows to show that the rate of change is constant. Then write the equation in the form y = mx + b.',
      mode: 'deriveEquation',
      requiredComparisons: 3,
      rows: [{ x: -2, y: -1 }, { x: 0, y: 3 }, { x: 3, y: 9 }, { x: 5, y: 13 }],
      hints: [
        'For each pair of rows, find Δy ÷ Δx. The x-values do not go up by 1, so divide every time.',
        'The constant rate of change is the slope m.',
        'The y-intercept b is the value of y when x = 0. Look for that row in the table.',
      ],
      backUp: ['In a table, the y-intercept is the y-value in the row where…', ['x = 0', 'y = 0'], 'x = 0'],
      notes: [
        ['Table to y = mx + b', 'm is the constant rate of change, Δy ÷ Δx. b is the y-value where x = 0.'],
        ['Worked example', 'Rows (0, 5), (2, 13), (5, 25): every rate is 4 and y = 5 when x = 0, so y = 4x + 5.'],
      ],
      solution: {
        reasoning: [
          'Rows 1 and 2: Δy ÷ Δx = 4 ÷ 2 = 2. Rows 2 and 3: 6 ÷ 3 = 2. Rows 3 and 4: 4 ÷ 2 = 2.',
          'The rate of change is always 2, so the function is linear and m = 2.',
          'The row with x = 0 has y = 3, so b = 3.',
          'The equation is y = 2x + 3. Check with (5, 13): 2(5) + 3 = 13.',
        ],
        commonError: 'Using the change in y alone (4 or 6) as the slope; divide by the change in x each time: 4 ÷ 2 and 6 ÷ 3 are both 2.',
      },
      example: 'ex-equation-from-table',
    }),
    item({
      id: 'tg-u2-q6',
      alignment: teks('A.3C'),
      actions: ['constructLine'],
      dok: 2,
      band: 3,
      prompt: 'Use the intercepts to graph 2x + 3y = 12.',
      standardForm: { A: 2, B: 3, C: 12 },
      constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts' },
      hints: [
        'To find the x-intercept, put 0 in place of y and solve for x.',
        'To find the y-intercept, put 0 in place of x and solve for y.',
        'Plot one intercept on each axis. Then draw the line through them.',
      ],
      backUp: ['To find the x-intercept of an equation, you replace…', ['y with 0', 'x with 0'], 'y with 0'],
      notes: [
        ['Graph from Ax + By = C', 'Find the two intercepts: let y = 0 to get the x-intercept, and let x = 0 to get the y-intercept. Plot both and draw the line.'],
        ['Worked example', '5x + 2y = 10: y = 0 gives 5x = 10, so (2, 0). x = 0 gives 2y = 10, so (0, 5).'],
      ],
      solution: {
        reasoning: [
          'Let y = 0: 2x = 12, so x = 6. The x-intercept is (6, 0).',
          'Let x = 0: 3y = 12, so y = 4. The y-intercept is (0, 4).',
          'Plot (6, 0) and (0, 4) and draw the line through them.',
        ],
        commonError: 'Plotting (2, 0) and (0, 3) by reading the coefficients as the intercepts; the intercepts come from solving 2x = 12 and 3y = 12.',
      },
      example: 'ex-graph-intercepts',
    }),
    item({
      id: 'tg-u2-q7',
      alignment: teks('A.2B'),
      actions: ['connectLinearRepresentations'],
      dok: 2,
      band: 3,
      prompt: 'A line passes through the points (−1, 5) and (2, −1). Find its slope. Then write its equation in point-slope form and in slope-intercept form.',
      ...board({
        source: { kind: 'twoPoints', points: [{ x: -1, y: 5 }, { x: 2, y: -1 }] },
        cards: ['slope', 'pointSlope', 'slopeIntercept'],
      }),
      hints: [
        'Use the slope formula: (y₂ − y₁) ÷ (x₂ − x₁). Subtract in the same order on the top and on the bottom.',
        'Point-slope form is y − y₁ = m(x − x₁). Use your slope and either point.',
        'To get slope-intercept form, distribute the slope and then get y alone.',
      ],
      backUp: ['In y − y₁ = m(x − x₁), the numbers x₁ and y₁ come from…', ['a point on the line', 'the slope'], 'a point on the line'],
      notes: [
        ['Line through two points', 'First the slope: m = (y₂ − y₁) ÷ (x₂ − x₁). Then point-slope form: y − y₁ = m(x − x₁). Solve for y to get y = mx + b.'],
        ['Worked example', '(1, 3) and (3, 11): m = 8 ÷ 2 = 4. y − 3 = 4(x − 1), which becomes y = 4x − 1.'],
      ],
      solution: {
        reasoning: [
          'Slope: m = (−1 − 5) ÷ (2 − (−1)) = −6 ÷ 3 = −2.',
          'Point-slope form with (−1, 5): y − 5 = −2(x + 1).',
          'Distribute: y − 5 = −2x − 2. Add 5 to both sides: y = −2x + 3.',
          'Check with (2, −1): −2(2) + 3 = −1.',
        ],
        commonError: 'Subtracting in different orders, such as (−1 − 5) ÷ (−1 − 2), which gives +2; if the top starts with the second point, the bottom must too.',
      },
      example: 'ex-line-two-points',
    }),
    item({
      id: 'tg-u2-q8',
      alignment: teks('A.3B', 'A.2C'),
      actions: ['connectLinearRepresentations'],
      dok: 3,
      band: 3,
      prompt: 'A block of ice melts at a constant rate. The graph shows its height, y centimeters, after x hours. Find the rate of change and tell what it means. Then write the equation of the line.',
      ...board({
        xAxisLabel: 'Time melting (hours)',
        yAxisLabel: 'Height of the ice (centimeters)',
        source: { kind: 'graph', points: [{ x: 0, y: 12 }, { x: 1, y: 10 }, { x: 3, y: 6 }, { x: 6, y: 0 }] },
        bounds: { xMin: -1, xMax: 9, yMin: -1, yMax: 14 },
        cards: ['slope', 'yIntercept', 'slopeIntercept'],
        context: {
          slopeMeaning: meaning('The ice gets 2 centimeters shorter each hour.', [
            'The ice gets 2 centimeters shorter each hour.',
            'The ice gets 2 centimeters taller each hour.',
            'The ice is gone after 2 hours.',
            'The ice starts 2 centimeters tall.',
          ]),
          yInterceptMeaning: meaning('The ice starts 12 centimeters tall.', [
            'The ice starts 12 centimeters tall.',
            'The ice melts 12 centimeters each hour.',
            'The ice is gone after 12 hours.',
            'The ice is 12 centimeters tall after 1 hour.',
          ]),
        },
      }),
      hints: [
        'Pick two marked points. Count the rise (the change in height) and the run (the change in time).',
        'The height goes down as time goes on. What does that tell you about the sign of the rate of change?',
        'The y-intercept is the height when x = 0, before any melting.',
      ],
      backUp: ['A line that falls from left to right has…', ['a negative slope', 'a positive slope'], 'a negative slope'],
      solution: {
        reasoning: [
          'Use (0, 12) and (1, 10): the rise is 10 − 12 = −2 and the run is 1, so the slope is −2.',
          'The slope means the ice gets 2 centimeters shorter each hour.',
          'The line meets the y-axis at (0, 12): the ice starts 12 centimeters tall.',
          'With m = −2 and b = 12, the equation is y = −2x + 12.',
        ],
        commonError: 'Dropping the negative sign and writing y = 2x + 12; the height goes down as time goes up, so the rate of change is −2.',
      },
    }),
  ],
  honors: [
    item({
      id: 'tg-u2-h1',
      alignment: teks('A.2B', 'A.3B'),
      actions: ['connectLinearRepresentations'],
      dok: 2,
      band: 4,
      prompt: 'Honors. A line passes through the points (−3, −1) and (3, 3). Find its slope. Then write its equation in point-slope form, in slope-intercept form and in standard form.',
      ...board({
        source: { kind: 'twoPoints', points: [{ x: -3, y: -1 }, { x: 3, y: 3 }] },
        cards: ['slope', 'pointSlope', 'slopeIntercept', 'standardForm'],
      }),
      hints: [
        'The slope will be a fraction. Simplify it, and keep it as a fraction.',
        'Write point-slope form with either point. Then distribute the fraction and get y alone.',
        'For standard form, Ax + By = C, multiply every term by the denominator to clear the fraction. Then move the x-term to the left side.',
      ],
      backUp: ['To clear the fraction in y = (1/4)x + 2, multiply every term by…', ['4', '1/4'], '4'],
      solution: {
        reasoning: [
          'Slope: m = (3 − (−1)) ÷ (3 − (−3)) = 4 ÷ 6 = 2/3.',
          'Point-slope form with (3, 3): y − 3 = (2/3)(x − 3).',
          'Distribute: y − 3 = (2/3)x − 2. Add 3: y = (2/3)x + 1.',
          'Multiply every term by 3: 3y = 2x + 3. Subtract 2x: −2x + 3y = 3, which is also 2x − 3y = −3.',
        ],
        commonError: 'Multiplying only the x-term by 3 when clearing the fraction, which gives 3y = 2x + 1; every term is multiplied, so the 1 becomes 3.',
      },
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 3 */

const CAUSE_SORT = sortBoard([
  {
    id: 'causation',
    label: 'Causation',
    cards: [['tickets', 'Card A'], ['faucet', 'Card C'], ['driving', 'Card E']],
  },
  {
    id: 'association',
    label: 'Association only',
    cards: [['umbrellas', 'Card B'], ['height', 'Card D'], ['shorts', 'Card F']],
  },
], ['tickets', 'umbrellas', 'faucet', 'height', 'driving', 'shorts']);
const CAUSE_CARDS = {
  tickets: 'The number of movie tickets bought at $8 each and the total cost of the tickets',
  umbrellas: 'The number of umbrellas sold in a city in a day and the number of car accidents that day',
  faucet: 'The number of minutes a faucet runs and the amount of water in the bucket under it',
  height: 'The height of a child and the number of words the child knows',
  driving: 'The number of miles a car is driven and the amount of gas the car uses',
  shorts: 'The number of people wearing shorts and the number of people at the city pool',
};

const UNIT_3 = unit({
  number: 3,
  title: 'Unit 3 — Scatterplots and sequences',
  minutes: 32,
  honorsMinutes: 40,
  questions: [
    item({
      id: 'tg-u3-q1',
      alignment: teks('A.12C'),
      actions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence'],
      dok: 1,
      band: 1,
      prompt: 'A sequence is given by f(1) = 3 and f(n) = f(n − 1) + 5 for n ≥ 2. Find the first five terms, plot them, and name the common difference.',
      sequence: { kind: 'arithmetic', first: 3, difference: 5 },
      displayCount: 5,
      notation: 'f(n)',
      hints: [
        'f(1) is the first term. The rule tells you how to get each term from the term just before it.',
        'f(n − 1) means "the term before". Use the rule on the first term to get the second term. Then use it again.',
        'Plot each term as the point (n, f(n)). Do not connect the points: n is a whole-number position.',
      ],
      backUp: ['In f(n) = f(n − 1) + 5, the part f(n − 1) means…', ['the term just before f(n)', 'the term number minus 1'], 'the term just before f(n)'],
      notes: [
        ['Recursive rule', 'A recursive rule gives the first term and how to get every term from the one before it. Adding the same number each time gives an arithmetic sequence; that number is the common difference.'],
        ['Worked example', 'f(1) = 9 and f(n) = f(n − 1) + 10: the terms are 9, 19, 29, 39, … and the common difference is 10.'],
      ],
      solution: {
        reasoning: [
          'Start with f(1) = 3.',
          'Add 5 each time: f(2) = 8, f(3) = 13, f(4) = 18 and f(5) = 23.',
          'Plot (1, 3), (2, 8), (3, 13), (4, 18) and (5, 23) as separate points.',
          'The same number, 5, is added each time, so the sequence is arithmetic with common difference 5.',
        ],
        commonError: 'Adding 5 to the position n instead of to the term before, which gives 6, 7, 8, …; each term is the previous TERM plus 5.',
      },
      example: 'ex-sequence',
    }),
    item({
      id: 'tg-u3-q2',
      alignment: teks('A.12C'),
      actions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'findSequenceTerm'],
      dok: 2,
      band: 3,
      prompt: 'A sequence is given by f(1) = 20 and f(n) = f(n − 1) − 3 for n ≥ 2. Find the first five terms, plot them, and name the common difference. Then find f(10).',
      sequence: { kind: 'arithmetic', first: 20, difference: -3 },
      displayCount: 5,
      targetN: 10,
      notation: 'f(n)',
      hints: [
        'Each term is smaller than the term before it. Is the common difference positive or negative?',
        'Use the rule on each term to get the next one. The terms get smaller.',
        'To reach f(10), keep using the rule after the fifth term, one term at a time.',
      ],
      backUp: ['If each term is 3 less than the term before it, the common difference is…', ['−3', '3'], '−3'],
      solution: {
        reasoning: [
          'Start with f(1) = 20 and subtract 3 each time: 20, 17, 14, 11, 8.',
          'Each term is 3 less than the one before, so the common difference is −3.',
          'Keep going: f(6) = 5, f(7) = 2, f(8) = −1, f(9) = −4.',
          'One more step gives f(10) = −4 − 3 = −7.',
        ],
        commonError: 'Writing the common difference as 3; the terms go down, so the number added each time is −3.',
      },
    }),
    item({
      id: 'tg-u3-q3',
      alignment: teks('A.4B'),
      actions: ['sortIntoOwnGroups'],
      dok: 2,
      band: 3,
      prompt: 'Each card names two quantities that change together. Sort the cards into exactly two groups: pairs where the first quantity causes the change in the second, and pairs that are only associated. Name each group and explain how you decided.',
      items: CAUSE_SORT.items.map((card) => ({ ...card, text: CAUSE_CARDS[card.id] })),
      validSchemes: [{ id: 'causationVsAssociation', label: 'Causation or association', groups: CAUSE_SORT.validSchemes[0].groups.map((group, index) => ({ id: group.id, label: CAUSE_SORT.categories[index].label, itemIds: group.itemIds })) }],
      minGroups: 2,
      maxGroups: 2,
      hints: [
        'Causation means changing the first quantity directly makes the second quantity change.',
        'Two quantities can change together because a third thing affects both of them.',
        'For each card, ask: could something else, such as rain, age or hot weather, be changing both quantities?',
      ],
      backUp: ['Cities with more ice cream shops also have more traffic. What most likely explains both?', ['Bigger cities have more of both', 'Ice cream shops cause traffic'], 'Bigger cities have more of both'],
      notes: [
        ['Association and causation', 'Associated: two quantities change together. Causation: a change in one directly makes the other change. A third quantity can make two things change together without either one causing the other.'],
        ['Worked example', 'Sunglasses sold and sunscreen sold rise together because of sunny weather: association only. Hours worked and pay at $10 an hour: causation.'],
      ],
      solution: {
        reasoning: [
          'For each card, ask whether changing only the first quantity would make the second one change.',
          'Causation: Card A (each ticket adds $8 to the cost), Card C (each minute the faucet runs adds water to the bucket) and Card E (each mile driven uses gas).',
          'Association only: Card B (rain raises both umbrella sales and accidents), Card D (older children are taller and know more words) and Card F (hot weather brings out shorts and fills the pool).',
        ],
        commonError: 'Calling Card B causation because both numbers go up on the same days; selling umbrellas does not cause accidents, since rain is behind both.',
      },
      example: 'ex-causation-sort',
    }),
    item({
      id: 'tg-u3-q4',
      alignment: teks('A.4C'),
      actions: ['fitDataModel', 'predictFromModel'],
      dok: 3,
      band: 3,
      prompt: 'A class measured a bean plant for 8 weeks. The scatterplot shows its height, y centimeters, x weeks after planting. First fit a line by hand. Then run linear regression, and use the regression line to predict the height at week 10.',
      points: [
        { x: 1, y: 5 }, { x: 2, y: 6 }, { x: 3, y: 9 }, { x: 4, y: 10 },
        { x: 5, y: 13 }, { x: 6, y: 14 }, { x: 7, y: 16 }, { x: 8, y: 19 },
      ],
      predictionX: 10,
      predictionTolerance: 2,
      xAxisLabel: 'Weeks after planting',
      yAxisLabel: 'Height (centimeters)',
      hints: [
        'Make your line rise the way the points rise. Then slide it until about as many points are above it as below it.',
        'Run linear regression on all eight points. Its line replaces your estimate.',
        'To predict, put the week number in place of x in the regression equation. Round to the nearest whole centimeter.',
      ],
      backUp: ['To predict the height at week 10, you replace which letter with 10?', ['x, the weeks', 'y, the height'], 'x, the weeks'],
      notes: [
        ['Line of best fit', 'A line of best fit follows the trend of the data, with points on both sides of it. Technology finds it with linear regression. To predict, substitute the x-value into its equation.'],
        ['Worked example', 'If regression gives y = 1.5x + 4, the prediction at x = 6 is 1.5(6) + 4 = 13.'],
      ],
      solution: {
        reasoning: [
          'The points rise about 2 centimeters each week, so a good hand-fit line has a slope close to 2.',
          'Linear regression on the eight points gives about y = 1.98x + 2.61.',
          'Substitute x = 10: 1.98(10) + 2.61 ≈ 22.4.',
          'The predicted height at week 10 is about 22 centimeters.',
        ],
        commonError: 'Predicting from the last data point alone (19 centimeters at week 8) instead of using the regression line, which uses all eight points.',
      },
      example: 'ex-best-fit',
    }),
  ],
  honors: [
    item({
      id: 'tg-u3-h1',
      alignment: teks('A.12C'),
      actions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence'],
      dok: 2,
      band: 4,
      prompt: 'Honors. A sequence is given by f(1) = 48 and f(n) = (1/2)·f(n − 1) for n ≥ 2. Find the first five terms and plot them. Decide whether the sequence is arithmetic or geometric, and give its common difference or common ratio.',
      sequence: { kind: 'geometric', first: 48, ratio: 0.5 },
      displayCount: 5,
      notation: 'f(n)',
      hints: [
        'This rule multiplies the term before by a number. It does not add a number.',
        'Multiplying by 1/2 is the same as taking half.',
        'Check your pattern two ways: subtract neighbors, then divide neighbors. Which one stays the same?',
      ],
      backUp: ['A sequence where each term is the term before it TIMES the same number is…', ['geometric', 'arithmetic'], 'geometric'],
      notes: [
        ['Geometric sequence', 'When each term is the term before it TIMES the same number, the sequence is geometric. That number is the common ratio.'],
        ['Worked example', 'f(1) = 64 and f(n) = (1/4)·f(n − 1): the terms are 64, 16, 4, 1, … and the common ratio is 1/4.'],
      ],
      solution: {
        reasoning: [
          'Start with f(1) = 48 and take half each time: 48, 24, 12, 6, 3.',
          'The differences are −24, −12, −6, −3: they are not the same, so the sequence is not arithmetic.',
          'The ratios are 24 ÷ 48, 12 ÷ 24, 6 ÷ 12 and 3 ÷ 6: each is 1/2.',
          'The sequence is geometric with common ratio 1/2.',
        ],
        commonError: 'Calling it arithmetic with common difference −24; the amount subtracted changes every time, but the ratio 1/2 stays the same.',
      },
      example: 'ex-geometric-sequence',
    }),
  ],
});

export const UNITS_1_TO_3 = [UNIT_1, UNIT_2, UNIT_3];
