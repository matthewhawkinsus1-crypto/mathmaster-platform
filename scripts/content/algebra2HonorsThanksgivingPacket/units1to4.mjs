/*
 * UNITS 1–4 OF THE THANKSGIVING PACKET: interval notation and function
 * attributes (A2.7I), parent functions and transformations (A2.2A), inverses
 * and operations on functions (A2.2B, A2.2D), and absolute value (A2.6C–F).
 * Each unit runs from its building block to grade level, and every item is new:
 * the method of the taught lesson, with numbers the class has not seen.
 */
import { example, item, unit, builtOn } from './packetKit.mjs';
import { expression, number } from '../lib/lessonKit.mjs';

/* ---------------------------------------------------------------- Unit 1 */

const U1 = {
  interval: example('ex-u1-interval', {
    skill: 'intervals.graphAndNotation',
    tool: 'intervalNumberLine',
    problem: 'Graph 1 ≤ x < 4 and write it in interval notation.',
    steps: [
      ['Closed circle at 1', '≤ means 1 is included, so its circle is filled in.'],
      ['Open circle at 4', '< means 4 is left out, so its circle stays open.'],
      ['Shade between 1 and 4', 'x can be any number between the two ends.'],
      ['[1, 4)', 'Smaller number first. A bracket goes with the closed circle and a parenthesis with the open one.'],
    ],
  }),
  ray: example('ex-u1-ray', {
    skill: 'intervals.ray',
    tool: 'intervalNumberLine',
    problem: 'Graph x < 3 and write it in interval notation.',
    steps: [
      ['Open circle at 3', '< means 3 is not included.'],
      ['Shade to the left, with an arrow', 'Every number less than 3 works, and they never stop.'],
      ['(−∞, 3)', 'The shading has no left end, so it starts at −∞. Infinity always gets a parenthesis.'],
    ],
  }),
  union: example('ex-u1-union', {
    skill: 'intervals.compoundOr',
    tool: 'intervalNumberLine',
    problem: 'Graph x ≤ −1 or x > 4 and write it in interval notation.',
    steps: [
      ['x ≤ −1: closed circle at −1, shade left', 'This piece is (−∞, −1].'],
      ['x > 4: open circle at 4, shade right', 'This piece is (4, ∞).'],
      ['(−∞, −1] ∪ (4, ∞)', '“Or” keeps both pieces. The symbol ∪ joins them, left piece first.'],
    ],
  }),
  domainRange: example('ex-u1-domain-range', {
    skill: 'functions.domainRangeFromGraph',
    tool: 'graphAnalysis',
    problem: 'The graph of f(x) = x + 1 is drawn only for −3 < x ≤ 2. State the domain and range.',
    steps: [
      ['Domain: read left to right, from x = −3 to x = 2', 'The domain is every x the graph uses.'],
      ['Domain: (−3, 2]', 'The left end is an open circle and the right end is a closed circle.'],
      ['Range: the lowest y is f(−3) = −2 and the highest is f(2) = 3', 'The range is every y the graph reaches, read bottom to top.'],
      ['Range: (−2, 3]', 'The open end stays open: y = −2 belongs to the open circle.'],
    ],
  }),
  relation: example('ex-u1-relation', {
    skill: 'relations.domainRangeFunction',
    tool: 'relationMapping',
    problem: 'For the relation {(1, 2), (3, 2), (3, 5)}, state the domain and range and decide whether it is a function.',
    steps: [
      ['Arrows: 1 → 2, 3 → 2, 3 → 5', 'Each ordered pair (x, y) is one arrow from an input to an output.'],
      ['Domain: {1, 3}', 'The domain is the set of inputs. List each one once.'],
      ['Range: {2, 5}', 'The range is the set of outputs. List each one once.'],
      ['Not a function', 'The input 3 has two different outputs, 2 and 5. A function gives each input exactly one output.'],
    ],
  }),
  attributes: example('ex-u1-attributes', {
    skill: 'functions.increasingDecreasingPositiveNegative',
    tool: 'graphAnalysis',
    problem: 'For f(x) = |x + 1| − 2, state where f is increasing, decreasing, positive and negative.',
    steps: [
      ['The vertex is (−1, −2) and the V opens up', 'The graph turns around at its vertex.'],
      ['Decreasing on (−∞, −1); increasing on (−1, ∞)', 'Left of the vertex the graph falls; right of it the graph rises. Use x-values.'],
      ['x-intercepts: |x + 1| = 2, so x = −3 and x = 1', 'The sign of f can only change where the graph crosses the x-axis.'],
      ['Negative on (−3, 1)', 'Between the intercepts the graph is below the x-axis.'],
      ['Positive on (−∞, −3) ∪ (1, ∞)', 'Outside the intercepts the graph is above the x-axis.'],
    ],
  }),
};

