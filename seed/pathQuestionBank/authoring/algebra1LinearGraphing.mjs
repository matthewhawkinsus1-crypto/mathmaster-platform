// Algebra I: the rest of A.2, and the A.3 graphing strand.

import {
  choice, equation, expression, inequality, numeric, parts, standard,
  balanceEquation, graphWorkspace, linearSystem, numberLine, steps, table,
} from './kit.mjs';

export const ALGEBRA1_GRAPHING_STANDARDS = [

  // --- A.2G Horizontal and vertical lines -------------------------------------------
  standard('A.2G', [
    equation({
      code: 'A.2G', slug: 'horizontal-through-point', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the equation of the horizontal line through $(-3, 7)$.',
      expected: 'y=7',
      accepted: ['y = 7'],
      responseHint: 'Write a full equation, for example y = 4 or x = 4.',
      review: {
        headline: 'On a horizontal line every point has the same $y$.',
        reasoning: [
          'The height never changes, so the equation fixes $y$ and says nothing about $x$.',
          'The point has $y = 7$, so the line is $y = 7$.',
        ],
        answer: '$y = 7$',
        commonError: 'Writing $x = -3$ describes the vertical line through the same point.',
      },
      feedback: ['Which coordinate stays the same as you move along a horizontal line?'],
      hints: ['Pick two points on a horizontal line and compare their coordinates.'],
      misconceptions: [{ when: ['x=-3', 'x = -3'], say: 'That is the vertical line through the point. A horizontal line fixes $y$.' }],
    }),

    choice({
      code: 'A.2G', slug: 'slope-of-each', band: 2, dok: 1, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which statement about slopes is correct?',
      options: [
        ['A horizontal line has slope 0; a vertical line has undefined slope', true],
        ['A horizontal line has undefined slope; a vertical line has slope 0', false],
        ['Both have slope 0', false],
        ['Both have undefined slope', false],
      ],
      review: {
        headline: 'Slope is rise over run, and a zero denominator has no value.',
        reasoning: [
          'On a horizontal line the rise is 0, so the slope is $0 \\div \\text{run} = 0$.',
          'On a vertical line the run is 0, and dividing by zero has no answer, so the slope is undefined.',
        ],
        answer: 'Horizontal: 0. Vertical: undefined.',
      },
      feedback: ['Work out rise over run for each kind of line.'],
      hints: ['Which line has a rise of zero?'],
    }),

    parts({
      code: 'A.2G', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Each table lists points on one line. Write the equation of line P and the equation of line Q.',
      stimulus: table(['Line', 'Points'], [
        ['P', '$(2, -4)$, $(2, 0)$, $(2, 9)$'],
        ['Q', '$(-5, 3)$, $(1, 3)$, $(6, 3)$'],
      ]),
      fields: [
        { id: 'p', label: 'Equation of line P', profile: 'equation', expected: 'x=2', accepted: ['x = 2'] },
        { id: 'q', label: 'Equation of line Q', profile: 'equation', expected: 'y=3', accepted: ['y = 3'] },
      ],
      review: {
        headline: 'Look for the coordinate that never changes.',
        reasoning: [
          'Line P always has $x = 2$, so it is vertical.',
          'Line Q always has $y = 3$, so it is horizontal.',
        ],
        answer: 'P: $x = 2$. Q: $y = 3$.',
      },
      feedback: ['In each list, which coordinate is the same in every point?'],
      hints: ['Compare the first coordinates, then the second ones.'],
    }),

    choice({
      code: 'A.2G', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the slope through $(4, 1)$ and $(4, 6)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$m = \\frac{6 - 1}{4 - 4}$' },
        { label: 'Line 2', work: '$m = \\frac{5}{0} = 0$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — dividing by zero is undefined, not zero', true],
        ['Line 1 — the points were used in the wrong order', false],
        ['Line 1 — the coordinates were swapped', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Zero on the bottom is not the same as zero as an answer.',
        reasoning: [
          'Line 1 sets the calculation up correctly.',
          '$\\frac{5}{0}$ has no value, so the slope is undefined and the line is vertical.',
        ],
        answer: 'Line 2. The slope is undefined.',
      },
      feedback: ['Look at what is on the bottom of the fraction.'],
      hints: ['Is $\\frac{5}{0}$ equal to zero?'],
    }),

    equation({
      code: 'A.2G', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a vertical line that does NOT intersect the line $x = -1$.',
      expected: 'x=3',
      accepted: ['x = 3', 'x=0', 'x = 0', 'x=5', 'x = 5', 'x=-4', 'x = -4', 'x=2', 'x = 2'],
      responseHint: 'Write a full equation, for example x = 4.',
      review: {
        headline: 'Two vertical lines are parallel unless they are the same line.',
        reasoning: [
          'Every vertical line is parallel to every other vertical line.',
          'So any $x = c$ with $c \\ne -1$ never meets $x = -1$.',
        ],
        answer: 'Any vertical line except $x = -1$ — for example $x = 3$.',
        commonError: 'A horizontal line would cross $x = -1$ exactly once, so it is not an answer here.',
      },
      feedback: ['Is your line vertical, and is it a different line from $x = -1$?'],
      hints: ['What happens when two vertical lines are drawn on the same axes?'],
    }),
  ]),

  // --- A.2H Writing linear inequalities ------------------------------------------------
  standard('A.2H', [
    inequality({
      code: 'A.2H', slug: 'from-context', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A lift can carry at most 550 kg. Each box weighs 25 kg and the operator weighs 80 kg. Write an inequality for the number of boxes $b$ that can be carried.',
      expected: '25b+80<=550',
      accepted: ['25b + 80 ≤ 550', '25b+80≤550', '80+25b<=550', '25b <= 470'],
      responseHint: 'Use ≤ or ≥ from the symbol pad.',
      review: {
        headline: '"At most" is $\\le$, and the operator travels every time.',
        reasoning: [
          'The total load is $25b + 80$ kilograms.',
          '"At most 550" means that total must not exceed 550, so $25b + 80 \\le 550$.',
        ],
        answer: '$25b + 80 \\le 550$',
        commonError: 'Using $<$ excludes a load of exactly 550 kg, which the lift can in fact carry.',
      },
      feedback: ['Which weights are counted once, and which are counted for every box?'],
      hints: ['Does "at most" allow the value itself?'],
    }),

    choice({
      code: 'A.2H', slug: 'match-symbol', band: 2, dok: 1, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which phrase means $x \\ge 12$?',
      options: [
        ['$x$ is at least 12', true],
        ['$x$ is more than 12', false],
        ['$x$ is at most 12', false],
        ['$x$ is no more than 12', false],
      ],
      review: {
        headline: '"At least" includes the boundary; "more than" does not.',
        reasoning: [
          '$x \\ge 12$ is satisfied by 12 itself, which is exactly what "at least 12" allows.',
          '"More than 12" would be $x > 12$, and both "at most" phrases point the other way.',
        ],
        answer: '$x$ is at least 12.',
      },
      feedback: ['Decide two things: which direction, and whether the boundary counts.'],
      hints: ['Is 12 itself allowed?'],
    }),

    choice({
      code: 'A.2H', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows which values satisfy an inequality. Which inequality is it?',
      stimulus: table(['$x$', 'Satisfies?'], [['-2', 'yes'], ['0', 'yes'], ['3', 'yes'], ['4', 'no'], ['7', 'no']]),
      options: [
        ['$x \\le 3$', true],
        ['$x < 3$', false],
        ['$x \\ge 3$', false],
        ['$x > 4$', false],
      ],
      review: {
        headline: 'The boundary is between the last yes and the first no.',
        reasoning: [
          'Everything up to and including 3 works, and 4 does not.',
          'Because 3 itself satisfies it, the symbol must be $\\le$.',
        ],
        answer: '$x \\le 3$',
      },
      feedback: ['Find the largest value that still works, then decide whether it is included.'],
      hints: ['Does $x = 3$ satisfy the inequality?'],
    }),

    choice({
      code: 'A.2H', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student wrote $12h > 200$ for "Maya earns $\\$12$ an hour and needs at least $\\$200$." What is wrong?',
      options: [
        ['"At least" includes 200 exactly, so it should be $\\ge$', true],
        ['The 12 and the $h$ should be swapped', false],
        ['The inequality should point the other way', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Earning exactly $\\$200$ meets the goal.',
        reasoning: [
          'With $>$, earning exactly 200 would not count as reaching the target.',
          'The correct model is $12h \\ge 200$.',
        ],
        answer: '$12h \\ge 200$',
      },
      feedback: ['Ask whether the boundary value itself satisfies the situation.'],
      hints: ['If Maya earns precisely $\\$200$, has she met her goal?'],
    }),

    inequality({
      code: 'A.2H', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an inequality in $x$ whose solutions are exactly the numbers greater than or equal to $-4$.',
      expected: 'x>=-4',
      accepted: ['x ≥ -4', 'x>=-4', '-4<=x', '-4 ≤ x', 'x+4>=0'],
      responseHint: 'Use ≥ or ≤ from the symbol pad.',
      review: {
        headline: 'The boundary and the direction are the only two decisions.',
        reasoning: [
          'The boundary is $-4$ and it is included, so the symbol is $\\ge$.',
          'Larger numbers are solutions, so the variable sits on the greater side.',
        ],
        answer: '$x \\ge -4$',
      },
      feedback: ['Test $-4$ and $-5$ against your inequality.'],
      hints: ['Is $-4$ itself a solution?'],
    }),
  ]),

  // --- A.2I Writing systems of linear equations -------------------------------------------
  standard('A.2I', [
    equation({
      code: 'A.2I', slug: 'from-context-first', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'context',
      prompt: 'Adult tickets cost $\\$9$ and child tickets $\\$5$. 240 tickets were sold for $\\$1{,}640$. Using $a$ for adult tickets and $c$ for child tickets, write the equation that counts the TICKETS.',
      expected: 'a+c=240',
      accepted: ['a + c = 240', 'c+a=240', 'c + a = 240'],
      responseHint: 'Write a full equation.',
      review: {
        headline: 'One equation counts things; the other counts money.',
        reasoning: [
          'Every ticket sold is either adult or child, so $a + c = 240$.',
          'The money equation is separate: $9a + 5c = 1640$.',
        ],
        answer: '$a + c = 240$',
        commonError: 'Putting the prices into the counting equation mixes tickets and dollars in one statement.',
      },
      feedback: ['This equation should contain no prices at all.'],
      hints: ['How many tickets were sold altogether?'],
    }),

    choice({
      code: 'A.2I', slug: 'match-system', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
      prompt: 'A gym sells 30 memberships in total. Monthly ones cost $\\$40$, yearly ones $\\$300$, and the total taken is $\\$4{,}600$. Which system models this?',
      options: [
        ['$m + y = 30$ and $40m + 300y = 4600$', true],
        ['$m + y = 4600$ and $40m + 300y = 30$', false],
        ['$40m + 300y = 30$ and $m + y = 4600$', false],
        ['$m + y = 30$ and $m + y = 4600$', false],
      ],
      review: {
        headline: 'Check the units of every equation.',
        reasoning: [
          'The first equation counts memberships, so its right-hand side must be a count: 30.',
          'The second adds up money, so its right-hand side must be dollars: 4600.',
        ],
        answer: '$m + y = 30$ and $40m + 300y = 4600$',
      },
      feedback: ['Ask what each side of each equation is measured in.'],
      hints: ['Which number is a count of memberships?'],
    }),

    parts({
      code: 'A.2I', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Two phone plans are shown. Give the monthly rate of each plan.',
      stimulus: table(['Months', 'Plan A total ($)', 'Plan B total ($)'], [['0', '60', '0'], ['4', '140', '120'], ['8', '220', '240']]),
      fields: [
        { id: 'a', label: 'Plan A, dollars per month', profile: 'number', expected: '20' },
        { id: 'b', label: 'Plan B, dollars per month', profile: 'number', expected: '30' },
      ],
      review: {
        headline: 'Rate is the change in cost divided by the months it took.',
        reasoning: [
          'Plan A rises $\\$80$ over 4 months, which is $\\$20$ a month, starting from a $\\$60$ fee.',
          'Plan B rises $\\$120$ over 4 months, which is $\\$30$ a month, with no fee.',
        ],
        answer: 'Plan A: $\\$20$. Plan B: $\\$30$.',
        connection: 'Written as a system, $A = 20m + 60$ and $B = 30m$ meet at $m = 6$.',
      },
      feedback: ['The rows step by 4 months, so divide by 4.'],
      hints: ['How much does each plan rise between the first two rows?'],
    }),

    choice({
      code: 'A.2I', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student modelled "the larger number is 5 more than twice the smaller" as $2L = S + 5$. What is wrong?',
      options: [
        ['It should be $L = 2S + 5$ — the doubling applies to the smaller number', true],
        ['It should be $L = 2S - 5$', false],
        ['It should be $S = 2L + 5$', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'Read the sentence from the subject outwards.',
        reasoning: [
          '"The larger number is …" means $L$ is alone on one side.',
          '"5 more than twice the smaller" is $2S + 5$.',
        ],
        answer: '$L = 2S + 5$',
      },
      feedback: ['Which quantity is the sentence describing?'],
      hints: ['What is doubled — the larger number or the smaller one?'],
    }),

    equation({
      code: 'A.2I', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write one equation, in $x$ and $y$, that together with $x + y = 10$ would give the solution $x = 7$, $y = 3$.',
      expected: 'x-y=4',
      accepted: ['x - y = 4', 'y=x-4', 'y = x - 4', 'x=y+4', 'x = y + 4', '2x+y=17'],
      responseHint: 'Write a full equation using x and y.',
      review: {
        headline: 'Build a second true statement about the same pair.',
        reasoning: [
          'The pair $(7, 3)$ must satisfy your equation as well as $x + y = 10$.',
          '$7 - 3 = 4$, so $x - y = 4$ works, and it is not a multiple of the first equation, so the system has exactly one solution.',
        ],
        answer: 'For example $x - y = 4$.',
        commonError: 'Writing $2x + 2y = 20$ is true for the pair but is the same line, so the system would have infinitely many solutions.',
      },
      feedback: ['Check that $(7, 3)$ satisfies your equation, and that it is not just the first equation doubled.'],
      hints: ['What is $7 - 3$?'],
    }),
  ]),

  // --- A.3A Finding slope --------------------------------------------------------------
  standard('A.3A', [
    numeric({
      code: 'A.3A', slug: 'two-points', band: 2, dok: 1, taskType: 'procedural', representation: 'orderedPairs',
      prompt: 'Find the slope of the line through $(-4, 9)$ and $(2, -3)$.',
      expected: '-2',
      review: {
        headline: 'Change in $y$ over change in $x$, subtracted in the same order.',
        reasoning: [
          '$-3 - 9 = -12$ and $2 - (-4) = 6$.',
          '$-12 \\div 6 = -2$.',
        ],
        answer: '$-2$',
        commonError: 'Subtracting the points in opposite orders on the top and bottom flips the sign.',
      },
      feedback: ['Start from the same point on both the top and the bottom of your fraction.'],
      hints: ['What is $2 - (-4)$?'],
    }),

    numeric({
      code: 'A.3A', slug: 'from-standard-form', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'What is the slope of the line $6x - 3y = 15$?',
      expected: '2',
      review: {
        headline: 'Rearrange into $y = mx + b$ before reading anything off.',
        reasoning: [
          '$-3y = -6x + 15$, so dividing by $-3$ gives $y = 2x - 5$.',
          'The slope is 2.',
        ],
        answer: '$2$',
        commonError: 'Reading 6 straight off standard form ignores the coefficient on $y$.',
      },
      feedback: ['Solve for $y$ first. Watch the sign when you divide by $-3$.'],
      hints: ['What do you get after subtracting $6x$ from both sides?'],
      misconceptions: [{ when: ['6', '-2'], say: 'Divide every term by the coefficient of $y$, and keep track of the negative sign.' }],
    }),

    numeric({
      code: 'A.3A', slug: 'from-table', band: 2, dok: 1, taskType: 'interpretation', representation: 'table',
      prompt: 'What is the slope of the line described by the table?',
      stimulus: table(['$x$', '$y$'], [['-6', '10'], ['-2', '7'], ['6', '1']]),
      expected: '-0.75',
      accepted: ['-3/4'], tolerance: 0.005,
      review: {
        headline: 'Any two rows give the same slope, so choose the easiest pair.',
        reasoning: [
          'From the first row to the second, $y$ falls 3 while $x$ rises 4.',
          '$-3 \\div 4 = -0.75$, and the last pair of rows gives $-6 \\div 8$, which is the same.',
        ],
        answer: '$-\\frac{3}{4}$',
      },
      feedback: ['Check your slope against a second pair of rows.'],
      hints: ['How much does $y$ change between the first two rows?'],
    }),

    choice({
      code: 'A.3A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student found the slope through $(5, 2)$ and $(1, 10)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$m = \\frac{5 - 1}{2 - 10}$' },
        { label: 'Line 2', work: '$m = \\frac{4}{-8} = -\\frac{1}{2}$' },
      ], { title: 'The work' }),
      options: [
        ['Line 1 — the coordinates are the wrong way up', true],
        ['Line 2 — the arithmetic is wrong', false],
        ['Line 2 — the fraction was not simplified', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'The $y$ values belong on top.',
        reasoning: [
          'Line 1 puts the $x$ values in the numerator and the $y$ values in the denominator.',
          'The correct calculation is $\\frac{10 - 2}{1 - 5} = \\frac{8}{-4} = -2$.',
        ],
        answer: 'Line 1. The slope is $-2$.',
        commonError: 'The reciprocal of the right answer is the classic sign that the fraction was built upside down.',
      },
      feedback: ['Look at which coordinates appear on top.'],
      hints: ['Slope is rise over run. Which coordinate measures rise?'],
    }),

    numeric({
      code: 'A.3A', slug: 'reverse-missing', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'The line through $(3, k)$ and $(7, 14)$ has slope $\\frac{1}{2}$. Find $k$.',
      expected: '12',
      review: {
        headline: 'Write the slope formula and solve for the unknown coordinate.',
        reasoning: [
          '$\\frac{14 - k}{7 - 3} = \\frac{1}{2}$, so $\\frac{14 - k}{4} = \\frac{1}{2}$.',
          'That gives $14 - k = 2$, so $k = 12$.',
        ],
        answer: '$k = 12$',
        commonError: 'Adding the slope to 14 instead of solving gives 14.5, which does not satisfy the formula.',
      },
      feedback: ['Set up the slope formula with $k$ in it, then solve.'],
      hints: ['What is $7 - 3$?'],
    }),
  ]),

  // --- A.3B Interpreting rate of change --------------------------------------------------
  standard('A.3B', [
    numeric({
      code: 'A.3B', slug: 'compute-rate', band: 2, dok: 1, taskType: 'procedural', representation: 'context',
      prompt: 'A car\'s fuel tank holds 54 litres at the start of a trip and 30 litres after 300 km. What is the rate of change, in litres per kilometre? Give your answer as a decimal.',
      expected: '-0.08', unit: 'litres per km', tolerance: 0.0005,
      review: {
        headline: 'Rate of change carries a sign and a unit.',
        reasoning: [
          'The fuel falls by 24 litres over 300 km.',
          '$-24 \\div 300 = -0.08$ litres per kilometre.',
        ],
        answer: '$-0.08$ L/km',
        commonError: 'Dropping the sign says the tank is filling up.',
      },
      feedback: ['Is the fuel increasing or decreasing? Your answer should show that.'],
      hints: ['How much fuel was used altogether?'],
    }),

    choice({
      code: 'A.3B', slug: 'interpret-in-context', band: 3, dok: 2, taskType: 'interpretation', representation: 'context',
      prompt: 'A cooling model is $T = -1.4m + 92$, where $T$ is temperature in °C and $m$ is minutes. What does $-1.4$ mean?',
      options: [
        ['The drink cools by 1.4 °C each minute', true],
        ['The drink starts at 1.4 °C', false],
        ['The drink cools for 1.4 minutes', false],
        ['The drink cools by 1.4 °C in total', false],
      ],
      review: {
        headline: 'The coefficient of the variable is a rate, and it carries both units.',
        reasoning: [
          'It multiplies minutes, so its units are degrees per minute.',
          'The negative sign means the temperature is falling.',
        ],
        answer: 'It cools by 1.4 °C every minute.',
        connection: 'The 92 is the other half of the story: the starting temperature.',
      },
      feedback: ['What are the units of the number that multiplies $m$?'],
      hints: ['Work out $T$ at $m = 0$ and at $m = 1$ and compare.'],
    }),

    numeric({
      code: 'A.3B', slug: 'from-table', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'The table shows two hikers\' distances from base camp. How many kilometres per hour faster is the faster hiker?',
      stimulus: table(['Hours', 'Hiker A (km)', 'Hiker B (km)'], [['1', '4', '6'], ['3', '14', '13'], ['5', '24', '20']]),
      expected: '1.5', unit: 'km/h', tolerance: 0.005,
      review: {
        headline: 'Two rates, then one comparison.',
        reasoning: [
          'Hiker A covers 20 km in 4 hours, which is 5 km/h.',
          'Hiker B covers 14 km in 4 hours, which is 3.5 km/h.',
          'The difference is 1.5 km/h.',
        ],
        answer: '$1.5$ km/h',
        commonError: 'Comparing the last row alone says B is behind, but that is a distance, not a rate.',
      },
      feedback: ['Work out each hiker\'s rate before comparing them.'],
      hints: ['How far does each hiker travel between hour 1 and hour 5?'],
    }),

    choice({
      code: 'A.3B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says a rate of change of $-6$ means "the quantity is small". What is the correct interpretation?',
      options: [
        ['It means the quantity is falling by 6 units for every 1 unit of input', true],
        ['It means the quantity is always negative', false],
        ['It means the quantity starts at $-6$', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'The sign of a rate describes direction, not size.',
        reasoning: [
          'A negative rate means the output decreases as the input increases.',
          'The quantity itself can be large and positive the whole time — a tank falling from 900 to 300 litres has a negative rate throughout.',
        ],
        answer: 'It is falling by 6 per unit.',
      },
      feedback: ['Think of a quantity that is both large and decreasing.'],
      hints: ['Does a negative slope say anything about where the graph sits?'],
    }),

    numeric({
      code: 'A.3B', slug: 'reverse-rate', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A tank drains at a constant rate. After 5 minutes it holds 310 litres; it is empty after 20 minutes. How many litres did it hold at the start?',
      expected: '413.33', tolerance: 0.7, unit: 'litres',
      review: {
        headline: 'Find the rate from what you know, then run it backwards.',
        reasoning: [
          'From minute 5 to minute 20 it loses 310 litres in 15 minutes, so the rate is about 20.67 litres per minute.',
          'Five minutes earlier it held $310 + 5 \\times 20.67 \\approx 413.3$ litres.',
        ],
        answer: 'About $413$ litres.',
        connection: 'Extending a linear model backwards to time zero is exactly finding its intercept.',
      },
      feedback: ['Work out the drain rate first, then go back five minutes.'],
      hints: ['How many minutes pass between the two facts you are given?'],
    }),
  ]),

  // --- A.3C Graphing linear functions -------------------------------------------------------
  standard('A.3C', [
    graphWorkspace({
      code: 'A.3C', slug: 'plot-and-read', band: 2, dok: 1, taskType: 'procedural', representation: 'graph',
      prompt: 'Graph $y = -2x + 6$: plot the point where $x = 0$ and the point where $x = 3$, then give the $x$-intercept.',
      functionSpec: { type: 'linear', m: -2, b: 6 },
      graph: { xMin: -2, xMax: 8, yMin: -4, yMax: 8 },
      pointTasks: [
        { id: 'yint', label: 'Plot the point where $x = 0$', x: 0, expected: [0, 6] },
        { id: 'xint', label: 'Plot the point where $x = 3$', x: 3, expected: [3, 0] },
      ],
      analysisRequests: [
        { id: 'zero', label: 'At what $x$ value does the line cross the $x$-axis?', kind: 'decreasing', responseMode: 'text', expected: ['3'], accepted: ['3', '(3, 0)', '(3,0)'] },
      ],
      review: {
        headline: 'The $x$-intercept is where the output is zero.',
        reasoning: [
          'Setting $-2x + 6 = 0$ gives $x = 3$.',
          'The $y$-intercept is 6, and the line falls 2 for every 1 across.',
        ],
        answer: 'The line crosses the $x$-axis at $x = 3$.',
      },
      feedback: ['The $x$-intercept is where $y$ is zero, not where $x$ is zero.'],
      hints: ['Solve $-2x + 6 = 0$.'],
    }),

    parts({
      code: 'A.3C', slug: 'key-features', band: 3, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For the line $4x - 5y = 20$, give the $x$-intercept and the $y$-intercept as numbers.',
      fields: [
        { id: 'x', label: '$x$-intercept', profile: 'number', expected: '5' },
        { id: 'y', label: '$y$-intercept', profile: 'number', expected: '-4' },
      ],
      review: {
        headline: 'Set the other variable to zero for each intercept.',
        reasoning: [
          'Setting $y = 0$ gives $4x = 20$, so $x = 5$.',
          'Setting $x = 0$ gives $-5y = 20$, so $y = -4$.',
        ],
        answer: '$x$-intercept 5, $y$-intercept $-4$.',
        commonError: 'Swapping the two is easy to do — the $x$-intercept is where $y$ is zero.',
      },
      feedback: ['To find where the line crosses an axis, set the OTHER variable to zero.'],
      hints: ['What does the equation become when $y = 0$?'],
    }),

    choice({
      code: 'A.3C', slug: 'match-table-to-line', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which line passes through every point in the table?',
      stimulus: table(['$x$', '$y$'], [['-1', '-1'], ['1', '5'], ['4', '14']]),
      options: [
        ['$y = 3x + 2$', true],
        ['$y = 3x - 2$', false],
        ['$y = 2x + 3$', false],
        ['$y = -3x + 2$', false],
      ],
      review: {
        headline: 'Test a candidate on every row, not just the first.',
        reasoning: [
          '$y = 3x + 2$ gives $-1$, 5 and 14 at the three inputs.',
          '$y = 2x + 3$ happens to give 5 at $x = 1$, which is why testing one row is not enough.',
        ],
        answer: '$y = 3x + 2$',
      },
      feedback: ['Two of these options agree on one row. Check all three rows.'],
      hints: ['What does each option give at $x = 4$?'],
    }),

    choice({
      code: 'A.3C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'To graph $y = \\frac{2}{3}x - 1$, a student started at $(0, -1)$ and then moved 2 right and 3 up. What went wrong?',
      options: [
        ['The slope was used upside down — it is 2 up and 3 right', true],
        ['The starting point should be $(0, 1)$', false],
        ['The student should have moved 2 left and 3 down', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'The numerator is the rise; the denominator is the run.',
        reasoning: [
          '$\\frac{2}{3}$ means rise 2 for a run of 3.',
          'Moving 2 right and 3 up draws a line of slope $\\frac{3}{2}$, which is steeper than intended.',
        ],
        answer: 'From $(0, -1)$, go 3 right and 2 up to $(3, 1)$.',
      },
      feedback: ['Which number of the fraction is the vertical movement?'],
      hints: ['Is a slope of $\\frac{2}{3}$ steeper or shallower than a slope of 1?'],
    }),

    equation({
      code: 'A.3C', slug: 'reverse-from-features', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of the line with $x$-intercept 4 and $y$-intercept $-6$, in slope-intercept form.',
      expected: 'y=1.5x-6',
      accepted: ['y = 1.5x - 6', 'y=3/2x-6', 'y = (3/2)x - 6'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Two intercepts are two points.',
        reasoning: [
          'The intercepts are the points $(4, 0)$ and $(0, -6)$.',
          'The slope is $\\frac{0 - (-6)}{4 - 0} = \\frac{6}{4} = 1.5$, and the $y$-intercept is given as $-6$.',
        ],
        answer: '$y = 1.5x - 6$',
      },
      feedback: ['Turn each intercept into an ordered pair first.'],
      hints: ['What point does an $x$-intercept of 4 describe?'],
    }),
  ]),

  // --- A.3D Graphing linear inequalities ------------------------------------------------------
  standard('A.3D', [
    choice({
      code: 'A.3D', slug: 'boundary-and-shading', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How is the graph of $y < 2x + 1$ drawn?',
      options: [
        ['A dashed line, shaded below', true],
        ['A solid line, shaded below', false],
        ['A dashed line, shaded above', false],
        ['A solid line, shaded above', false],
      ],
      review: {
        headline: 'Strict inequality means a dashed boundary; "less than" shades below.',
        reasoning: [
          'The boundary points satisfy $y = 2x + 1$, which is not part of $y < 2x + 1$, so the line is dashed.',
          'Points below the line have smaller $y$ values, which is what the inequality asks for.',
        ],
        answer: 'Dashed, shaded below.',
      },
      feedback: ['Two decisions: is the boundary included, and which side satisfies the inequality?'],
      hints: ['Test the origin in the inequality. Does it satisfy it?'],
    }),

    choice({
      code: 'A.3D', slug: 'test-a-point', band: 3, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
      prompt: 'Which point is a solution of $3x - y \\ge 6$?',
      options: [
        ['$(4, 2)$', true],
        ['$(1, 1)$', false],
        ['$(0, 0)$', false],
        ['$(2, 5)$', false],
      ],
      review: {
        headline: 'Substitute and check the inequality, not just the equation.',
        reasoning: [
          '$3(4) - 2 = 10$, and $10 \\ge 6$ is true.',
          '$(1, 1)$ gives 2, $(0, 0)$ gives 0 and $(2, 5)$ gives 1 — none reaches 6.',
        ],
        answer: '$(4, 2)$',
      },
      feedback: ['Work out the left-hand side for each point before comparing with 6.'],
      hints: ['What is $3(4) - 2$?'],
    }),

    numberLine({
      code: 'A.3D', slug: 'one-variable-graph', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Solve $-3x + 4 > 13$ and graph the solution on the number line.',
      inequalityText: '-3x + 4 > 13',
      min: -10, max: 6, step: 1, variable: 'x',
      ask: ['graph'],
      intervals: [{ min: null, max: -3, minClosed: false, maxClosed: false }],
      review: {
        headline: 'Dividing by a negative reverses the inequality.',
        reasoning: [
          'Subtracting 4 gives $-3x > 9$.',
          'Dividing both sides by $-3$ reverses the symbol: $x < -3$.',
          'The endpoint is open because $-3$ itself does not satisfy a strict inequality.',
        ],
        answer: '$x < -3$',
        commonError: 'Keeping the symbol pointing the same way gives $x > -3$, which is every value that is NOT a solution.',
      },
      feedback: ['Check by testing $x = -4$ in the original inequality.'],
      hints: ['What happens to an inequality symbol when both sides are divided by a negative number?'],
    }),

    choice({
      code: 'A.3D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student graphed $y \\le -x + 4$ with a dashed boundary. What is wrong?',
      options: [
        ['$\\le$ includes the boundary, so the line should be solid', true],
        ['The shading should be above the line', false],
        ['The boundary should have positive slope', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A dashed line says "these points are not solutions".',
        reasoning: [
          'Every point on $y = -x + 4$ satisfies $y \\le -x + 4$ with equality.',
          'So the boundary belongs to the solution set and must be drawn solid.',
        ],
        answer: 'The line should be solid.',
      },
      feedback: ['Does a point exactly on the line satisfy the inequality?'],
      hints: ['Try $(0, 4)$ in the inequality.'],
    }),

    inequality({
      code: 'A.3D', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'graph',
      prompt: 'A graph shows a solid boundary through $(0, 2)$ with slope $-1$, and the region ABOVE it is shaded. Write the inequality.',
      expected: 'y>=-x+2',
      accepted: ['y ≥ -x + 2', 'y>=-x+2', 'x+y>=2', 'y >= 2 - x'],
      responseHint: 'Use ≥ or ≤ from the symbol pad.',
      review: {
        headline: 'Boundary first, then the symbol.',
        reasoning: [
          'The boundary line is $y = -x + 2$.',
          'Solid means the boundary is included, and shading above means the $y$ values are larger, so the symbol is $\\ge$.',
        ],
        answer: '$y \\ge -x + 2$',
      },
      feedback: ['Write the equation of the boundary before choosing the symbol.'],
      hints: ['Does shading above mean $y$ is greater or smaller than the boundary?'],
    }),
  ]),
];

export default ALGEBRA1_GRAPHING_STANDARDS;
