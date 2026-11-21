/*
 * UNITS 5–8 OF THE THANKSGIVING PACKET: 3×3 systems and matrices (A2.3A,
 * A2.3B), operations on polynomials (A2.7B), dividing polynomials with the
 * Remainder and Factor Theorems (A2.7C, A2.7D), and factoring (A2.7E).
 */
import { example, item, unit, builtOn } from './packetKit.mjs';
import { expression, number, sortBoard } from '../lib/lessonKit.mjs';

const factored = (id, label, answer, extra = {}) => expression(id, label, answer, { gradingMode: 'factoredForm', ...extra });

/* ---------------------------------------------------------------- Unit 5 */

const U5 = {
  twoByTwo: example('ex-u5-2x2', {
    skill: 'systems.elimination2x2',
    tool: 'systemsWorkspace',
    problem: 'Solve x + y = 9 and x − y = 5 by elimination.',
    steps: [
      ['(x + y) + (x − y) = 9 + 5', 'Add the two equations: +y and −y cancel.'],
      ['2x = 14, so x = 7', 'Only x is left. Divide by 2.'],
      ['7 + y = 9, so y = 2', 'Put x = 7 back into the first equation.'],
      ['7 + 2 = 9 and 7 − 2 = 5', 'Check (7, 2) in both equations.'],
    ],
  }),
  threeByThree: example('ex-u5-3x3', {
    skill: 'systems.elimination3x3',
    tool: 'systemsWorkspace',
    problem: 'Solve x + y + z = 9, x − y + z = 3 and x + y − z = 1.',
    steps: [
      ['Equation 1 + equation 2: 2x + 2z = 12', 'Adding cancels y. This is the first equation with only x and z.'],
      ['Equation 2 + equation 3: 2x = 4', 'Eliminate y again, from a different pair. Here z cancels too.'],
      ['x = 2, then 2(2) + 2z = 12 gives z = 4', 'Solve the smaller system.'],
      ['2 + y + 4 = 9, so y = 3', 'Put x and z back into an original equation.'],
      ['(2, 3, 4): 2 + 3 + 4 = 9, 2 − 3 + 4 = 3, 2 + 3 − 4 = 1', 'Check the ordered triple in all three equations.'],
    ],
  }),
  multiply: example('ex-u5-multiply', {
    skill: 'matrices.rowTimesColumn',
    tool: 'matrixLab',
    problem: 'A has rows [2 1] and [0 3]. B is the column with 4 on top and 5 below. Find A · B.',
    steps: [
      ['A is 2 × 2 and B is 2 × 1', 'The inside numbers match (2 and 2), so the product exists. It is 2 × 1.'],
      ['Row 1: 2(4) + 1(5) = 13', 'Multiply across the row and down the column, then add.'],
      ['Row 2: 0(4) + 3(5) = 15', 'Do the same with the second row.'],
      ['A · B is the column with 13 on top and 15 below', 'One entry for each row of A.'],
    ],
  }),
  matrixEquation: example('ex-u5-matrix-equation', {
    skill: 'matrices.writeMatrixEquation',
    tool: 'matrixLab',
    problem: 'Write 2x + y − z = 3, x + 4z = 9 and 3x − 2y + z = 4 as a matrix equation A · X = B.',
    steps: [
      ['Row 1 of A: 2, 1, −1', 'The coefficients of x, y and z, in that order. −z has coefficient −1.'],
      ['Row 2 of A: 1, 0, 4', 'The second equation has no y, so its y-coefficient is 0.'],
      ['Row 3 of A: 3, −2, 1', 'Keep the signs with the numbers.'],
      ['X is the column x, y, z', 'The variables, in the same order as the columns of A.'],
      ['B is the column 3, 9, 4', 'The constants, in the same order as the equations.'],
    ],
  }),
  solve: example('ex-u5-solve-matrix', {
    skill: 'matrices.solveWithInverse',
    tool: 'matrixLab',
    problem: 'Solve x + y + z = 6, 2x − y + z = 3 and x + 2y − z = 2 with matrices.',
    steps: [
      ['A has rows [1 1 1], [2 −1 1] and [1 2 −1]', 'A holds the coefficients.'],
      ['B is the column 6, 3, 2', 'B holds the constants.'],
      ['X = A⁻¹ · B', 'Multiplying both sides of A · X = B by the inverse of A leaves X alone.'],
      ['The calculator gives the column 1, 2, 3', 'Read x, y and z from top to bottom.'],
      ['(1, 2, 3): 1 + 2 + 3 = 6, 2 − 2 + 3 = 3, 1 + 4 − 3 = 2', 'Check the answer in all three equations.'],
    ],
  }),
  formulate: example('ex-u5-formulate', {
    skill: 'systems.formulateThreeEquations',
    tool: 'matrixLab',
    problem: 'A theater sold 20 tickets for $88: child tickets at $2, student tickets at $4 and adult tickets at $6. It sold twice as many student tickets as child tickets. How many of each?',
    steps: [
      ['c = child, s = student, a = adult tickets', 'Name what each variable counts.'],
      ['c + s + a = 20', 'The numbers of tickets add to 20.'],
      ['2c + 4s + 6a = 88', 'Each price times its count adds to the money.'],
      ['s = 2c, or −2c + s = 0', 'The comparison is the third equation. Move the variables to one side for the matrix.'],
      ['Solve A · X = B: c = 4, s = 8, a = 8', 'Check: 4 + 8 + 8 = 20 and 8 + 32 + 48 = 88.'],
    ],
  }),
};