const unit1 = unit(1, 'Interval notation, domain and range', U1, [
  item('tgp-u1-1', {
    standards: ['A2.7I'], dok: 1, band: 1, actions: ['constructInterval', 'writeInterval'],
    prompt: 'Graph $-2 < x \\le 6$ on the number line. Then write it in interval notation.',
    tool: { inequalityText: '−2 < x ≤ 6', intervals: [{ min: -2, max: 6, minClosed: false, maxClosed: true }] },
    example: U1.interval,
    idea: 'A closed circle and a bracket mean the end is included (≤ or ≥). An open circle and a parenthesis mean it is not (< or >).',
    hints: [
      'Put one circle at −2 and one at 6. Which of them is included?',
      'The symbol next to 6 is ≤, so 6 is included. The symbol next to −2 is <.',
      'Write the smaller end first. Use a bracket for an included end and a parenthesis for an end that is left out.',
    ],
    back: ['x ≤ 6 means that 6 is…', ['included', 'not included'], 'included'],
    solution: ['One open end, one closed end.', [
      '−2 < x: open circle at −2, because −2 is not included.',
      'x ≤ 6: closed circle at 6, because 6 is included.',
      'Shade between them and write the smaller end first: (−2, 6].',
    ], '(−2, 6]', 'Writing [−2, 6): the bracket has to go with 6, the end that is included.'],
  }),
  item('tgp-u1-2', {
    standards: ['A2.7I'], dok: 1, band: 1, actions: ['constructInterval', 'writeInterval'],
    prompt: 'Graph $x \\ge -1$ on the number line. Then write it in interval notation.',
    tool: { inequalityText: 'x ≥ −1', intervals: [{ min: -1, max: null, minClosed: true, maxClosed: false }] },
    example: U1.ray,
    idea: 'A graph that never ends goes to ∞ or −∞. Infinity is not a number, so it always gets a parenthesis.',
    hints: [
      'Is −1 included? Look at the symbol ≥.',
      'Numbers greater than −1 are to the right of −1, and they never stop.',
      'Start the interval at −1 and end it at ∞. Only −1 can have a bracket.',
    ],
    back: ['Which way do you shade for x ≥ −1?', ['To the right of −1', 'To the left of −1'], 'To the right of −1'],
    solution: ['A closed end and an arrow.', [
      '≥ includes −1: closed circle at −1.',
      'Greater than −1 is to the right, so shade right with an arrow.',
      'The interval starts at −1 and never ends: [−1, ∞).',
    ], '[−1, ∞)', 'Putting a bracket on ∞: infinity is never included, so it always gets a parenthesis.'],
  }),
  item('tgp-u1-3', {
    standards: ['A2.7I'], dok: 2, band: 2, actions: ['constructInterval', 'writeInterval'],
    prompt: 'Graph $x < -3$ or $x \\ge 2$ on the number line. Then write it in interval notation.',
    tool: {
      inequalityText: 'x < −3 or x ≥ 2',
      intervals: [{ min: null, max: -3, minClosed: false, maxClosed: false }, { min: 2, max: null, minClosed: true, maxClosed: false }],
    },
    example: U1.union,
    idea: '“Or” means two separate pieces. Write each piece as its own interval and join them with ∪.',
    hints: [
      'Graph the two pieces one at a time. They do not touch.',
      'x < −3 goes left from an open circle. x ≥ 2 goes right from a closed circle.',
      'Write the left piece, then ∪, then the right piece.',
    ],
    back: ['How many separate pieces does “x < −3 or x ≥ 2” have?', ['Two', 'One'], 'Two'],
    solution: ['Two rays joined by ∪.', [
      'x < −3: open circle at −3, shade left. That piece is (−∞, −3).',
      'x ≥ 2: closed circle at 2, shade right. That piece is [2, ∞).',
      'Join the two pieces: (−∞, −3) ∪ [2, ∞).',
    ], '(−∞, −3) ∪ [2, ∞)', 'Shading between −3 and 2: “or” keeps the two outside pieces, not the middle.'],
  }),
  item('tgp-u1-4', {
    standards: ['A2.7I'], dok: 2, band: 2, actions: ['buildMapping', 'plotRelation', 'stateDomain', 'stateRange', 'classifyFunction'],
    prompt: 'Show the relation {(−2, 3), (0, 5), (1, 3), (4, −1)} as a mapping and as a graph. Then state its domain and range, and decide whether it is a function.',
    tool: { relation: [[-2, 3], [0, 5], [1, 3], [4, -1]] },
    example: U1.relation,
    idea: 'The domain is the set of inputs (x-values) and the range is the set of outputs (y-values). A relation is a function when every input has exactly one output.',
    hints: [
      'Each ordered pair is (input, output). Draw one arrow for each pair.',
      'List each input once for the domain, and each output once for the range.',
      'Look at the inputs. Does any input have two different outputs?',
    ],
    back: ['In the ordered pair (4, −1), the input is…', ['4', '−1'], '4'],
    solution: ['Inputs, outputs, then one output for each input.', [
      'The inputs are −2, 0, 1 and 4, so the domain is {−2, 0, 1, 4}.',
      'The outputs are 3, 5, 3 and −1. List 3 only once: the range is {−1, 3, 5}.',
      'No input is used twice, so every input has exactly one output: it is a function.',
      'Two inputs share the output 3. That is allowed in a function.',
    ], 'Domain {−2, 0, 1, 4}; range {−1, 3, 5}; it is a function', 'Saying it is not a function because the output 3 appears twice: a function may repeat an output, but not an input.'],
  }),
  item('tgp-u1-5', {
    standards: ['A2.7I'], dok: 2, band: 2, actions: ['analyzeDomain', 'analyzeRange'],
    prompt: 'The graph of $f(x) = -x + 3$ is drawn only for $-2 \\le x < 5$. State its domain and range in interval notation.',
    tool: { function: { family: 'linear', m: -1, b: 3, domain: { min: -2, max: 5, minClosed: true, maxClosed: false } } },
    example: U1.domainRange,
    idea: 'Domain: every x the graph uses, read left to right. Range: every y the graph reaches, read bottom to top.',
    hints: [
      'For the domain, look left to right. Where does the graph start and stop?',
      'For the range, find the height of each end: f(−2) and f(5).',
      'This line goes down, so the closed circle is the highest point. Write the lowest y first.',
    ],
    back: ['The domain of a graph is read…', ['left to right, along the x-axis', 'bottom to top, along the y-axis'], 'left to right, along the x-axis'],
    solution: ['Read x left to right, then y bottom to top.', [
      'Domain: x runs from −2 (closed circle) to 5 (open circle): [−2, 5).',
      'The ends are f(−2) = 5 (closed circle) and f(5) = −2 (open circle).',
      'Range: y runs from −2 up to 5, and the closed end is the top: (−2, 5].',
    ], 'Domain [−2, 5); range (−2, 5]', 'Copying the domain’s brackets onto the range: this line falls, so the closed end is the highest y, not the lowest.'],
  }),
  item('tgp-u1-6', {
    standards: ['A2.7I'], dok: 3, band: 3, actions: ['analyzeIncreasing', 'analyzeDecreasing', 'analyzePositive', 'analyzeNegative'],
    prompt: 'Use the graph of $f(x) = -|x - 1| + 4$. State where $f$ is increasing, decreasing, positive and negative.',
    tool: { function: { family: 'absolute', a: -1, h: 1, k: 4 } },
    example: U1.attributes,
    idea: 'Increasing and decreasing change at the vertex. Positive and negative change at the x-intercepts. All four answers are intervals of x.',
    hints: [
      'Find the vertex first. The graph rises on one side of it and falls on the other.',
      'Find where the graph crosses the x-axis. Above the axis is positive; below it is negative.',
      'Every answer uses x-values with parentheses: the turning point and the crossing points are not included.',
    ],
    back: ['“f is positive” means the graph is…', ['above the x-axis', 'going uphill'], 'above the x-axis'],
    solution: ['Vertex for up and down; x-intercepts for the sign.', [
      'The vertex is (1, 4) and the V opens down: increasing on (−∞, 1), decreasing on (1, ∞).',
      'x-intercepts: −|x − 1| + 4 = 0 gives |x − 1| = 4, so x = −3 and x = 5.',
      'The graph is above the x-axis between them: positive on (−3, 5).',
      'It is below the axis outside them: negative on (−∞, −3) ∪ (5, ∞).',
    ], 'Increasing (−∞, 1); decreasing (1, ∞); positive (−3, 5); negative (−∞, −3) ∪ (5, ∞)', 'Answering “positive” with where the graph is rising: positive means above the x-axis, wherever the graph is heading.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 2 */

const U2 = {
  parent: example('ex-u2-parent', {
    skill: 'parentFunctions.keyAttributes',
    tool: 'graphAnalysis',
    problem: 'For the parent function f(x) = |x|, state the domain, the range and the vertex.',
    steps: [
      ['Vertex: (0, 0)', 'The V turns around at the origin.'],
      ['Domain: (−∞, ∞)', 'You can take the absolute value of any number, and the graph keeps going both ways.'],
      ['Range: [0, ∞)', 'An absolute value is never negative. The lowest y is 0, at the vertex.'],
    ],
  }),
  identify: example('ex-u2-identify', {
    skill: 'transformations.readAHK',
    tool: 'transformationsLab',
    problem: 'A graph of y = a(x − h)² + k has its vertex at (−1, 4) and passes through (0, 6). Find a, h and k.',
    steps: [
      ['h = −1 and k = 4', 'The vertex of y = a(x − h)² + k is (h, k).'],
      ['From the vertex, 1 step right is 2 steps up', 'For y = x², one step right of the vertex is 1 step up. Here it is a times that.'],
      ['a = 2', 'The rise after one step right of the vertex is a.'],
      ['y = 2(x + 1)² + 4', 'x − (−1) is written x + 1.'],
    ],
  }),
  describe: example('ex-u2-describe', {
    skill: 'transformations.describe',
    tool: 'transformationsLab',
    problem: 'Describe how the graph of y = x² becomes g(x) = −3(x − 2)² + 1.',
    steps: [
      ['a = −3 is negative: reflect across the x-axis', 'A negative number in front flips the graph upside down.'],
      ['|a| = 3: vertical stretch by a factor of 3', 'Every y-value is multiplied by 3, so the graph is narrower.'],
      ['Nothing multiplies x inside: no horizontal stretch, no reflection across the y-axis', 'A number multiplying x inside would stretch or flip the graph sideways. Here that number is 1.'],
      ['x − 2 inside: 2 units right', 'The inside acts in the opposite direction: x − 2 moves right.'],
      ['+ 1 outside: 1 unit up', 'The number added at the end moves the graph up or down as it says.'],
    ],
  }),
  map: example('ex-u2-map', {
    skill: 'transformations.mapPoint',
    tool: 'transformationsLab',
    problem: 'The point (4, 2) is on y = √x. Where does it land on y = 3√(x + 1) − 5?',
    steps: [
      ['h = −1, so new x = 4 − 1 = 3', 'x + 1 inside moves every point 1 unit left.'],
      ['a = 3, so y becomes 3 · 2 = 6', 'The number in front multiplies the y-value first.'],
      ['k = −5, so new y = 6 − 5 = 1', 'Then the number at the end is added.'],
      ['(4, 2) → (3, 1)', 'Check: 3√(3 + 1) − 5 = 3 · 2 − 5 = 1.'],
    ],
  }),
  match: example('ex-u2-match', {
    skill: 'transformations.matchGraph',
    tool: 'transformationsLab',
    problem: 'A dashed graph is y = x³ moved and stretched. Its center point is (−2, 1), and one step right of the center it is 3 units higher. Find a, h and k.',
    steps: [
      ['h = −2 and k = 1', 'The center point (0, 0) of y = x³ moves to (h, k).'],
      ['One step right of the center, the graph is 3 higher', 'For y = x³, one step right of the center is 1 step up. Here it is a times that.'],
      ['a = 3', 'The graph rises to the right, so a is positive.'],
      ['y = 3(x + 2)³ + 1', 'Check the point one step right: 3(−1 + 2)³ + 1 = 4, which is 3 above the center.'],
    ],
  }),
};

const unit2 = unit(2, 'Parent functions and transformations', U2, [
  item('tgp-u2-1', {
    standards: ['A2.2A'], dok: 1, band: 1, actions: ['analyzeDomain', 'analyzeRange', 'findVertex'],
    prompt: 'Analyze the parent function $f(x) = x^2$. State its domain, its range and its vertex.',
    tool: {
      analysisRequests: [{ id: 'vertex', kind: 'point', feature: 'vertex', label: 'Vertex' }],
      function: { family: 'quadratic', a: 1, h: 0, k: 0 },
    },
    example: U2.parent,
    idea: 'A parent function is the simplest graph of its family. Know its shape, its turning point, and which x- and y-values it uses.',
    hints: [
      'The vertex is the point where the parabola turns around.',
      'Can you square any number? That tells you the domain.',
      'A square is never negative. What is the smallest value x² can be?',
    ],
    back: ['Can x² ever be a negative number?', ['No', 'Yes'], 'No'],
    solution: ['The parabola turns at the origin.', [
      'The vertex is (0, 0), where the graph turns around.',
      'Any number can be squared, so the domain is (−∞, ∞).',
      'x² is never negative and equals 0 at the vertex, so the range is [0, ∞).',
    ], 'Domain (−∞, ∞); range [0, ∞); vertex (0, 0)', 'Giving the range as (−∞, ∞): the parabola never goes below its vertex.'],
  }),
  item('tgp-u2-2', {
    standards: ['A2.2A'], dok: 2, band: 2, actions: ['analyzeDomain', 'analyzeRange', 'analyzeIncreasing'],
    prompt: 'Analyze the parent function $f(x) = \\sqrt{x}$. State its domain, its range and where it is increasing.',
    tool: { function: { family: 'squareRoot', a: 1, h: 0, k: 0 } },
    hints: [
      'Which numbers have a real square root? That is the domain.',
      'The graph starts at a point and goes one way only. Find the starting point.',
      'From its starting point, does the graph ever go down?',
    ],
    back: ['Is √(−4) a real number?', ['No', 'Yes'], 'No'],
    solution: ['The graph starts at the origin and only rises.', [
      'Only x ≥ 0 has a real square root, so the domain is [0, ∞).',
      'The outputs start at √0 = 0 and grow without end, so the range is [0, ∞).',
      'The graph rises all the way from its starting point, so f increases over its whole domain, from 0 on.',
    ], 'Domain [0, ∞); range [0, ∞); increasing from x = 0 on', 'Writing the domain as (−∞, ∞): negative numbers have no real square root.'],
  }),
  item('tgp-u2-3', {
    standards: ['A2.2A'], dok: 2, band: 2, actions: ['analyzeTransformations'],
    prompt: 'The graph shows $y = x^2$ after it was moved. Find $a$, $h$ and $k$ in $y = a(x - h)^2 + k$.',
    tool: { transformation: { mode: 'identify' }, function: { family: 'quadratic', a: 1, h: 3, k: -2 } },
    example: U2.identify,
    idea: 'In y = a·f(x − h) + k, the point (0, 0) of the parent moves to (h, k). a stretches or flips the graph.',
    hints: [
      'Find the vertex of the graph. Its coordinates are (h, k).',
      'Go one step right from the vertex. How far up or down does the graph go? That is a.',
      'A vertex to the right of the y-axis has a positive h, and the equation then shows x minus that number.',
    ],
    back: ['The vertex of y = a(x − h)² + k is the point…', ['(h, k)', '(k, h)'], '(h, k)'],
    solution: ['Read the vertex, then one step from it.', [
      'The vertex is (3, −2), so h = 3 and k = −2.',
      'One step right of the vertex the graph is 1 unit higher, the same as y = x², so a = 1.',
      'The equation is y = (x − 3)² − 2.',
    ], 'a = 1, h = 3, k = −2', 'Writing h = −3 because the equation shows x − 3: the form is x − h, so h is 3.'],
  }),
  item('tgp-u2-4', {
    standards: ['A2.2A'], dok: 2, band: 2, actions: ['analyzeTransformations'],
    prompt: 'Describe every transformation that takes $y = \\sqrt{x}$ to $g(x) = 2\\sqrt{x + 1} - 4$.',
    tool: { transformation: { mode: 'describe' }, function: { family: 'squareRoot', a: 2, h: -1, k: -4 } },
    example: U2.describe,
    idea: 'Read one number at a time. Outside numbers (a and k) act on y as they look. The inside number (h) acts on x in the opposite direction.',
    hints: [
      'The 2 in front multiplies every y-value. Is it negative? Is its size more than 1?',
      'x + 1 is inside the root. Inside changes move the graph the opposite way. Nothing multiplies x, so there is no horizontal stretch and no reflection across the y-axis.',
      'The −4 at the end is outside. It moves the graph down.',
    ],
    back: ['Which way does x + 1 inside the root move the graph?', ['Left 1', 'Right 1'], 'Left 1'],
    solution: ['a, then h, then k.', [
      'a = 2 is positive, so there is no reflection across the x-axis. It is a vertical stretch by a factor of 2.',
      'Nothing multiplies x inside the root: the horizontal scale is unchanged (factor 1) and there is no reflection across the y-axis.',
      'x + 1 means h = −1: the graph moves 1 unit left.',
      'k = −4: the graph moves 4 units down.',
    ], 'Vertical stretch by 2, left 1, down 4, no reflection', 'Moving the graph right 1 because of the plus sign: inside the function, + moves left.'],
  }),
  item('tgp-u2-5', {
    standards: ['A2.2A'], dok: 2, band: 3, actions: ['analyzeTransformations'],
    prompt: 'The point $(2, 4)$ is on $y = x^2$. Find where it lands on $y = -(x - 3)^2 + 2$.',
    tool: { transformation: { mode: 'pointMap' }, function: { family: 'quadratic', a: -1, h: 3, k: 2 }, parentPoint: [2, 4] },
    example: U2.map,
    idea: 'Every point (x, y) of the parent moves to (x + h, a·y + k): shift x by h, multiply y by a, then add k.',
    hints: [
      'Work on x and y separately. Only h changes x.',
      'x − 3 moves the point 3 to the right.',
      'For y: multiply the old y by a first, then add k.',
    ],
    back: ['In y = −(x − 3)² + 2, the value of a is…', ['−1', '3'], '−1'],
    solution: ['(x, y) → (x + h, a·y + k).', [
      'Here a = −1, h = 3 and k = 2.',
      'New x: 2 + 3 = 5.',
      'New y: −1 · 4 + 2 = −2.',
      'Check: −(5 − 3)² + 2 = −4 + 2 = −2.',
    ], '(5, −2)', 'Adding k before multiplying by a: multiply the y-value by a first, then add k.'],
  }),
  item('tgp-u2-6', {
    standards: ['A2.2A'], dok: 3, band: 3, actions: ['analyzeTransformations'],
    prompt: 'The dashed graph is $y = x^3$ after transformations. Change $a$, $h$ and $k$ until your graph matches it.',
    tool: { transformation: { mode: 'match' }, family: 'cubic', target: { a: -1, h: 2, k: 1 } },
    example: U2.match,
    idea: 'Find where the parent’s center point (0, 0) went: that is (h, k). Then use one more point to find a.',
    hints: [
      'Find the center of the dashed curve, the point where it bends from one direction to the other.',
      'Set h and k to that point first, so the two centers sit on top of each other.',
      'Does the dashed graph rise or fall to the right? A graph of x³ that falls to the right has a negative a.',
    ],
    back: ['The graph of y = −x³ goes which way as you move right?', ['Down', 'Up'], 'Down'],
    solution: ['Center first, then direction.', [
      'The center of the dashed graph is (2, 1), so h = 2 and k = 1.',
      'One step right of the center the dashed graph is 1 unit lower, so a = −1.',
      'The dashed graph is y = −(x − 2)³ + 1.',
    ], 'a = −1, h = 2, k = 1', 'Leaving a = 1: the dashed graph falls to the right, so it has been reflected and a is negative.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 3 */

const U3 = {
  undo: example('ex-u3-undo', {
    skill: 'inverses.undo',
    tool: 'inverseCompositionLab',
    problem: 'f(x) = x + 6. Send x = 2 through f, then through the inverse of f.',
    steps: [
      ['f(2) = 2 + 6 = 8', 'f adds 6.'],
      ['The inverse subtracts 6', 'An inverse undoes the function with the opposite operation.'],
      ['f⁻¹(8) = 8 − 6 = 2', 'The inverse takes the output 8 back to the input 2.'],
      ['f⁻¹(f(2)) = 2', 'A function followed by its inverse always gives back the number you started with.'],
    ],
  }),
  derive: example('ex-u3-derive', {
    skill: 'inverses.linearRule',
    tool: 'inverseCompositionLab',
    problem: 'Find the inverse of f(x) = 2x + 8.',
    steps: [
      ['y = 2x + 8', 'Write f(x) as y.'],
      ['x = 2y + 8', 'Swap x and y: the inverse trades inputs and outputs.'],
      ['x − 8 = 2y', 'Subtract 8 from both sides.'],
      ['(x − 8)/2 = y, so y = x/2 − 4', 'Divide both sides by 2.'],
      ['f⁻¹(x) = x/2 − 4', 'Check: f(1) = 10 and f⁻¹(10) = 5 − 4 = 1.'],
    ],
  }),
  add: example('ex-u3-add', {
    skill: 'functionOperations.sum',
    tool: 'polynomialWorkshop',
    problem: 'f(x) = x² + 4x and g(x) = 3x² − x + 2. Find (f + g)(x).',
    steps: [
      ['(x² + 4x) + (3x² − x + 2)', '(f + g)(x) means f(x) + g(x).'],
      ['x² + 3x² = 4x²', 'Add the x² terms.'],
      ['4x + (−x) = 3x', 'Add the x terms.'],
      ['(f + g)(x) = 4x² + 3x + 2', 'Only g has a constant, so the 2 comes down unchanged.'],
    ],
  }),
  multiply: example('ex-u3-multiply', {
    skill: 'functionOperations.product',
    tool: 'polynomialWorkshop',
    problem: 'f(x) = x − 2 and g(x) = 3x + 4. Find (f · g)(x).',
    steps: [
      ['(x − 2)(3x + 4)', '(f · g)(x) means f(x) times g(x).'],
      ['x · 3x = 3x² and x · 4 = 4x', 'Multiply x by each term of 3x + 4.'],
      ['−2 · 3x = −6x and −2 · 4 = −8', 'Multiply −2 by each term of 3x + 4.'],
      ['4x − 6x = −2x', 'Combine the like terms.'],
      ['(f · g)(x) = 3x² − 2x − 8', 'Write the terms from the highest power down.'],
    ],
  }),
  compose: example('ex-u3-compose', {
    skill: 'functionOperations.composeAtValue',
    tool: 'inverseCompositionLab',
    problem: 'f(x) = 2x + 1 and g(x) = x − 3. Find f(g(5)) and g(f(5)).',
    steps: [
      ['g(5) = 5 − 3 = 2', 'For f(g(5)), work from the inside out: g goes first.'],
      ['f(2) = 2 · 2 + 1 = 5, so f(g(5)) = 5', 'The output of g becomes the input of f.'],
      ['f(5) = 2 · 5 + 1 = 11', 'For g(f(5)), f goes first.'],
      ['g(11) = 11 − 3 = 8, so g(f(5)) = 8', 'The two orders give different answers: the order matters.'],
    ],
  }),
  composeRule: example('ex-u3-compose-rule', {
    skill: 'functionOperations.composeRule',
    problem: 'f(x) = 3x + 1 and g(x) = x² − 2. Find f(g(x)).',
    steps: [
      ['f(g(x)) = f(x² − 2)', 'Replace g(x) with its rule.'],
      ['3(x² − 2) + 1', 'In f, put the whole expression x² − 2 wherever x was.'],
      ['3x² − 6 + 1', 'Distribute the 3.'],
      ['f(g(x)) = 3x² − 5', 'Combine −6 and 1.'],
    ],
  }),
};

const unit3 = unit(3, 'Inverses, operations on functions and composition', U3, [
  item('tgp-u3-1', {
    standards: ['A2.2B'], dok: 1, band: 1, actions: ['findInverse'],
    prompt: 'Send $x = 3$ through $f(x) = 2x + 1$. Then undo it with the inverse to find $f^{-1}(f(3))$.',
    tool: { inverse: { mode: 'inverse' }, function: { family: 'linear', m: 2, b: 1 }, x: 3 },
    example: U3.undo,
    idea: 'An inverse function undoes the function: it takes each output back to the input it came from.',
    hints: [
      'First find the output of f: double the input, then add 1.',
      'The inverse undoes those two steps in reverse order: subtract 1, then divide by 2.',
      'A function followed by its inverse returns the number you started with.',
    ],
    back: ['What undoes “multiply by 2”?', ['Divide by 2', 'Subtract 2'], 'Divide by 2'],
    solution: ['Out with f, back with the inverse.', [
      'f(3) = 2 · 3 + 1 = 7.',
      'The inverse undoes f: subtract 1, then divide by 2. (7 − 1) ÷ 2 = 3.',
      'So the inverse brings 7 back to 3, the starting number.',
    ], 'f⁻¹(f(3)) = 3', 'Stopping at f(3) = 7: the question asks for the value after the inverse has undone f.'],
  }),
  item('tgp-u3-2', {
    standards: ['A2.2B'], dok: 2, band: 2, actions: ['findInverse'],
    prompt: 'Find the inverse of $f(x) = 3x - 6$. Swap $x$ and $y$, then solve for $y$.',
    tool: { mode: 'deriveInverse', function: { family: 'linear', m: 3, b: -6 } },
    example: U3.derive,
    idea: 'To find an inverse rule: write y for f(x), swap x and y, then solve for y.',
    hints: [
      'Start from y = 3x − 6 and swap the letters: x = 3y − 6.',
      'To get y alone, undo the −6 first.',
      'Then undo the multiplication by 3. Divide every term on the other side.',
    ],
    back: ['After swapping x and y in y = 3x − 6, the equation is…', ['x = 3y − 6', 'y = 6x − 3'], 'x = 3y − 6'],
    solution: ['Swap, then solve for y.', [
      'Write y = 3x − 6 and swap: x = 3y − 6.',
      'Add 6 to both sides: x + 6 = 3y.',
      'Divide both sides by 3: y = (x + 6)/3 = x/3 + 2.',
      'Check with a number: f(4) = 6, and 6/3 + 2 = 4.',
    ], 'f⁻¹(x) = x/3 + 2', 'Dividing only x by 3 and leaving the 6: every term on that side is divided by 3.'],
  }),
  item('tgp-u3-3', {
    standards: ['A2.2B'], dok: 2, band: 3, actions: ['findInverse'],
    prompt: 'Find the inverse of $f(x) = -5x + 15$. Swap $x$ and $y$, then solve for $y$.',
    tool: { mode: 'deriveInverse', function: { family: 'linear', m: -5, b: 15 } },
    hints: [
      'Swap first: x = −5y + 15.',
      'Subtract 15 from both sides, so the y-term is alone.',
      'Divide both sides by −5. Dividing by a negative changes the sign of every term.',
    ],
    back: ['What is 15 ÷ (−5)?', ['−3', '3'], '−3'],
    solution: ['Swap, subtract 15, divide by −5.', [
      'Swap x and y: x = −5y + 15.',
      'Subtract 15: x − 15 = −5y.',
      'Divide by −5: y = (x − 15)/(−5) = −x/5 + 3.',
      'Check with a number: f(2) = 5, and −5/5 + 3 = 2.',
    ], 'f⁻¹(x) = −x/5 + 3', 'Losing a sign when dividing by −5: both x and −15 change sign.'],
  }),
  item('tgp-u3-4', {
    standards: ['A2.2D'], dok: 1, band: 1, actions: ['addPolynomials'],
    prompt: 'Let $f(x) = 2x^2 + 3x - 1$ and $g(x) = x^2 - 5x + 4$. Find $(f + g)(x)$ by adding like terms.',
    tool: { polynomial: { operation: 'add', firstPolynomial: '2x^2+3x-1', secondPolynomial: 'x^2-5x+4' } },
    example: U3.add,
    idea: '(f + g)(x) means f(x) + g(x). Add the two rules by combining like terms.',
    hints: [
      'Line up the like terms: x² with x², x with x, number with number.',
      'Add the coefficients in each column. The exponents do not change.',
      'Watch the signs: 3x + (−5x) is negative.',
    ],
    back: ['Which pair are like terms?', ['3x and −5x', '3x and x²'], '3x and −5x'],
    solution: ['Add column by column.', [
      'x² terms: 2x² + x² = 3x².',
      'x terms: 3x + (−5x) = −2x.',
      'Constants: −1 + 4 = 3.',
      'So (f + g)(x) = 3x² − 2x + 3.',
    ], '3x² − 2x + 3', 'Adding the exponents: 2x² + x² is 3x², not 3x⁴.'],
  }),
  item('tgp-u3-5', {
    standards: ['A2.2D'], dok: 2, band: 2, actions: ['multiplyPolynomials'],
    prompt: 'Let $f(x) = x + 3$ and $g(x) = 2x - 5$. Find $(f \\cdot g)(x)$ with the area model.',
    tool: { polynomial: { leftFactor: 'x+3', rightFactor: '2x-5' } },
    example: U3.multiply,
    idea: '(f · g)(x) means f(x) times g(x). Multiply every term of one rule by every term of the other, then combine like terms.',
    hints: [
      'The model has four cells. Each cell is one term of x + 3 times one term of 2x − 5.',
      'x · 2x = 2x². Keep the minus sign with the 5.',
      'Two of the cells are x terms. Combine them for the middle term.',
    ],
    back: ['What is x · 2x?', ['2x²', '3x'], '2x²'],
    solution: ['Four cells, then combine.', [
      'x · 2x = 2x² and x · (−5) = −5x.',
      '3 · 2x = 6x and 3 · (−5) = −15.',
      'Combine the x terms: −5x + 6x = x.',
      'So (f · g)(x) = 2x² + x − 15.',
    ], '2x² + x − 15', 'Multiplying only the first terms and the last terms: the two middle cells make the x term.'],
  }),
  item('tgp-u3-6', {
    standards: ['A2.2D'], dok: 2, band: 2, actions: ['composeFunctions'],
    prompt: 'Let $f(x) = 3x - 1$ and $g(x) = x + 4$. Find $(f \\circ g)(2)$ and $(g \\circ f)(2)$.',
    tool: { composition: { mode: 'composition' }, f: { family: 'linear', m: 3, b: -1 }, g: { family: 'linear', m: 1, b: 4 }, x: 2 },
    example: U3.compose,
    idea: '(f ∘ g)(x) means f(g(x)): work from the inside out. The output of the inside function is the input of the outside one.',
    hints: [
      '(f ∘ g)(2) is f(g(2)). Find g(2) first.',
      'Put that answer into f.',
      'For (g ∘ f)(2), switch the order: find f(2) first, then put it into g.',
    ],
    back: ['In f(g(2)), which function is used first?', ['g', 'f'], 'g'],
    solution: ['Inside first, both ways.', [
      'g(2) = 2 + 4 = 6, then f(6) = 3 · 6 − 1 = 17.',
      'f(2) = 3 · 2 − 1 = 5, then g(5) = 5 + 4 = 9.',
      'The two orders give different answers.',
    ], '(f ∘ g)(2) = 17 and (g ∘ f)(2) = 9', 'Multiplying f(2) by g(2): composition puts one function inside the other, it does not multiply them.'],
  }),
  item('tgp-u3-7', {
    standards: ['A2.2D'], dok: 3, band: 3, actions: ['multipleResponses'],
    prompt: 'Let $f(x) = 2x - 3$ and $g(x) = x^2 + 1$. Find the rules for $f(g(x))$ and $g(f(x))$, one step at a time.',
    tool: {
      responses: [
        expression('inside', 'f(g(x)): put x² + 1 in place of x in 2x − 3. Before simplifying, 2(x² + 1) − 3 = 2x² + 2 − 3. Simplified, f(g(x)) =', '2x^2-1'),
        expression('square', 'g(f(x)) = (2x − 3)² + 1. First expand (2x − 3)² =', '4x^2-12x+9'),
        expression('outside', 'Then add 1. g(f(x)) =', '4x^2-12x+10', builtOn(['square'], '{square}+1')),
      ],
    },
    example: U3.composeRule,
    idea: 'To compose two rules, replace every x in the outside function with the whole inside rule, in parentheses. Then simplify.',
    hints: [
      'For f(g(x)), the inside rule x² + 1 takes the place of x in 2x − 3.',
      '(2x − 3)² means (2x − 3)(2x − 3). It has a middle term.',
      'For g(f(x)), square 2x − 3 first, then add the 1 from g.',
    ],
    back: ['f(g(x)) means…', ['put g(x) into f', 'multiply f(x) by g(x)'], 'put g(x) into f'],
    solution: ['Substitute the whole rule, then simplify.', [
      'f(g(x)) = 2(x² + 1) − 3 = 2x² + 2 − 3 = 2x² − 1.',
      'g(f(x)) = (2x − 3)² + 1.',
      '(2x − 3)² = (2x − 3)(2x − 3) = 4x² − 12x + 9.',
      'Add 1: g(f(x)) = 4x² − 12x + 10.',
    ], 'f(g(x)) = 2x² − 1 and g(f(x)) = 4x² − 12x + 10', 'Squaring 2x − 3 as 4x² + 9: (2x − 3)² also has the middle term −12x.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 4 */

const V_POINTS = [{ x: -2, y: 2 }, { x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];

const U4 = {
  vertex: example('ex-u4-vertex', {
    skill: 'absoluteValue.readAHK',
    tool: 'transformationsLab',
    problem: 'A V-shaped graph of y = a|x − h| + k has its vertex at (4, −1) and opens up with slopes 1 and −1. Find a, h and k.',
    steps: [
      ['h = 4 and k = −1', 'The vertex of y = a|x − h| + k is (h, k).'],
      ['One step right of the vertex, the graph is 1 unit higher', 'The rise after one step right of the vertex is a.'],
      ['a = 1', 'The V opens up and is as steep as y = |x|.'],
      ['y = |x − 4| − 1', 'h = 4 is written x − 4.'],
    ],
  }),
  plot: example('ex-u4-plot', {
    skill: 'absoluteValue.graphByMapping',
    tool: 'transformationsLab',
    problem: 'Graph g(x) = −|x + 2| + 4 by moving the points (−1, 1), (0, 0) and (1, 1) of f(x) = |x|.',
    steps: [
      ['Rule: (x, y) → (x − 2, −y + 4)', 'h = −2 shifts x left 2. a = −1 flips y, and k = 4 adds 4.'],
      ['(0, 0) → (−2, 4)', 'The vertex moves to (h, k).'],
      ['(−1, 1) → (−3, 3)', 'x: −1 − 2 = −3. y: −1 + 4 = 3.'],
      ['(1, 1) → (−1, 3)', 'x: 1 − 2 = −1. y: −1 + 4 = 3.'],
      ['The new V has its vertex at (−2, 4) and opens down', 'a is negative, so the graph is reflected across the x-axis.'],
    ],
  }),
  equation: example('ex-u4-equation', {
    skill: 'absoluteValue.solveEquation',
    tool: 'stepAlgebra',
    problem: 'Solve |x + 2| = 7.',
    steps: [
      ['|x + 2| = 7', 'The bars are already alone on one side.'],
      ['x + 2 = 7 or x + 2 = −7', 'Two numbers are 7 units from zero: 7 and −7. So the inside can be either one.'],
      ['x = 5 or x = −9', 'Subtract 2 in each equation.'],
      ['|5 + 2| = 7 and |−9 + 2| = 7', 'Check both answers in the original equation.'],
    ],
  }),
  isolate: example('ex-u4-isolate', {
    skill: 'absoluteValue.isolateThenSolve',
    tool: 'stepAlgebra',
    problem: 'Solve 3|x − 2| + 1 = 13.',
    steps: [
      ['3|x − 2| = 12', 'Subtract 1 from both sides. Get the bars alone before you split.'],
      ['|x − 2| = 4', 'Divide both sides by 3.'],
      ['x − 2 = 4 or x − 2 = −4', 'Now split into two equations.'],
      ['x = 6 or x = −2', 'Add 2 in each equation.'],
      ['3|6 − 2| + 1 = 13 and 3|−2 − 2| + 1 = 13', 'Check both answers in the original equation.'],
    ],
  }),
  formulate: example('ex-u4-formulate', {
    skill: 'absoluteValue.writeEquation',
    problem: 'A bolt should be 60 mm long. The longest and shortest bolts allowed are 2 mm away from that. Write an absolute value equation for those two lengths L.',
    steps: [
      ['Center: 60', 'The target value goes inside the bars, subtracted from the variable.'],
      ['Distance: 2', 'The allowed distance from the target goes on the other side.'],
      ['|L − 60| = 2', '|L − 60| is the distance between L and 60.'],
      ['L = 62 or L = 58', 'Solve: L − 60 = 2 or L − 60 = −2.'],
    ],
  }),
  less: example('ex-u4-less', {
    skill: 'absoluteValue.lessThan',
    tool: 'stepAlgebra',
    problem: 'Solve |x − 2| ≤ 3. Graph the solution and write it in interval notation.',
    steps: [
      ['−3 ≤ x − 2 ≤ 3', '“Less than” means the inside is within 3 of zero: between −3 and 3.'],
      ['−1 ≤ x ≤ 5', 'Add 2 to all three parts.'],
      ['Closed circles at −1 and 5, shaded between', '≤ includes both ends.'],
      ['[−1, 5]', 'One interval, with brackets for the included ends.'],
    ],
  }),
  greater: example('ex-u4-greater', {
    skill: 'absoluteValue.greaterThan',
    tool: 'stepAlgebra',
    problem: 'Solve |x + 3| ≥ 1. Graph the solution and write it in interval notation.',
    steps: [
      ['x + 3 ≤ −1 or x + 3 ≥ 1', '“Greater than” means the inside is far from zero: at or below −1, or at or above 1.'],
      ['x ≤ −4 or x ≥ −2', 'Subtract 3 in each inequality.'],
      ['Closed circles at −4 and −2, shaded outward', 'The solutions are the two outside pieces.'],
      ['(−∞, −4] ∪ [−2, ∞)', 'Two intervals joined by ∪.'],
    ],
  }),
  flip: example('ex-u4-flip', {
    skill: 'absoluteValue.inequalityWithNegative',
    tool: 'stepAlgebra',
    problem: 'Solve −2|x − 1| + 6 > 2.',
    steps: [
      ['−2|x − 1| > −4', 'Subtract 6 from both sides.'],
      ['|x − 1| < 2', 'Divide both sides by −2. Dividing an inequality by a negative number reverses the symbol.'],
      ['−2 < x − 1 < 2', 'Now it is a “less than”: the inside is between −2 and 2.'],
      ['−1 < x < 3', 'Add 1 to all three parts.'],
      ['(−1, 3)', 'Open circles and parentheses, because < does not include the ends.'],
    ],
  }),
};

const unit4 = unit(4, 'Absolute value: graphs, equations and inequalities', U4, [
  item('tgp-u4-1', {
    standards: ['A2.6C'], dok: 1, band: 1, actions: ['analyzeTransformations'],
    prompt: 'The graph shows $y = |x|$ after it was moved. Find $a$, $h$ and $k$ in $y = a|x - h| + k$.',
    tool: { transformation: { mode: 'identify' }, function: { family: 'absolute', a: 1, h: -3, k: 2 } },
    example: U4.vertex,
    idea: 'The vertex of y = a|x − h| + k is the point (h, k). a tells how steep the V is and whether it opens up or down.',
    hints: [
      'Find the point of the V. Its coordinates are (h, k).',
      'A vertex to the left of the y-axis has a negative h.',
      'Go one step right from the vertex. The change in height is a.',
    ],
    back: ['The vertex of y = |x| is at…', ['(0, 0)', '(1, 1)'], '(0, 0)'],
    solution: ['Read the vertex, then the steepness.', [
      'The vertex is (−3, 2), so h = −3 and k = 2.',
      'One step right of the vertex the graph is 1 unit higher, so a = 1.',
      'The equation is y = |x + 3| + 2.',
    ], 'a = 1, h = −3, k = 2', 'Writing h = 3 because the equation shows x + 3: x + 3 is x − (−3), so h is −3.'],
  }),
  item('tgp-u4-2', {
    standards: ['A2.6C'], dok: 2, band: 2, actions: ['analyzeTransformations'],
    prompt: 'The graph of $f(x) = |x|$ is shown with five points. Graph $g(x) = 2|x - 1| - 3$ by moving each point to its new place.',
    tool: {
      transformation: { mode: 'plotTransform' },
      function: { family: 'absolute', a: 2, b: 1, h: 1, k: -3 },
      sourceLabel: 'f(x) = |x|',
      sourcePoints: V_POINTS,
      graphBounds: { xMin: -8, xMax: 8, yMin: -6, yMax: 8 },
      snapStep: 1,
    },
    example: U4.plot,
    idea: 'For g(x) = a|x − h| + k, each point (x, y) of |x| moves to (x + h, a·y + k).',
    hints: [
      'Start with the vertex of f. It moves to the vertex of g, the point (h, k).',
      'For every point, x shifts the way the number inside the bars says: the opposite of its sign.',
      'For every point, multiply the old y by the number in front of the bars, then add the number at the end.',
    ],
    back: ['Which way does x − 1 inside the bars move the graph?', ['Right 1', 'Left 1'], 'Right 1'],
    solution: ['Move each point with (x, y) → (x + 1, 2y − 3).', [
      'The vertex (0, 0) moves to (1, −3).',
      '(−1, 1) → (0, −1) and (1, 1) → (2, −1).',
      '(−2, 2) → (−1, 1) and (2, 2) → (3, 1).',
      'g is twice as steep as f, shifted right 1 and down 3.',
    ], 'Vertex (1, −3); the other points are (0, −1), (2, −1), (−1, 1) and (3, 1)', 'Subtracting 3 before multiplying by 2: multiply the y-value by 2 first.'],
  }),
  item('tgp-u4-3', {
    standards: ['A2.6E'], dok: 1, band: 1, actions: ['solveStepByStep'],
    prompt: 'Solve $|x - 3| = 5$. Split it into two equations and check both answers.',
    tool: { equation: '|x - 3| = 5', solveFor: 'x' },
    example: U4.equation,
    idea: '|A| = d means A is d units from zero, so A = d or A = −d. Most absolute value equations have two answers.',
    hints: [
      'What two numbers have an absolute value of 5?',
      'Write two equations: the inside equals the positive number, or the inside equals the negative number.',
      'Solve each equation by adding 3 to both sides.',
    ],
    back: ['Which numbers are 5 units from zero?', ['5 and −5', 'Only 5'], '5 and −5'],
    solution: ['Split, solve, check.', [
      'The bars are alone, so split: x − 3 = 5 or x − 3 = −5.',
      'Add 3 in each: x = 8 or x = −2.',
      'Check: |8 − 3| = 5 and |−2 − 3| = 5.',
    ], 'x = 8 or x = −2', 'Solving only x − 3 = 5: the inside can also equal −5.'],
  }),
  item('tgp-u4-4', {
    standards: ['A2.6E'], dok: 2, band: 2, actions: ['solveStepByStep'],
    prompt: 'Solve $2|x + 1| - 3 = 7$. Get the absolute value alone first, then split.',
    tool: { equation: '2|x + 1| - 3 = 7', solveFor: 'x' },
    example: U4.isolate,
    idea: 'Get the bars alone before you split: undo what is added or subtracted, then what is multiplied.',
    hints: [
      'Undo the −3 first: add 3 to both sides.',
      'Then divide both sides by 2, so the bars are alone.',
      'Now split into two equations and solve each one.',
    ],
    back: ['What is the first move in 2|x + 1| − 3 = 7?', ['Add 3 to both sides', 'Split it into two equations'], 'Add 3 to both sides'],
    solution: ['Isolate, split, solve, check.', [
      'Add 3: 2|x + 1| = 10.',
      'Divide by 2: |x + 1| = 5.',
      'Split: x + 1 = 5 or x + 1 = −5, so x = 4 or x = −6.',
      'Check: 2|4 + 1| − 3 = 7 and 2|−6 + 1| − 3 = 7.',
    ], 'x = 4 or x = −6', 'Splitting before the bars are alone, as 2(x + 1) − 3 = −7: isolate the absolute value first.'],
  }),
  item('tgp-u4-5', {
    standards: ['A2.6D', 'A2.6E'], dok: 2, band: 3, actions: ['multipleResponses'],
    prompt: 'A refrigerator is set to 37°F. Its warmest and coldest temperatures are 3 degrees away from that setting. Write and solve an absolute value equation for those two temperatures $T$.',
    tool: {
      responses: [
        number('center', 'The setting (the center)', 37),
        number('distance', 'How far from the setting, in degrees', 3),
        { id: 'equation', label: 'An absolute value equation for the two temperatures T', answer: '|T-37|=3', acceptedAnswers: ['|37-T|=3', '|-T+37|=3'], inputProfile: 'equation', ...builtOn(['center', 'distance'], '|T-{center}|={distance}') },
        number('coldest', 'Coldest temperature (°F)', 34),
        number('warmest', 'Warmest temperature (°F)', 40),
      ],
    },
    example: U4.formulate,
    idea: '|x − center| = distance says “x is exactly that distance from the center.”',
    hints: [
      'The setting is the center. The number of degrees it can be off by is the distance.',
      'The distance between T and the setting is written |T − setting|.',
      'To find the two temperatures, go that distance below the setting and the same distance above it.',
    ],
    back: ['|T − 37| stands for…', ['the distance between T and 37', 'the sum of T and 37'], 'the distance between T and 37'],
    solution: ['Center inside the bars, distance on the other side.', [
      'The center is 37 and the distance is 3.',
      'The equation is |T − 37| = 3.',
      'Split: T − 37 = 3 or T − 37 = −3.',
      'So T = 40 or T = 34.',
    ], '|T − 37| = 3; the temperatures are 34°F and 40°F', 'Writing |T − 3| = 37: the center goes inside the bars and the distance goes on the other side.'],
  }),
  item('tgp-u4-6', {
    standards: ['A2.6F'], dok: 2, band: 2, actions: ['solveInequality'],
    prompt: 'Solve $|x + 1| < 4$. Then graph the solution and write it in interval notation.',
    tool: { inequality: '|x + 1| < 4' },
    example: U4.less,
    idea: '|A| < d means A is close to zero: −d < A < d. The answer is one piece, between two numbers.',
    hints: [
      '“Less than” means the inside is between −4 and 4.',
      'Write −4 < x + 1 < 4, then subtract 1 from all three parts.',
      'The symbol is <, so the circles are open and the interval uses parentheses.',
    ],
    back: ['|A| < 4 means A is…', ['between −4 and 4', 'less than −4 or greater than 4'], 'between −4 and 4'],
    solution: ['Less than means between.', [
      'Write it as a between statement: −4 < x + 1 < 4.',
      'Subtract 1 from all three parts: −5 < x < 3.',
      'Open circles at −5 and 3, shaded between: (−5, 3).',
    ], '−5 < x < 3, written (−5, 3)', 'Solving only x + 1 < 4: the inside must also be greater than −4.'],
  }),
  item('tgp-u4-7', {
    standards: ['A2.6F'], dok: 2, band: 2, actions: ['solveInequality'],
    prompt: 'Solve $|x - 4| > 2$. Then graph the solution and write it in interval notation.',
    tool: { inequality: '|x - 4| > 2' },
    example: U4.greater,
    idea: '|A| > d means A is far from zero: A < −d or A > d. The answer is two outside pieces.',
    hints: [
      '“Greater than” means the inside is below −2 or above 2.',
      'Write two inequalities: x − 4 < −2 or x − 4 > 2. Add 4 in each.',
      'The graph has two pieces that point away from each other. Join the intervals with ∪.',
    ],
    back: ['|A| > 2 means A is…', ['less than −2 or greater than 2', 'between −2 and 2'], 'less than −2 or greater than 2'],
    solution: ['Greater than means outside.', [
      'Write two inequalities: x − 4 < −2 or x − 4 > 2.',
      'Add 4 in each: x < 2 or x > 6.',
      'Open circles at 2 and 6, shaded outward: (−∞, 2) ∪ (6, ∞).',
    ], 'x < 2 or x > 6, written (−∞, 2) ∪ (6, ∞)', 'Writing 2 < x < 6: that is the “less than” answer. Greater than gives the two outside pieces.'],
  }),
  item('tgp-u4-8', {
    standards: ['A2.6F'], dok: 3, band: 3, actions: ['solveInequality'],
    prompt: 'Solve $-3|x + 2| + 5 \\ge -4$. Then graph the solution and write it in interval notation.',
    tool: { inequality: '-3|x + 2| + 5 >= -4' },
    example: U4.flip,
    idea: 'Isolate the bars first. When you multiply or divide an inequality by a negative number, reverse the symbol.',
    hints: [
      'Subtract 5 from both sides first.',
      'Divide both sides by −3. What happens to ≥ when you divide by a negative number?',
      'After the symbol reverses you have a “less than or equal to”: the inside is between two numbers.',
    ],
    back: ['What happens to ≥ when you divide both sides by −3?', ['It reverses to ≤', 'It stays ≥'], 'It reverses to ≤'],
    solution: ['Isolate, reverse the symbol, then “between”.', [
      'Subtract 5: −3|x + 2| ≥ −9.',
      'Divide by −3 and reverse the symbol: |x + 2| ≤ 3.',
      'Between: −3 ≤ x + 2 ≤ 3, so −5 ≤ x ≤ 1.',
      'Closed circles at −5 and 1, shaded between: [−5, 1].',
    ], '−5 ≤ x ≤ 1, written [−5, 1]', 'Not reversing the symbol when dividing by −3, which gives the two outside pieces instead.'],
  }),
]);

export const UNITS_1_TO_4 = [unit1, unit2, unit3, unit4];
