/*
 * THE PACKET'S WORKED EXAMPLES (lessonSupports.examples).
 *
 * One example for each new skill, opened by the first question on that skill.
 * Each is a sibling problem — the same method with other numbers, never an
 * item of the packet — written as a step card: small steps, none skipped,
 * each with its reason. A Step Algebra example that is solved with balanced
 * moves alone also carries `moves` (add, subtract, multiply, divide, check),
 * the tool's own actions, for the replay.
 *
 * `honors: true` marks an example only an Honors question opens; the regular
 * file leaves it out.
 */
import { example } from './shared.mjs';

const REGULAR = [
  /* ---------------------------------------------------------------- Unit 1 */
  example({
    id: 'ex-mapping',
    skill: 'functions.mappingDiagram',
    problem: 'Is the relation (1, 4), (2, 7), (3, 4), (5, 0) a function?',
    steps: [
      ['Inputs: 1, 2, 3, 5. Outputs: 4, 7, 0.', 'The first number of each pair is the input. The second is the output.'],
      ['1 → 4, 2 → 7, 3 → 4, 5 → 0', 'Draw one arrow for each ordered pair.'],
      ['Each input has exactly one arrow leaving it.', 'A function gives every input exactly one output.'],
      ['Inputs 1 and 3 both point to 4. That is allowed.', 'Two inputs may share an output. One input may not have two outputs.'],
      ['Every input has exactly one output, so the relation passes the function test.', 'No input has more than one output.'],
    ],
  }),
  example({
    id: 'ex-function-sort',
    skill: 'functions.identifyFromRepresentations',
    problem: 'Decide whether each relation is a function. Table P: x = 1, 2, 3 with y = 6, 6, 8. Table Q: x = 4, 4, 5 with y = 1, 2, 3. Equation R: x = 7.',
    steps: [
      ['Ask of each one: does any input have two different outputs?', 'That one question decides every relation, in any form.'],
      ['Table P: inputs 1, 2 and 3 each appear once. Function.', 'The output 6 repeats, but each input still has one output.'],
      ['Table Q: the input 4 has the outputs 1 and 2. Not a function.', 'One input with two outputs breaks the rule.'],
      ['Equation R: x = 7 pairs the input 7 with every y-value. Not a function.', 'Its graph is a vertical line: one input, many outputs.'],
    ],
  }),
  example({
    id: 'ex-intercepts-graph',
    skill: 'linear.interceptsFromGraph',
    problem: 'A line crosses the x-axis at −3 and the y-axis at 6. Name its x-intercept, its zero and its y-intercept.',
    steps: [
      ['The line crosses the x-axis at x = −3.', 'The x-intercept is where the graph meets the x-axis.'],
      ['x-intercept: (−3, 0)', 'Every point on the x-axis has y = 0, so the 0 goes second.'],
      ['Zero: −3', 'The zero is the x-value that makes y = 0. It is a number, not a point.'],
      ['The line crosses the y-axis at y = 6.', 'The y-intercept is where the graph meets the y-axis.'],
      ['y-intercept: (0, 6)', 'Every point on the y-axis has x = 0, so the 0 goes first.'],
    ],
  }),
  example({
    id: 'ex-domain-range',
    skill: 'functions.domainRangeFromGraph',
    problem: 'A line segment goes from a closed dot at (−2, 1) to a closed dot at (4, 7). Write its domain and its range as inequalities.',
    steps: [
      ['Left end: x = −2. Right end: x = 4.', 'The domain is the x-values. Read the graph from left to right.'],
      ['Domain: −2 ≤ x ≤ 4', 'Both dots are closed, so both ends are included: use ≤.'],
      ['Lowest point: y = 1. Highest point: y = 7.', 'The range is the y-values. Read the graph from bottom to top.'],
      ['Range: 1 ≤ y ≤ 7', 'Both ends are included, and the smaller number is written on the left.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 2 */
  example({
    id: 'ex-slope-graph',
    skill: 'linear.slopeFromGraph',
    problem: 'A line passes through the grid points (0, 4) and (3, 13). Find its slope and its y-intercept.',
    steps: [
      ['Rise: 13 − 4 = 9', 'The rise is the change in y from the first point to the second.'],
      ['Run: 3 − 0 = 3', 'The run is the change in x between the same two points.'],
      ['Slope = rise ÷ run = 9 ÷ 3 = 3', 'Slope is the change in y divided by the change in x.'],
      ['y-intercept: (0, 4)', 'The y-intercept is the point of the line on the y-axis.'],
    ],
  }),
  example({
    id: 'ex-rate-table',
    skill: 'linear.rateOfChangeFromTable',
    problem: 'A table has the rows (1, 9), (3, 17), (4, 21) and (8, 37). Is the rate of change constant?',
    steps: [
      ['Rows (1, 9) and (3, 17): Δx = 2, Δy = 8', 'Subtract the x-values and the y-values in the same order.'],
      ['Rate: 8 ÷ 2 = 4', 'The rate of change is Δy ÷ Δx.'],
      ['Rows (3, 17) and (4, 21): Δx = 1, Δy = 4, rate 4 ÷ 1 = 4', 'Test a second pair of rows the same way.'],
      ['Rows (4, 21) and (8, 37): Δx = 4, Δy = 16, rate 16 ÷ 4 = 4', 'Test a third pair. The x-values jump by different amounts, so always divide.'],
      ['Every rate is 4, so the rate of change is constant.', 'A constant rate means every pair of rows gives the same number.'],
    ],
  }),
  example({
    id: 'ex-graph-slope-intercept',
    skill: 'linear.graphFromSlopeIntercept',
    problem: 'Graph y = 3x + 1.',
    steps: [
      ['b = 1, so plot (0, 1).', 'In y = mx + b, the number b is the y-intercept.'],
      ['m = 3 = 3/1: rise 3, run 1.', 'The slope is rise over run. A whole number is written over 1.'],
      ['From (0, 1) go up 3 and right 1 to (1, 4).', 'The slope takes you from one point of the line to the next.'],
      ['Draw the line through (0, 1) and (1, 4).', 'Two points are enough to draw a line.'],
      ['Check (1, 4): 3(1) + 1 = 4.', 'A point on the line makes the equation true.'],
    ],
  }),
  example({
    id: 'ex-equation-from-words',
    skill: 'linear.equationFromSituation',
    problem: 'A fair charges a $5 entry fee plus $2 for each ride. Write an equation for the total cost y of x rides, and graph it.',
    steps: [
      ['x = number of rides, y = total cost', 'The cost depends on the number of rides, so rides are the input.'],
      ['$2 for each ride: m = 2', 'The amount "for each" is the rate of change, the slope.'],
      ['$5 entry fee: b = 5', 'The one-time amount is the cost when x = 0, the y-intercept.'],
      ['y = 2x + 5', 'Write the slope and the y-intercept into y = mx + b.'],
      ['Plot (0, 5), then go up 2 and right 1 to (1, 7).', 'Start at the y-intercept and use the slope to find a second point.'],
    ],
  }),
  example({
    id: 'ex-equation-from-table',
    skill: 'linear.equationFromTable',
    problem: 'A table has the rows (−1, 1), (0, 5), (1, 9) and (5, 25). Write its equation in the form y = mx + b.',
    steps: [
      ['Rows (−1, 1) and (0, 5): 4 ÷ 1 = 4', 'Find Δy ÷ Δx for one pair of rows.'],
      ['Rows (0, 5) and (1, 9): 4 ÷ 1 = 4. Rows (1, 9) and (5, 25): 16 ÷ 4 = 4', 'Check more pairs. Every pair must give the same rate.'],
      ['m = 4', 'The constant rate of change is the slope.'],
      ['In the row (0, 5), x is zero, so b = 5.', 'The y-intercept is the y-value in the row where x is zero.'],
      ['y = 4x + 5', 'Write m and b into y = mx + b.'],
      ['Check (5, 25): 4(5) + 5 = 25.', 'Another row of the table must make the equation true.'],
    ],
  }),
  example({
    id: 'ex-graph-intercepts',
    skill: 'linear.graphFromIntercepts',
    problem: 'Use the intercepts to graph 5x + 2y = 10.',
    steps: [
      ['Replace y with zero: 5x = 10, so x = 2', 'Every point on the x-axis has a y-value of zero.'],
      ['x-intercept: (2, 0)', 'Write the x-intercept as a point.'],
      ['Replace x with zero: 2y = 10, so y = 5', 'Every point on the y-axis has an x-value of zero.'],
      ['y-intercept: (0, 5)', 'Write the y-intercept as a point.'],
      ['Plot (2, 0) and (0, 5) and draw the line through them.', 'Two points are enough to draw a line.'],
    ],
  }),
  example({
    id: 'ex-line-two-points',
    skill: 'linear.equationFromTwoPoints',
    problem: 'A line passes through (2, 6) and (4, 14). Find its slope. Then write its equation in point-slope form and in slope-intercept form.',
    steps: [
      ['m = (14 − 6) ÷ (4 − 2) = 8 ÷ 2 = 4', 'Slope is the change in y over the change in x, subtracted in the same order.'],
      ['y − 6 = 4(x − 2)', 'Point-slope form is y − y₁ = m(x − x₁). Use the slope with the point (2, 6).'],
      ['y − 6 = 4x − 8', 'Distribute the 4.'],
      ['y = 4x − 2', 'Add 6 to both sides to get y alone.'],
      ['Check (4, 14): 4(4) − 2 = 14.', 'The other point must make the equation true.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 3 */
  example({
    id: 'ex-sequence',
    skill: 'sequences.recursiveArithmetic',
    problem: 'A sequence is given by f(1) = 9 and f(n) = f(n − 1) + 10. Find the first four terms and the common difference.',
    steps: [
      ['f(1) = 9', 'The rule gives the first term.'],
      ['f(2) = f(1) + 10 = 9 + 10 = 19', 'f(n − 1) is the term before, so each term is the term before it plus 10.'],
      ['f(3) = 19 + 10 = 29 and f(4) = 29 + 10 = 39', 'Use the rule again on each new term.'],
      ['Points: (1, 9), (2, 19), (3, 29), (4, 39)', 'Each term is plotted as (n, f(n)). The points are not connected.'],
      ['Common difference: 10', 'The same number is added every time. That number is the common difference.'],
    ],
  }),
  example({
    id: 'ex-causation-sort',
    skill: 'data.associationOrCausation',
    problem: 'Decide whether each pair shows causation or association only. Pair 1: hours worked at $10 an hour, and pay. Pair 2: sunglasses sold in a day, and sunscreen sold that day.',
    steps: [
      ['Ask: does changing the first quantity directly change the second?', 'That is what causation means.'],
      ['Pair 1: each hour worked adds $10 to the pay. Causation.', 'The pay changes because the hours change.'],
      ['Pair 2: ask what else could change both.', 'A third quantity can make two things rise together.'],
      ['Sunny weather raises both sales. Association only.', 'Buying sunglasses does not make anyone buy sunscreen.'],
    ],
  }),
  example({
    id: 'ex-best-fit',
    skill: 'data.lineOfBestFit',
    problem: 'A scatterplot shows hours of practice, x, and points scored, y. Linear regression gives y = 1.5x + 4. Predict the points scored after 6 hours of practice.',
    steps: [
      ['Fit a line by hand: follow the trend, with points on both sides.', 'An estimate shows whether the regression line makes sense.'],
      ['Run linear regression: y = 1.5x + 4', 'Technology finds the line that fits all of the points best.'],
      ['Substitute x = 6: y = 1.5(6) + 4', 'To predict, replace x with the value asked about.'],
      ['y = 9 + 4 = 13', 'Multiply first, then add.'],
      ['Prediction: about 13 points', 'A prediction from a line of best fit is an estimate.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 4 */
  example({
    id: 'ex-translate-vertical',
    skill: 'transformations.verticalTranslation',
    problem: 'The parent function is f(x) = x. Find the images of (−3, −3), (1, 1) and (5, 5) under g(x) = f(x) − 8.',
    steps: [
      ['The − 8 is outside f(x).', 'A number added or subtracted outside the function changes the outputs.'],
      ['Keep each x. Subtract 8 from each y.', 'Subtracting 8 from every output moves every point down 8.'],
      ['(−3, −3) → (−3, −11)', 'x stays −3, and −3 − 8 = −11.'],
      ['(1, 1) → (1, −7) and (5, 5) → (5, −3)', 'Do the same thing to every point.'],
      ['The graph of g is the graph of f moved down 8 units.', 'A translation moves every point the same distance in the same direction.'],
    ],
  }),
  example({
    id: 'ex-translate-horizontal',
    skill: 'transformations.horizontalTranslation',
    problem: 'The parent function is f(x) = x. Find the images of (−3, −3), (1, 1) and (5, 5) under g(x) = f(x + 10).',
    steps: [
      ['The + 10 is inside the parentheses.', 'A number added or subtracted inside changes the inputs, the x-values.'],
      ['f(x + 10) moves the graph LEFT 10.', 'Inside changes work the opposite way: x must be 10 less to give the same output.'],
      ['Keep each y. Subtract 10 from each x.', 'Moving left makes every x-coordinate smaller.'],
      ['(−3, −3) → (−13, −3)', 'y stays −3, and −3 − 10 = −13.'],
      ['(1, 1) → (−9, 1) and (5, 5) → (−5, 5)', 'Do the same thing to every point.'],
    ],
  }),
  example({
    id: 'ex-dilate',
    skill: 'transformations.verticalDilation',
    problem: 'The parent function is f(x) = x. Find the images of (−1, −1), (1, 1) and (3, 3) under g(x) = 3f(x).',
    steps: [
      ['The 3 multiplies f(x).', 'A number in front of the function multiplies the outputs.'],
      ['Keep each x. Multiply each y by 3.', 'Only the y-coordinates change.'],
      ['(−1, −1) → (−1, −3)', 'x stays the same, and 3 times −1 is −3.'],
      ['(1, 1) → (1, 3) and (3, 3) → (3, 9)', 'Do the same thing to every point.'],
      ['The graph of g is steeper than the graph of f.', 'A factor greater than 1 stretches the graph away from the x-axis.'],
    ],
  }),
  example({
    id: 'ex-combine-transformations',
    skill: 'transformations.combined',
    problem: 'g(x) = 2f(x − 3) + 5, where f(x) = x. Where does the point (1, 1) on f(x) land on g(x)?',
    steps: [
      ['Inside: x − 3. Outside: times 2, then + 5.', 'Sort the changes: inside changes x, outside changes y.'],
      ['x: 1 + 3 = 4', 'x − 3 inside moves the point RIGHT 3.'],
      ['y: 2(1) = 2', 'The 2 in front multiplies the output first.'],
      ['y: 2 + 5 = 7', 'Then the + 5 outside is added.'],
      ['(1, 1) lands at (4, 7).', 'Put the new x and the new y together.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 5 */
  example({
    id: 'ex-horizontal-vertical',
    skill: 'linear.horizontalVerticalLines',
    problem: 'Graph the lines y = −1 and x = 2.',
    steps: [
      ['y = −1: every point has y-coordinate −1.', 'The equation fixes y. x can be any number.'],
      ['Plot (0, −1) and (3, −1) and draw the line.', 'Two points with the same y make a horizontal line. Its slope is 0.'],
      ['x = 2: every point has x-coordinate 2.', 'The equation fixes x. y can be any number.'],
      ['Plot (2, 0) and (2, 5) and draw the line.', 'Two points with the same x make a vertical line. Its slope is undefined.'],
    ],
  }),
  example({
    id: 'ex-parallel-line',
    skill: 'linear.parallelThroughPoint',
    problem: 'Line p is parallel to y = 3x − 4 and passes through (4, 1). Graph line p.',
    steps: [
      ['The slope of y = 3x − 4 is 3.', 'In y = mx + b, the slope is m.'],
      ['Line p also has slope 3.', 'Parallel lines have the same slope.'],
      ['Plot (4, 1).', 'Line p must pass through the given point.'],
      ['Go up 3 and right 1 to (5, 4).', 'Slope 3 is 3/1: rise 3, run 1.'],
      ['Draw the line through (4, 1) and (5, 4).', 'Two points are enough to draw a line.'],
    ],
  }),
  example({
    id: 'ex-perpendicular-line',
    skill: 'linear.perpendicularThroughPoint',
    problem: 'Line k is perpendicular to y = (2/5)x + 4 and passes through (2, 7). Graph line k.',
    steps: [
      ['The slope of the given line is 2/5.', 'In y = mx + b, the slope is m.'],
      ['Flip 2/5 to get 5/2.', 'Perpendicular slopes are reciprocals: the fraction is turned over.'],
      ['Change the sign: −5/2.', 'They also have opposite signs. The perpendicular slope is −5/2.'],
      ['Plot (2, 7).', 'Line k must pass through the given point.'],
      ['Go down 5 and right 2 to (4, 2).', 'Slope −5/2 means fall 5, run 2.'],
      ['Draw the line through (2, 7) and (4, 2).', 'Check: the two slopes multiply to negative one, so the lines are perpendicular.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 6 */
  example({
    id: 'ex-one-step',
    skill: 'solve.oneStepAddSubtract',
    tool: 'stepAlgebra',
    sibling: { equation: 'x + 6 = 15' },
    steps: [
      ['x + 6 = 15', '6 is added to x. To get x alone, undo the addition.'],
      ['x + 6 − 6 = 15 − 6', 'Subtract 6 from BOTH sides to keep the equation balanced.'],
      ['x = 9', 'Simplify each side.'],
      ['Check: 9 + 6 = 15', 'Put the value back into the original equation.'],
    ],
    moves: [
      { op: 'subtract', operand: '6', why: 'Undo the + 6 on both sides.' },
      { check: true, why: 'Put x = 9 back into the equation: 9 + 6 = 15.' },
    ],
  }),
  example({
    id: 'ex-one-step-divide',
    skill: 'solve.oneStepMultiplyDivide',
    tool: 'stepAlgebra',
    sibling: { equation: '3x = -24' },
    steps: [
      ['3x = −24', '3x means 3 times x. To get x alone, undo the multiplication.'],
      ['3x ÷ 3 = −24 ÷ 3', 'Divide BOTH sides by 3.'],
      ['x = −8', 'A negative number divided by a positive number is negative.'],
      ['Check: 3(−8) = −24', 'Put the value back into the original equation.'],
    ],
    moves: [
      { op: 'divide', operand: '3', why: 'Undo the multiplication by 3 on both sides.' },
      { check: true, why: 'Put x = −8 back into the equation: 3(−8) = −24.' },
    ],
  }),
  example({
    id: 'ex-two-step',
    skill: 'solve.twoStep',
    tool: 'stepAlgebra',
    sibling: { equation: '2x + 5 = 17' },
    steps: [
      ['2x + 5 = 17', 'x is multiplied by 2, and then 5 is added. Undo them in the opposite order.'],
      ['2x = 12', 'Subtract 5 from both sides to undo the addition first.'],
      ['x = 6', 'Divide both sides by 2 to undo the multiplication.'],
      ['Check: 2(6) + 5 = 17', 'Put the value back into the original equation.'],
    ],
    moves: [
      { op: 'subtract', operand: '5', why: 'Undo the + 5 first.' },
      { op: 'divide', operand: '2', why: 'Undo the multiplication by 2.' },
      { check: true, why: 'Put x = 6 back into the equation: 2(6) + 5 = 17.' },
    ],
  }),
  example({
    id: 'ex-distribute',
    skill: 'solve.distribute',
    tool: 'stepAlgebra',
    sibling: { equation: '3(x + 2) = 21' },
    steps: [
      ['3(x + 2) = 21', 'The 3 multiplies everything inside the parentheses.'],
      ['3x + 6 = 21', 'Distribute: 3 times x is 3x, and 3 times 2 is 6.'],
      ['3x = 15', 'Subtract 6 from both sides.'],
      ['x = 5', 'Divide both sides by 3.'],
      ['Check: 3(5 + 2) = 3(7) = 21', 'Put the value back into the original equation.'],
    ],
  }),
  example({
    id: 'ex-both-sides',
    skill: 'solve.variablesOnBothSides',
    tool: 'stepAlgebra',
    sibling: { equation: '6x - 4 = 2x + 12' },
    steps: [
      ['6x − 4 = 2x + 12', 'There are x-terms on both sides. Collect them on one side first.'],
      ['4x − 4 = 12', 'Subtract 2x from both sides.'],
      ['4x = 16', 'Add 4 to both sides to collect the numbers on the other side.'],
      ['x = 4', 'Divide both sides by 4.'],
      ['Check: 6(4) − 4 = 20 and 2(4) + 12 = 20', 'The value must make both sides equal.'],
    ],
    moves: [
      { op: 'subtract', operand: '2x', why: 'Collect the x-terms on one side.' },
      { op: 'add', operand: '4', why: 'Collect the numbers on the other side.' },
      { op: 'divide', operand: '4', why: 'Undo the multiplication by 4.' },
      { check: true, why: 'Put x = 4 back into both sides: each side is 20.' },
    ],
  }),
  example({
    id: 'ex-multi-step',
    skill: 'solve.multiStep',
    tool: 'stepAlgebra',
    sibling: { equation: '2(3x - 1) = 4x + 10' },
    steps: [
      ['2(3x − 1) = 4x + 10', 'Simplify each side before moving any terms.'],
      ['6x − 2 = 4x + 10', 'Distribute the 2: 2 times 3x is 6x, and 2 times −1 is −2.'],
      ['2x − 2 = 10', 'Subtract 4x from both sides to collect the x-terms.'],
      ['2x = 12', 'Add 2 to both sides.'],
      ['x = 6', 'Divide both sides by 2.'],
      ['Check: 2(18 − 1) = 34 and 4(6) + 10 = 34', 'The value must make both sides equal.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 7 */
  example({
    id: 'ex-number-line',
    skill: 'inequalities.graphOnNumberLine',
    problem: 'Graph x < 3 on the number line.',
    steps: [
      ['Is 3 a solution? 3 < 3 is false.', 'The symbol < does not include the number itself.'],
      ['Draw an open circle at 3.', 'An open circle shows that 3 is not a solution.'],
      ['Numbers less than 3 are to the left of 3.', 'Smaller numbers are to the left on a number line.'],
      ['Shade to the left of 3.', 'Every shaded number makes the inequality true. Check: 0 < 3.'],
    ],
  }),
  example({
    id: 'ex-solve-inequality',
    skill: 'inequalities.solve',
    sibling: { inequality: '2x + 3 > 21' },
    steps: [
      ['2x + 3 > 21', 'Solve it the way you would solve 2x + 3 = 21.'],
      ['2x > 18', 'Subtract 3 from both sides. Subtracting does not change the symbol.'],
      ['x > 9', 'Divide both sides by 2. It is positive, so the symbol stays the same.'],
      ['Open circle at 9, shaded to the right.', '> does not include 9, and the solutions are greater than 9.'],
      ['Check with 10: 2(10) + 3 = 23, and 23 > 21.', 'A shaded number must make the original inequality true.'],
    ],
  }),
  example({
    id: 'ex-inequality-reverse',
    skill: 'inequalities.solveWithReversal',
    sibling: { inequality: '-5x + 3 <= 13' },
    steps: [
      ['−5x + 3 ≤ 13', 'Start as you would with an equation.'],
      ['−5x ≤ 10', 'Subtract 3 from both sides.'],
      ['x ≥ −2', 'Divide both sides by −5. Dividing by a negative number reverses the symbol.'],
      ['Closed circle at −2, shaded to the right.', '≥ includes −2, and the solutions are greater than −2.'],
      ['Check with 0: −5(0) + 3 = 3, and 3 ≤ 13.', 'A shaded number must make the original inequality true.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 8 */
  example({
    id: 'ex-graph-system',
    skill: 'systems.solveByGraphing',
    problem: 'Solve the system y = 3x and y = x + 6 by graphing.',
    steps: [
      ['Graph y = 3x: start at the origin, then go up 3 and right 1 to (1, 3).', 'Start where the line crosses the y-axis, then use the slope.'],
      ['Graph y = x + 6: start at 6 on the y-axis, then go up 1 and right 1 to (1, 7).', 'Start where the line crosses the y-axis, then use the slope.'],
      ['The lines cross at (3, 9).', 'The crossing point is on both lines.'],
      ['Check: 9 = 3(3) and 9 = 3 + 6.', 'A solution must make both equations true.'],
      ['The solution is (3, 9).', 'Lines with different slopes cross at exactly one point.'],
    ],
  }),
  example({
    id: 'ex-write-system-rules',
    skill: 'systems.writeFromTwoRules',
    problem: 'Taxi A charges $3 plus $2 for each mile. Taxi B charges $5 plus $1 for each mile. Write an equation for the cost y of an x-mile ride with each taxi.',
    steps: [
      ['x = miles, y = total cost in dollars', 'Both taxis are described with the same two variables.'],
      ['Taxi A: $2 for each mile, so m = 2. $3 once, so b = 3.', 'The amount for each mile is the slope. The one-time amount is the y-intercept.'],
      ['Taxi A: y = 2x + 3', 'Write the slope and the y-intercept into y = mx + b.'],
      ['Taxi B: $1 for each mile, so m = 1. $5 once, so b = 5.', 'Read the second rule the same way.'],
      ['Taxi B: y = x + 5', 'The two equations together are a system.'],
    ],
  }),
  example({
    id: 'ex-graph-system-context',
    skill: 'systems.solveByGraphingInContext',
    problem: 'Mia has $10 and saves $5 each week: y = 5x + 10. Leo has $0 and saves $10 each week: y = 10x. Graph both to find when they have the same amount.',
    steps: [
      ['Graph y = 5x + 10 through (0, 10) and (1, 15).', 'Mia starts with $10, and her line rises 5 for each week.'],
      ['Graph y = 10x through (0, 0) and (1, 10).', 'Leo starts with $0, and his line rises 10 for each week.'],
      ['The lines cross at (2, 20).', 'At the crossing point, both rules give the same amount for the same week.'],
      ['Check: 5(2) + 10 = 20 and 10(2) = 20.', 'The point must make both equations true.'],
      ['After 2 weeks, each has $20.', 'The x-value is the number of weeks and the y-value is the dollars saved.'],
    ],
  }),

  /* ---------------------------------------------------------------- Unit 9 */
  example({
    id: 'ex-substitution',
    skill: 'systems.solveBySubstitution',
    problem: 'Solve the system y = 6x and x + y = 63 by substitution.',
    steps: [
      ['y = 6x', 'This equation is already solved for y.'],
      ['x + 6x = 63', 'Put 6x in place of y in the OTHER equation.'],
      ['7x = 63', 'Combine like terms.'],
      ['x = 9', 'Divide both sides by 7.'],
      ['y = 6(9) = 54', 'Put x = 9 back into y = 6x to find y.'],
      ['Check: 54 = 6(9) and 9 + 54 = 63. Solution: (9, 54)', 'The pair must make both equations true.'],
    ],
  }),
  example({
    id: 'ex-write-system',
    skill: 'systems.writeFromSituation',
    problem: 'A school sold 30 tickets to a play. Adult tickets cost $8, child tickets cost $4, and the school collected $200. Write a system of equations.',
    steps: [
      ['a = number of adult tickets, c = number of child tickets', 'Name a variable for each unknown.'],
      ['a + c = 30', 'The first fact counts tickets: adults plus children is 30.'],
      ['8a is the adult money and 4c is the child money.', 'Multiply each price by the number of tickets at that price.'],
      ['8a + 4c = 200', 'The second fact adds up the money.'],
    ],
  }),

  /* --------------------------------------------------------------- Unit 10 */
  example({
    id: 'ex-graph-inequality',
    skill: 'inequalities.graphTwoVariables',
    problem: 'Graph y ≥ −x + 2.',
    steps: [
      ['Boundary: y = −x + 2', 'Replace the symbol with = to get the boundary line.'],
      ['Plot (0, 2), then go down 1 and right 1 to (1, 1).', 'Start at the y-intercept and use the slope, −1.'],
      ['Draw a solid line.', '≥ includes the points on the line.'],
      ['Test (0, 0): 0 ≥ −0 + 2 is 0 ≥ 2. False.', 'A test point shows which side holds the solutions.'],
      ['Shade the side that does not hold (0, 0): above the line.', 'The test point is not a solution, so the solutions are on the other side.'],
    ],
  }),
  example({
    id: 'ex-model-inequality',
    skill: 'inequalities.writeFromSituation',
    problem: 'A stand sells apples for $1 and melons for $4. It wants at least $12 in sales. Write and graph an inequality, with x apples and y melons.',
    steps: [
      ['Apples bring in 1x dollars. Melons bring in 4y dollars.', 'Multiply each price by its variable.'],
      ['x + 4y ≥ 12', '"At least 12" means 12 or more, so the symbol is ≥.'],
      ['Let y = 0: x = 12. Let x = 0: 4y = 12, so y = 3.', 'The boundary crosses the axes at (12, 0) and (0, 3).'],
      ['Draw a solid line through (12, 0) and (0, 3).', '≥ includes the points on the line.'],
      ['Test (0, 0): 0 + 0 ≥ 12 is false. Shade the other side.', 'Selling nothing does not reach $12, so the solutions are above the line.'],
    ],
  }),
  example({
    id: 'ex-inequality-system',
    skill: 'inequalities.graphSystem',
    problem: 'Graph the system y ≤ x + 1 and y > −2x + 4. Is (3, 2) a solution?',
    steps: [
      ['y ≤ x + 1: solid line through (0, 1) and (1, 2), shaded below.', 'Graph the first inequality by itself.'],
      ['y > −2x + 4: dashed line through (0, 4) and (1, 2), shaded above.', 'Graph the second inequality on the same plane.'],
      ['The solutions are where the two shadings overlap.', 'A solution must make both inequalities true.'],
      ['Test (3, 2) in the first: 2 ≤ 3 + 1 is true.', 'Check the point in each inequality.'],
      ['Test (3, 2) in the second: 2 > −6 + 4 is 2 > −2. True.', 'Both are true, so (3, 2) is a solution.'],
    ],
  }),
];

const HONORS = [
  example({
    id: 'ex-geometric-sequence',
    skill: 'sequences.recursiveGeometric',
    problem: 'A sequence is given by f(1) = 625 and f(n) = (1/5)·f(n − 1). Find the first four terms. Do they have a common difference or a common ratio?',
    steps: [
      ['f(1) = 625', 'The rule gives the first term.'],
      ['Second term: (1/5)(625) = 125', 'Each term is one fifth of the term before it.'],
      ['Third term: (1/5)(125) = 25. Fourth term: (1/5)(25) = 5', 'Use the rule again on each new term.'],
      ['Differences: −500, −100, −20. They are not the same.', 'An arithmetic sequence adds the same number every time. This one does not.'],
      ['Ratios: 125 ÷ 625, 25 ÷ 125, 5 ÷ 25. Each is 1/5.', 'This sequence multiplies by the same number every time.'],
      ['The terms have a common ratio of 1/5.', 'The number each term is multiplied by is the common ratio.'],
    ],
  }),
  example({
    id: 'ex-perpendicular-equation',
    skill: 'linear.perpendicularEquation',
    problem: 'Line t is perpendicular to y = (3/4)x + 2 and passes through (3, 1). Write its equation.',
    steps: [
      ['The given slope is 3/4.', 'In y = mx + b, the slope is m.'],
      ['Perpendicular slope: −4/3', 'Flip the fraction and change its sign.'],
      ['1 = (−4/3)(3) + b', 'Put the slope with the point (3, 1) into y = mx + b.'],
      ['1 = −4 + b', 'Multiply: (−4/3)(3) = −4.'],
      ['b = 5', 'Add 4 to both sides.'],
      ['y = −(4/3)x + 5', 'Write the slope with the y-intercept into y = mx + b.'],
    ],
  }),
  example({
    id: 'ex-no-solution',
    skill: 'solve.noSolutionOrAllRealNumbers',
    tool: 'stepAlgebra',
    sibling: { equation: '3(x + 1) = 3x + 8' },
    steps: [
      ['3(x + 1) = 3x + 8', 'Simplify each side before moving any terms.'],
      ['3x + 3 = 3x + 8', 'Distribute the 3.'],
      ['3 = 8', 'Subtract 3x from both sides. The variable is gone.'],
      ['3 = 8 is false.', 'Read the statement that is left.'],
      ['No value of x makes the equation true.', 'A false statement stays false whatever x is.'],
    ],
  }),
  example({
    id: 'ex-substitution-no-solution',
    skill: 'systems.substitutionSpecialCase',
    problem: 'Solve the system y = 2x + 1 and 4x − 2y = 6 by substitution.',
    steps: [
      ['4x − 2(2x + 1) = 6', 'Put 2x + 1, in parentheses, in place of y in the other equation.'],
      ['4x − 4x − 2 = 6', 'Distribute the −2 to both terms.'],
      ['−2 = 6', 'The x-terms cancel. No variable is left.'],
      ['−2 = 6 is false.', 'Read the statement that is left.'],
      ['No ordered pair makes both equations true.', 'A false statement stays false for every x and y. The two lines are parallel.'],
    ],
  }),
];

export const PACKET_EXAMPLES = Object.freeze({ regular: REGULAR, honors: HONORS });