const unit5 = unit(5, '3×3 systems and matrices', U5, [
  item('tgp-u5-1', {
    standards: ['A2.3B'], dok: 2, band: 1, actions: ['solveSystem'],
    prompt: 'Solve the system $2x + y = 11$ and $x - y = 1$ by elimination. Check your ordered pair in both equations.',
    tool: { method: 'elimination', equations: ['2x + y = 11', 'x - y = 1'], variables: ['x', 'y'], requireVerification: true },
    example: U5.twoByTwo,
    idea: 'Elimination: add or subtract the equations so one variable cancels. Solve for the other, then substitute back.',
    hints: [
      'Look at the y-terms: +y and −y. What happens if you add the two equations?',
      'After adding, only x is left. Solve for x.',
      'Put your x into either equation to find y.',
    ],
    back: ['What is y + (−y)?', ['0', '2y'], '0'],
    solution: ['Add the equations to cancel y.', [
      'Add: (2x + y) + (x − y) = 11 + 1, so 3x = 12.',
      'Divide by 3: x = 4.',
      'Substitute into x − y = 1: 4 − y = 1, so y = 3.',
      'Check: 2(4) + 3 = 11 and 4 − 3 = 1.',
    ], '(4, 3)', 'Stopping after finding x: a solution of a system needs a value for every variable.'],
  }),
  item('tgp-u5-2', {
    standards: ['A2.3B'], dok: 2, band: 2, actions: ['solveSystem'],
    prompt: 'Solve the system $x + y + z = 6$, $x - y + z = 2$ and $x + y - z = 0$ by elimination. Eliminate the same variable from two pairs of equations, then check your ordered triple.',
    tool: { method: 'elimination', equations: ['x + y + z = 6', 'x - y + z = 2', 'x + y - z = 0'], variables: ['x', 'y', 'z'], requireVerification: true },
    example: U5.threeByThree,
    idea: 'Eliminate the same variable twice, with two different pairs of equations. That leaves a smaller system in two variables.',
    hints: [
      'Add equations 1 and 2. Which variable cancels?',
      'Now add equations 2 and 3. The same variable cancels again.',
      'Solve the smaller system, then put those values into an original equation for the last variable.',
    ],
    back: ['To get a 2×2 system, the two pairs must eliminate…', ['the same variable', 'two different variables'], 'the same variable'],
    solution: ['Eliminate y twice, then back-substitute.', [
      'Equation 1 + equation 2: 2x + 2z = 8.',
      'Equation 2 + equation 3: 2x = 2, so x = 1.',
      'Then 2(1) + 2z = 8 gives z = 3.',
      'Equation 1: 1 + y + 3 = 6, so y = 2. The triple (1, 2, 3) checks in all three equations.',
    ], '(1, 2, 3)', 'Eliminating y from one pair and z from the other: the two new equations must have the same two variables.'],
  }),
  item('tgp-u5-3', {
    standards: ['A2.3B'], dok: 3, band: 3, actions: ['solveSystem'],
    prompt: 'Solve the system $x + 2y - z = 4$, $2x - y + z = 6$ and $x + y + 2z = 6$ by elimination. One pair needs an equation multiplied first. Check your ordered triple.',
    tool: { method: 'elimination', equations: ['x + 2y - z = 4', '2x - y + z = 6', 'x + y + 2z = 6'], variables: ['x', 'y', 'z'], requireVerification: true },
    hints: [
      'Equations 1 and 2 have −z and +z. Add them to eliminate z.',
      'To eliminate z from equations 2 and 3, multiply equation 2 by 2 first, then subtract equation 3.',
      'You now have two equations in x and y. Solve them, then find z.',
    ],
    back: ['To cancel +z against +2z, you can multiply the first of those equations by…', ['2, then subtract', '0'], '2, then subtract'],
    solution: ['Eliminate z twice, scaling one equation.', [
      'Equation 1 + equation 2: 3x + y = 10.',
      '2 × equation 2 − equation 3: 3x − 3y = 6, which is x − y = 2.',
      'Add those two: 4x = 12, so x = 3 and y = 1.',
      'Equation 2: 2(3) − 1 + z = 6, so z = 1. The triple (3, 1, 1) checks in all three equations.',
    ], '(3, 1, 1)', 'Multiplying only part of an equation: when you scale an equation, every term is multiplied, the constant too.'],
  }),
  item('tgp-u5-4', {
    standards: ['A2.3B'], dok: 1, band: 1, actions: ['multiplyMatrices'],
    prompt: 'Matrix A shows how many granola bars and smoothies two friends bought. Matrix B shows the price of each. Multiply $A \\cdot B$ to find what each friend paid.',
    tool: {
      matrices: {
        A: { rows: [[3, 2], [1, 4]], rowLabels: ['Ana', 'Ben'], colLabels: ['Bars', 'Smoothies'], caption: 'Items bought' },
        B: { rows: [[2], [5]], rowLabels: ['Bars', 'Smoothies'], colLabels: ['Price ($)'], caption: 'Price of each' },
      },
      left: 'A',
      right: 'B',
      resultName: 'Cost',
      showExpansion: true,
    },
    example: U5.multiply,
    idea: 'To multiply matrices, pair a row of the first with a column of the second: multiply the matching numbers and add.',
    hints: [
      'For Ana, use row 1 of A: 3 bars and 2 smoothies.',
      'Multiply each count by its price, then add the two products.',
      'Do the same for Ben with row 2 of A.',
    ],
    back: ['3 bars at $2 each cost…', ['$6', '$5'], '$6'],
    solution: ['Row times column, for each friend.', [
      'A is 2 × 2 and B is 2 × 1, so the product is 2 × 1: one total for each friend.',
      'Ana: 3(2) + 2(5) = 16.',
      'Ben: 1(2) + 4(5) = 22.',
    ], 'Ana paid $16 and Ben paid $22', 'Adding the counts and prices instead of multiplying: each count is multiplied by its price before the products are added.'],
  }),
  item('tgp-u5-5', {
    standards: ['A2.3B'], dok: 2, band: 2, actions: ['writeMatrixEquation'],
    prompt: 'Write the system $x + 2y - z = 4$, $3x - y = 5$ and $2x + y + 2z = 9$ as a matrix equation $A \\cdot X = B$. Fill in the coefficient matrix, the variable matrix and the constant matrix.',
    tool: { equations: ['x + 2y - z = 4', '3x - y = 5', '2x + y + 2z = 9'] },
    example: U5.matrixEquation,
    idea: 'A holds the coefficients, X the variables, B the constants. A missing variable has coefficient 0, and a variable with no number has coefficient 1 or −1.',
    hints: [
      'Each row of A is one equation: the numbers in front of x, y and z, in that order.',
      'The second equation has no z. What number goes in its z place?',
      '−z has coefficient −1, and x alone has coefficient 1.',
    ],
    back: ['In 3x − y = 5, the coefficient of z is…', ['0', '1'], '0'],
    solution: ['Coefficients, variables, constants.', [
      'Row 1 of A is 1, 2, −1. Row 2 is 3, −1, 0. Row 3 is 2, 1, 2.',
      'X is the column x, y, z.',
      'B is the column 4, 5, 9.',
    ], 'A has rows [1 2 −1], [3 −1 0], [2 1 2]; X is the column x, y, z; B is the column 4, 5, 9', 'Leaving the missing z out of row 2: every row needs three entries, so a missing variable is 0.'],
  }),
  item('tgp-u5-6', {
    standards: ['A2.3B'], dok: 2, band: 3, actions: ['solveMatrixEquation'],
    prompt: 'Solve the system $x + y + z = 10$, $2x - y + z = 6$ and $x + 2y - z = 3$ with matrices. Write $A \\cdot X = B$, then use the calculator to find $X = A^{-1} \\cdot B$.',
    tool: { equations: ['x + y + z = 10', '2x - y + z = 6', 'x + 2y - z = 3'] },
    example: U5.solve,
    idea: 'To solve A · X = B, multiply by the inverse of A: X = A⁻¹ · B. The calculator does the arithmetic; you set up A and B.',
    hints: [
      'Enter the coefficients row by row. −y and −z have coefficient −1.',
      'B is the column of constants: the numbers after the equal signs.',
      'Run A⁻¹ · B and read x, y and z from top to bottom.',
    ],
    back: ['Which matrix holds the numbers after the equal signs?', ['B', 'A'], 'B'],
    solution: ['Set up A and B, then X = A⁻¹ · B.', [
      'A has rows [1 1 1], [2 −1 1] and [1 2 −1]. B is the column 10, 6, 3.',
      'A⁻¹ · B gives the column 2, 3, 5.',
      'Check: 2 + 3 + 5 = 10, 2(2) − 3 + 5 = 6, and 2 + 2(3) − 5 = 3.',
    ], '(2, 3, 5)', 'Entering −y as 1 instead of −1: the sign belongs to the coefficient.'],
  }),
  item('tgp-u5-7', {
    standards: ['A2.3A', 'A2.3B'], dok: 3, band: 3, actions: ['solveMatrixEquation'],
    prompt: 'A snack stand sold 30 items for $64: waters at $1, bags of chips at $2 and sandwiches at $5. It sold 4 more waters than chips and sandwiches together. Let x, y and z be the numbers of waters, chips and sandwiches. Write a matrix equation that models the situation, and solve it.',
    tool: {
      equations: ['x + y + z = 30', 'x + 2y + 5z = 64', 'x = y + z + 4'],
      showEquations: false,
      variableMeanings: { x: 'waters', y: 'bags of chips', z: 'sandwiches' },
    },
    example: U5.formulate,
    idea: 'Each fact in the story is one equation: a total count, a total amount of money, and a comparison. Put the variables on one side before you fill in the matrix.',
    hints: [
      'First fact: the three counts add to 30.',
      'Second fact: each price times its count adds to 64.',
      'Third fact: x = y + z + 4. Move y and z to the left side before you write the row.',
    ],
    back: ['“30 items in all” becomes the equation…', ['x + y + z = 30', 'x + 2y + 5z = 30'], 'x + y + z = 30'],
    solution: ['Three facts, three equations.', [
      'Count: x + y + z = 30. Money: x + 2y + 5z = 64.',
      'Comparison: x = y + z + 4, which is x − y − z = 4.',
      'A has rows [1 1 1], [1 2 5] and [1 −1 −1]. B is the column 30, 64, 4.',
      'A⁻¹ · B gives 17, 6, 7. Check: 17 + 6 + 7 = 30 and 17 + 12 + 35 = 64.',
    ], '17 waters, 6 bags of chips and 7 sandwiches', 'Writing the comparison row as 1, 1, 1 with constant 4: after moving y and z to the left, their coefficients are −1.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 6 */

const U6 = {
  add: example('ex-u6-add', {
    skill: 'polynomials.add',
    tool: 'polynomialWorkshop',
    problem: 'Simplify (2x² − x + 4) + (5x² + 3x − 7).',
    steps: [
      ['2x² + 5x² = 7x²', 'Like terms have the same letter and the same exponent. Add their coefficients.'],
      ['−x + 3x = 2x', '−x means −1x.'],
      ['4 + (−7) = −3', 'Add the constants.'],
      ['7x² + 2x − 3', 'Write the terms from the highest power down.'],
    ],
  }),
  subtract: example('ex-u6-subtract', {
    skill: 'polynomials.subtract',
    tool: 'polynomialWorkshop',
    problem: 'Simplify (4x² + 3x − 2) − (x² − 5x + 6).',
    steps: [
      ['The opposite of x² − 5x + 6 is −x² + 5x − 6', 'Subtracting a polynomial means adding its opposite. Every sign changes.'],
      ['4x² + (−x²) = 3x²', 'Now add the x² terms.'],
      ['3x + 5x = 8x', 'Add the x terms.'],
      ['−2 + (−6) = −8', 'Add the constants.'],
      ['3x² + 8x − 8', 'Write the terms from the highest power down.'],
    ],
  }),
  distribute: example('ex-u6-distribute', {
    skill: 'polynomials.monomialTimesPolynomial',
    tool: 'polynomialWorkshop',
    problem: 'Simplify −2x(x² + 3x − 5).',
    steps: [
      ['−2x · x² = −2x³', 'Multiply the coefficients and add the exponents: x¹ · x² = x³.'],
      ['−2x · 3x = −6x²', 'Negative times positive is negative.'],
      ['−2x · (−5) = 10x', 'Negative times negative is positive.'],
      ['−2x³ − 6x² + 10x', 'No two of these are like terms, so this is the answer.'],
    ],
  }),
  binomials: example('ex-u6-binomials', {
    skill: 'polynomials.binomialTimesBinomial',
    tool: 'polynomialWorkshop',
    problem: 'Simplify (3x + 1)(x − 4).',
    steps: [
      ['3x · x = 3x² and 3x · (−4) = −12x', 'Multiply 3x by each term of x − 4.'],
      ['1 · x = x and 1 · (−4) = −4', 'Multiply 1 by each term of x − 4.'],
      ['−12x + x = −11x', 'The two x terms are like terms.'],
      ['3x² − 11x − 4', 'Write the terms from the highest power down.'],
    ],
  }),
  trinomial: example('ex-u6-trinomial', {
    skill: 'polynomials.binomialTimesTrinomial',
    tool: 'polynomialWorkshop',
    problem: 'Simplify (x + 3)(x² − 2x + 5).',
    steps: [
      ['x · x² = x³, x · (−2x) = −2x², x · 5 = 5x', 'Multiply x by each of the three terms.'],
      ['3 · x² = 3x², 3 · (−2x) = −6x, 3 · 5 = 15', 'Multiply 3 by each of the three terms.'],
      ['−2x² + 3x² = x²', 'Combine the x² terms.'],
      ['5x − 6x = −x', 'Combine the x terms.'],
      ['x³ + x² − x + 15', 'Six cells, two pairs of like terms, four terms in the answer.'],
    ],
  }),
};

const unit6 = unit(6, 'Operations on polynomials', U6, [
  item('tgp-u6-1', {
    standards: ['A2.7B'], dok: 1, band: 1, actions: ['addPolynomials'],
    prompt: 'Simplify $(3x^2 + 2x - 5) + (x^2 - 6x + 1)$. Line up the like terms and add.',
    tool: { polynomial: { operation: 'add', firstPolynomial: '3x^2+2x-5', secondPolynomial: 'x^2-6x+1' } },
    example: U6.add,
    idea: 'Like terms have the same variable and the same exponent. To add them, add the coefficients and keep the exponent.',
    hints: [
      'Which terms go in the same column? Match the exponents.',
      'x² means 1x². Add the coefficients in each column.',
      'Watch the signs: 2x + (−6x) is negative.',
    ],
    back: ['3x² + x² equals…', ['4x²', '4x⁴'], '4x²'],
    solution: ['Add column by column.', [
      'x² terms: 3x² + x² = 4x².',
      'x terms: 2x + (−6x) = −4x.',
      'Constants: −5 + 1 = −4.',
    ], '4x² − 4x − 4', 'Adding the exponents as well as the coefficients: only the coefficients are added.'],
  }),
  item('tgp-u6-2', {
    standards: ['A2.7B'], dok: 2, band: 2, actions: ['subtractPolynomials'],
    prompt: 'Simplify $(5x^2 - 2x + 7) - (2x^2 + 4x - 3)$. Write the opposite of every term of the second polynomial, then add.',
    tool: { polynomial: { operation: 'subtract', firstPolynomial: '5x^2-2x+7', secondPolynomial: '2x^2+4x-3' } },
    example: U6.subtract,
    idea: 'Subtracting a polynomial means adding its opposite: change the sign of every term in the second polynomial, then add.',
    hints: [
      'The minus sign in front changes every term inside the second parentheses, not only the first.',
      'The opposite of −3 is +3. What are the opposites of 2x² and 4x?',
      'Now add each column: −2x and the opposite of 4x are both negative.',
    ],
    back: ['The opposite of −3 is…', ['3', '−3'], '3'],
    solution: ['Change every sign, then add.', [
      'The opposites of 2x², 4x and −3 are −2x², −4x and 3.',
      'x² terms: 5x² − 2x² = 3x².',
      'x terms: −2x − 4x = −6x.',
      'Constants: 7 + 3 = 10.',
    ], '3x² − 6x + 10', 'Changing only the first sign: −(2x² + 4x − 3) changes all three terms, so the −3 becomes +3.'],
  }),
  item('tgp-u6-3', {
    standards: ['A2.7B'], dok: 2, band: 2, actions: ['multiplyPolynomials'],
    prompt: 'Simplify $3x(2x^2 - x + 4)$ with the area model. Fill in every cell, then write the product.',
    tool: { polynomial: { leftFactor: '3x', rightFactor: '2x^2-x+4' } },
    example: U6.distribute,
    idea: 'Distribute: multiply the outside term by every term inside. Multiply the coefficients and add the exponents.',
    hints: [
      'Each cell is 3x times one term of 2x² − x + 4.',
      '3x · 2x²: multiply 3 by 2, and add the exponents of x.',
      '−x means −1x, so its product with 3x is negative.',
    ],
    back: ['x · x² equals…', ['x³', 'x²'], 'x³'],
    solution: ['One row, three cells.', [
      '3x · 2x² = 6x³.',
      '3x · (−x) = −3x².',
      '3x · 4 = 12x.',
      'No two cells are like terms, so the product is their sum.',
    ], '6x³ − 3x² + 12x', 'Multiplying the exponents: x · x² is x³, because the exponents are added.'],
  }),
  item('tgp-u6-4', {
    standards: ['A2.7B'], dok: 2, band: 2, actions: ['multiplyPolynomials'],
    prompt: 'Simplify $(2x - 3)(x + 5)$ with the area model. Fill in every cell, then combine like terms.',
    tool: { polynomial: { leftFactor: '2x-3', rightFactor: 'x+5' } },
    example: U6.binomials,
    idea: 'Two binomials make four products. Two of them are like terms, so they combine into the middle term.',
    hints: [
      'There are four cells: each term of 2x − 3 times each term of x + 5.',
      'Keep the minus sign with the 3 in every product.',
      'Two cells are x terms. Add them for the middle term.',
    ],
    back: ['−3 · 5 equals…', ['−15', '15'], '−15'],
    solution: ['Four cells, then combine.', [
      '2x · x = 2x² and 2x · 5 = 10x.',
      '−3 · x = −3x and −3 · 5 = −15.',
      'Combine the x terms: 10x − 3x = 7x.',
    ], '2x² + 7x − 15', 'Writing 2x² − 15 only: the two middle cells, 10x and −3x, are part of the product.'],
  }),
  item('tgp-u6-5', {
    standards: ['A2.7B'], dok: 3, band: 3, actions: ['multiplyPolynomials'],
    prompt: 'Simplify $(x - 2)(x^2 + 3x - 4)$ with the area model. Fill in every cell, then combine like terms.',
    tool: { polynomial: { leftFactor: 'x-2', rightFactor: 'x^2+3x-4' } },
    example: U6.trinomial,
    idea: 'Every term of the first factor multiplies every term of the second: 2 terms times 3 terms is 6 cells. Then combine like terms.',
    hints: [
      'There are six cells. Start with the row for x.',
      'In the row for −2, every product changes sign.',
      'Look for cells with the same power of x: there is a pair of x² terms and a pair of x terms.',
    ],
    back: ['How many cells does a 2-term by 3-term area model have?', ['6', '5'], '6'],
    solution: ['Six cells, two pairs of like terms.', [
      'Row x: x³, 3x², −4x.',
      'Row −2: −2x², −6x, 8.',
      'Combine: 3x² − 2x² = x² and −4x − 6x = −10x.',
    ], 'x³ + x² − 10x + 8', 'Losing the sign in the −2 row: −2 · (−4) is +8.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 7 */

const U7 = {
  long: example('ex-u7-long', {
    skill: 'division.long',
    tool: 'polynomialWorkshop',
    problem: 'Divide (x² + 6x + 8) ÷ (x + 2) by long division.',
    steps: [
      ['x² ÷ x = x', 'Divide the leading terms. This is the first term of the quotient.'],
      ['x(x + 2) = x² + 2x', 'Multiply that term by the whole divisor.'],
      ['(x² + 6x) − (x² + 2x) = 4x; bring down 8', 'Subtract, then bring down the next term: 4x + 8.'],
      ['4x ÷ x = 4, and 4(x + 2) = 4x + 8', 'Repeat: divide the leading terms and multiply back.'],
      ['(4x + 8) − (4x + 8) = 0', 'Nothing is left, so the remainder is 0.'],
      ['Quotient x + 4, remainder 0', 'Check: (x + 2)(x + 4) = x² + 6x + 8.'],
    ],
  }),
  remainder: example('ex-u7-long-remainder', {
    skill: 'division.longWithRemainder',
    tool: 'polynomialWorkshop',
    problem: 'Divide (3x² − 5x + 1) ÷ (x − 1) by long division.',
    steps: [
      ['3x² ÷ x = 3x, and 3x(x − 1) = 3x² − 3x', 'Divide the leading terms and multiply back.'],
      ['(3x² − 5x) − (3x² − 3x) = −2x; bring down 1', 'Subtracting −3x adds 3x: −5x + 3x = −2x.'],
      ['−2x ÷ x = −2, and −2(x − 1) = −2x + 2', 'Repeat with the new leading term.'],
      ['(−2x + 1) − (−2x + 2) = −1', 'What is left has no x, so it is the remainder.'],
      ['Quotient 3x − 2, remainder −1', 'Check: (x − 1)(3x − 2) − 1 = 3x² − 5x + 1.'],
    ],
  }),
  synthetic: example('ex-u7-synthetic', {
    skill: 'division.synthetic',
    tool: 'polynomialWorkshop',
    problem: 'Divide (x³ + 2x² − 5x − 6) ÷ (x − 2) by synthetic division.',
    steps: [
      ['r = 2; coefficients 1, 2, −5, −6', 'The divisor x − 2 is zero at x = 2. Write only the coefficients.'],
      ['Bring down 1', 'The first coefficient comes straight down.'],
      ['1 · 2 = 2, and 2 + 2 = 4', 'Multiply the bottom number by r, write it in the next column, and add.'],
      ['4 · 2 = 8, and −5 + 8 = 3', 'Repeat in the next column.'],
      ['3 · 2 = 6, and −6 + 6 = 0', 'The last number of the bottom row is the remainder.'],
      ['Quotient x² + 4x + 3, remainder 0', 'The bottom row 1, 4, 3 is the quotient, one degree lower than the dividend.'],
    ],
  }),
  missing: example('ex-u7-missing', {
    skill: 'division.syntheticMissingTerm',
    tool: 'polynomialWorkshop',
    problem: 'Divide (x³ − 3x − 2) ÷ (x + 1) by synthetic division.',
    steps: [
      ['r = −1', 'x + 1 is x − (−1), so the number in the corner is −1.'],
      ['Coefficients 1, 0, −3, −2', 'There is no x² term, so its coefficient is 0. Every power needs a place.'],
      ['Bring down 1; 1 · (−1) = −1, and 0 + (−1) = −1', 'Multiply by r and add.'],
      ['−1 · (−1) = 1, and −3 + 1 = −2', 'Repeat in the next column.'],
      ['−2 · (−1) = 2, and −2 + 2 = 0', 'The remainder is 0.'],
      ['Quotient x² − x − 2', 'The bottom row 1, −1, −2 gives the quotient.'],
    ],
  }),
  value: example('ex-u7-remainder-theorem', {
    skill: 'theorems.remainder',
    tool: 'polynomialWorkshop',
    problem: 'For P(x) = x³ + x² − 4x + 1, find P(2). Is x − 2 a factor?',
    steps: [
      ['P(2) = 2³ + 2² − 4(2) + 1', 'Put 2 in place of every x.'],
      ['8 + 4 − 8 + 1 = 5', 'Work out the powers first, then add.'],
      ['The remainder of P(x) ÷ (x − 2) is 5', 'Remainder Theorem: dividing P(x) by x − r leaves the remainder P(r).'],
      ['x − 2 is not a factor', 'Factor Theorem: x − r is a factor only when P(r) = 0.'],
    ],
  }),
  factor: example('ex-u7-factor-theorem', {
    skill: 'theorems.factor',
    tool: 'polynomialWorkshop',
    problem: 'Use synthetic division to find P(1) for P(x) = x³ − 6x² + 11x − 6. Is x − 1 a factor?',
    steps: [
      ['r = 1; coefficients 1, −6, 11, −6', 'Testing x − 1 means the number in the corner is 1.'],
      ['Bring down 1; 1 · 1 = 1, and −6 + 1 = −5', 'Multiply by r and add.'],
      ['−5 · 1 = −5, and 11 − 5 = 6', 'Repeat in the next column.'],
      ['6 · 1 = 6, and −6 + 6 = 0', 'The last number is the remainder, and it equals P(1).'],
      ['P(1) = 0, so x − 1 is a factor', 'Factor Theorem: a remainder of 0 means x − r divides the polynomial exactly.'],
      ['P(x) = (x − 1)(x² − 5x + 6)', 'The rest of the bottom row, 1, −5, 6, is the quotient.'],
    ],
  }),
};

const unit7 = unit(7, 'Dividing polynomials; the Remainder and Factor Theorems', U7, [
  item('tgp-u7-1', {
    standards: ['A2.7C'], dok: 1, band: 1, actions: ['longDivision'],
    prompt: 'Use long division to find $(x^2 + 7x + 10) \\div (x + 2)$.',
    tool: { polynomial: { dividend: 'x^2+7x+10', divisor: 'x+2' } },
    example: U7.long,
    idea: 'Long division repeats four moves: divide the leading terms, multiply back, subtract, bring down.',
    hints: [
      'Start with the leading terms: x² ÷ x.',
      'Multiply your answer by the whole divisor, x + 2, and subtract it.',
      'Bring down the 10 and repeat with the new leading term.',
    ],
    back: ['What is x² ÷ x?', ['x', 'x²'], 'x'],
    solution: ['Divide, multiply, subtract, bring down.', [
      'x² ÷ x = x, and x(x + 2) = x² + 2x.',
      'Subtract: 7x − 2x = 5x. Bring down 10 to get 5x + 10.',
      '5x ÷ x = 5, and 5(x + 2) = 5x + 10. Subtracting leaves 0.',
    ], 'Quotient x + 5, remainder 0', 'Multiplying back by only the x of the divisor: the new term multiplies the whole divisor, x + 2.'],
  }),
  item('tgp-u7-2', {
    standards: ['A2.7C'], dok: 2, band: 2, actions: ['longDivision'],
    prompt: 'Use long division to find $(2x^2 + 3x - 4) \\div (x - 2)$. This one has a remainder.',
    tool: { polynomial: { dividend: '2x^2+3x-4', divisor: 'x-2' } },
    example: U7.remainder,
    idea: 'When the last subtraction does not leave 0, what is left is the remainder. Subtracting a negative term adds it.',
    hints: [
      '2x² ÷ x gives the first term of the quotient.',
      'When you subtract 2x² − 4x, the −4x becomes +4x: 3x + 4x.',
      'Keep going until what is left has no x. That number is the remainder.',
    ],
    back: ['3x − (−4x) equals…', ['7x', '−x'], '7x'],
    solution: ['Two rounds, then a remainder.', [
      '2x² ÷ x = 2x, and 2x(x − 2) = 2x² − 4x.',
      'Subtract: 3x − (−4x) = 7x. Bring down −4 to get 7x − 4.',
      '7x ÷ x = 7, and 7(x − 2) = 7x − 14.',
      'Subtract: −4 − (−14) = 10. The remainder is 10.',
    ], 'Quotient 2x + 7, remainder 10', 'Subtracting −4x as if it were +4x, which gives −x: subtracting a negative adds.'],
  }),
  item('tgp-u7-3', {
    standards: ['A2.7C'], dok: 2, band: 3, actions: ['longDivision'],
    prompt: 'Use long division to find $(6x^2 + 5x - 4) \\div (2x - 1)$.',
    tool: { polynomial: { dividend: '6x^2+5x-4', divisor: '2x-1' } },
    hints: [
      'Divide the leading terms: 6x² ÷ 2x. Divide the numbers and the letters.',
      'Multiply that term by 2x − 1 and subtract. Subtracting −3x adds 3x.',
      'Repeat with the new leading term. This division comes out even.',
    ],
    back: ['What is 6x² ÷ 2x?', ['3x', '4x'], '3x'],
    solution: ['The divisor starts with 2x, so divide by 2x each round.', [
      '6x² ÷ 2x = 3x, and 3x(2x − 1) = 6x² − 3x.',
      'Subtract: 5x − (−3x) = 8x. Bring down −4 to get 8x − 4.',
      '8x ÷ 2x = 4, and 4(2x − 1) = 8x − 4. Subtracting leaves 0.',
    ], 'Quotient 3x + 4, remainder 0', 'Dividing 6x² by x instead of by 2x: use the whole leading term of the divisor.'],
  }),
  item('tgp-u7-4', {
    standards: ['A2.7C'], dok: 2, band: 2, actions: ['syntheticDivision'],
    prompt: 'Use synthetic division to find $(x^3 - 2x^2 - 5x + 6) \\div (x - 3)$.',
    tool: { polynomial: { dividend: 'x^3-2x^2-5x+6', divisor: 'x-3' } },
    example: U7.synthetic,
    idea: 'Synthetic division is a shortcut for dividing by x − r. It uses only the coefficients: bring down, multiply by r, add.',
    hints: [
      'The number in the corner makes the divisor zero: x − 3 = 0.',
      'Bring the first coefficient down. Multiply it by r and write the product under the next coefficient.',
      'Add each column. The last sum is the remainder; the others are the quotient’s coefficients.',
    ],
    back: ['For the divisor x − 3, the number in the corner is…', ['3', '−3'], '3'],
    solution: ['Bring down, multiply by 3, add.', [
      'r = 3, and the coefficients are 1, −2, −5, 6.',
      'Bring down 1. Then 1 · 3 = 3, and −2 + 3 = 1.',
      '1 · 3 = 3, and −5 + 3 = −2. Then −2 · 3 = −6, and 6 − 6 = 0.',
      'The bottom row 1, 1, −2 gives the quotient x² + x − 2, and the remainder is 0.',
    ], 'Quotient x² + x − 2, remainder 0', 'Starting the quotient with x³: the quotient is one degree lower than the dividend.'],
  }),
  item('tgp-u7-5', {
    standards: ['A2.7C'], dok: 2, band: 3, actions: ['syntheticDivision'],
    prompt: 'Use synthetic division to find $(x^3 - 7x + 6) \\div (x + 3)$. One power of $x$ is missing.',
    tool: { polynomial: { dividend: 'x^3-7x+6', divisor: 'x+3' } },
    example: U7.missing,
    idea: 'Two things to watch: x + 3 means r = −3, and a missing power needs a 0 in its place.',
    hints: [
      'x + 3 is x − (−3). What is r?',
      'The dividend has no x² term. Write 0 for its coefficient.',
      'Multiplying by a negative r changes the sign of each product.',
    ],
    back: ['Which list of coefficients stands for x³ − 7x + 6?', ['1, 0, −7, 6', '1, −7, 6'], '1, 0, −7, 6'],
    solution: ['r = −3, with a 0 for the missing x².', [
      'r = −3, and the coefficients are 1, 0, −7, 6.',
      'Bring down 1. Then 1 · (−3) = −3, and 0 − 3 = −3.',
      '−3 · (−3) = 9, and −7 + 9 = 2. Then 2 · (−3) = −6, and 6 − 6 = 0.',
      'The bottom row 1, −3, 2 gives the quotient x² − 3x + 2.',
    ], 'Quotient x² − 3x + 2, remainder 0', 'Leaving out the 0 for the missing x² term, which puts every number in the wrong column.'],
  }),
  item('tgp-u7-6', {
    standards: ['A2.7D'], dok: 2, band: 2, actions: ['factorPolynomial'],
    prompt: 'Let $P(x) = x^3 - 3x^2 - 4x + 12$. Find $P(1)$, then decide whether $x - 1$ is a factor of $P(x)$.',
    tool: { mode: 'factorZero', polynomial: { coefficients: [1, -3, -4, 12], candidateRoot: 1 } },
    example: U7.value,
    idea: 'Remainder Theorem: P(r) is the remainder when P(x) is divided by x − r. Factor Theorem: x − r is a factor exactly when P(r) = 0.',
    hints: [
      'Put 1 in place of every x in the polynomial.',
      'Any power of 1 is 1, so the terms are 1, −3, −4 and 12.',
      'Is your value of P(1) zero? Only then is x − 1 a factor.',
    ],
    back: ['x − r is a factor of P(x) when P(r) equals…', ['0', '1'], '0'],
    solution: ['Evaluate, then compare with 0.', [
      'P(1) = 1 − 3 − 4 + 12.',
      'That is 6.',
      'P(1) is not 0, so dividing by x − 1 leaves a remainder of 6.',
    ], 'P(1) = 6, so x − 1 is not a factor', 'Calling x − 1 a factor because P(1) came out a whole number: only a value of 0 makes it a factor.'],
  }),
  item('tgp-u7-7', {
    standards: ['A2.7D'], dok: 2, band: 3, actions: ['syntheticDivision'],
    prompt: 'Let $P(x) = x^3 - 3x^2 - 4x + 12$. Use synthetic division to find $P(3)$, then decide whether $x - 3$ is a factor.',
    tool: { polynomial: { dividend: [1, -3, -4, 12], candidateRoot: 3, ask: ['value', 'factor'] } },
    example: U7.factor,
    idea: 'The last number of a synthetic division by x − r is the remainder, and the remainder is P(r). So the table finds P(r) without powers.',
    hints: [
      'Put 3 in the corner and write the coefficients 1, −3, −4, 12.',
      'Bring down, multiply by 3, add. Do it for every column.',
      'The last number of the bottom row is P(3). What does it tell you about x − 3?',
    ],
    back: ['In synthetic division, the last number of the bottom row is the…', ['remainder', 'quotient'], 'remainder'],
    solution: ['The table’s last number is P(3).', [
      'Bring down 1. Then 1 · 3 = 3, and −3 + 3 = 0.',
      '0 · 3 = 0, and −4 + 0 = −4.',
      '−4 · 3 = −12, and 12 − 12 = 0.',
      'The remainder is 0, so P(3) = 0.',
    ], 'P(3) = 0, so x − 3 is a factor', 'Reading the first number of the bottom row as P(3): the value is the last number.'],
  }),
  item('tgp-u7-8', {
    standards: ['A2.7D', 'A2.7C'], dok: 3, band: 3, actions: ['syntheticDivision'],
    prompt: 'Let $P(x) = x^3 + 4x^2 + x - 6$. Use synthetic division with $x + 2$ to find $P(-2)$ and the quotient. Then decide whether $x + 2$ is a factor.',
    tool: { polynomial: { dividend: [1, 4, 1, -6], candidateRoot: -2, ask: ['value', 'quotient', 'factor'] } },
    hints: [
      'x + 2 is x − (−2), so −2 goes in the corner.',
      'Multiplying by −2 changes the sign of each product. Add each column carefully.',
      'The last number is P(−2). The numbers before it are the coefficients of the quotient, which starts with x².',
    ],
    back: ['For the divisor x + 2, the number in the corner is…', ['−2', '2'], '−2'],
    solution: ['One table gives the value, the quotient and the answer about the factor.', [
      'Bring down 1. Then 1 · (−2) = −2, and 4 − 2 = 2.',
      '2 · (−2) = −4, and 1 − 4 = −3.',
      '−3 · (−2) = 6, and −6 + 6 = 0, so P(−2) = 0.',
      'The bottom row 1, 2, −3 gives the quotient, so P(x) = (x + 2)(x² + 2x − 3).',
    ], 'P(−2) = 0; the quotient is x² + 2x − 3; x + 2 is a factor', 'Using 2 in the corner: the divisor x + 2 is zero at x = −2.'],
  }),
]);

/* ---------------------------------------------------------------- Unit 8 */

const U8 = {
  gcf: example('ex-u8-gcf', {
    skill: 'factor.gcf',
    problem: 'Factor 20x³ + 28x.',
    steps: [
      ['The GCF of 20 and 28 is 4', 'Start with the largest number that divides both coefficients.'],
      ['The GCF of x³ and x is x', 'Take the lowest power of x that every term has.'],
      ['20x³ ÷ 4x = 5x² and 28x ÷ 4x = 7', 'Divide each term by the GCF, 4x.'],
      ['4x(5x² + 7)', 'Write the GCF outside and what is left inside.'],
      ['4x · 5x² + 4x · 7 = 20x³ + 28x', 'Check by distributing.'],
    ],
  }),
  trinomial: example('ex-u8-trinomial', {
    skill: 'factor.trinomial',
    tool: 'polynomialWorkshop',
    problem: 'Factor x² + 9x + 14.',
    steps: [
      ['Find two numbers that multiply to 14 and add to 9', 'x² + bx + c = (x + p)(x + q), where p · q = c and p + q = b.'],
      ['Pairs for 14: 1 and 14 (sum 15), 2 and 7 (sum 9)', 'List the factor pairs and their sums. Both numbers are positive because c and b are positive.'],
      ['(x + 2)(x + 7)', 'The pair with the right sum gives the two factors.'],
      ['x² + 7x + 2x + 14 = x² + 9x + 14', 'Check by multiplying back.'],
    ],
  }),
  signs: example('ex-u8-trinomial-signs', {
    skill: 'factor.trinomialNegativeConstant',
    tool: 'polynomialWorkshop',
    problem: 'Factor x² − 3x − 10.',
    steps: [
      ['Find two numbers that multiply to −10 and add to −3', 'A negative product means one number is positive and one is negative.'],
      ['Pairs: 1 and −10 (sum −9), −1 and 10 (9), 2 and −5 (−3), −2 and 5 (3)', 'List the pairs with opposite signs and their sums.'],
      ['(x + 2)(x − 5)', 'The pair 2 and −5 has the sum −3.'],
      ['x² − 5x + 2x − 10 = x² − 3x − 10', 'Check by multiplying back.'],
    ],
  }),
  squares: example('ex-u8-squares', {
    skill: 'factor.differenceOfSquares',
    tool: 'polynomialWorkshop',
    problem: 'Factor x² − 36.',
    steps: [
      ['x² − 36 = x² + 0x − 36', 'There is no x term, so the middle coefficient is 0.'],
      ['Find two numbers that multiply to −36 and add to 0', 'A sum of 0 means the two numbers are opposites.'],
      ['6 and −6', '6 · (−6) = −36 and 6 + (−6) = 0.'],
      ['(x + 6)(x − 6)', 'This is the difference of squares pattern: a² − b² = (a + b)(a − b).'],
      ['x² − 6x + 6x − 36 = x² − 36', 'Check: the middle terms cancel.'],
    ],
  }),
  choose: example('ex-u8-choose', {
    skill: 'factor.chooseMethod',
    tool: 'openSortBoard',
    problem: 'Name the method that factors each one: 3x² + 12x, x² − 81, x² + 6x + 8 and x³ − 27.',
    steps: [
      ['3x² + 12x: common factor', 'Both terms share 3x, and what is left, x + 4, does not factor.'],
      ['x² − 81: difference of two squares', 'Two terms, a minus sign, and both are perfect squares: x² and 9².'],
      ['x² + 6x + 8: trinomial', 'Three terms with x² first: look for two numbers that multiply to 8 and add to 6.'],
      ['x³ − 27: difference of two cubes', 'Two terms that are perfect cubes: x³ and 3³.'],
    ],
  }),
  ac: example('ex-u8-ac', {
    skill: 'factor.trinomialAC',
    problem: 'Factor 5x² + 16x + 3.',
    steps: [
      ['a · c = 5 · 3 = 15', 'When the x² coefficient is not 1, multiply a and c first.'],
      ['Pairs for 15: 1 and 15 (sum 16), 3 and 5 (sum 8)', 'Find the pair that adds to b = 16: 1 and 15.'],
      ['5x² + x + 15x + 3', 'Split the middle term with that pair.'],
      ['x(5x + 1) + 3(5x + 1)', 'Group the first two terms and the last two, and factor each group.'],
      ['(5x + 1)(x + 3)', 'Factor out the binomial the two groups share.'],
      ['5x² + 15x + x + 3 = 5x² + 16x + 3', 'Check by multiplying back.'],
    ],
  }),
  cubes: example('ex-u8-cubes', {
    skill: 'factor.sumDifferenceOfCubes',
    problem: 'Factor 3x⁴ − 81x completely.',
    steps: [
      ['3x(x³ − 27)', 'Always take out the GCF first. Here it is 3x.'],
      ['x³ − 27 = x³ − 3³', 'Two perfect cubes with a minus sign: a difference of cubes, with a = x and b = 3.'],
      ['a³ − b³ = (a − b)(a² + ab + b²)', 'The pattern: the binomial keeps the sign, the middle term of the trinomial has the opposite sign.'],
      ['x³ − 27 = (x − 3)(x² + 3x + 9)', 'Put a = x and b = 3 into the pattern.'],
      ['3x(x − 3)(x² + 3x + 9)', 'Keep the GCF in front. x² + 3x + 9 does not factor further.'],
    ],
  }),
};

const unit8 = unit(8, 'Factoring', U8, [
  item('tgp-u8-1', {
    standards: ['A2.7E'], dok: 1, band: 1, actions: ['multipleResponses'],
    prompt: 'Factor $6x^3 + 9x^2$ by taking out the greatest common factor (GCF).',
    tool: {
      responses: [
        expression('gcf', 'The GCF of 6x³ and 9x²', '3x^2'),
        expression('first', '6x³ ÷ GCF =', '2x'),
        number('second', '9x² ÷ GCF =', 3),
        factored('factored', '6x³ + 9x² =', '3x^2(2x+3)', builtOn(['gcf', 'first', 'second'], '{gcf}({first}+{second})')),
      ],
    },
    example: U8.gcf,
    idea: 'The GCF is the largest number and the lowest power of the variable that every term has. Factoring it out is the first step of every factoring problem.',
    hints: [
      'What is the largest number that divides both 6 and 9?',
      'Both terms have x. Take the lower power.',
      'Divide each term by the GCF to find what stays inside the parentheses.',
    ],
    back: ['x³ ÷ x² equals…', ['x', 'x⁵'], 'x'],
    solution: ['Find the GCF, divide, write the product.', [
      'The GCF of 6 and 9 is 3, and the lower power of x is x², so the GCF is 3x².',
      '6x³ ÷ 3x² = 2x and 9x² ÷ 3x² = 3.',
      'So 6x³ + 9x² = 3x²(2x + 3).',
      'Check: 3x² · 2x + 3x² · 3 = 6x³ + 9x².',
    ], '3x²(2x + 3)', 'Taking out only 3 or only x²: the GCF has both the number and the variable part.'],
  }),
  item('tgp-u8-2', {
    standards: ['A2.7E'], dok: 1, band: 1, actions: ['factorPolynomial'],
    prompt: 'Factor $x^2 + 7x + 12$. Find two numbers that multiply to 12 and add to 7.',
    tool: { polynomial: { coefficients: [1, 7, 12] } },
    example: U8.trinomial,
    idea: 'x² + bx + c = (x + p)(x + q) when p · q = c and p + q = b. List the factor pairs of c and look at their sums.',
    hints: [
      'List the pairs of whole numbers that multiply to 12.',
      'Add each pair. Which pair has a sum of 7?',
      'Both numbers are positive here, because the product and the sum are both positive.',
    ],
    back: ['Which pair multiplies to 12?', ['2 and 6', '5 and 7'], '2 and 6'],
    solution: ['Factor pairs of 12 and their sums.', [
      'Pairs for 12: 1 and 12 (sum 13), 2 and 6 (sum 8), 3 and 4 (sum 7).',
      'The pair 3 and 4 adds to 7.',
      'So x² + 7x + 12 = (x + 3)(x + 4).',
      'Check: x² + 4x + 3x + 12 = x² + 7x + 12.',
    ], '(x + 3)(x + 4)', 'Choosing 2 and 6 because they multiply to 12: the pair also has to add to 7.'],
  }),
  item('tgp-u8-3', {
    standards: ['A2.7E'], dok: 2, band: 2, actions: ['factorPolynomial'],
    prompt: 'Factor $x^2 - 2x - 15$. Find two numbers that multiply to $-15$ and add to $-2$.',
    tool: { polynomial: { coefficients: [1, -2, -15] } },
    example: U8.signs,
    idea: 'When c is negative, the two numbers have opposite signs. The one with the larger size takes the sign of b.',
    hints: [
      'A negative product means one number is positive and the other is negative.',
      'Try each factor pair of 15 with one of its two numbers negative.',
      'The sum is negative, so the larger of the two numbers is the negative one.',
    ],
    back: ['Two numbers multiply to −15. Their signs are…', ['opposite', 'the same'], 'opposite'],
    solution: ['Opposite signs, sum −2.', [
      'Pairs for −15: 1 and −15 (sum −14), −1 and 15 (14), 3 and −5 (−2), −3 and 5 (2).',
      'The pair 3 and −5 adds to −2.',
      'So x² − 2x − 15 = (x + 3)(x − 5).',
      'Check: x² − 5x + 3x − 15 = x² − 2x − 15.',
    ], '(x + 3)(x − 5)', 'Writing (x − 3)(x + 5): that multiplies out to x² + 2x − 15, with the wrong sign on the middle term.'],
  }),
  item('tgp-u8-4', {
    standards: ['A2.7E'], dok: 2, band: 2, actions: ['factorPolynomial'],
    prompt: 'Factor $x^2 - 49$. Its middle term is $0x$, so find two numbers that multiply to $-49$ and add to 0.',
    tool: { polynomial: { coefficients: [1, 0, -49] } },
    example: U8.squares,
    idea: 'A difference of two squares, a² − b², factors as (a + b)(a − b). The two numbers are opposites, so the middle terms cancel.',
    hints: [
      'Two numbers that add to 0 are opposites, like 4 and −4.',
      'Which number times itself is 49?',
      'Use that number once as a positive and once as a negative.',
    ],
    back: ['Two numbers add to 0. They are…', ['opposites, like 4 and −4', 'both 0'], 'opposites, like 4 and −4'],
    solution: ['Opposites that multiply to −49.', [
      '49 = 7 · 7, so use 7 and −7.',
      '7 · (−7) = −49 and 7 + (−7) = 0.',
      'So x² − 49 = (x + 7)(x − 7).',
      'Check: x² − 7x + 7x − 49 = x² − 49.',
    ], '(x + 7)(x − 7)', 'Writing (x − 7)(x − 7): that is x² − 14x + 49, a perfect square trinomial, not a difference of squares.'],
  }),
  item('tgp-u8-5', {
    standards: ['A2.7E'], dok: 2, band: 2, actions: ['sortIntoCategories'],
    prompt: 'Read the structure before you factor. Sort each polynomial by the method that factors it.',
    tool: sortBoard([
      { id: 'gcf', label: 'Common factor (GCF) only', cards: [['c1', '5x² + 10x'], ['c2', '7x³ − 21x']] },
      { id: 'squares', label: 'Difference of two squares', cards: [['c3', 'x² − 36'], ['c4', '4x² − 9']] },
      { id: 'trinomial', label: 'Trinomial: two numbers with a product and a sum', cards: [['c5', 'x² + 9x + 20'], ['c6', 'x² − 4x − 12']] },
      { id: 'cubes', label: 'Sum or difference of two cubes', cards: [['c7', 'x³ + 8'], ['c8', '27x³ − 1']] },
    ], ['c5', 'c3', 'c7', 'c1', 'c8', 'c6', 'c4', 'c2']),
    example: U8.choose,
    idea: 'Count the terms and look at their shape: a shared factor, two squares with a minus, three terms, or two cubes.',
    hints: [
      'Count the terms first. Three terms with x² first is a trinomial.',
      'Two terms with a minus sign: are both perfect squares, or both perfect cubes?',
      'If every term shares a number or an x, and nothing else works afterward, it is a common factor only.',
    ],
    back: ['How many terms does a trinomial have?', ['Three', 'Two'], 'Three'],
    solution: ['Count the terms, then look at the shape.', [
      'Common factor only: 5x² + 10x = 5x(x + 2) and 7x³ − 21x = 7x(x² − 3).',
      'Difference of two squares: x² − 36 = x² − 6² and 4x² − 9 = (2x)² − 3².',
      'Trinomial: x² + 9x + 20 and x² − 4x − 12 each have three terms.',
      'Cubes: x³ + 8 = x³ + 2³ and 27x³ − 1 = (3x)³ − 1³.',
    ], 'GCF: 5x² + 10x, 7x³ − 21x. Squares: x² − 36, 4x² − 9. Trinomial: x² + 9x + 20, x² − 4x − 12. Cubes: x³ + 8, 27x³ − 1', 'Putting x³ + 8 with the squares: 8 is 2³, a cube, and a sum of squares would not factor anyway.'],
  }),
  item('tgp-u8-6', {
    standards: ['A2.7E'], dok: 2, band: 3, actions: ['multipleResponses'],
    prompt: 'Factor $3x^2 + 8x + 4$ with the $ac$ method, one step at a time.',
    tool: {
      responses: [
        number('ac', 'a · c =', 12),
        number('small', 'Two numbers multiply to a · c and add to 8. The smaller one is', 2),
        number('large', 'The larger one is', 6),
        expression('binomial', 'Split and group: 3x² + 2x + 6x + 4 = x(3x + 2) + 2(3x + 2). The binomial both groups share is', '3x+2'),
        factored('factored', '3x² + 8x + 4 =', '(3x+2)(x+2)', { checkpoint: { kind: 'factorPair' } }),
      ],
    },
    example: U8.ac,
    idea: 'When a is not 1: multiply a · c, find the pair that multiplies to a · c and adds to b, split the middle term, then factor by grouping.',
    hints: [
      'Here a = 3, b = 8 and c = 4.',
      'List the pairs that multiply to a · c and add each pair.',
      'After you split 8x into two terms, factor the first two terms and the last two terms separately.',
    ],
    back: ['In 3x² + 8x + 4, the value of a is…', ['3', '8'], '3'],
    solution: ['a · c, pair, split, group.', [
      'a · c = 3 · 4 = 12. The pair 2 and 6 multiplies to 12 and adds to 8.',
      'Split the middle term: 3x² + 2x + 6x + 4.',
      'Group: x(3x + 2) + 2(3x + 2).',
      'Factor out 3x + 2: (3x + 2)(x + 2).',
    ], '(3x + 2)(x + 2)', 'Using the pair for c alone, 2 and 2, and writing (x + 2)(x + 2): with a = 3 the pair must multiply to a · c.'],
  }),
  item('tgp-u8-7', {
    standards: ['A2.7E'], dok: 3, band: 3, actions: ['multipleResponses'],
    prompt: 'Factor $2x^4 + 16x$ completely. Take out the GCF first, then factor the sum of two cubes.',
    tool: {
      responses: [
        expression('gcf', 'The GCF of 2x⁴ and 16x', '2x'),
        expression('left', 'After the GCF comes out, what is left in the parentheses?', 'x^3+8'),
        number('b', 'x³ + 8 = a³ + b³ with a = x. The value of b is', 2),
        factored('cubes', 'Use a³ + b³ = (a + b)(a² − ab + b²). x³ + 8 =', '(x+2)(x^2-2x+4)'),
        factored('factored', 'Completely factored: 2x⁴ + 16x =', '2x(x+2)(x^2-2x+4)', builtOn(['gcf', 'cubes'], '{gcf}{cubes}')),
      ],
    },
    example: U8.cubes,
    idea: 'Factor completely: GCF first, then look at what is left. Two perfect cubes follow a³ ± b³ = (a ± b)(a² ∓ ab + b²).',
    hints: [
      'Both terms share a number and an x. Take the largest of each.',
      'What is left has two terms. Is 8 a perfect cube?',
      'In the pattern, the binomial keeps the plus sign and the middle term of the trinomial is negative.',
    ],
    back: ['Which of these is a perfect cube?', ['27, because 3 · 3 · 3 = 27', '9, because 3 · 3 = 9'], '27, because 3 · 3 · 3 = 27'],
    solution: ['GCF, then the sum of cubes.', [
      'The GCF is 2x: 2x⁴ + 16x = 2x(x³ + 8).',
      'x³ + 8 = x³ + 2³, a sum of cubes with a = x and b = 2.',
      'a³ + b³ = (a + b)(a² − ab + b²) gives (x + 2)(x² − 2x + 4).',
      'So 2x⁴ + 16x = 2x(x + 2)(x² − 2x + 4).',
    ], '2x(x + 2)(x² − 2x + 4)', 'Writing the trinomial as x² + 2x + 4: in a sum of cubes the middle term of the trinomial is negative.'],
  }),
]);

export const UNITS_5_TO_8 = [unit5, unit6, unit7, unit8];
