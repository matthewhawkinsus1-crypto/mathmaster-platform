/*
 * UNITS 4–7: transformations of linear functions; parallel, perpendicular,
 * horizontal and vertical lines; solving linear equations; linear
 * inequalities in one variable.
 */
import { WINDOW, item, teks, unit } from './shared.mjs';

/* ------------------------------------------------------------------ Unit 4 */

const PARENT = Object.freeze({ sourceLabel: 'f(x) = x', graphBounds: { ...WINDOW } });
const A3E = teks('A.3E', 'A.3C');

const UNIT_4 = unit({
  number: 4,
  title: 'Unit 4 — Transformations of linear functions',
  minutes: 28,
  honorsMinutes: 35,
  questions: [
    item({
      id: 'tg-u4-q1',
      alignment: A3E,
      actions: ['analyzeTransformations'],
      dok: 1,
      band: 1,
      prompt: 'The parent function is f(x) = x. Graph g(x) = f(x) + 4 by plotting the image of each labeled point S1–S3, in order.',
      transformation: { mode: 'plotTransform' },
      function: { family: 'linear', a: 1, h: 0, k: 4 },
      sourcePoints: [[-2, -2], [0, 0], [2, 2]],
      ...PARENT,
      hints: [
        'The number added is outside f(x), so it changes the outputs, the y-values.',
        'Keep each x-coordinate the same. What happens to each y-coordinate?',
        'Do the same thing to all three points. The new line is parallel to the old one.',
      ],
      backUp: ['In g(x) = f(x) + 4, the 4 is added to…', ['the output, y', 'the input, x'], 'the output, y'],
      notes: [
        ['Outside changes move the graph up or down', 'g(x) = f(x) + d adds d to every output: the graph moves up d units (down when d is negative). The x-coordinates stay the same.'],
        ['Worked example', 'g(x) = f(x) − 8 sends (1, 1) to (1, −7): keep x, subtract 8 from y.'],
      ],
      solution: {
        reasoning: [
          'Adding 4 outside the function adds 4 to every output, so each point moves up 4.',
          'S1 (−2, −2) → (−2, 2). S2 (0, 0) → (0, 4). S3 (2, 2) → (2, 6).',
          'The graph of g is the graph of f translated up 4 units.',
        ],
        commonError: 'Moving the points right 4 instead of up 4; a number added outside f(x) changes the y-coordinates, not the x-coordinates.',
      },
      example: 'ex-translate-vertical',
    }),
    item({
      id: 'tg-u4-q2',
      alignment: A3E,
      actions: ['analyzeTransformations'],
      dok: 2,
      band: 2,
      prompt: 'The parent function is f(x) = x. Graph g(x) = f(x − 4) by plotting the image of each labeled point S1–S3, in order.',
      transformation: { mode: 'plotTransform' },
      function: { family: 'linear', a: 1, h: 4, k: 0 },
      sourcePoints: [[-2, -2], [0, 0], [2, 2]],
      ...PARENT,
      hints: [
        'The − 4 is inside the parentheses, so it changes the inputs, the x-values.',
        'An inside change works the opposite way from how it looks. Which way does x − 4 move the graph?',
        'Keep each y-coordinate the same. Change only the x-coordinates.',
      ],
      backUp: ['A change inside the parentheses, as in f(x − 4), moves the graph…', ['left or right', 'up or down'], 'left or right'],
      notes: [
        ['Inside changes move the graph left or right', 'g(x) = f(x − c) moves the graph RIGHT c units. g(x) = f(x + c) moves it LEFT c units. The y-coordinates stay the same.'],
        ['Worked example', 'g(x) = f(x + 10) sends (1, 1) to (−9, 1): subtract 10 from x, keep y.'],
      ],
      solution: {
        reasoning: [
          'Subtracting 4 inside the parentheses moves the graph right 4, so add 4 to each x-coordinate.',
          'S1 (−2, −2) → (2, −2). S2 (0, 0) → (4, 0). S3 (2, 2) → (6, 2).',
          'The graph of g is the graph of f translated right 4 units.',
        ],
        commonError: 'Moving the points left 4 because of the minus sign; f(x − 4) moves the graph to the right.',
      },
      example: 'ex-translate-horizontal',
    }),
    item({
      id: 'tg-u4-q3',
      alignment: A3E,
      actions: ['analyzeTransformations'],
      dok: 2,
      band: 3,
      prompt: 'The parent function is f(x) = x. Graph g(x) = (1/2)f(x) by plotting the image of each labeled point S1–S3, in order.',
      transformation: { mode: 'plotTransform' },
      function: { family: 'linear', a: 0.5, h: 0, k: 0 },
      sourcePoints: [[-4, -4], [0, 0], [4, 4]],
      ...PARENT,
      hints: [
        'The 1/2 multiplies f(x), so it changes the outputs, the y-values.',
        'Keep each x-coordinate. Multiply each y-coordinate by the number in front of f(x).',
        'A factor smaller than one makes the line less steep. Does your new line look less steep?',
      ],
      backUp: ['In g(x) = (1/2)f(x), the 1/2 multiplies…', ['each output, y', 'each input, x'], 'each output, y'],
      notes: [
        ['A number in front stretches or compresses', 'g(x) = a·f(x) multiplies every output by a. If a is greater than 1 the line gets steeper; if a is between 0 and 1 it gets less steep; if a is negative it also flips over the x-axis.'],
        ['Worked example', 'g(x) = 3f(x) sends (3, 3) to (3, 9): keep x, multiply y by 3.'],
      ],
      solution: {
        reasoning: [
          'Multiplying f(x) by 1/2 multiplies every output by 1/2: keep x and take half of y.',
          'S1 (−4, −4) → (−4, −2). S2 (0, 0) → (0, 0). S3 (4, 4) → (4, 2).',
          'The graph of g is less steep than the graph of f: it is compressed vertically by a factor of 1/2.',
        ],
        commonError: 'Halving the x-coordinates instead of the y-coordinates; a number in front of f(x) changes the outputs.',
      },
      example: 'ex-dilate',
    }),
    item({
      id: 'tg-u4-q4',
      alignment: A3E,
      actions: ['analyzeTransformations'],
      dok: 3,
      band: 3,
      prompt: 'Combine transformations. g(x) = 3f(x + 2) − 1, where f(x) = x. Where does the point (1, 1) on f(x) land on g(x)?',
      transformation: { mode: 'pointMap', showTransformedGraph: false },
      function: { family: 'linear', a: 3, h: -2, k: -1 },
      parentPoint: [1, 1],
      graphBounds: { ...WINDOW },
      hints: [
        'Handle x and y one at a time.',
        'Only the + 2 inside the parentheses changes x. Which way does it move the point?',
        'The numbers outside change y: multiply first, then add or subtract.',
      ],
      backUp: ['In g(x) = 3f(x + 2) − 1, which number changes the x-coordinate?', ['the 2', 'the 3'], 'the 2'],
      notes: [
        ['One coordinate at a time', 'Inside the parentheses changes x (the opposite way). Outside changes y: multiply by the number in front, then add or subtract the number at the end.'],
        ['Worked example', 'g(x) = 2f(x − 3) + 5 sends (1, 1) to (4, 7): x is 1 + 3 = 4, and y is 2(1) + 5 = 7.'],
      ],
      solution: {
        reasoning: [
          'x: the + 2 inside moves the point left 2, so x = 1 − 2 = −1.',
          'y: multiply the output by 3 and then subtract 1, so y = 3(1) − 1 = 2.',
          'The point (1, 1) lands at (−1, 2).',
        ],
        commonError: 'Adding 2 to x and getting (3, 2); f(x + 2) moves the graph to the left, so 2 is subtracted from the x-coordinate.',
      },
      example: 'ex-combine-transformations',
    }),
  ],
  honors: [
    item({
      id: 'tg-u4-h1',
      alignment: A3E,
      actions: ['analyzeTransformations'],
      dok: 3,
      band: 4,
      prompt: 'Honors. The parent function is f(x) = x. Graph g(x) = −2f(x) + 3 by plotting the image of each labeled point S1–S3, in order.',
      transformation: { mode: 'plotTransform' },
      function: { family: 'linear', a: -2, h: 0, k: 3 },
      sourcePoints: [[-2, -2], [0, 0], [2, 2]],
      ...PARENT,
      hints: [
        'Both changes are outside f(x), so only the y-coordinates change.',
        'Do them in order: multiply each y-coordinate first, then add.',
        'A negative factor flips the graph over the x-axis. Does your new line fall from left to right?',
      ],
      backUp: ['To find the new y-coordinate for g(x) = −2f(x) + 3, you first…', ['multiply y by −2', 'add 3 to y'], 'multiply y by −2'],
      solution: {
        reasoning: [
          'Keep each x-coordinate. For each y-coordinate, multiply by −2 and then add 3.',
          'S1 (−2, −2): −2(−2) + 3 = 7, so (−2, 7). S2 (0, 0): −2(0) + 3 = 3, so (0, 3). S3 (2, 2): −2(2) + 3 = −1, so (2, −1).',
          'The graph of g is f reflected over the x-axis, stretched by a factor of 2 and moved up 3: the line y = −2x + 3.',
        ],
        commonError: 'Adding 3 before multiplying by −2; the multiplication comes first, then the 3 is added.',
      },
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 5 */

const UNIT_5 = unit({
  number: 5,
  title: 'Unit 5 — Parallel, perpendicular, horizontal and vertical lines',
  minutes: 26,
  honorsMinutes: 34,
  questions: [
    item({
      id: 'tg-u5-q1',
      alignment: teks('A.2G'),
      actions: ['constructLine'],
      dok: 1,
      band: 1,
      prompt: 'Graph the horizontal line y = 4.',
      orientation: 'horizontal',
      value: 4,
      hints: [
        'On this line, y is always the same number. x can be anything.',
        'Find two points whose y-coordinate is that number.',
        'Plot both points and draw the line through them. It should run left to right.',
      ],
      backUp: ['Every point on a horizontal line has the same…', ['y-value', 'x-value'], 'y-value'],
      notes: [
        ['Horizontal and vertical lines', 'y = a number is a horizontal line (slope 0). x = a number is a vertical line (undefined slope).'],
        ['Worked example', 'y = −1 passes through (0, −1) and (3, −1). x = 2 passes through (2, 0) and (2, 5).'],
      ],
      solution: {
        reasoning: [
          'y = 4 means every point on the line has a y-coordinate of 4.',
          'Two such points are (0, 4) and (3, 4).',
          'The line through them is horizontal, 4 units above the x-axis. Its slope is 0.',
        ],
        commonError: 'Drawing a vertical line through 4 on the x-axis; that line is x = 4. For y = 4, the line crosses the y-axis at 4.',
      },
      example: 'ex-horizontal-vertical',
    }),
    item({
      id: 'tg-u5-q2',
      alignment: teks('A.2G'),
      actions: ['constructLine'],
      dok: 1,
      band: 1,
      prompt: 'Graph the vertical line x = −5.',
      orientation: 'vertical',
      value: -5,
      hints: [
        'On this line, x is always the same number. y can be anything.',
        'Find two points whose x-coordinate is that number.',
        'Plot both points and draw the line through them. It should run up and down.',
      ],
      backUp: ['Every point on a vertical line has the same…', ['x-value', 'y-value'], 'x-value'],
      solution: {
        reasoning: [
          'x = −5 means every point on the line has an x-coordinate of −5.',
          'Two such points are (−5, 0) and (−5, 3).',
          'The line through them is vertical, 5 units left of the y-axis. Its slope is undefined.',
        ],
        commonError: 'Drawing a horizontal line through −5 on the y-axis; that line is y = −5. For x = −5, the line crosses the x-axis at −5.',
      },
    }),
    item({
      id: 'tg-u5-q3',
      alignment: teks('A.2F', 'A.3C'),
      actions: ['constructLine'],
      dok: 2,
      band: 2,
      prompt: 'Line p is parallel to y = 2x + 5 and passes through the point (1, −3). Graph line p.',
      point: [1, -3],
      slope: 2,
      // The given line: the tool draws it and asks for the line through the point without printing the slope.
      referenceLine: { m: 2, b: 5, relation: 'parallel' },
      graphBounds: { ...WINDOW },
      hints: [
        'Parallel lines never meet. What must be the same about their slopes?',
        'Read the slope of y = 2x + 5. Line p uses that slope, but it starts from the point (1, −3).',
        'Plot (1, −3). Then use the slope as rise over run to plot a second point.',
      ],
      backUp: ['Parallel lines have…', ['the same slope', 'the same y-intercept'], 'the same slope'],
      notes: [
        ['Parallel lines', 'Parallel lines have the same slope and different y-intercepts. To graph one through a point: plot the point, then use the shared slope.'],
        ['Worked example', 'Parallel to y = 3x − 4 through (0, 2): the slope is 3, so plot (0, 2) and go up 3, right 1 to (1, 5).'],
      ],
      solution: {
        reasoning: [
          'The slope of y = 2x + 5 is 2. A parallel line has the same slope, so line p has slope 2.',
          'Plot the given point (1, −3).',
          'Slope 2 is 2/1: go up 2 and right 1 to (2, −1). Draw the line through both points.',
        ],
        commonError: 'Starting line p at (0, 5), the y-intercept of the given line; line p shares only the slope, and it must pass through (1, −3).',
      },
      example: 'ex-parallel-line',
    }),
    item({
      id: 'tg-u5-q4',
      alignment: teks('A.2F', 'A.3C'),
      actions: ['constructLine'],
      dok: 2,
      band: 3,
      prompt: 'Line k is perpendicular to y = −(1/3)x + 2 and passes through the point (−1, −2). Graph line k.',
      point: [-1, -2],
      slope: 3,
      referenceLine: { m: -1 / 3, b: 2, relation: 'perpendicular' },
      graphBounds: { ...WINDOW },
      hints: [
        'Perpendicular lines meet at a right angle. Their slopes are negative reciprocals.',
        'To find a negative reciprocal, flip the fraction and change its sign.',
        'Plot (−1, −2). Then use the new slope as rise over run to plot a second point.',
      ],
      backUp: ['The reciprocal of 1/3 is…', ['3', '−1/3'], '3'],
      notes: [
        ['Perpendicular lines', 'The slopes of perpendicular lines are negative reciprocals: flip the fraction and change the sign. Their product is −1.'],
        ['Worked example', 'Perpendicular to y = (2/5)x + 4: flip 2/5 to get 5/2, change the sign to get −5/2. The perpendicular slope is −5/2.'],
      ],
      solution: {
        reasoning: [
          'The slope of the given line is −1/3.',
          'Flip it to get 3/1 and change the sign: the perpendicular slope is 3.',
          'Plot (−1, −2). Slope 3 is 3/1: go up 3 and right 1 to (0, 1).',
          'Draw the line through (−1, −2) and (0, 1). Check: −1/3 × 3 = −1.',
        ],
        commonError: 'Using the slope 1/3, which only changes the sign; the perpendicular slope also flips the fraction: 3.',
      },
      example: 'ex-perpendicular-line',
    }),
  ],
  honors: [
    item({
      id: 'tg-u5-h1',
      alignment: teks('A.2F', 'A.2B'),
      actions: ['multipleResponses'],
      dok: 2,
      band: 4,
      prompt: 'Honors. Line t is perpendicular to y = −(2/3)x + 1 and passes through the point (4, 1). Find its slope and its y-intercept. Then write its equation.',
      responses: [
        { id: 'slope', label: 'Slope of line t', answer: '3/2' },
        {
          id: 'intercept',
          label: 'The y-intercept b of line t (use your slope and the point (4, 1))',
          answer: '-5',
          followThrough: { from: ['slope'], answer: '1 - 4*{slope}' },
        },
        {
          id: 'equation',
          label: 'Equation of line t in slope-intercept form',
          answer: 'y=3/2x-5',
          inputProfile: 'equation',
          followThrough: { from: ['slope', 'intercept'], answer: 'y = {slope}x + {intercept}' },
        },
      ],
      hints: [
        'The perpendicular slope is the negative reciprocal of −2/3: flip the fraction, then change the sign.',
        'Put the point (4, 1) and your slope into y = mx + b. The only letter left is b.',
        'Solve for b. Then write y = mx + b with your m and b.',
      ],
      backUp: ['To get a perpendicular slope from −2/3, you…', ['flip it and change its sign', 'change only its sign'], 'flip it and change its sign'],
      notes: [
        ['Equation of a perpendicular line', 'Find the negative reciprocal slope. Substitute it and the given point into y = mx + b, solve for b, then write the equation.'],
        ['Worked example', 'Perpendicular to y = (3/4)x + 2 through (3, 1): m = −4/3. 1 = −4 + b gives b = 5, so y = −(4/3)x + 5.'],
      ],
      solution: {
        reasoning: [
          'The given slope is −2/3. Flip it and change the sign: the slope of line t is 3/2.',
          'Substitute (4, 1) into y = (3/2)x + b: 1 = (3/2)(4) + b, so 1 = 6 + b.',
          'Subtract 6: b = −5.',
          'The equation of line t is y = (3/2)x − 5.',
        ],
        commonError: 'Using 2/3 as the slope, which changes the sign but does not flip the fraction; the negative reciprocal of −2/3 is 3/2.',
      },
      example: 'ex-perpendicular-equation',
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 6 */

const A5A = teks('A.5A');
const solve = ({ equation, ...rest }) => item({ alignment: A5A, actions: ['solveStepByStep'], equation, ...rest });

const UNIT_6 = unit({
  number: 6,
  title: 'Unit 6 — Solving linear equations',
  minutes: 45,
  honorsMinutes: 52,
  questions: [
    solve({
      id: 'tg-u6-q1',
      dok: 1,
      band: 1,
      prompt: 'Solve x − 7 = 12. Do the same thing to both sides.',
      equation: 'x - 7 = 12',
      hints: [
        'You want x alone. What is being done to x?',
        'Undo a subtraction with the opposite operation.',
        'Do that operation to BOTH sides. Then check your value in the equation.',
      ],
      backUp: ['The opposite of subtracting 7 is…', ['adding 7', 'dividing by 7'], 'adding 7'],
      notes: [
        ['Keep the equation balanced', 'To get the variable alone, undo what is done to it with the opposite operation, and do the same thing to both sides.'],
        ['Worked example', 'x + 6 = 15: subtract 6 from both sides to get x = 9. Check: 9 + 6 = 15.'],
      ],
      solution: {
        reasoning: [
          '7 is subtracted from x, so add 7 to both sides.',
          'x − 7 + 7 = 12 + 7 gives x = 19.',
          'Check: 19 − 7 = 12.',
        ],
        commonError: 'Subtracting 7 from both sides, which gives x − 14 = 5; to undo a subtraction, add.',
      },
      example: 'ex-one-step',
    }),
    solve({
      id: 'tg-u6-q2',
      dok: 1,
      band: 1,
      prompt: 'Solve 5x = −35.',
      equation: '5x = -35',
      hints: [
        '5x means 5 times x. What operation undoes multiplying?',
        'Do that operation to both sides.',
        'Watch the sign: a negative number divided by a positive number is negative.',
      ],
      backUp: ['5x means…', ['5 times x', '5 plus x'], '5 times x'],
      notes: [
        ['Undo multiplying', 'A number in front of the variable multiplies it. Undo it by dividing both sides by that number.'],
        ['Worked example', '3x = −24: divide both sides by 3 to get x = −8. Check: 3(−8) = −24.'],
      ],
      solution: {
        reasoning: [
          'x is multiplied by 5, so divide both sides by 5.',
          '5x ÷ 5 = −35 ÷ 5 gives x = −7.',
          'Check: 5(−7) = −35.',
        ],
        commonError: 'Subtracting 5 from both sides; 5x is a multiplication, so it is undone by dividing by 5.',
      },
      example: 'ex-one-step-divide',
    }),
    solve({
      id: 'tg-u6-q3',
      dok: 1,
      band: 2,
      prompt: 'Solve 3x + 8 = 29.',
      equation: '3x + 8 = 29',
      hints: [
        'Two things are done to x: it is multiplied by 3, and then 8 is added.',
        'Undo them in the opposite order. Undo the addition first.',
        'Then undo the multiplication. Check your value in the equation.',
      ],
      backUp: ['To solve 3x + 8 = 29, the first step is to…', ['subtract 8 from both sides', 'divide both sides by 3'], 'subtract 8 from both sides'],
      notes: [
        ['Two steps', 'Undo the operations in reverse order: first the adding or subtracting, then the multiplying or dividing.'],
        ['Worked example', '2x + 5 = 17: subtract 5 to get 2x = 12, then divide by 2 to get x = 6.'],
      ],
      solution: {
        reasoning: [
          'Subtract 8 from both sides: 3x = 21.',
          'Divide both sides by 3: x = 7.',
          'Check: 3(7) + 8 = 21 + 8 = 29.',
        ],
        commonError: 'Dividing only the 3x by 3 first and leaving the 8 alone; undo the + 8 first, or divide every term.',
      },
      example: 'ex-two-step',
    }),
    solve({
      id: 'tg-u6-q4',
      dok: 2,
      band: 2,
      prompt: 'Solve 4(x − 3) = 20.',
      equation: '4(x - 3) = 20',
      hints: [
        'The 4 multiplies everything inside the parentheses.',
        'Distribute first: multiply 4 by x and 4 by −3.',
        'After distributing you have a two-step equation. Solve it as before.',
      ],
      backUp: ['4(x − 3) is equal to…', ['4x − 12', '4x − 3'], '4x − 12'],
      notes: [
        ['Distribute first', 'A number in front of parentheses multiplies every term inside. Multiply it out, then solve.'],
        ['Worked example', '3(x + 2) = 21 becomes 3x + 6 = 21. Subtract 6 to get 3x = 15, so x = 5.'],
      ],
      solution: {
        reasoning: [
          'Distribute the 4: 4x − 12 = 20.',
          'Add 12 to both sides: 4x = 32.',
          'Divide both sides by 4: x = 8.',
          'Check: 4(8 − 3) = 4(5) = 20.',
        ],
        commonError: 'Multiplying only the x by 4 and writing 4x − 3 = 20; the 4 multiplies both terms inside the parentheses.',
      },
      example: 'ex-distribute',
    }),
    solve({
      id: 'tg-u6-q5',
      dok: 2,
      band: 3,
      prompt: 'Solve 7x − 5 = 3x + 15.',
      equation: '7x - 5 = 3x + 15',
      hints: [
        'There are x-terms on both sides. Get them all on one side first.',
        'Subtract the smaller x-term from both sides.',
        'Now it is a two-step equation: move the number, then divide.',
      ],
      backUp: ['To collect the x-terms of 7x − 5 = 3x + 15 on the left, you…', ['subtract 3x from both sides', 'add 3x to both sides'], 'subtract 3x from both sides'],
      notes: [
        ['Variables on both sides', 'Add or subtract one of the variable terms on both sides, so the variable is on one side only. Then solve the two-step equation that is left.'],
        ['Worked example', '6x − 4 = 2x + 12: subtract 2x to get 4x − 4 = 12, add 4 to get 4x = 16, so x = 4.'],
      ],
      solution: {
        reasoning: [
          'Subtract 3x from both sides: 4x − 5 = 15.',
          'Add 5 to both sides: 4x = 20.',
          'Divide both sides by 4: x = 5.',
          'Check: 7(5) − 5 = 30 and 3(5) + 15 = 30.',
        ],
        commonError: 'Adding 7x and 3x to get 10x; the terms are on opposite sides of the equals sign, so one is subtracted from both sides.',
      },
      example: 'ex-both-sides',
    }),
    solve({
      id: 'tg-u6-q6',
      dok: 2,
      band: 3,
      prompt: 'Solve 3(2x + 1) = 4x − 9.',
      equation: '3(2x + 1) = 4x - 9',
      hints: [
        'Simplify the left side first: distribute the 3.',
        'Then collect the x-terms on one side and the numbers on the other.',
        'The answer is negative. Check it in both sides of the original equation.',
      ],
      backUp: ['3(2x + 1) is equal to…', ['6x + 3', '6x + 1'], '6x + 3'],
      notes: [
        ['Simplify, collect, solve', 'First simplify each side: distribute and combine like terms. Then collect the variable terms on one side and the numbers on the other.'],
        ['Worked example', '2(3x − 1) = 4x + 10 becomes 6x − 2 = 4x + 10, then 2x = 12, so x = 6.'],
      ],
      solution: {
        reasoning: [
          'Distribute the 3: 6x + 3 = 4x − 9.',
          'Subtract 4x from both sides: 2x + 3 = −9.',
          'Subtract 3 from both sides: 2x = −12.',
          'Divide both sides by 2: x = −6. Check: 3(−12 + 1) = −33 and 4(−6) − 9 = −33.',
        ],
        commonError: 'Writing 3(2x + 1) as 6x + 1; the 3 also multiplies the 1, so the left side is 6x + 3.',
      },
      example: 'ex-multi-step',
    }),
    solve({
      id: 'tg-u6-q7',
      dok: 2,
      band: 3,
      prompt: 'Solve 6x + 4 − 2x = x − 11.',
      equation: '6x + 4 - 2x = x - 11',
      hints: [
        'The left side has two x-terms. Combine them first.',
        'Then collect the x-terms on one side and the numbers on the other.',
        'Remember that x means 1x.',
      ],
      backUp: ['6x − 2x is equal to…', ['4x', '8x'], '4x'],
      solution: {
        reasoning: [
          'Combine like terms on the left: 4x + 4 = x − 11.',
          'Subtract x from both sides: 3x + 4 = −11.',
          'Subtract 4 from both sides: 3x = −15.',
          'Divide both sides by 3: x = −5. Check: 6(−5) + 4 − 2(−5) = −16 and −5 − 11 = −16.',
        ],
        commonError: 'Adding 6x and 2x to get 8x; the 2x is subtracted, so the left side simplifies to 4x + 4.',
      },
      // Named here: without it the platform would show the first example of the skill, which is a different method.
      example: 'ex-multi-step',
    }),
  ],
  honors: [
    solve({
      id: 'tg-u6-h1',
      dok: 2,
      band: 4,
      prompt: 'Honors. Solve 5(x + 2) − 3 = 5x + 4. If no value of x makes the equation true, or every value does, say so.',
      equation: '5(x + 2) - 3 = 5x + 4',
      relationWorkspace: true,
      hints: [
        'Simplify the left side completely before you move any terms.',
        'Compare the x-terms on the two sides. What happens when you subtract one of them from both sides?',
        'When the variable is gone, read the statement that is left. Is it true or false?',
      ],
      backUp: ['After simplifying, the left side 5(x + 2) − 3 is…', ['5x + 7', '5x − 1'], '5x + 7'],
      notes: [
        ['When the variable disappears', 'If the x-terms cancel, read what is left. A false statement (like 3 = 8) means no solution. A true statement (like 4 = 4) means every number is a solution.'],
        ['Worked example', '3(x + 1) = 3x + 8 becomes 3x + 3 = 3x + 8. Subtract 3x: 3 = 8, which is false, so there is no solution.'],
      ],
      solution: {
        reasoning: [
          'Distribute and combine: 5x + 10 − 3 = 5x + 4, so 5x + 7 = 5x + 4.',
          'Subtract 5x from both sides: 7 = 4.',
          '7 = 4 is false for every value of x.',
          'No value of x makes the equation true: the equation has no solution.',
        ],
        commonError: 'Reading 7 = 4 as the answer x = 0 or x = 3; when the variable is gone and the statement is false, there is no solution.',
      },
      example: 'ex-no-solution',
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 7 */

const A5B = teks('A.5B');
const solveInequality = ({ inequality, ...rest }) => item({ alignment: A5B, actions: ['solveInequality'], inequality, ...rest });

const UNIT_7 = unit({
  number: 7,
  title: 'Unit 7 — Linear inequalities in one variable',
  minutes: 38,
  honorsMinutes: 46,
  questions: [
    item({
      id: 'tg-u7-q1',
      alignment: A5B,
      actions: ['constructInterval'],
      dok: 1,
      band: 1,
      prompt: 'Graph x ≥ −2 on the number line.',
      intervals: [{ min: -2, max: null, minClosed: true, maxClosed: false }],
      ask: ['graph'],
      // A plain −10 to 10 line: the tool's own window would be centred on the answer.
      min: -10,
      max: 10,
      step: 1,
      autoViewport: false,
      hints: [
        'Is −2 itself a solution? Is −2 ≥ −2 true?',
        'A closed circle includes the number. An open circle leaves it out.',
        'Shade toward the numbers that make the inequality true. Are they greater or less than −2?',
      ],
      backUp: ['For x > 5, the number 5 is…', ['not a solution', 'a solution'], 'not a solution'],
      notes: [
        ['Graphing an inequality', '< and > use an open circle: the number is not a solution. ≤ and ≥ use a closed circle: it is. Shade the side where the inequality is true.'],
        ['Worked example', 'x < 3: open circle at 3, shaded to the left, because every solution is less than 3.'],
      ],
      solution: {
        reasoning: [
          '≥ means "greater than or equal to", so −2 is a solution: draw a closed circle at −2.',
          'Numbers greater than −2 are to the right, so shade to the right.',
          'Check a shaded number: 0 ≥ −2 is true.',
        ],
        commonError: 'Shading to the left; the numbers greater than −2, such as −1 and 0, are to the right of −2.',
      },
      example: 'ex-number-line',
    }),
    solveInequality({
      id: 'tg-u7-q2',
      dok: 1,
      band: 1,
      prompt: 'Solve x − 4 < 3. Then graph its solution.',
      inequality: 'x - 4 < 3',
      hints: [
        'Solve it the way you would solve x − 4 = 3.',
        'Do the same thing to both sides. Adding or subtracting never changes the symbol.',
        'Graph: is the boundary number a solution? Choose an open or a closed circle.',
      ],
      backUp: ['To get x alone in x − 4 < 3, you…', ['add 4 to both sides', 'subtract 4 from both sides'], 'add 4 to both sides'],
      notes: [
        ['Solving an inequality', 'Solve an inequality like an equation: do the same thing to both sides. Adding, subtracting, or multiplying or dividing by a POSITIVE number keeps the symbol.'],
        ['Worked example', '2x + 3 > 21: subtract 3 to get 2x > 18, then divide by 2 to get x > 9. Open circle at 9, shaded right.'],
      ],
      solution: {
        reasoning: [
          'Add 4 to both sides: x < 7.',
          '< does not include 7, so draw an open circle at 7.',
          'Shade to the left, toward the numbers less than 7. Check: 0 − 4 < 3 is true.',
        ],
        commonError: 'Using a closed circle at 7; 7 − 4 = 3, and 3 < 3 is false, so 7 is not a solution.',
      },
      example: 'ex-solve-inequality',
    }),
    solveInequality({
      id: 'tg-u7-q3',
      dok: 2,
      band: 2,
      prompt: 'Solve 3x + 4 ≥ 19. Then graph its solution.',
      inequality: '3x + 4 >= 19',
      hints: [
        'Undo the addition first, on both sides.',
        'Then divide both sides by the number in front of x. Is that number positive or negative?',
        'Graph: ≥ includes the boundary number.',
      ],
      backUp: ['Dividing both sides of an inequality by a positive number…', ['keeps the symbol the same', 'reverses the symbol'], 'keeps the symbol the same'],
      solution: {
        reasoning: [
          'Subtract 4 from both sides: 3x ≥ 15.',
          'Divide both sides by 3. It is positive, so the symbol stays: x ≥ 5.',
          'Graph: closed circle at 5, shaded to the right.',
        ],
        commonError: 'Reversing the symbol to x ≤ 5; the symbol reverses only when you multiply or divide by a negative number.',
      },
    }),
    solveInequality({
      id: 'tg-u7-q4',
      dok: 2,
      band: 3,
      prompt: 'Solve −2x + 6 < 14. Then graph its solution.',
      inequality: '-2x + 6 < 14',
      hints: [
        'Undo the + 6 first, on both sides.',
        'Now divide both sides by the number in front of x. Look at its sign.',
        'When you multiply or divide both sides by a negative number, reverse the inequality symbol.',
      ],
      backUp: ['When you divide both sides of an inequality by a negative number, the symbol…', ['reverses', 'stays the same'], 'reverses'],
      notes: [
        ['Negative means reverse', 'When you multiply or divide both sides of an inequality by a NEGATIVE number, reverse the symbol: < becomes >, and ≤ becomes ≥.'],
        ['Worked example', '−5x ≤ 10: divide by −5 and reverse the symbol to get x ≥ −2.'],
      ],
      solution: {
        reasoning: [
          'Subtract 6 from both sides: −2x < 8.',
          'Divide both sides by −2 and reverse the symbol: x > −4.',
          'Graph: open circle at −4, shaded to the right.',
          'Check with 0: −2(0) + 6 = 6, and 6 < 14 is true.',
        ],
        commonError: 'Keeping the symbol and writing x < −4; dividing by −2 reverses it, so the solution is x > −4.',
      },
      example: 'ex-inequality-reverse',
    }),
    solveInequality({
      id: 'tg-u7-q5',
      dok: 2,
      band: 3,
      prompt: 'Solve 6x − 5 ≤ 2x + 11. Then graph its solution.',
      inequality: '6x - 5 <= 2x + 11',
      hints: [
        'Collect the x-terms on one side first, as you would in an equation.',
        'Then move the number to the other side.',
        'Divide by the number in front of x. Check its sign before you decide about the symbol.',
      ],
      backUp: ['To collect the x-terms of 6x − 5 ≤ 2x + 11 on the left, you…', ['subtract 2x from both sides', 'add 2x to both sides'], 'subtract 2x from both sides'],
      solution: {
        reasoning: [
          'Subtract 2x from both sides: 4x − 5 ≤ 11.',
          'Add 5 to both sides: 4x ≤ 16.',
          'Divide both sides by 4. It is positive, so the symbol stays: x ≤ 4.',
          'Graph: closed circle at 4, shaded to the left.',
        ],
        commonError: 'Shading to the right; x ≤ 4 means the numbers less than or equal to 4, which are to the left.',
      },
    }),
    solveInequality({
      id: 'tg-u7-q6',
      dok: 2,
      band: 3,
      prompt: 'Solve −3(x − 2) > 15. Then graph its solution.',
      inequality: '-3(x - 2) > 15',
      hints: [
        'Distribute the number in front of the parentheses first. Watch the sign of each product.',
        'Move the number to the right side.',
        'You will divide by a negative number. What must happen to the symbol?',
      ],
      backUp: ['−3(x − 2) is equal to…', ['−3x + 6', '−3x − 6'], '−3x + 6'],
      solution: {
        reasoning: [
          'Distribute the −3: −3x + 6 > 15.',
          'Subtract 6 from both sides: −3x > 9.',
          'Divide both sides by −3 and reverse the symbol: x < −3.',
          'Graph: open circle at −3, shaded to the left. Check with −4: −3(−4 − 2) = 18, and 18 > 15 is true.',
        ],
        commonError: 'Writing −3(x − 2) as −3x − 6; a negative times a negative is positive, so the product is −3x + 6.',
      },
      // Named here: without it the platform would show the first example of the skill, which is a different method.
      example: 'ex-inequality-reverse',
    }),
  ],
  honors: [
    solveInequality({
      id: 'tg-u7-h1',
      dok: 2,
      band: 4,
      prompt: 'Honors. Solve 5 − (2/3)x ≥ 11. Then graph its solution.',
      inequality: '5 - (2/3)x >= 11',
      hints: [
        'Undo the 5 first. It is positive, so subtract it from both sides.',
        'The number in front of x is −2/3. To undo it, multiply both sides by its reciprocal.',
        'That reciprocal is negative. What must happen to the symbol?',
      ],
      backUp: ['The reciprocal of −2/3 is…', ['−3/2', '3/2'], '−3/2'],
      solution: {
        reasoning: [
          'Subtract 5 from both sides: −(2/3)x ≥ 6.',
          'Multiply both sides by −3/2 and reverse the symbol: x ≤ 6 · (−3/2).',
          '6 · (−3/2) = −9, so x ≤ −9.',
          'Graph: closed circle at −9, shaded to the left. Check with −12: 5 − (2/3)(−12) = 13, and 13 ≥ 11 is true.',
        ],
        commonError: 'Keeping ≥ after multiplying by −3/2; multiplying by a negative number reverses the symbol, so the solution is x ≤ −9.',
      },
      // Named here: without it the platform would show the first example of the skill, which is a different method.
      example: 'ex-inequality-reverse',
    }),
  ],
});

export const UNITS_4_TO_7 = [UNIT_4, UNIT_5, UNIT_6, UNIT_7];
