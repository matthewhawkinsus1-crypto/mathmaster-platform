// Middle-school prerequisites the Algebra routing graph can actually reach.
//
// These six standards were the emptiest part of the bank: 7.7 and 7.11A had ten
// placeholder items between them and the other four had nothing at all. That is
// not a cosmetic gap — `planRemediation` walks to these standards when an
// Algebra student's evidence points below the course, and a repair excursion
// that arrives at an empty standard strands the student it was trying to help.
//
// Each standard gets five families that are five different pieces of thinking:
// do it, use it, critique it, read it from a table, and build one backwards.

import {
  choice, equation, expression, numeric, standard,
  balanceEquation, graphWorkspace, numberLine, steps, table,
} from './kit.mjs';

export const GRADE_6_7_STANDARDS = [

  // --- 6.7A Order of operations -------------------------------------------------
  standard('6.7A', [
    numeric({
      code: '6.7A', slug: 'evaluate', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Evaluate $4 + 3 \\times 2^{3} - 6$.',
      expected: '22',
      review: {
        headline: 'Powers first, then multiplication, then addition and subtraction.',
        reasoning: [
          'The exponent is evaluated before anything else: $2^{3} = 8$.',
          'Multiplication comes next: $3 \\times 8 = 24$.',
          'Finally work left to right through the addition and subtraction: $4 + 24 - 6$.',
        ],
        answer: '$22$',
        commonError: 'Multiplying $3 \\times 2$ before applying the exponent gives $6^{3}$, which is a different expression entirely.',
      },
      feedback: ['Check which operation you did first. The exponent is not optional and it does not wait its turn.'],
      hints: ['Which single operation in this expression has to happen before every other one?'],
      misconceptions: [
        { when: ['210', '214'], say: 'It looks like $3 \\times 2$ was evaluated before the exponent. The power applies only to the 2.' },
        { when: ['26'], say: 'The subtraction of 6 seems to have been left out. Work left to right once the multiplication is done.' },
      ],
    }),

    choice({
      code: '6.7A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'Jordan evaluated $20 - 4 \\times 3 + 5$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$20 - 4 \\times 3 + 5$' },
        { label: 'Line 2', work: '$16 \\times 3 + 5$' },
        { label: 'Line 3', work: '$48 + 5$' },
        { label: 'Line 4', work: '$53$' },
      ], { title: "Jordan's work" }),
      options: [
        ['Line 1 — the expression was copied wrongly', false],
        ['Line 2 — subtraction was done before multiplication', true],
        ['Line 3 — the multiplication is wrong', false],
        ['Line 4 — the addition is wrong', false],
      ],
      review: {
        headline: 'Multiplication happens before subtraction, whatever the reading order.',
        reasoning: [
          'Line 2 subtracts $20 - 4$ first, which changes the expression being evaluated.',
          'The multiplication $4 \\times 3 = 12$ must happen first, giving $20 - 12 + 5$.',
          'Working left to right through what is left gives $8 + 5 = 13$.',
        ],
        answer: 'Line 2, and the correct value is $13$.',
        connection: 'Reading an expression left to right is not the same as evaluating it left to right.',
      },
      feedback: ['Look for the first line where the value of the whole expression changed, not the first line that looks unusual.'],
      hints: ['Compare the value of each line to the value of the line above it. Which is the first pair that are not equal?'],
    }),

    numeric({
      code: '6.7A', slug: 'context-cost', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A club buys 3 boxes of shirts at $\\$18$ each and one banner for $\\$25$, then uses a $\\$20$ coupon. Write the total as a single expression and evaluate it. What is the total cost in dollars?',
      expected: '59', unit: 'dollars',
      review: {
        headline: 'The expression is $3 \\times 18 + 25 - 20$.',
        reasoning: [
          'The three boxes cost $3 \\times 18 = 54$ dollars, and that multiplication has to happen before anything is added.',
          'Adding the banner gives $54 + 25 = 79$ dollars.',
          'The coupon is subtracted last: $79 - 20 = 59$ dollars.',
        ],
        answer: '$\\$59$',
        commonError: 'Adding 18 and 25 first, then multiplying, charges for three banners as well as three boxes.',
      },
      feedback: ['Write the expression before you calculate. Which quantity is repeated three times, and which happens only once?'],
      hints: ['Only one of the three amounts is multiplied. Which one?'],
    }),

    choice({
      code: '6.7A', slug: 'table-compare', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Each row shows an expression and a proposed value. Which row is the only correct one?',
      stimulus: table(['Row', 'Expression', 'Proposed value'], [
        ['A', '$10 - 2^{2}$', '$64$'],
        ['B', '$(10 - 2)^{2}$', '$64$'],
        ['C', '$10 - 2 \\times 2$', '$16$'],
        ['D', '$10 \\times 2 - 2$', '$16$'],
      ]),
      options: [
        ['Row A', false],
        ['Row B', true],
        ['Row C', false],
        ['Row D', false],
      ],
      review: {
        headline: 'Brackets change which quantity gets squared.',
        reasoning: [
          'In Row B the brackets are evaluated first: $10 - 2 = 8$, and $8^{2} = 64$.',
          'Row A squares only the 2, giving $10 - 4 = 6$.',
          'Row C gives $10 - 4 = 6$ and Row D gives $20 - 2 = 18$, so neither proposed value is right.',
        ],
        answer: 'Row B.',
        connection: 'Two expressions can use the same symbols in the same order and still mean different things.',
      },
      feedback: ['Evaluate each row for yourself rather than looking for the one that seems familiar.'],
      hints: ['Start with the rows that contain brackets. What do brackets change about the order?'],
    }),

    expression({
      code: '6.7A', slug: 'reverse-brackets', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Where must brackets be placed in $12 - 4 \\div 2$ so that the value is $4$? Type the expression with your brackets included.',
      expected: '(12-4)/2',
      accepted: ['(12 - 4) / 2', '(12-4)÷2', '(12 − 4) ÷ 2'],
      responseHint: 'Type the whole expression, for example (5+1)/3.',
      review: {
        headline: 'Brackets are how you overrule the usual order.',
        reasoning: [
          'Without brackets the division happens first: $12 - 2 = 10$.',
          'Putting the subtraction in brackets forces it to happen first: $(12 - 4) = 8$.',
          'Dividing that result by 2 gives 4.',
        ],
        answer: '$(12 - 4) \\div 2 = 4$',
        connection: 'This is the same reasoning you will use in algebra when a whole numerator has to be divided at once.',
      },
      feedback: ['Try evaluating your expression yourself. What value does it actually give?'],
      hints: ['You want the subtraction to happen first. Which part of the expression needs to be wrapped?'],
    }),
  ]),

  // --- 6.7D Equivalent expressions ------------------------------------------------
  standard('6.7D', [
    expression({
      code: '6.7D', slug: 'distribute', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Use the distributive property to write $5(x + 3)$ without brackets.',
      expected: '5x+15',
      accepted: ['5x + 15', '15+5x', '15 + 5x'],
      review: {
        headline: 'Every term inside the brackets is multiplied by what is outside.',
        reasoning: [
          'The 5 multiplies the $x$: $5 \\times x = 5x$.',
          'The 5 also multiplies the 3: $5 \\times 3 = 15$.',
          'The two products are added, because the original expression added $x$ and 3.',
        ],
        answer: '$5x + 15$',
        commonError: 'Multiplying only the first term gives $5x + 3$, which is a different expression for every value of $x$.',
      },
      feedback: ['Check that the 5 reached both terms inside the brackets.'],
      hints: ['How many terms are inside the brackets? Each one needs a partner.'],
      misconceptions: [{ when: ['5x+3', '5x + 3'], say: 'The 5 multiplied the $x$ but not the 3. Both terms inside the brackets are being multiplied.' }],
    }),

    choice({
      code: '6.7D', slug: 'which-property', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which property justifies rewriting $7 + (3 + x)$ as $(7 + 3) + x$?',
      options: [
        ['The commutative property of addition', false],
        ['The associative property of addition', true],
        ['The distributive property', false],
        ['The identity property of addition', false],
      ],
      review: {
        headline: 'The grouping moved; the order did not.',
        reasoning: [
          'The terms appear in the same order on both sides: 7, then 3, then $x$.',
          'What changed is which pair is added first — that is regrouping, which is the associative property.',
          'The commutative property would show terms swapping places, as in $7 + x$ becoming $x + 7$.',
        ],
        answer: 'The associative property of addition.',
        connection: 'Naming the property matters later, when you have to justify a step in an algebraic proof.',
      },
      feedback: ['Compare the two expressions term by term. Did anything change position, or only the brackets?'],
      hints: ['One of these properties is about order and one is about grouping. Which one describes what happened here?'],
    }),

    choice({
      code: '6.7D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'Priya rewrote $4(2x - 5)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$4(2x - 5)$' },
        { label: 'Line 2', work: '$4 \\cdot 2x - 4 \\cdot 5$' },
        { label: 'Line 3', work: '$8x - 9$' },
      ], { title: "Priya's work" }),
      options: [
        ['Line 1', false],
        ['Line 2', false],
        ['Line 3', true],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'The distribution was right; the arithmetic was not.',
        reasoning: [
          'Line 2 correctly multiplies both terms by 4.',
          'Line 3 should be $8x - 20$, because $4 \\times 5 = 20$, not 9.',
          'It looks as though 4 and 5 were added instead of multiplied.',
        ],
        answer: 'Line 3. The correct expression is $8x - 20$.',
      },
      feedback: ['Two of these lines are correct. Work out each product for yourself.'],
      hints: ['Check the second product on its own: what is $4 \\times 5$?'],
    }),

    numeric({
      code: '6.7D', slug: 'table-check', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table tests whether $3(x + 2)$ and $3x + 2$ are equivalent. Complete the missing value: what is $3(x+2)$ when $x = 4$?',
      stimulus: table(['$x$', '$3(x+2)$', '$3x+2$'], [
        ['1', '9', '5'],
        ['2', '12', '8'],
        ['4', '?', '14'],
      ]),
      expected: '18',
      review: {
        headline: 'Equivalent expressions agree for every value, not just one.',
        reasoning: [
          'Substituting $x = 4$ gives $3(4 + 2) = 3 \\times 6 = 18$.',
          'The other expression gives $3 \\times 4 + 2 = 14$ at the same value.',
          'Because the two columns disagree at every row, the expressions are not equivalent.',
        ],
        answer: '$18$',
        connection: 'A table is a fast way to disprove equivalence: one disagreeing row is enough.',
      },
      feedback: ['Substitute 4 for $x$ inside the brackets first.'],
      hints: ['What is inside the brackets once $x = 4$ is substituted?'],
    }),

    expression({
      code: '6.7D', slug: 'reverse-factor', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an expression in the form $a(bx + c)$ that is equivalent to $12x + 18$ and uses the largest possible whole number for $a$.',
      expected: '6(2x+3)',
      accepted: ['6(2x + 3)', '6*(2x+3)', '6(3+2x)'],
      responseHint: 'Type your expression, for example 4(x + 5).',
      review: {
        headline: 'You are undoing the distribution.',
        reasoning: [
          'Both 12 and 18 are divisible by 6, and 6 is the largest number that divides both.',
          'Dividing each term by 6 gives $2x$ and 3.',
          'Multiplying back checks it: $6(2x + 3) = 12x + 18$.',
        ],
        answer: '$6(2x + 3)$',
        commonError: 'Choosing 2 or 3 gives an equivalent expression, but not with the largest possible factor.',
        connection: 'This is factoring, and it is the same move you will use on quadratics in Algebra I.',
      },
      feedback: ['Multiply your expression back out. Does it give $12x + 18$ exactly?'],
      hints: ['What is the largest whole number that divides both 12 and 18?'],
    }),
  ]),

  // --- 7.3A Operations with rational numbers ---------------------------------------
  standard('7.3A', [
    numeric({
      code: '7.3A', slug: 'signed-arithmetic', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Evaluate $-7 + 3 - (-5)$.',
      expected: '1',
      review: {
        headline: 'Subtracting a negative is adding.',
        reasoning: [
          'Start at $-7$ and add 3, which gives $-4$.',
          'Subtracting $-5$ is the same as adding 5.',
          'Adding 5 to $-4$ gives 1.',
        ],
        answer: '$1$',
        commonError: 'Treating $-(-5)$ as $-5$ gives $-9$.',
      },
      feedback: ['Look carefully at the last term. What does subtracting a negative number do to the total?'],
      hints: ['Rewrite $-(-5)$ before you calculate anything.'],
      misconceptions: [{ when: ['-9'], say: 'Subtracting $-5$ moves you in the positive direction, not the negative one.' }],
    }),

    numeric({
      code: '7.3A', slug: 'fraction-quotient-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows four quotients. Complete the missing value. Give your answer as a decimal or a fraction.',
      stimulus: table(['Calculation', 'Value'], [
        ['$\\frac{1}{2} \\div \\frac{1}{4}$', '$2$'],
        ['$-\\frac{1}{2} \\div \\frac{1}{4}$', '$-2$'],
        ['$\\frac{3}{4} \\div \\frac{1}{2}$', '$1.5$'],
        ['$-\\frac{3}{4} \\div \\frac{1}{2}$', '?'],
      ]),
      expected: '-1.5',
      accepted: ['-3/2', '-1 1/2'],
      tolerance: 0.005,
      review: {
        headline: 'Dividing by a fraction is multiplying by its reciprocal.',
        reasoning: [
          'The reciprocal of $\\frac{1}{2}$ is 2, so the calculation becomes $-\\frac{3}{4} \\times 2 = -\\frac{6}{4}$.',
          'That simplifies to $-\\frac{3}{2}$, or $-1.5$.',
          'The table shows the pattern: the third row has the same size as this one, and only the sign differs.',
        ],
        answer: '$-\\frac{3}{2}$',
        commonError: 'Multiplying by $\\frac{1}{2}$ instead of by 2 gives $-\\frac{3}{8}$, which is smaller than the number you started with.',
        connection: 'Reading down the table shows that the sign and the size are two separate decisions.',
      },
      feedback: ['Compare your answer with the row above it. Should it have the same size and the opposite sign?'],
      hints: ['Dividing by a half makes a quantity bigger, not smaller. Does your answer reflect that?'],
    }),

    choice({
      code: '7.3A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'Marco evaluated $-2 \\times (-3) - 4$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$-2 \\times (-3) - 4$' },
        { label: 'Line 2', work: '$-6 - 4$' },
        { label: 'Line 3', work: '$-10$' },
      ], { title: "Marco's work" }),
      options: [
        ['Line 1', false],
        ['Line 2 — the product of two negatives is positive', true],
        ['Line 3 — the subtraction is wrong', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Two negative factors give a positive product.',
        reasoning: [
          'Line 2 should read $6 - 4$, because $-2 \\times -3 = 6$.',
          'The correct value is therefore 2, not $-10$.',
          'Line 3 is arithmetic done correctly on the wrong expression.',
        ],
        answer: 'Line 2. The correct value is $2$.',
      },
      feedback: ['One of these lines is arithmetic done correctly on a wrong expression. Find the line above it.'],
      hints: ['What sign does the product of two negative numbers have?'],
    }),

    numeric({
      code: '7.3A', slug: 'temperature-context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'At 6 p.m. the temperature was $-3^{\\circ}$C. It fell $4.5^{\\circ}$ overnight, then rose $6^{\\circ}$ by noon. What was the temperature at noon, in degrees Celsius?',
      expected: '-1.5', unit: '°C',
      review: {
        headline: 'Falling is subtracting; rising is adding.',
        reasoning: [
          'Falling $4.5^{\\circ}$ from $-3^{\\circ}$ gives $-7.5^{\\circ}$.',
          'Rising $6^{\\circ}$ from $-7.5^{\\circ}$ gives $-1.5^{\\circ}$.',
          'The temperature ends below zero, which fits a night that fell further than it rose.',
        ],
        answer: '$-1.5^{\\circ}$C',
        commonError: 'Adding 4.5 because the number is positive, rather than because the temperature fell.',
      },
      feedback: ['Track the temperature one change at a time and check the sign of each change.'],
      hints: ['Which of the two changes moved the temperature down?'],
    }),

    choice({
      code: '7.3A', slug: 'sign-reasoning', band: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Let $a$ be a negative number and $b$ a positive number. Without choosing any particular values, which expression is guaranteed to be negative?',
      options: [
        ['$a \\times b^{2}$', true],
        ['$a^{2} \\times b$', false],
        ['$a - b^{2}$ is guaranteed positive', false],
        ['$a \\div a$', false],
      ],
      review: {
        headline: 'Reason about the signs, not about particular numbers.',
        reasoning: [
          'Squaring $b$ keeps it positive, so $a \\times b^{2}$ is a negative times a positive, which is negative.',
          'Squaring $a$ makes it positive, so $a^{2} \\times b$ is a positive times a positive.',
          '$a \\div a$ is 1 for every non-zero $a$, negative or not.',
        ],
        answer: '$a \\times b^{2}$',
        commonError: 'Assuming a negative number stays negative when it is squared.',
        connection: 'This kind of reasoning is what lets you predict the shape of a graph before plotting a single point.',
      },
      feedback: ['Try one negative value and one positive value in each option, then ask whether your conclusion would hold for every choice.'],
      hints: ['What happens to the sign of a negative number when it is squared?'],
    }),
  ]),

  // --- 7.3B Problem solving with rational numbers ------------------------------------
  standard('7.3B', [
    numeric({
      code: '7.3B', slug: 'multistep-money', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A savings account starts at $\\$120.50$. Three withdrawals of $\\$18.25$ are made, then a deposit of $\\$40$. What is the balance in dollars?',
      expected: '105.75', unit: 'dollars', tolerance: 0.005,
      review: {
        headline: 'Repeated withdrawals are a multiplication, not three separate steps to remember.',
        reasoning: [
          'Three withdrawals of $\\$18.25$ total $3 \\times 18.25 = \\$54.75$.',
          'Subtracting from the starting balance gives $120.50 - 54.75 = \\$65.75$.',
          'The deposit adds $\\$40$, giving $\\$105.75$.',
        ],
        answer: '$\\$105.75$',
        commonError: 'Subtracting only one withdrawal gives $\\$142.25$.',
      },
      feedback: ['Check how many withdrawals were made, and whether each one was accounted for.'],
      hints: ['What is the total of the three withdrawals before anything else happens?'],
    }),

    numeric({
      code: '7.3B', slug: 'table-total', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows one week of changes to a diver\'s depth, in metres, where negative means further below the surface. What is the diver\'s depth at the end of the week, in metres?',
      stimulus: table(['Day', 'Change (m)'], [
        ['Monday', '-12.5'],
        ['Tuesday', '+4'],
        ['Wednesday', '-6.25'],
        ['Thursday', '+9.75'],
      ], { note: 'The diver starts at the surface, at a depth of 0 m.' }),
      expected: '-5', unit: 'metres', tolerance: 0.005,
      review: {
        headline: 'Add every change to the starting value, keeping the signs.',
        reasoning: [
          'The downward changes total $-12.5 + (-6.25) = -18.75$ metres.',
          'The upward changes total $4 + 9.75 = 13.75$ metres.',
          'Combining gives $-18.75 + 13.75 = -5$ metres, so the diver ends 5 m below the surface.',
        ],
        answer: '$-5$ m',
        connection: 'Grouping the negatives and the positives separately is often faster and less error-prone than working down the list.',
      },
      feedback: ['Check that each row kept its sign when you added it.'],
      hints: ['Try totalling the downward moves and the upward moves separately.'],
    }),

    choice({
      code: '7.3B', slug: 'reasonableness', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'A recipe needs $\\frac{3}{4}$ cup of oil per batch. Without calculating exactly, which is the most reasonable estimate of the oil needed for $5\\frac{1}{2}$ batches?',
      options: [
        ['A little more than 4 cups', true],
        ['A little less than 3 cups', false],
        ['About 7 cups', false],
        ['About $\\frac{3}{4}$ of a cup', false],
      ],
      review: {
        headline: 'Estimate before you calculate, so you can tell whether the answer is sensible.',
        reasoning: [
          'Each batch needs slightly less than one cup, so 5 and a half batches need slightly less than 5 and a half cups.',
          'Three quarters of $5\\frac{1}{2}$ is a little over 4, which matches that reasoning.',
          'Seven cups is more than one cup per batch, which is impossible here.',
        ],
        answer: 'A little more than 4 cups — the exact value is $4\\frac{1}{8}$ cups.',
        connection: 'An estimate is what tells you a calculator slip has happened.',
      },
      feedback: ['Think about how much one batch needs, then scale up. Should the answer be more or less than 5.5 cups?'],
      hints: ['Is $\\frac{3}{4}$ of a cup more or less than a whole cup?'],
    }),

    choice({
      code: '7.3B', slug: 'error-analysis', band: 4, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the total cost of 4 items at $\\$6.30$ each with a $\\$5$ discount. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: 'Total $= 4 \\times 6.30 - 5$' },
        { label: 'Line 2', work: 'Total $= 4 \\times 1.30$' },
        { label: 'Line 3', work: 'Total $= 5.20$' },
      ], { title: 'The work' }),
      options: [
        ['Line 1 — the expression is set up wrongly', false],
        ['Line 2 — the discount was applied to each item instead of once', true],
        ['Line 3 — the multiplication is wrong', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'The discount applies once, to the total.',
        reasoning: [
          'Line 1 is correct: it multiplies first and subtracts once.',
          'Line 2 subtracts the $\\$5$ from the price of a single item, which then gets multiplied by 4 — a $\\$20$ discount.',
          'The correct total is $25.20 - 5 = \\$20.20$.',
        ],
        answer: 'Line 2. The correct total is $\\$20.20$.',
        connection: 'This is exactly the distributive property: $4(6.30 - 5)$ is not the same as $4 \\times 6.30 - 5$.',
      },
      feedback: ['Line 1 sets the problem up correctly. Compare what Line 2 does to what Line 1 says.'],
      hints: ['How many times should the $\\$5$ be subtracted?'],
    }),

    equation({
      code: '7.3B', slug: 'reverse-expression', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A phone plan charges a $\\$25$ monthly fee plus $\\$0.10$ per gigabyte. Write an equation for the monthly cost $c$ when $g$ gigabytes are used.',
      expected: 'c=25+0.1g',
      accepted: ['c = 25 + 0.1g', 'c=0.1g+25', 'c = 0.10g + 25', 'c=25+0.10g'],
      responseHint: 'Write a full equation starting with c =',
      review: {
        headline: 'A fixed charge is a constant; a per-unit charge multiplies the variable.',
        reasoning: [
          'The $\\$25$ is paid whether or not any data is used, so it stands alone.',
          'The $\\$0.10$ is paid once per gigabyte, so it multiplies $g$.',
          'The two are added, because both are part of the same bill.',
        ],
        answer: '$c = 25 + 0.1g$',
        commonError: 'Writing $c = 25g + 0.1$ charges $\\$25$ per gigabyte and adds ten cents once.',
        connection: 'This is the structure of every linear model you will meet in Algebra I.',
      },
      feedback: ['Check which of the two numbers is multiplied by $g$. Which charge depends on how much data is used?'],
      hints: ['If you use zero gigabytes, what does the plan cost? That number stands alone in your equation.'],
    }),
  ]),

  // --- 7.7 Linear relationships in tables and graphs -----------------------------------
  standard('7.7', [
    numeric({
      code: '7.7', slug: 'rate-from-table', band: 2, dok: 1, taskType: 'procedural', representation: 'table',
      prompt: 'The table shows the cost of buying tickets. What is the cost per ticket, in dollars?',
      stimulus: table(['Tickets', 'Cost ($)'], [
        ['2', '17'],
        ['4', '34'],
        ['6', '51'],
      ]),
      expected: '8.5', unit: 'dollars', tolerance: 0.005,
      review: {
        headline: 'The rate is the change in cost divided by the change in tickets.',
        reasoning: [
          'From 2 tickets to 4 tickets the cost rises by $34 - 17 = \\$17$.',
          'That rise happened over $4 - 2 = 2$ tickets.',
          'So each ticket costs $17 \\div 2 = \\$8.50$, and the same rate holds between every pair of rows.',
        ],
        answer: '$\\$8.50$ per ticket',
        commonError: 'Reading the first cost, 17, as the price of one ticket.',
      },
      feedback: ['Check how many tickets the first row is actually paying for.'],
      hints: ['Pick any two rows. How much did the cost change, and how many tickets caused that change?'],
      misconceptions: [{ when: ['17'], say: 'The first row is the cost of two tickets, not one.' }],
    }),

    equation({
      code: '7.7', slug: 'equation-from-table', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Write an equation in the form $y = mx + b$ for the relationship in the table.',
      stimulus: table(['$x$', '$y$'], [
        ['0', '5'],
        ['1', '8'],
        ['2', '11'],
        ['3', '14'],
      ]),
      expected: 'y=3x+5',
      accepted: ['y = 3x + 5', 'y=5+3x', 'y = 5 + 3x'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'The table gives you both numbers directly.',
        reasoning: [
          'Each time $x$ increases by 1, $y$ increases by 3, so the rate of change is 3.',
          'When $x = 0$, $y = 5$, so 5 is the starting value.',
          'That gives $y = 3x + 5$, and checking $x = 3$ gives $9 + 5 = 14$, which matches the table.',
        ],
        answer: '$y = 3x + 5$',
        commonError: 'Swapping the two numbers gives $y = 5x + 3$, which fails at every row except none.',
      },
      feedback: ['Check your equation against the last row of the table. Does it give the right value?'],
      hints: ['What is $y$ when $x$ is zero? That number is not multiplied by anything.'],
    }),

    graphWorkspace({
      code: '7.7', slug: 'graph-the-relationship', band: 3, dok: 2, taskType: 'interpretation', representation: 'graph',
      prompt: 'A pool holds 300 litres and drains at 25 litres per minute. Plot the amount of water at 0 minutes and at 4 minutes, then state the rate of change.',
      functionSpec: { type: 'linear', m: -25, b: 300 },
      graph: { xMin: 0, xMax: 12, yMin: 0, yMax: 320 },
      pointTasks: [
        { id: 'start', label: 'Plot the amount of water at 0 minutes', x: 0, expected: [0, 300] },
        { id: 'four', label: 'Plot the amount of water at 4 minutes', x: 4, expected: [4, 200] },
      ],
      analysisRequests: [
        {
          id: 'rate',
          label: 'How many litres does the pool lose each minute?',
          kind: 'decreasing',
          responseMode: 'text',
          expected: ['25'],
          accepted: ['25', '-25', '25 litres', '25 L'],
        },
      ],
      review: {
        headline: 'A constant rate is a straight line, and its steepness is the rate.',
        reasoning: [
          'At 0 minutes nothing has drained, so the first point is at 300 litres.',
          'After 4 minutes the pool has lost $4 \\times 25 = 100$ litres, leaving 200.',
          'Between those two points the graph falls 100 litres over 4 minutes, which is 25 litres per minute — the rate the question started with.',
        ],
        answer: 'The points are $(0, 300)$ and $(4, 200)$, and the pool loses 25 litres per minute.',
        connection: 'The steepness of the line and the rate in the sentence are the same number, seen two ways.',
      },
      feedback: ['Check the amount of water at time zero before plotting anything else.'],
      hints: ['How much water has drained after 4 minutes, and how much is therefore left?'],
    }),

    choice({
      code: '7.7', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says the table shows a linear relationship with a rate of change of 4. Are they right, and why?',
      stimulus: table(['$x$', '$y$'], [
        ['1', '4'],
        ['2', '8'],
        ['3', '16'],
        ['4', '32'],
      ]),
      options: [
        ['No — the $y$ values double rather than increasing by a fixed amount', true],
        ['Yes — each $y$ value is 4 times the one before', false],
        ['Yes — the first two rows increase by 4', false],
        ['No — the $x$ values are not evenly spaced', false],
      ],
      review: {
        headline: 'A linear relationship adds the same amount each step; this one multiplies.',
        reasoning: [
          'From row to row, $y$ goes up by 4, then by 8, then by 16 — the increases are not equal.',
          'What is constant is the ratio: each value is double the one before.',
          'A relationship with a constant ratio is exponential, and its graph is a curve, not a line.',
        ],
        answer: 'No. The values double, so the relationship is not linear.',
        connection: 'You will meet this distinction again in Algebra I as linear versus exponential growth.',
      },
      feedback: ['Work out the increase between each pair of rows before deciding.'],
      hints: ['Is the same amount being added each time, or the same amount being multiplied?'],
    }),

    numeric({
      code: '7.7', slug: 'predict-value', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'A candle burns at a constant rate. After 2 hours it is 19 cm tall; after 5 hours it is 13 cm tall. How tall was the candle when it was lit, in centimetres?',
      expected: '23', unit: 'cm',
      review: {
        headline: 'Find the rate first, then work backwards to the start.',
        reasoning: [
          'The candle shrank $19 - 13 = 6$ cm over $5 - 2 = 3$ hours, so it burns 2 cm per hour.',
          'Two hours before the first reading is the moment it was lit, so add back $2 \\times 2 = 4$ cm.',
          'That gives $19 + 4 = 23$ cm.',
        ],
        answer: '$23$ cm',
        commonError: 'Subtracting instead of adding when working backwards in time gives 15 cm, which is shorter than the candle ever was.',
      },
      feedback: ['You are going backwards in time here. Should the candle be taller or shorter than 19 cm?'],
      hints: ['How much does the candle shrink in one hour?'],
    }),
  ]),

  // --- 7.11A Solving two-step equations and inequalities --------------------------------
  standard('7.11A', [
    balanceEquation({
      code: '7.11A', slug: 'balance-two-step', band: 2, dok: 1,
      prompt: 'Solve $4x + 7 = 31$ using the balance workspace. Choose each move yourself.',
      equation: '4x + 7 = 31',
      answer: '6',
      review: {
        headline: 'Undo the addition before you undo the multiplication.',
        reasoning: [
          'Subtracting 7 from both sides leaves $4x = 24$.',
          'Dividing both sides by 4 leaves $x = 6$.',
          'Substituting back gives $4(6) + 7 = 31$, which checks.',
        ],
        answer: '$x = 6$',
        commonError: 'Dividing by 4 first means the 7 has to be divided too, which is more work and easy to get wrong.',
      },
      feedback: ['Look at what is being done to $x$, in order, and undo the outermost operation first.'],
      hints: ['Which operation is applied to $x$ last: the multiplying, or the adding?'],
    }),

    numeric({
      code: '7.11A', slug: 'context-solve', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A taxi charges a $\\$3.50$ pickup fee plus $\\$1.25$ per kilometre. A ride cost $\\$16$. How many kilometres was the ride?',
      expected: '10', unit: 'km',
      review: {
        headline: 'Write the equation, then undo it.',
        reasoning: [
          'The cost is $3.50 + 1.25k = 16$, where $k$ is the number of kilometres.',
          'Subtracting the pickup fee gives $1.25k = 12.50$.',
          'Dividing by 1.25 gives $k = 10$ kilometres.',
        ],
        answer: '$10$ km',
        commonError: 'Dividing $\\$16$ by $\\$1.25$ forgets that part of the fare was the pickup fee.',
      },
      feedback: ['Write the equation before solving. Which part of the $\\$16$ was not paid per kilometre?'],
      hints: ['How much of the fare had nothing to do with distance?'],
      misconceptions: [{ when: ['12.8'], say: 'The pickup fee was included in the $\\$16$, so it has to come out before you divide.' }],
    }),

    choice({
      code: '7.11A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'Sam solved $\\frac{x}{3} - 5 = 4$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$\\frac{x}{3} - 5 = 4$' },
        { label: 'Line 2', work: '$\\frac{x}{3} = 9$' },
        { label: 'Line 3', work: '$x = 3$' },
      ], { title: "Sam's work" }),
      options: [
        ['Line 1', false],
        ['Line 2', false],
        ['Line 3 — dividing instead of multiplying', true],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Dividing by 3 is undone by multiplying by 3.',
        reasoning: [
          'Line 2 is correct: adding 5 to both sides leaves $\\frac{x}{3} = 9$.',
          'To undo the division by 3, both sides are multiplied by 3, giving $x = 27$.',
          'Line 3 divided by 3 instead, which repeats the operation rather than undoing it.',
        ],
        answer: 'Line 3. The correct solution is $x = 27$.',
      },
      feedback: ['Check Line 3 by substituting the value back into the original equation.'],
      hints: ['What operation undoes dividing by 3?'],
    }),

    numberLine({
      code: '7.11A', slug: 'inequality-graph', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Solve $2x - 3 \\ge 7$, then graph the solution on the number line.',
      inequalityText: '2x - 3 ≥ 7',
      min: -2, max: 12, step: 1, variable: 'x',
      ask: ['graph'],
      intervals: [{ min: 5, max: null, minClosed: true, maxClosed: false }],
      review: {
        headline: 'Solve it like an equation, then think about which side to shade.',
        reasoning: [
          'Adding 3 to both sides gives $2x \\ge 10$.',
          'Dividing both sides by 2 gives $x \\ge 5$.',
          'Because 5 itself satisfies the inequality, the endpoint is closed, and the shading goes towards larger values.',
        ],
        answer: '$x \\ge 5$',
        commonError: 'An open circle at 5 would say that 5 is not a solution, but $2(5) - 3 = 7$, which does satisfy $\\ge 7$.',
      },
      feedback: ['Check two things: is your endpoint in the right place, and is it open or closed?'],
      hints: ['Test $x = 5$ in the original inequality. Does it work?'],
    }),

    equation({
      code: '7.11A', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a two-step equation in the form $ax + b = c$ whose solution is exactly $x = -4$, using a positive value for $a$.',
      expected: '2x+3=-5',
      accepted: ['2x + 3 = -5', '3x+2=-10', '5x+1=-19', 'x*2+3=-5', '2x+1=-7'],
      responseHint: 'Any correct equation is accepted — for example 2x + 3 = -5.',
      review: {
        headline: 'Build the equation forwards from the answer you want.',
        reasoning: [
          'Choose a value for $a$ and multiply: with $a = 2$, $2 \\times (-4) = -8$.',
          'Choose a value for $b$ and add: with $b = 3$, $-8 + 3 = -5$.',
          'That right-hand side is your $c$, giving $2x + 3 = -5$.',
        ],
        answer: 'For example $2x + 3 = -5$. Many equations are correct here.',
        connection: 'Constructing a problem with a known answer is how you check that you understand what solving actually does.',
      },
      feedback: ['Substitute $-4$ into your equation. Do both sides come out equal?'],
      hints: ['Pick your $a$ and your $b$ first, then work out what $c$ has to be.'],
    }),
  ]),
];

export default GRADE_6_7_STANDARDS;
