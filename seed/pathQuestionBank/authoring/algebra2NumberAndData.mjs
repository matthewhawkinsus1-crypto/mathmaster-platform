// Algebra II — number and algebraic methods, and data modeling (A2.7A – A2.8C).
//
// This cluster is where Algebra II does its symbolic housekeeping: complex
// numbers, polynomial arithmetic and factoring, rational and radical
// expressions, and then choosing and using a data model. The temptation in a
// bank like this is to write fifty "simplify" items. These are written so that
// at least half of every standard asks the student to interpret, compare, or
// reason backwards instead.

import {
  standard, choice, numeric, expression, equation, interval, shortText, parts,
  table, steps, expressions, itemList,
} from './kit.mjs';

export const ALGEBRA2_NUMBER_DATA_STANDARDS = [

  // --- A2.7A Complex number arithmetic ---------------------------------------
  standard('A2.7A', [
    expression({
      code: 'A2.7A', slug: 'add-subtract', band: 3, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $(5 + 3i) - (2 - 7i)$ in the form $a + bi$.',
      expected: '3 + 10i',
      accepted: ['3+10i', '10i + 3'],
      review: {
        headline: 'Combine real with real and imaginary with imaginary.',
        reasoning: [
          'Distributing the subtraction flips both signs in the second number.',
          'The real parts combine to 3 and the imaginary parts combine to $10i$.',
        ],
        answer: '$3 + 10i$',
      },
      feedback: ['Did the subtraction reach both terms in the second parentheses?'],
      hints: ['Treat $i$ the way you would treat a variable, then handle the subtraction sign carefully across both terms.'],
      misconceptions: ['Subtracting only the first term inside the parentheses.'],
    }),

    expression({
      code: 'A2.7A', slug: 'multiply', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $(4 + i)(2 - 3i)$ in the form $a + bi$.',
      expected: '11 - 10i',
      accepted: ['11-10i', '-10i + 11'],
      review: {
        headline: 'Multiply out, then replace $i^2$.',
        reasoning: [
          'Distributing gives $8 - 12i + 2i - 3i^2$.',
          'Because $i^2 = -1$, the last term becomes $+3$, leaving $11 - 10i$.',
        ],
        answer: '$11 - 10i$',
      },
      feedback: ['What does $i^2$ equal? That term is not staying as it is.'],
      hints: ['Distribute completely first. Then look for a squared imaginary unit and replace it with its value.'],
    }),

    choice({
      code: 'A2.7A', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student simplifies $(3i)^2$ and writes $9i$. Which line of reasoning corrects the error?',
      stimulus: steps([
        'Square the coefficient: $3^2 = 9$',
        'Leave the $i$ alone: $9i$',
      ]),
      options: [
        ['Squaring must reach the $i$ as well, and $i^2$ is a real number, so the result is real', true],
        ['The coefficient should not be squared, only the $i$', false],
        ['$i^2$ equals $1$, so the answer is $9$', false],
        ['The expression cannot be simplified at all', false],
      ],
      review: {
        headline: 'The exponent applies to the whole product.',
        reasoning: [
          'Squaring $3i$ squares both the 3 and the $i$.',
          'Since $i^2 = -1$, the imaginary unit disappears and the result is a negative real number.',
        ],
        answer: '$(3i)^2 = -9$',
      },
      feedback: ['Does the exponent outside the parentheses apply to everything inside?'],
      hints: ['Rewrite the square as a product of two identical factors and multiply them out term by term.'],
    }),

    choice({
      code: 'A2.7A', slug: 'why-complex', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'A quadratic equation with real coefficients has a negative discriminant. What does that tell you about its solutions?',
      options: [
        ['They form a conjugate pair of complex numbers, so the parabola misses the $x$-axis', true],
        ['There are no solutions of any kind', false],
        ['There is exactly one repeated real solution', false],
        ['There are two real solutions that are very close together', false],
      ],
      review: {
        headline: 'A negative under the radical produces imaginary parts.',
        reasoning: [
          'The quadratic formula takes the square root of the discriminant, and a negative radicand brings in $i$.',
          'The two solutions differ only in the sign of the imaginary part, which is what conjugate means.',
        ],
        answer: 'Two complex conjugate solutions; no $x$-intercepts.',
      },
      feedback: ['Where does the discriminant sit inside the quadratic formula?'],
      hints: ['Look at which operation is performed on the discriminant, and what that operation does to a negative input.'],
    }),

    parts({
      code: 'A2.7A', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'An electronics problem needs two complex numbers whose sum is $6 + 0i$ and whose difference (first minus second) is $0 + 8i$. Give the first number as $a + bi$.',
      fields: [
        { id: 'a', label: 'Real part $a$', profile: 'number', expected: '3' },
        { id: 'b', label: 'Imaginary coefficient $b$', profile: 'number', expected: '4' },
      ],
      review: {
        headline: 'Real and imaginary parts can be solved separately.',
        reasoning: [
          'The real parts satisfy their own sum-and-difference system, and so do the imaginary coefficients.',
          'Each pair of conditions has one solution, giving $3 + 4i$ and $3 - 4i$.',
        ],
        answer: '$3 + 4i$',
      },
      feedback: ['Can you treat the real parts and the imaginary parts as two independent problems?'],
      hints: ['Set up one sum-and-difference system for the real parts and a second one for the imaginary coefficients.'],
    }),
  ]),

  // --- A2.7B Polynomial addition, subtraction and multiplication -------------
  standard('A2.7B', [
    expression({
      code: 'A2.7B', slug: 'subtract', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $(4x^3 - 2x + 7) - (x^3 + 5x^2 - 2x)$ in simplified form.',
      expected: '3x^3 - 5x^2 + 7',
      accepted: ['3x^3-5x^2+7', '3x^3 - 5x^2 + 7'],
      review: {
        headline: 'Distribute the subtraction to every term.',
        reasoning: [
          'Subtracting the second polynomial changes the sign of all three of its terms.',
          'The $x$ terms cancel completely, and there is no $x^2$ term in the first polynomial to pair with.',
        ],
        answer: '$3x^3 - 5x^2 + 7$',
      },
      feedback: ['Check the sign on every term of the second polynomial, including the last one.'],
      hints: ['Rewrite the subtraction as adding the opposite of each term, then group like degrees.'],
      misconceptions: ['Distributing the minus sign to only the first term.'],
    }),

    expression({
      code: 'A2.7B', slug: 'multiply-trinomial', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $(x + 3)(x^2 - 2x + 5)$ in expanded form.',
      expected: 'x^3 + x^2 - x + 15',
      accepted: ['x^3+x^2-x+15'],
      review: {
        headline: 'Every term in the first factor meets every term in the second.',
        reasoning: [
          'Distributing $x$ gives $x^3 - 2x^2 + 5x$, and distributing 3 gives $3x^2 - 6x + 15$.',
          'Combining like degrees collapses six terms down to four.',
        ],
        answer: '$x^3 + x^2 - x + 15$',
      },
      feedback: ['How many products should you have before you combine anything? Count them.'],
      hints: ['Multiply the first factor through the second one term at a time, keeping the two partial results separate until the end.'],
    }),

    numeric({
      code: 'A2.7B', slug: 'degree-and-lead', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'A degree 4 polynomial is multiplied by a degree 3 polynomial. What is the degree of the product?',
      expected: '7',
      review: {
        headline: 'Degrees add under multiplication.',
        reasoning: [
          'The highest-degree term of the product comes from multiplying the two leading terms.',
          'Multiplying powers of the same base adds the exponents, and no other pair of terms can reach that degree.',
        ],
        answer: 'Degree 7',
      },
      feedback: ['Which pair of terms produces the highest power in the product?'],
      hints: ['Think only about the leading terms and what happens to their exponents when they multiply.'],
    }),

    choice({
      code: 'A2.7B', slug: 'area-model', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'The partial products of a multiplication are organized in the grid. Which product does the grid represent?',
      stimulus: table(['$\\times$', '$2x$', '$-5$'], [['$x$', '$2x^2$', '$-5x$'], ['$4$', '$8x$', '$-20$']]),
      options: [
        ['$(x + 4)(2x - 5)$', true],
        ['$(x - 4)(2x + 5)$', false],
        ['$(2x + 4)(x - 5)$', false],
        ['$(x + 4)(2x + 5)$', false],
      ],
      review: {
        headline: 'The grid headers are the factors.',
        reasoning: [
          'The row labels form one factor and the column labels form the other.',
          'The signs inside the grid confirm which header carries the negative.',
        ],
        answer: '$(x + 4)(2x - 5)$',
      },
      feedback: ['Read the labels on the edges of the grid rather than the entries inside it.'],
      hints: ['Assemble one factor from the row headers and the other from the column headers, then check one interior cell.'],
    }),

    expression({
      code: 'A2.7B', slug: 'context-volume', band: 4, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'A rectangular box has height $x$, width $x + 2$, and length $x + 5$. Write its volume as an expanded polynomial in $x$.',
      expected: 'x^3 + 7x^2 + 10x',
      accepted: ['x^3+7x^2+10x'],
      review: {
        headline: 'Volume is the product of the three dimensions.',
        reasoning: [
          'Multiplying the two binomials first gives $x^2 + 7x + 10$.',
          'Multiplying that by the height distributes $x$ across all three terms.',
        ],
        answer: '$x^3 + 7x^2 + 10x$',
      },
      feedback: ['Multiply two of the dimensions first, then bring in the third.'],
      hints: ['Choose the two factors that are easiest to multiply, expand them, and then distribute the remaining dimension.'],
    }),
  ]),

  // --- A2.7C Polynomial division ----------------------------------------------
  standard('A2.7C', [
    expression({
      code: 'A2.7C', slug: 'exact-quotient', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Divide $x^3 - 4x^2 + x + 6$ by $x - 3$. Write the quotient.',
      expected: 'x^2 - x - 2',
      accepted: ['x^2-x-2'],
      review: {
        headline: 'The division comes out even here.',
        reasoning: [
          'Synthetic division with 3 produces the coefficients 1, $-1$, $-2$ and a remainder of 0.',
          'A zero remainder means $x - 3$ is a factor of the original polynomial.',
        ],
        answer: '$x^2 - x - 2$',
      },
      feedback: ['What number do you use in synthetic division when the divisor is $x - 3$?'],
      hints: ['Line up the coefficients in order, including any missing degree as a zero, before you start.'],
    }),

    numeric({
      code: 'A2.7C', slug: 'remainder', band: 3, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'When $p(x) = 2x^3 + x^2 - 5x + 4$ is divided by $x - 1$, what is the remainder?',
      expected: '2',
      review: {
        headline: 'The remainder theorem turns division into evaluation.',
        reasoning: [
          'Dividing by $x - c$ leaves a remainder equal to $p(c)$.',
          'Evaluating the polynomial at 1 adds the coefficients, giving the remainder directly.',
        ],
        answer: '2',
      },
      feedback: ['Is there a shortcut that avoids doing the whole division?'],
      hints: ['The remainder theorem lets you substitute a single value instead of dividing. Which value does the divisor point to?'],
    }),

    choice({
      code: 'A2.7C', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student divides $x^3 - 8$ by $x - 2$ using synthetic division and writes only three numbers in the top row: 1, 0, $-8$. What did they forget?',
      options: [
        ['A zero placeholder for the missing $x$ term, so there should be four coefficients', true],
        ['Nothing — a cubic has three coefficients', false],
        ['The divisor should have been written as $-2$', false],
        ['They should have written the coefficients in reverse order', false],
      ],
      review: {
        headline: 'Every degree needs a slot, even the absent ones.',
        reasoning: [
          'A cubic has four coefficient positions: $x^3$, $x^2$, $x$, and the constant.',
          'Skipping a missing degree shifts every later coefficient into the wrong column.',
        ],
        answer: 'Use 1, 0, 0, $-8$.',
      },
      feedback: ['Count the degrees a cubic can have, then count the numbers written down.'],
      hints: ['Write out the polynomial with every power from the highest down to the constant, filling in the absent ones.'],
      misconceptions: ['Omitting placeholders for missing degrees.'],
    }),

    choice({
      code: 'A2.7C', slug: 'interpret-zero-remainder', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Dividing a polynomial by $x - 7$ gives a remainder of zero. What does that tell you?',
      options: [
        ['$x = 7$ is a zero of the polynomial and $x - 7$ is one of its factors', true],
        ['$x = -7$ is a zero of the polynomial', false],
        ['The polynomial has degree 7', false],
        ['The polynomial has no real zeros', false],
      ],
      review: {
        headline: 'Zero remainder means clean factorization.',
        reasoning: [
          'If nothing is left over, the divisor multiplies the quotient back to the original polynomial exactly.',
          'The input that makes the divisor zero therefore makes the whole polynomial zero.',
        ],
        answer: '$x - 7$ is a factor; 7 is a zero.',
      },
      feedback: ['What input makes the divisor itself equal to zero?'],
      hints: ['Write the polynomial as divisor times quotient and ask what happens when the divisor equals zero.'],
    }),

    expression({
      code: 'A2.7C', slug: 'context-rate', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A rectangular garden has area $2x^2 + 11x + 12$ square feet and width $x + 4$ feet. Write an expression for its length.',
      expected: '2x + 3',
      accepted: ['2x+3', '3 + 2x'],
      review: {
        headline: 'Area divided by one dimension gives the other.',
        reasoning: [
          'Dividing the area expression by the given width undoes the multiplication that produced it.',
          'The division comes out even, which it must for a rectangle with these dimensions.',
        ],
        answer: '$2x + 3$ feet',
      },
      feedback: ['Which operation reverses "length times width"?'],
      hints: ['Set up the division of the area expression by the known dimension, or factor the area and see which factor matches the width.'],
    }),
  ]),

  // --- A2.7D Linear factors of degree 3 and 4 polynomials --------------------
  standard('A2.7D', [
    choice({
      code: 'A2.7D', slug: 'rational-root-candidates', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'For $p(x) = 2x^3 + 3x^2 - 8x + 3$, which set lists the possible rational zeros?',
      options: [
        ['$\\pm 1, \\pm 3, \\pm \\frac{1}{2}, \\pm \\frac{3}{2}$', true],
        ['$\\pm 1, \\pm 2, \\pm 3$', false],
        ['$\\pm 2, \\pm 3, \\pm \\frac{2}{3}$', false],
        ['$\\pm 1, \\pm 3$ only', false],
      ],
      review: {
        headline: 'Factors of the constant over factors of the leading coefficient.',
        reasoning: [
          'The numerators come from the divisors of the constant term.',
          'The denominators come from the divisors of the leading coefficient, which is why halves appear here.',
        ],
        answer: '$\\pm 1, \\pm 3, \\pm \\frac{1}{2}, \\pm \\frac{3}{2}$',
      },
      feedback: ['Which coefficient supplies the numerators, and which supplies the denominators?'],
      hints: ['List the divisors of the constant term and the divisors of the leading coefficient separately, then form every quotient.'],
    }),

    expression({
      code: 'A2.7D', slug: 'full-factorization', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^3 - 2x^2 - 5x + 6$ completely into linear factors.',
      expected: '(x - 1)(x + 2)(x - 3)',
      accepted: ['(x-1)(x+2)(x-3)', '(x-1)(x-3)(x+2)', '(x+2)(x-1)(x-3)'],
      review: {
        headline: 'Find one zero, divide, then factor what is left.',
        reasoning: [
          'Testing small candidates shows that $x = 1$ makes the polynomial zero.',
          'Dividing out that factor leaves a quadratic that factors into two more linear pieces.',
        ],
        answer: '$(x - 1)(x + 2)(x - 3)$',
      },
      feedback: ['Test a few simple candidate zeros before doing any division.'],
      hints: ['Substitute the smallest candidate values one at a time until the polynomial evaluates to zero, then divide by the factor you found.'],
    }),

    choice({
      code: 'A2.7D', slug: 'from-graph-zeros', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'graph',
      prompt: 'A degree 3 polynomial crosses the $x$-axis at $-4$, $0$, and $2$, and its leading coefficient is 1. Which expression is the polynomial?',
      options: [
        ['$x(x + 4)(x - 2)$', true],
        ['$x(x - 4)(x + 2)$', false],
        ['$(x + 4)(x - 2)$', false],
        ['$x(x + 4)(x + 2)$', false],
      ],
      review: {
        headline: 'Each $x$-intercept contributes one linear factor.',
        reasoning: [
          'A zero at $c$ corresponds to the factor $x - c$, so the signs flip relative to the intercepts.',
          'Three intercepts and degree 3 means exactly three linear factors and no extras.',
        ],
        answer: '$x(x + 4)(x - 2)$',
      },
      feedback: ['If a graph crosses at $-4$, is the factor $x + 4$ or $x - 4$?'],
      hints: ['Write the factor that becomes zero at each intercept, one intercept at a time.'],
      misconceptions: ['Copying the intercept sign straight into the factor.'],
    }),

    choice({
      code: 'A2.7D', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student factors a degree 4 polynomial, finds three linear factors, and concludes the polynomial is fully factored. Why is that conclusion premature?',
      options: [
        ['Three linear factors account for only degree 3, so at least one more factor is unaccounted for', true],
        ['A degree 4 polynomial can never have three linear factors', false],
        ['Linear factors must always come in pairs', false],
        ['The conclusion is fine; degree 4 polynomials have three factors', false],
      ],
      review: {
        headline: 'The degrees of the factors must add back to the original degree.',
        reasoning: [
          'Multiplying linear factors adds one degree each, so three of them reach only degree 3.',
          'The missing piece may be another linear factor or an irreducible quadratic.',
        ],
        answer: 'The degrees do not add up yet.',
      },
      feedback: ['Add up the degrees of the factors found so far and compare with the original degree.'],
      hints: ['Ask what degree you get when you multiply the factors the student already has.'],
    }),

    numeric({
      code: 'A2.7D', slug: 'context-zero', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A box is built from a sheet by cutting squares of side $x$ from the corners, giving volume $V(x) = x(10 - 2x)(14 - 2x)$ cubic inches. Not counting $x = 0$, what is the smallest positive value of $x$ that makes the volume zero?',
      expected: '5',
      unit: 'inches',
      review: {
        headline: 'Each factor gives a value that flattens the box.',
        reasoning: [
          'Setting each factor to zero gives $x = 0$, $x = 5$, and $x = 7$.',
          'The smaller nonzero one is where the shorter side has been cut away entirely.',
        ],
        answer: '5 inches',
      },
      feedback: ['Set each factor equal to zero separately and compare the results.'],
      hints: ['A product is zero exactly when one of its factors is zero. Solve each factor on its own.'],
    }),
  ]),

  // --- A2.7E Linear and quadratic factors, cubes, grouping -------------------
  standard('A2.7E', [
    expression({
      code: 'A2.7E', slug: 'difference-of-cubes', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^3 - 27$ completely over the real numbers.',
      expected: '(x - 3)(x^2 + 3x + 9)',
      accepted: ['(x-3)(x^2+3x+9)'],
      review: {
        headline: 'A difference of cubes splits into a linear and a quadratic factor.',
        reasoning: [
          'The linear factor is the difference of the cube roots.',
          'The quadratic factor has no real zeros, so the factoring stops there over the reals.',
        ],
        answer: '$(x - 3)(x^2 + 3x + 9)$',
      },
      feedback: ['What are the cube roots of the two terms?'],
      hints: ['Identify the cube root of each term first; the linear factor is built from those two roots.'],
    }),

    expression({
      code: 'A2.7E', slug: 'grouping', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Factor $x^3 + 4x^2 - 9x - 36$ by grouping.',
      expected: '(x + 4)(x - 3)(x + 3)',
      accepted: ['(x+4)(x-3)(x+3)', '(x+4)(x+3)(x-3)'],
      review: {
        headline: 'Group, factor each pair, then factor the difference of squares.',
        reasoning: [
          'The first pair gives $x^2(x + 4)$ and the second gives $-9(x + 4)$.',
          'That common binomial factors out, leaving $x^2 - 9$, which splits further.',
        ],
        answer: '$(x + 4)(x - 3)(x + 3)$',
      },
      feedback: ['After the first grouping step, look at whether the leftover factor can still be factored.'],
      hints: ['Split the four terms into two pairs, pull the greatest common factor from each pair, and check that the same binomial appears twice.'],
    }),

    choice({
      code: 'A2.7E', slug: 'select-strategy', band: 3, dok: 2, taskType: 'comparison', representation: 'verbal',
      prompt: 'Which factoring strategy is the natural first move for $8x^3 + 125$?',
      options: [
        ['Sum of cubes, because both terms are perfect cubes', true],
        ['Grouping, because there are two terms', false],
        ['Difference of squares, because both terms are perfect squares', false],
        ['Quadratic trinomial factoring', false],
      ],
      review: {
        headline: 'Match the shape of the expression to the pattern.',
        reasoning: [
          'A two-term expression with both terms perfect cubes fits the sum-of-cubes pattern.',
          'Grouping needs four terms, and a sum of squares does not factor over the reals.',
        ],
        answer: 'Sum of cubes.',
      },
      feedback: ['How many terms are there, and are they perfect cubes, perfect squares, or neither?'],
      hints: ['Count the terms first, then check what kind of perfect power each term is.'],
    }),

    choice({
      code: 'A2.7E', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student factors $x^3 + 8$ as $(x + 2)(x^2 + 4x + 4)$. Which check exposes the error fastest?',
      options: [
        ['Expanding the proposed factors does not reproduce the original expression', true],
        ['A sum of cubes cannot be factored at all', false],
        ['The linear factor should be $x - 2$', false],
        ['The original expression has degree 2, not 3', false],
      ],
      review: {
        headline: 'Multiply the factors back and compare.',
        reasoning: [
          'The middle term of the quadratic factor in a sum of cubes is not double the cube root; it is the negative of the product of the roots.',
          'Expanding the student\'s answer produces extra terms that the original does not have.',
        ],
        answer: 'The correct quadratic factor is $x^2 - 2x + 4$.',
      },
      feedback: ['Multiply the two proposed factors together and see what you get.'],
      hints: ['Verification does not require remembering the pattern — just expand the answer and compare it term by term with the original.'],
    }),

    numeric({
      code: 'A2.7E', slug: 'count-real-zeros', band: 4, dok: 3, taskType: 'interpretation', representation: 'table',
      prompt: 'A polynomial has been factored as $(x - 2)(x + 5)(x^2 + 1)$. The table records whether each factor has a real zero. How many real zeros does the whole polynomial have?',
      stimulus: table(['Factor', 'Has a real zero?'], [['$x - 2$', 'yes'], ['$x + 5$', 'yes'], ['$x^2 + 1$', 'no']]),
      expected: '2',
      review: {
        headline: 'Only factors with real zeros contribute real zeros.',
        reasoning: [
          'Each linear factor supplies one real zero.',
          'A quadratic that is never zero for real inputs supplies none, even though it raises the degree.',
        ],
        answer: '2 real zeros',
      },
      feedback: ['Count only the factors the table marks as having a real zero.'],
      hints: ['Add up the real zeros contributed by each factor individually.'],
    }),
  ]),

  // --- A2.7F Rational expression arithmetic ----------------------------------
  standard('A2.7F', [
    expression({
      code: 'A2.7F', slug: 'multiply-simplify', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $\\dfrac{x^2 - 9}{x + 1} \\cdot \\dfrac{x + 1}{x - 3}$ in simplest form.',
      expected: 'x + 3',
      accepted: ['x+3', '3 + x'],
      review: {
        headline: 'Factor before you cancel.',
        reasoning: [
          'The numerator of the first fraction factors into $(x - 3)(x + 3)$.',
          'Matching factors cancel across the product, leaving a single binomial.',
        ],
        answer: '$x + 3$',
      },
      feedback: ['Can the quadratic numerator be factored into two binomials?'],
      hints: ['Factor every numerator and denominator completely first; only then look for matching pairs.'],
    }),

    expression({
      code: 'A2.7F', slug: 'add-unlike', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write $\\dfrac{3}{x} + \\dfrac{2}{x + 1}$ as a single rational expression.',
      expected: '(5x + 3)/(x(x + 1))',
      accepted: ['(5x+3)/(x(x+1))', '(5x+3)/(x^2+x)', '(3 + 5x)/(x^2 + x)'],
      responseHint: 'Write the whole fraction, for example (ax + b)/(...).',
      review: {
        headline: 'Build a common denominator, then add the numerators.',
        reasoning: [
          'The common denominator is the product of the two distinct denominators.',
          'Rewriting each fraction gives $3(x + 1)$ and $2x$ on top, which combine to $5x + 3$.',
        ],
        answer: '$\\dfrac{5x + 3}{x(x + 1)}$',
      },
      feedback: ['Each numerator has to be multiplied by whatever its denominator was missing.'],
      hints: ['Decide on the common denominator first, then ask what each original fraction must be multiplied by to reach it.'],
      misconceptions: ['Adding numerators and denominators straight across.'],
    }),

    choice({
      code: 'A2.7F', slug: 'divide-setup', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'What is the first structural step when dividing one rational expression by another?',
      options: [
        ['Rewrite the division as multiplication by the reciprocal of the second expression', true],
        ['Cancel any matching terms across the division sign', false],
        ['Find a common denominator for both expressions', false],
        ['Add the two numerators and keep the first denominator', false],
      ],
      review: {
        headline: 'Division becomes multiplication by the reciprocal.',
        reasoning: [
          'A common denominator is what addition and subtraction need, not division.',
          'Once the division is rewritten as a product, ordinary factor-and-cancel applies.',
        ],
        answer: 'Multiply by the reciprocal.',
      },
      feedback: ['Which operation do common denominators actually belong to?'],
      hints: ['Recall what you do with numerical fractions when you divide one by another.'],
    }),

    choice({
      code: 'A2.7F', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student simplifies $\\dfrac{x + 6}{6}$ to $x$ by cancelling the sixes. What rule does this violate?',
      options: [
        ['You may cancel common factors, not individual terms of a sum', true],
        ['You may never cancel anything in a rational expression', false],
        ['The 6 in the numerator should have been cancelled with the $x$ instead', false],
        ['Nothing is violated; the simplification is correct', false],
      ],
      review: {
        headline: 'Cancelling is division, and division distributes over the whole numerator.',
        reasoning: [
          'The numerator is a sum, so the 6 underneath divides both terms, not just one.',
          'Substituting any number quickly shows the two expressions are not equal.',
        ],
        answer: 'The expression does not simplify to $x$.',
      },
      feedback: ['Substitute a convenient value into both expressions and compare the results.'],
      hints: ['Pick any number for $x$, evaluate the original and the student\'s version, and see whether they agree.'],
      misconceptions: ['Cancelling a term that is part of a sum.'],
    }),

    expression({
      code: 'A2.7F', slug: 'context-combine', band: 4, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'A runner covers 5 miles at $r$ miles per hour and then 3 miles at $r + 1$ miles per hour. Write a single rational expression for the total time in hours.',
      expected: '(8r + 5)/(r(r + 1))',
      accepted: ['(8r+5)/(r(r+1))', '(8r+5)/(r^2+r)', '(5 + 8r)/(r^2 + r)'],
      responseHint: 'Write the whole fraction, for example (ar + b)/(...).',
      review: {
        headline: 'Each leg contributes a fraction; combine them over a common denominator.',
        reasoning: [
          'The two times are $\\frac{5}{r}$ and $\\frac{3}{r + 1}$.',
          'Over the common denominator the numerators become $5(r + 1)$ and $3r$, which total $8r + 5$.',
        ],
        answer: '$\\dfrac{8r + 5}{r(r + 1)}$',
      },
      feedback: ['Write the time for each leg on its own before combining.'],
      hints: ['Time is distance divided by rate. Write both times, then put them over one denominator.'],
    }),
  ]),

  // --- A2.7G Radical expressions with variables ------------------------------
  standard('A2.7G', [
    expression({
      code: 'A2.7G', slug: 'simplify-radical', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Rewrite $\\sqrt{50x^5}$ in simplest radical form, assuming $x \\ge 0$.',
      expected: '5x^2*sqrt(2x)',
      accepted: ['5x^2 sqrt(2x)', '5*x^2*sqrt(2x)', '5x^2√(2x)'],
      responseHint: 'Write square roots as sqrt(...).',
      review: {
        headline: 'Pull out every perfect square you can find.',
        reasoning: [
          'The number 50 contains the perfect square 25, contributing a factor of 5.',
          'The variable power contains $x^4$, contributing $x^2$ and leaving one $x$ inside.',
        ],
        answer: '$5x^2\\sqrt{2x}$',
      },
      feedback: ['Split the number and the variable power into a perfect square times a leftover.'],
      hints: ['Handle the coefficient and the variable separately, looking for the largest perfect square hiding in each.'],
    }),

    choice({
      code: 'A2.7G', slug: 'rational-exponent-form', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
      prompt: 'Which expression is equivalent to $\\sqrt[3]{x^5}$?',
      options: [
        ['$x^{5/3}$', true],
        ['$x^{3/5}$', false],
        ['$x^{15}$', false],
        ['$x^{2}$', false],
      ],
      review: {
        headline: 'The index goes underneath; the power goes on top.',
        reasoning: [
          'A radical of index $n$ is a power with denominator $n$.',
          'The exponent inside the radical becomes the numerator of that fractional exponent.',
        ],
        answer: '$x^{5/3}$',
      },
      feedback: ['Which number is the index of the radical, and where does it belong in the fraction?'],
      hints: ['Translate the radical index and the inside exponent into the two positions of a fraction, one at a time.'],
      misconceptions: ['Swapping the index and the interior exponent.'],
    }),

    expression({
      code: 'A2.7G', slug: 'rationalize', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Rewrite $\\dfrac{6}{\\sqrt{3}}$ with no radical in the denominator.',
      expected: '2*sqrt(3)',
      accepted: ['2sqrt(3)', '2 sqrt(3)', '2√3'],
      responseHint: 'Write square roots as sqrt(...).',
      review: {
        headline: 'Multiply the fraction by a form of 1 that clears the radical.',
        reasoning: [
          'Multiplying top and bottom by the radical turns the denominator into a whole number.',
          'The resulting fraction reduces because the numerator shares a factor with the new denominator.',
        ],
        answer: '$2\\sqrt{3}$',
      },
      feedback: ['What can you multiply the denominator by so that the radical disappears?'],
      hints: ['Multiply numerator and denominator by the same radical, then reduce the numerical fraction that results.'],
    }),

    choice({
      code: 'A2.7G', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student writes $\\sqrt{x^2 + 9} = x + 3$. Which single test most clearly shows this is false?',
      options: [
        ['Substitute a value such as $x = 4$ and compare the two sides', true],
        ['Square both sides, which always confirms the statement', false],
        ['Point out that square roots of sums are undefined', false],
        ['Note that the left side must be negative', false],
      ],
      review: {
        headline: 'A square root does not distribute over addition.',
        reasoning: [
          'Substituting a value gives 5 on one side and 7 on the other.',
          'The radical of a sum is not the sum of the radicals, however tempting the pattern looks.',
        ],
        answer: 'The statement fails a single substitution.',
      },
      feedback: ['Pick any value for $x$ and evaluate both sides.'],
      hints: ['You do not need a rule here — one well-chosen number settles it.'],
      misconceptions: ['Distributing a radical across a sum.'],
    }),

    expression({
      code: 'A2.7G', slug: 'context-side', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A square patio has area $18x^4$ square feet, with $x > 0$. Write an expression in simplest radical form for the length of one side.',
      expected: '3x^2*sqrt(2)',
      accepted: ['3x^2 sqrt(2)', '3*x^2*sqrt(2)', '3x^2√2'],
      responseHint: 'Write square roots as sqrt(...).',
      review: {
        headline: 'Side length is the square root of the area.',
        reasoning: [
          'The coefficient 18 contains the perfect square 9.',
          'The variable part is already a perfect square, so it comes out whole.',
        ],
        answer: '$3x^2\\sqrt{2}$ feet',
      },
      feedback: ['What relationship connects the area of a square to its side?'],
      hints: ['Take the square root of the area expression, treating the number and the variable power separately.'],
    }),
  ]),

  // --- A2.7H Equations with rational exponents -------------------------------
  standard('A2.7H', [
    numeric({
      code: 'A2.7H', slug: 'reciprocal-power', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $x^{2/3} = 9$ for the positive solution.',
      expected: '27',
      review: {
        headline: 'Undo a fractional exponent with its reciprocal.',
        reasoning: [
          'Raising both sides to the $\\frac{3}{2}$ power leaves $x$ alone on the left.',
          'On the right, that means taking the square root and then cubing.',
        ],
        answer: '$x = 27$',
      },
      feedback: ['What power, applied to both sides, would cancel the exponent you have?'],
      hints: ['Multiply the existing exponent by something that gives 1. That something is the power you should apply.'],
    }),

    numeric({
      code: 'A2.7H', slug: 'isolate-first', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $2x^{1/2} + 5 = 17$.',
      expected: '36',
      review: {
        headline: 'Isolate the power before you undo it.',
        reasoning: [
          'Subtracting 5 and dividing by 2 leaves the half-power alone.',
          'Squaring both sides then removes the fractional exponent, and the result checks in the original equation.',
        ],
        answer: '$x = 36$',
      },
      feedback: ['Is the fractional power by itself yet on the left side?'],
      hints: ['Do the addition and multiplication undoing first; save the exponent step for last.'],
    }),

    choice({
      code: 'A2.7H', slug: 'extraneous-check', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'Why must solutions to an equation with a rational exponent such as $x^{1/2}$ always be checked in the original equation?',
      options: [
        ['Raising both sides to a power is not reversible, so it can create values that do not satisfy the original', true],
        ['Because rational exponents are always undefined for positive inputs', false],
        ['Because checking is required for every equation of any type', false],
        ['Because the original equation has no solutions unless you check', false],
      ],
      review: {
        headline: 'Powering both sides can manufacture solutions.',
        reasoning: [
          'Squaring erases sign information, so a false statement can become a true one.',
          'The check is what distinguishes a real solution from an artifact of the method.',
        ],
        answer: 'Powering is not a reversible step.',
      },
      feedback: ['What information does squaring both sides throw away?'],
      hints: ['Think about two numbers that are different but have the same square.'],
    }),

    choice({
      code: 'A2.7H', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows values of $f(x) = x^{3/2}$. Which input satisfies $x^{3/2} = 64$?',
      stimulus: table(['$x$', '$x^{3/2}$'], [['4', '8'], ['9', '27'], ['16', '64'], ['25', '125']]),
      options: [
        ['$x = 16$', true],
        ['$x = 9$', false],
        ['$x = 25$', false],
        ['$x = 4$', false],
      ],
      review: {
        headline: 'Read the table backwards from the output.',
        reasoning: [
          'The equation asks which input produces the given output.',
          'Scanning the output column locates the matching row directly.',
        ],
        answer: '$x = 16$',
      },
      feedback: ['Find the row whose second column matches the number in the equation.'],
      hints: ['Search the output column first, then read across to the input.'],
    }),

    numeric({
      code: 'A2.7H', slug: 'context', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'The period $T$ of a pendulum in seconds satisfies $T = 2L^{1/2}$, where $L$ is its length in meters. A pendulum has a period of 6 seconds. What is its length in meters?',
      expected: '9',
      unit: 'meters',
      review: {
        headline: 'Isolate the power, then undo it.',
        reasoning: [
          'Dividing the period by 2 leaves the half-power of the length alone.',
          'Squaring that result recovers the length, and substituting it back reproduces the given period.',
        ],
        answer: '9 meters',
      },
      feedback: ['Divide before you square, not the other way around.'],
      hints: ['Get the fractional power by itself on one side first, then apply the reciprocal power to both sides.'],
    }),
  ]),

  // --- A2.7I Domain and range in three notations -----------------------------
  standard('A2.7I', [
    interval({
      code: 'A2.7I', slug: 'radical-domain', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the domain of $f(x) = \\sqrt{x - 7}$ in interval notation.',
      expected: '[7, inf)',
      accepted: ['[7,inf)', '[7, infinity)', '[7,∞)'],
      responseHint: 'Use [ or ( for the endpoint and inf for infinity.',
      review: {
        headline: 'The radicand cannot be negative.',
        reasoning: [
          'Requiring the inside of the square root to be at least zero gives a single inequality.',
          'The boundary value itself is allowed, because the square root of zero is defined.',
        ],
        answer: '$[7, \\infty)$',
      },
      feedback: ['Is the endpoint itself allowed? That decides the bracket.'],
      hints: ['Set the expression under the radical greater than or equal to zero and solve it.'],
    }),

    choice({
      code: 'A2.7I', slug: 'set-notation', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'multipleRepresentation',
      prompt: 'The range of a function is all real numbers less than 4. Which line gives that range correctly in set notation and interval notation?',
      options: [
        ['$\\{y \\mid y < 4\\}$ and $(-\\infty, 4)$', true],
        ['$\\{y \\mid y \\le 4\\}$ and $(-\\infty, 4]$', false],
        ['$\\{y \\mid y > 4\\}$ and $(4, \\infty)$', false],
        ['$\\{y \\mid y < 4\\}$ and $(-\\infty, 4]$', false],
      ],
      review: {
        headline: '"Less than" excludes the boundary in both notations.',
        reasoning: [
          'A strict inequality corresponds to a parenthesis, never a bracket.',
          'The two notations must agree with each other and with the description.',
        ],
        answer: '$\\{y \\mid y < 4\\}$ and $(-\\infty, 4)$',
      },
      feedback: ['Does "less than 4" include 4 itself?'],
      hints: ['Check the inequality symbol and the bracket against each other before choosing.'],
    }),

    interval({
      code: 'A2.7I', slug: 'quadratic-range', band: 4, dok: 3, taskType: 'interpretation', representation: 'graph',
      prompt: 'A parabola opens upward with vertex at $(2, -5)$. Write its range in interval notation.',
      expected: '[-5, inf)',
      accepted: ['[-5,inf)', '[-5, infinity)', '[-5,∞)'],
      responseHint: 'Use [ or ( for the endpoint and inf for infinity.',
      review: {
        headline: 'For an upward parabola the vertex output is the minimum.',
        reasoning: [
          'The graph never goes below the vertex, and the vertex value is actually attained.',
          'Above that value the outputs continue without bound.',
        ],
        answer: '$[-5, \\infty)$',
      },
      feedback: ['Which coordinate of the vertex describes outputs?'],
      hints: ['Range is about outputs. Decide whether the vertex output is a floor or a ceiling, then say whether it is reached.'],
      misconceptions: ['Using the vertex $x$-coordinate as the range boundary.'],
    }),

    choice({
      code: 'A2.7I', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student writes the domain of a function as $(3, \\infty]$. What is wrong with the notation itself, before any mathematics is checked?',
      options: [
        ['Infinity is never included, so it always takes a parenthesis', true],
        ['The lower endpoint should have been a bracket', false],
        ['Interval notation cannot use infinity at all', false],
        ['The two endpoints should be written in the opposite order', false],
      ],
      review: {
        headline: 'Infinity is a direction, not a number you can reach.',
        reasoning: [
          'A bracket claims that the endpoint is a member of the set.',
          'No real number is infinite, so that side of the interval must stay open.',
        ],
        answer: 'It should be $(3, \\infty)$.',
      },
      feedback: ['Can a real number ever equal infinity?'],
      hints: ['Ask what a square bracket is claiming about the endpoint next to it.'],
    }),

    interval({
      code: 'A2.7I', slug: 'context-range', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A ball\'s height in feet follows $h(t) = -16t^2 + 64t$, reaching a maximum height of 64 feet before landing. Written in interval notation, what is the range of heights the ball actually occupies?',
      expected: '[0, 64]',
      accepted: ['[0,64]'],
      responseHint: 'Use [ or ( for each endpoint.',
      review: {
        headline: 'The situation caps the range at both ends.',
        reasoning: [
          'The ball starts and lands at ground level, so zero is attained.',
          'The maximum height is reached exactly once, so it is included too.',
        ],
        answer: '$[0, 64]$',
      },
      feedback: ['Does the ball actually reach its maximum height, and does it actually reach the ground?'],
      hints: ['Decide for each endpoint whether the height is attained or only approached, then choose the bracket that says so.'],
    }),
  ]),

  // --- A2.8A Selecting a model from data -------------------------------------
  standard('A2.8A', [
    choice({
      code: 'A2.8A', slug: 'constant-differences', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Which model best fits the data in the table?',
      stimulus: table(['$x$', '$y$'], [['0', '3'], ['1', '6'], ['2', '12'], ['3', '24'], ['4', '48']]),
      options: [
        ['Exponential, because each output is a fixed multiple of the one before it', true],
        ['Linear, because the outputs increase by a fixed amount', false],
        ['Quadratic, because the second differences are constant', false],
        ['No model fits; the data is random', false],
      ],
      review: {
        headline: 'Test differences first, then ratios.',
        reasoning: [
          'The first differences here are not constant, which rules out a linear model.',
          'Dividing each output by the previous one gives the same value every time, which is the signature of exponential growth.',
        ],
        answer: 'Exponential.',
      },
      feedback: ['Try subtracting consecutive outputs, then try dividing them.'],
      hints: ['Run both tests on the first three rows and see which one produces the same result each time.'],
    }),

    choice({
      code: 'A2.8A', slug: 'second-differences', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The second differences of a data set are all equal to 6, while the first differences change. What model does this indicate?',
      stimulus: table(['First differences', 'Second differences'], [['4', '—'], ['10', '6'], ['16', '6'], ['22', '6']]),
      options: [
        ['Quadratic', true],
        ['Linear', false],
        ['Exponential', false],
        ['Inverse variation', false],
      ],
      review: {
        headline: 'Constant second differences mean degree 2.',
        reasoning: [
          'Constant first differences indicate a linear model.',
          'When you have to go one level deeper before the differences settle, the model is one degree higher.',
        ],
        answer: 'Quadratic.',
      },
      feedback: ['How many rounds of differencing were needed before the values became constant?'],
      hints: ['Count the levels of differencing and connect that count to the degree of the model.'],
    }),

    choice({
      code: 'A2.8A', slug: 'context-choice', band: 4, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'A bacteria population doubles every 3 hours with no limiting factors. Which model should be selected, and why?',
      options: [
        ['Exponential, because a fixed doubling time means a constant growth factor', true],
        ['Linear, because the population increases steadily', false],
        ['Quadratic, because population growth curves upward', false],
        ['Linear, because doubling adds the same amount each period', false],
      ],
      review: {
        headline: 'Repeated multiplication is exponential, not linear.',
        reasoning: [
          'A doubling time describes multiplication by a fixed factor, not addition of a fixed amount.',
          'A curve that bends upward could be quadratic or exponential; the constant ratio is what settles it.',
        ],
        answer: 'Exponential.',
      },
      feedback: ['Does doubling add a fixed number, or multiply by a fixed number?'],
      hints: ['Write out three or four successive population values and look at how each one comes from the last.'],
      misconceptions: ['Treating "grows fast" as enough to identify a model.'],
    }),

    choice({
      code: 'A2.8A', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student picks a linear model because the scatterplot "generally goes up". Why is that reason insufficient?',
      options: [
        ['Quadratic and exponential models also go up, so direction alone does not identify a model', true],
        ['Linear models never go up', false],
        ['A scatterplot can never be used to select a model', false],
        ['The student should always choose exponential when data goes up', false],
      ],
      review: {
        headline: 'Direction is not shape.',
        reasoning: [
          'Increasing is a property shared by many different models.',
          'What distinguishes them is whether the change per step is constant, growing steadily, or multiplying.',
        ],
        answer: 'Direction does not determine the model.',
      },
      feedback: ['Name two different model types that both increase.'],
      hints: ['Think about what additional evidence — differences, ratios, or curvature — would actually separate the candidates.'],
    }),

    shortText({
      code: 'A2.8A', slug: 'reverse-name', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'You are designing a data set that must satisfy every requirement listed. Which single model type will fit it exactly? Answer with one word.',
      stimulus: itemList([
        'Every input is spaced one unit apart.',
        'The first differences of the outputs are all equal to the same nonzero number.',
        'No second differencing is needed to reach a constant.',
      ]),
      expected: 'linear',
      accepted: ['Linear', 'a linear model', 'linear model'],
      review: {
        headline: 'Constant first differences define a straight line.',
        reasoning: [
          'A fixed change per step is exactly what a constant slope means.',
          'Any deeper differencing would be needed only for a higher-degree model.',
        ],
        answer: 'Linear',
      },
      feedback: ['What does a constant change per step describe geometrically?'],
      hints: ['Connect "the same change every step" to the quantity that stays fixed on a straight-line graph.'],
    }),
  ]),

  // --- A2.8B Regression ------------------------------------------------------
  standard('A2.8B', [
    choice({
      code: 'A2.8B', slug: 'which-regression', band: 3, dok: 2, taskType: 'procedural', representation: 'table',
      prompt: 'A data set has roughly constant second differences. Which regression should you run on it?',
      stimulus: table(['$x$', '$y$'], [['1', '2'], ['2', '8'], ['3', '18'], ['4', '32'], ['5', '50']]),
      options: [
        ['Quadratic regression', true],
        ['Linear regression', false],
        ['Exponential regression', false],
        ['No regression is appropriate', false],
      ],
      review: {
        headline: 'Choose the regression that matches the pattern you diagnosed.',
        reasoning: [
          'The first differences here grow steadily rather than staying fixed.',
          'The second differences settle to a single value, which points to a degree-2 model.',
        ],
        answer: 'Quadratic regression.',
      },
      feedback: ['Difference the outputs once, then difference the results.'],
      hints: ['Diagnose the pattern with differences before you pick a regression menu item.'],
    }),

    choice({
      code: 'A2.8B', slug: 'interpret-r-squared', band: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
      prompt: 'Two regressions are run on the same data. The linear model reports $r^2 = 0.62$ and the quadratic model reports $r^2 = 0.97$. What does this comparison support?',
      options: [
        ['The quadratic model accounts for much more of the variation in the data', true],
        ['The linear model is more accurate because its value is smaller', false],
        ['The two models fit equally well', false],
        ['The quadratic model must be the true relationship in the world', false],
      ],
      review: {
        headline: 'A higher $r^2$ means less unexplained variation.',
        reasoning: [
          'The statistic reports the proportion of variation the model accounts for, so higher is a better fit to this data.',
          'Better fit to a sample is not the same as being the true underlying relationship, which is why the strongest-sounding option overreaches.',
        ],
        answer: 'The quadratic model fits this data considerably better.',
      },
      feedback: ['Does a larger value of this statistic mean more or less unexplained variation?'],
      hints: ['Recall what the statistic is measuring, then be careful about how strong a claim the numbers can support.'],
    }),

    numeric({
      code: 'A2.8B', slug: 'use-model', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A regression on sales data gives $y = 4.5x + 20$, where $x$ is months since opening and $y$ is sales in thousands of dollars. What does the model predict for month 8, in thousands of dollars?',
      expected: '56',
      review: {
        headline: 'A regression equation is used like any other function.',
        reasoning: [
          'Substituting 8 for the number of months gives $36 + 20$.',
          'The output is in thousands of dollars, matching how the model was defined.',
        ],
        answer: '56 thousand dollars',
      },
      feedback: ['Substitute the month number into the equation and read the units carefully.'],
      hints: ['Put the given month value in for $x$ and evaluate; then check what the output units are.'],
    }),

    choice({
      code: 'A2.8B', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'An exponential regression produces $y = 200(0.85)^x$. A student says the quantity grows by 85% each period. What is the correct interpretation?',
      options: [
        ['It decays, keeping 85% of its value each period — a 15% decrease', true],
        ['It grows by 85% each period, as the student said', false],
        ['It grows by 15% each period', false],
        ['It decreases by 85 units each period', false],
      ],
      review: {
        headline: 'The base is the multiplier, not the percent change.',
        reasoning: [
          'A base below 1 multiplies the quantity down each period.',
          'The percent change is the distance between the base and 1, not the base itself.',
        ],
        answer: 'A 15% decrease per period.',
      },
      feedback: ['Is the base larger or smaller than 1, and what does that mean for the quantity?'],
      hints: ['Compare the base with 1 first, then work out what percentage the gap represents.'],
      misconceptions: ['Reading the base directly as the percent rate.'],
    }),

    equation({
      code: 'A2.8B', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A quantity starts at 500 and is multiplied by 1.2 each year. Write the exponential model for the amount $y$ after $x$ years.',
      expected: 'y = 500(1.2)^x',
      accepted: ['y=500(1.2)^x', 'y = 500*1.2^x', 'y=500*1.2^x'],
      review: {
        headline: 'Starting value out front, growth factor in the base.',
        reasoning: [
          'The initial amount is the output when the exponent is zero.',
          'The fixed multiplier per period is exactly the base being raised to the number of periods.',
        ],
        answer: '$y = 500(1.2)^x$',
      },
      feedback: ['Which number describes where the quantity starts, and which describes how it changes?'],
      hints: ['Write the general exponential form first, then decide which given number fills each slot.'],
    }),
  ]),

  // --- A2.8C Predicting and judging from models ------------------------------
  standard('A2.8C', [
    numeric({
      code: 'A2.8C', slug: 'predict', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A quadratic model for a company\'s profit is $P(x) = -2x^2 + 24x - 40$, where $x$ is the price in dollars. What price produces the maximum profit?',
      expected: '6',
      unit: 'dollars',
      review: {
        headline: 'The vertex of a downward parabola is the maximum.',
        reasoning: [
          'The axis of symmetry sits halfway between the roots, at $x = -\\frac{b}{2a}$.',
          'Because the leading coefficient is negative, that input gives the largest output rather than the smallest.',
        ],
        answer: '$6',
      },
      feedback: ['Which feature of a parabola corresponds to a maximum?'],
      hints: ['Locate the axis of symmetry from the coefficients, then decide whether it marks a peak or a valley.'],
    }),

    choice({
      code: 'A2.8C', slug: 'extrapolation', band: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
      prompt: 'A linear model built from 5 years of data is used to predict a value 40 years out. What is the main concern with that prediction?',
      options: [
        ['Extrapolating far beyond the data assumes a trend continues with no evidence that it does', true],
        ['Linear models can only be evaluated at whole numbers', false],
        ['The prediction is fine as long as the model had a high $r^2$', false],
        ['Predictions are only valid for values inside the original data range, so the model is useless', false],
      ],
      review: {
        headline: 'A model describes the range it was built from.',
        reasoning: [
          'Fit quality measures how well the model matched the data it saw, not how long the pattern will hold.',
          'Prediction just outside the data is often reasonable; prediction eight times beyond it is a much stronger assumption.',
        ],
        answer: 'Far extrapolation is an unsupported assumption.',
      },
      feedback: ['How far outside the original data does this prediction reach?'],
      hints: ['Compare the span of the data with the distance of the prediction, and ask what the model can honestly claim.'],
    }),

    choice({
      code: 'A2.8C', slug: 'compare-models', band: 4, dok: 3, taskType: 'comparison', representation: 'table',
      prompt: 'Two models predict a population. The table shows their predictions. What decision does the comparison support for planning 20 years ahead?',
      stimulus: table(['Years ahead', 'Linear model', 'Exponential model'], [['5', '12,000', '12,800'], ['10', '14,000', '16,400'], ['20', '18,000', '26,900']]),
      options: [
        ['The two models agree in the short term but diverge sharply, so the long-range plan must state which model it assumes', true],
        ['The models agree at every horizon, so the choice does not matter', false],
        ['The linear model is always correct because its numbers are smaller', false],
        ['The exponential model is always correct because populations always grow exponentially', false],
      ],
      review: {
        headline: 'Model choice matters most far from the data.',
        reasoning: [
          'Near the present the two predictions differ by a few percent, which is within planning tolerance.',
          'By year 20 the gap is nearly 9,000 people, which changes what infrastructure the plan needs.',
        ],
        answer: 'State the assumption; the long-range gap is large.',
      },
      feedback: ['Compare the size of the gap at 5 years with the gap at 20 years.'],
      hints: ['Subtract the two predictions at each horizon and watch what happens to the difference.'],
    }),

    numeric({
      code: 'A2.8C', slug: 'break-even', band: 4, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'Revenue is modeled by $R(x) = 15x$ and cost by $C(x) = 9x + 300$, both in dollars for $x$ units. How many units must be sold to break even?',
      expected: '50',
      unit: 'units',
      review: {
        headline: 'Break-even is where the two models meet.',
        reasoning: [
          'Setting revenue equal to cost gives $15x = 9x + 300$.',
          'Solving leaves $6x = 300$, and each unit sold beyond that point adds $6 of profit.',
        ],
        answer: '50 units',
      },
      feedback: ['What has to be true of revenue and cost at the break-even point?'],
      hints: ['Write an equation stating that the two quantities are equal, then solve it.'],
    }),

    choice({
      code: 'A2.8C', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A model for a plant\'s height is $h(t) = -t^2 + 10t$ centimeters after $t$ weeks. A student evaluates it at $t = 15$, gets $-75$, and reports that the plant is 75 centimeters below ground. What went wrong?',
      options: [
        ['The model is only valid while the height is nonnegative; $t = 15$ is outside its useful domain', true],
        ['The arithmetic is wrong; the value should be positive', false],
        ['The model should have been evaluated at $t = -15$', false],
        ['Nothing is wrong; plants can have negative height', false],
      ],
      review: {
        headline: 'A model can keep producing numbers after it stops describing reality.',
        reasoning: [
          'The quadratic returns to zero and then goes negative, but the situation ends when the height reaches zero.',
          'Reporting the output without checking the practical domain gives a meaningless answer.',
        ],
        answer: 'The input lies outside the model\'s practical domain.',
      },
      feedback: ['Can the quantity being modeled actually be negative?'],
      hints: ['Ask what the output represents and whether that quantity is allowed to take the value produced.'],
      misconceptions: ['Trusting a model output without checking the practical domain.'],
    }),
  ]),
];

export default ALGEBRA2_NUMBER_DATA_STANDARDS;
