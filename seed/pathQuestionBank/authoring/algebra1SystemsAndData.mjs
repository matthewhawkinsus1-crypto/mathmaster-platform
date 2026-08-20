// Algebra I: transformations of lines, systems, data models and solving.

import {
  choice, equation, expression, inequality, numeric, orderedPair, parts, standard,
  balanceEquation, graphWorkspace, linearSystem, numberLine, steps, table,
} from './kit.mjs';

export const ALGEBRA1_SYSTEMS_STANDARDS = [

  // --- A.3E Transformations of the linear parent function ---------------------------
  standard('A.3E', [
    choice({
      code: 'A.3E', slug: 'describe-shift', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How does the graph of $y = x - 7$ compare with the graph of $y = x$?',
      options: [
        ['Shifted 7 units down', true],
        ['Shifted 7 units up', false],
        ['Shifted 7 units right', false],
        ['Seven times as steep', false],
      ],
      review: {
        headline: 'Subtracting from the output lowers the graph.',
        reasoning: [
          'Every output is 7 less than before, so every point moves down 7.',
          'The slope is unchanged, so the two lines are parallel.',
        ],
        answer: 'Down 7.',
      },
      feedback: ['Compare the two graphs at $x = 0$.'],
      hints: ['What is $y$ when $x = 0$ in each equation?'],
    }),

    choice({
      code: 'A.3E', slug: 'steepness', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Compared with $y = x$, which transformation makes the line steeper AND keeps it rising?',
      stimulus: table(['Option', 'Equation'], [
        ['W', '$y = 4x$'],
        ['X', '$y = 0.25x$'],
        ['Y', '$y = -4x$'],
        ['Z', '$y = x + 4$'],
      ]),
      options: [['Option W', true], ['Option X', false], ['Option Y', false], ['Option Z', false]],
      review: {
        headline: 'Steepness is the size of the slope; rising is its sign.',
        reasoning: [
          '$y = 4x$ has slope 4, which is larger in size than 1 and positive.',
          '$y = 0.25x$ is shallower, $y = -4x$ is steep but falling, and $y = x + 4$ has the same steepness as $y = x$.',
        ],
        answer: 'Option W.',
      },
      feedback: ['Check two things for each option: the size of the slope, and its sign.'],
      hints: ['Which option changes the slope without changing its sign?'],
    }),

    equation({
      code: 'A.3E', slug: 'write-transformed', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
      prompt: 'The parent function $y = x$ is reflected across the $x$-axis and shifted up 5. Write the resulting equation.',
      expected: 'y=-x+5',
      accepted: ['y = -x + 5', 'y=5-x', 'y = 5 - x'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'A reflection changes the sign of the slope; a shift changes the constant.',
        reasoning: [
          'Reflecting $y = x$ across the $x$-axis gives $y = -x$.',
          'Shifting up 5 adds 5 to every output: $y = -x + 5$.',
        ],
        answer: '$y = -x + 5$',
      },
      feedback: ['Apply the reflection first, then the shift.'],
      hints: ['What is the equation after the reflection alone?'],
    }),

    choice({
      code: 'A.3E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student says $y = 3x$ is "$y = x$ shifted up 3". What is the correct description?',
      options: [
        ['It is $y = x$ stretched to three times the steepness', true],
        ['It is $y = x$ shifted right 3', false],
        ['It is $y = x$ reflected and shifted', false],
        ['The student is right', false],
      ],
      review: {
        headline: 'Multiplying the input changes steepness; adding a constant shifts.',
        reasoning: [
          'At $x = 0$ both graphs pass through the origin, so nothing has been shifted.',
          'At $x = 2$, $y = x$ gives 2 and $y = 3x$ gives 6 — the gap grows, which is a stretch.',
        ],
        answer: 'A vertical stretch by a factor of 3.',
      },
      feedback: ['Compare the two graphs at $x = 0$ and again at $x = 2$.'],
      hints: ['Does a shift change the gap between two graphs as $x$ grows?'],
    }),

    equation({
      code: 'A.3E', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write the equation of a line that is a transformation of $y = x$, falls from left to right, and passes through $(0, -3)$.',
      expected: 'y=-x-3',
      accepted: ['y = -x - 3', 'y=-2x-3', 'y = -2x - 3', 'y=-0.5x-3'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Two conditions, two decisions.',
        reasoning: [
          'Passing through $(0, -3)$ fixes the constant at $-3$.',
          'Falling means the slope must be negative, and any negative slope will do.',
        ],
        answer: 'For example $y = -x - 3$.',
      },
      feedback: ['Check the sign of your slope and the value of your constant.'],
      hints: ['What does the graph do at $x = 0$?'],
    }),
  ]),

  // --- A.3F Solving systems by graphing --------------------------------------------
  standard('A.3F', [
    linearSystem({
      code: 'A.3F', slug: 'workspace-solve', band: 3, dok: 2,
      prompt: 'Graph $y = \\frac{1}{2}x + 1$ and $y = -x + 7$ in the workspace, classify the system, and give the intersection point.',
      m1: 0.5, b1: 1, m2: -1, b2: 7,
      review: {
        headline: 'The intersection satisfies both equations at once.',
        reasoning: [
          'Setting $\\frac{1}{2}x + 1 = -x + 7$ gives $\\frac{3}{2}x = 6$, so $x = 4$.',
          'Substituting back gives $y = 3$, and the different slopes guarantee exactly one crossing.',
        ],
        answer: '$(4, 3)$, one solution.',
      },
      feedback: ['Check your point in BOTH equations, not just one.'],
      hints: ['Where do the two lines have the same $y$ value?'],
    }),

    orderedPair({
      code: 'A.3F', slug: 'from-table', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table evaluates two lines. Give the solution of the system as an ordered pair.',
      stimulus: table(['$x$', 'Line 1: $y$', 'Line 2: $y$'], [['-1', '-5', '7'], ['1', '1', '5'], ['2', '4', '4'], ['4', '10', '2']]),
      expected: '(2,4)',
      accepted: ['(2, 4)', '2,4'],
      responseHint: 'Write your answer as an ordered pair, for example (3, -1).',
      review: {
        headline: 'The solution is the row where both lines agree.',
        reasoning: [
          'At $x = 2$ both lines give $y = 4$.',
          'Before that row Line 2 is higher, and afterwards Line 1 is — they cross exactly once.',
        ],
        answer: '$(2, 4)$',
      },
      feedback: ['Look for the row where the two right-hand columns match.'],
      hints: ['Compare the two columns row by row.'],
    }),

    choice({
      code: 'A.3F', slug: 'classify', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'How many solutions does the system $y = 2x - 3$ and $y = 2x + 5$ have?',
      options: [
        ['None — the lines are parallel and distinct', true],
        ['Exactly one', false],
        ['Infinitely many', false],
        ['Exactly two', false],
      ],
      review: {
        headline: 'Equal slopes with different intercepts never meet.',
        reasoning: [
          'Setting the right-hand sides equal gives $-3 = 5$, which is false for every $x$.',
          'Geometrically the lines stay 8 units apart for ever.',
        ],
        answer: 'No solution.',
      },
      feedback: ['Set the two expressions equal and see what statement you are left with.'],
      hints: ['Subtract $2x$ from both sides.'],
    }),

    choice({
      code: 'A.3F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student reads a solution of $(3, 5)$ off a graph but does not check it. Why is checking necessary here?',
      options: [
        ['A point read from a graph is an estimate until it satisfies both equations', true],
        ['Graphs can only show integer solutions', false],
        ['The solution must always be checked in exactly one equation', false],
        ['Checking is unnecessary if the graph is neat', false],
      ],
      review: {
        headline: 'Graphing locates a solution; algebra confirms it.',
        reasoning: [
          'A crossing point that looks like $(3, 5)$ might really be $(3.1, 5.2)$.',
          'Substituting into both equations is what turns a reading into an answer.',
        ],
        answer: 'Because a graphical reading is an estimate.',
        connection: 'This is why A.3G asks you to ESTIMATE graphically and then solve algebraically.',
      },
      feedback: ['Think about what happens when the intersection is not at a grid point.'],
      hints: ['How precisely can you read a graph?'],
    }),

    equation({
      code: 'A.3F', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation that, together with $y = 3x - 4$, forms a system with NO solution.',
      expected: 'y=3x+1',
      accepted: ['y = 3x + 1', 'y=3x+2', 'y = 3x + 2', 'y=3x', 'y = 3x', 'y=3x-1'],
      responseHint: 'Write it in the form y = mx + b.',
      review: {
        headline: 'Same slope, different intercept.',
        reasoning: [
          'Matching the slope makes the lines parallel.',
          'A different constant keeps them from being the same line, so they never meet.',
        ],
        answer: 'Any $y = 3x + b$ with $b \\ne -4$ — for example $y = 3x + 1$.',
        commonError: 'Writing $y = 3x - 4$ again gives infinitely many solutions, not none.',
      },
      feedback: ['Is your slope the same, and is your constant different?'],
      hints: ['What makes two lines parallel?'],
    }),
  ]),

  // --- A.3G Estimating solutions of systems ----------------------------------------------
  standard('A.3G', [
    numeric({
      code: 'A.3G', slug: 'break-even', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A stall costs $\\$120$ to set up and $\\$2$ per drink to make; each drink sells for $\\$5$. How many drinks must be sold to break even?',
      expected: '40', unit: 'drinks',
      review: {
        headline: 'Break-even is where cost and revenue meet.',
        reasoning: [
          'Cost is $120 + 2d$ and revenue is $5d$.',
          'Setting them equal gives $3d = 120$, so $d = 40$ drinks.',
        ],
        answer: '$40$ drinks',
        commonError: 'Dividing 120 by 5 ignores the $\\$2$ cost of making each drink.',
      },
      feedback: ['How much profit does each drink actually contribute?'],
      hints: ['Write the cost and the revenue as two separate expressions.'],
      misconceptions: [{ when: ['24'], say: 'That divides the setup cost by the selling price, but each drink also costs $\\$2$ to make.' }],
    }),


    linearSystem({
      code: 'A.3G', slug: 'estimate-graphically', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'A pool is draining while a second pool fills. Graph both lines in the workspace, then give the point where the two pools hold the same amount and say how many such moments there are.',
      m1: -3, b1: 18, m2: 1, b2: 2,
      review: {
        headline: 'The lines cross where the two quantities are equal.',
        reasoning: [
          'One line falls and the other rises, so they must meet exactly once.',
          'Setting $-3x + 18 = x + 2$ gives $16 = 4x$, and substituting back gives the shared amount.',
        ],
        answer: 'One moment, at $(4, 6)$.',
      },
      feedback: ['A falling line and a rising line — how many times can they cross?'],
      hints: ['Read roughly where the lines meet on the graph first, then set the two expressions equal to confirm it exactly.'],
    }),

    numeric({
      code: 'A.3G', slug: 'refine-estimate', band: 4, dok: 3, taskType: 'transfer', representation: 'symbolic',
      prompt: 'A graph suggests the lines $y = 1.5x + 2$ and $y = -0.5x + 8$ cross near $x = 3$. Solve algebraically and give the exact $x$ value.',
      expected: '3',
      review: {
        headline: 'Estimate to locate, solve to confirm.',
        reasoning: [
          'Setting $1.5x + 2 = -0.5x + 8$ gives $2x = 6$.',
          'So $x = 3$ exactly, and the graph reading was right.',
        ],
        answer: '$x = 3$',
        connection: 'When the algebra disagrees with the graph, the algebra is right and the reading was imprecise.',
      },
      feedback: ['Set the two expressions equal and collect the $x$ terms.'],
      hints: ['What do you get when you add $0.5x$ to both sides?'],
    }),

    choice({
      code: 'A.3G', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student estimates a break-even point at 18.5 items and reports "18.5 items". What should they say instead?',
      options: [
        ['19 items, because you cannot sell half an item and 18 would still be a loss', true],
        ['18 items, rounding down', false],
        ['18.5 items is correct', false],
        ['The break-even point cannot be found', false],
      ],
      review: {
        headline: 'The context decides how a numerical answer is reported.',
        reasoning: [
          'Items are counted, so the answer must be a whole number.',
          'At 18 items the stall is still short of covering costs, so 19 is the first count that breaks even.',
        ],
        answer: '19 items.',
        connection: 'This is the discrete-domain reasoning from A.2A applied to a system.',
      },
      feedback: ['Ask what the number is counting, and which whole number actually satisfies the condition.'],
      hints: ['Does 18 items cover the costs?'],
    }),

    orderedPair({
      code: 'A.3G', slug: 'reverse-scenario', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Two lines cross at exactly one point. One is $y = 4x - 5$ and the other has slope $-1$ and passes through the intersection. If the intersection has $x = 2$, give the intersection as an ordered pair.',
      expected: '(2,3)',
      accepted: ['(2, 3)', '2,3'],
      responseHint: 'Write your answer as an ordered pair, for example (3, -1).',
      review: {
        headline: 'The intersection is on both lines, so either one gives its $y$.',
        reasoning: [
          'Substituting $x = 2$ into $y = 4x - 5$ gives $y = 3$.',
          'The second line must also pass through $(2, 3)$, which makes it $y = -x + 5$.',
        ],
        answer: '$(2, 3)$',
      },
      feedback: ['You already have one full equation. Use it.'],
      hints: ['What is $4(2) - 5$?'],
    }),
  ]),

  // --- A.3H Graphing systems of inequalities ------------------------------------------------
  standard('A.3H', [
    choice({
      code: 'A.3H', slug: 'which-region', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which point is in the solution region of BOTH $y > x - 1$ and $y \\le -2x + 6$?',
      options: [
        ['$(1, 3)$', true],
        ['$(4, 1)$', false],
        ['$(0, -4)$', false],
        ['$(3, 5)$', false],
      ],
      review: {
        headline: 'A solution of a system of inequalities satisfies every one of them.',
        reasoning: [
          '$(1, 3)$: $3 > 0$ is true, and $3 \\le 4$ is true.',
          '$(3, 5)$ satisfies the first but not the second, which is why checking both matters.',
        ],
        answer: '$(1, 3)$',
      },
      feedback: ['Test each point in both inequalities before choosing.'],
      hints: ['Start with the second inequality — it rules out more of the options.'],
    }),

    parts({
      code: 'A.3H', slug: 'boundaries', band: 2, dok: 1, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For the system $y \\ge 2x + 1$ and $y < -x + 4$, state whether each boundary is solid or dashed. Answer with the word solid or dashed.',
      fields: [
        { id: 'first', label: 'Boundary of $y \\ge 2x + 1$', profile: 'text', expected: 'solid', accepted: ['Solid'] },
        { id: 'second', label: 'Boundary of $y < -x + 4$', profile: 'text', expected: 'dashed', accepted: ['Dashed'] },
      ],
      review: {
        headline: 'The symbol decides the line style.',
        reasoning: [
          '$\\ge$ includes equality, so its boundary belongs to the solution and is drawn solid.',
          '$<$ excludes equality, so its boundary is drawn dashed.',
        ],
        answer: 'Solid, then dashed.',
      },
      feedback: ['Does each inequality allow the boundary points themselves?'],
      hints: ['Which symbol has a line underneath it?'],
    }),

    choice({
      code: 'A.3H', slug: 'context-constraints', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A student has at most 12 hours to split between studying $s$ and working $w$, and must work at least 4 hours. Which system models this?',
      options: [
        ['$s + w \\le 12$ and $w \\ge 4$', true],
        ['$s + w \\ge 12$ and $w \\le 4$', false],
        ['$s + w \\le 12$ and $s \\ge 4$', false],
        ['$s + w = 12$ and $w = 4$', false],
      ],
      review: {
        headline: '"At most" caps a total; "at least" sets a floor.',
        reasoning: [
          'The 12 hours is a maximum for the combined total, so $s + w \\le 12$.',
          'The 4 hours is a minimum for working alone, so $w \\ge 4$.',
        ],
        answer: '$s + w \\le 12$ and $w \\ge 4$',
      },
      feedback: ['Which constraint is about the total, and which is about one activity?'],
      hints: ['Does "at most 12" allow 10 hours?'],
    }),

    choice({
      code: 'A.3H', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student shades the region for each inequality of a system and says the solution is everywhere either one is shaded. What is wrong?',
      options: [
        ['The solution is where the regions OVERLAP, not their combination', true],
        ['Only the first inequality should be shaded', false],
        ['Systems of inequalities have no solution region', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'A system asks for points that satisfy all of it.',
        reasoning: [
          'A point in only one shaded region fails the other inequality.',
          'The solution set is the intersection of the regions, which is usually much smaller.',
        ],
        answer: 'The overlap.',
      },
      feedback: ['Would a point in only one region satisfy the whole system?'],
      hints: ['What does "and" mean when two conditions are joined?'],
    }),

    inequality({
      code: 'A.3H', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'graph',
      prompt: 'One inequality of a system is $y \\le 3$. Write a second inequality so that $(0, 0)$ is a solution of the system but $(5, 0)$ is not.',
      expected: 'x<=2',
      accepted: ['x ≤ 2', 'x<=2', 'x<3', 'x ≤ 4', 'x<=4', 'x<=1', 'x ≤ 1'],
      responseHint: 'Use ≤ or ≥ from the symbol pad.',
      review: {
        headline: 'Find a condition the first point meets and the second does not.',
        reasoning: [
          'Both points already satisfy $y \\le 3$, so the second inequality has to do the separating.',
          'The points differ only in $x$: 0 and 5. Any inequality that admits 0 and excludes 5 works — for example $x \\le 2$.',
        ],
        answer: 'For example $x \\le 2$.',
      },
      feedback: ['Check both points against your inequality: one must pass, one must fail.'],
      hints: ['What is different between $(0, 0)$ and $(5, 0)$?'],
    }),
  ]),

  // --- A.4A Correlation coefficient ----------------------------------------------------------
  standard('A.4A', [
    choice({
      code: 'A.4A', slug: 'interpret-r', band: 2, dok: 1, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'A data set has correlation coefficient $r = -0.93$. What does this say?',
      options: [
        ['A strong negative linear relationship', true],
        ['A weak negative linear relationship', false],
        ['A strong positive linear relationship', false],
        ['No relationship', false],
      ],
      review: {
        headline: 'The sign is the direction; the distance from zero is the strength.',
        reasoning: [
          'A negative $r$ means one variable falls as the other rises.',
          '$|r| = 0.93$ is close to 1, so the points lie close to a straight line.',
        ],
        answer: 'Strong and negative.',
      },
      feedback: ['Read the sign and the size separately.'],
      hints: ['How close to 1 is $0.93$?'],
    }),

    choice({
      code: 'A.4A', slug: 'compare-r', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which data set is best modelled by a linear function?',
      stimulus: table(['Data set', '$r$'], [['A', '0.42'], ['B', '-0.97'], ['C', '0.68'], ['D', '-0.11']]),
      options: [['Data set B', true], ['Data set C', false], ['Data set A', false], ['Data set D', false]],
      review: {
        headline: 'Strength ignores the sign.',
        reasoning: [
          '$|-0.97| = 0.97$ is the largest, so B is closest to a straight line.',
          'A negative correlation is just as strong as a positive one of the same size.',
        ],
        answer: 'Data set B.',
        commonError: 'Choosing C because 0.68 is the biggest positive value confuses direction with strength.',
      },
      feedback: ['Ignore the signs and compare the sizes.'],
      hints: ['Which value is furthest from zero?'],
    }),

    choice({
      code: 'A.4A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student reports $r = 1.4$ for a data set. What is the problem?',
      options: [
        ['$r$ always lies between $-1$ and 1, so the value is impossible', true],
        ['$r$ must be negative', false],
        ['$r$ must be a whole number', false],
        ['Nothing is wrong', false],
      ],
      review: {
        headline: 'The correlation coefficient is bounded.',
        reasoning: [
          '$r$ ranges from $-1$ to $1$ inclusive.',
          'A value outside that range means a calculation or entry error, not an unusually strong relationship.',
        ],
        answer: 'It is outside the possible range.',
      },
      feedback: ['What are the largest and smallest values $r$ can take?'],
      hints: ['What does $r = 1$ describe?'],
    }),

    numeric({
      code: 'A.4A', slug: 'predict-with-model', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A regression gives $y = -2.4x + 96$ with $r = -0.91$. Predict $y$ when $x = 15$.',
      expected: '60',
      review: {
        headline: 'A strong $r$ means the prediction is worth making.',
        reasoning: [
          '$-2.4 \\times 15 = -36$.',
          '$96 - 36 = 60$.',
        ],
        answer: '$60$',
        connection: 'A weak $r$ would not change the arithmetic, but it would make the prediction untrustworthy.',
      },
      feedback: ['Multiply before adding.'],
      hints: ['What is $-2.4 \\times 15$?'],
    }),

    choice({
      code: 'A.4A', slug: 'reverse-judgement', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'Two variables have $r = 0.05$. What is the most defensible conclusion?',
      options: [
        ['There is almost no LINEAR relationship, though some other relationship may exist', true],
        ['The two variables are completely unrelated', false],
        ['There is a strong relationship that is simply not visible', false],
        ['One variable causes the other very weakly', false],
      ],
      review: {
        headline: '$r$ measures one specific kind of relationship.',
        reasoning: [
          'A near-zero $r$ rules out a straight-line pattern.',
          'A perfect U-shaped relationship can also produce $r$ near zero, so "no linear relationship" is the honest claim.',
        ],
        answer: 'Almost no linear relationship.',
        connection: 'And $r$ never establishes causation, however large it is — that is A.4B.',
      },
      feedback: ['What exactly is $r$ measuring?'],
      hints: ['Could a strong curved pattern give a small $r$?'],
    }),
  ]),

  // --- A.4B Association and causation ------------------------------------------------------
  standard('A.4B', [
    choice({
      code: 'A.4B', slug: 'identify-confounder', band: 3, dok: 2, taskType: 'conceptual', representation: 'context',
      prompt: 'Ice cream sales and drowning incidents rise together across the year. What best explains this?',
      options: [
        ['A third variable — hot weather — raises both', true],
        ['Ice cream causes drowning', false],
        ['Drowning causes ice cream sales', false],
        ['The association must be a coincidence with no explanation', false],
      ],
      review: {
        headline: 'A shared cause creates association without causation.',
        reasoning: [
          'Hot weather raises ice cream sales and also sends more people swimming.',
          'The association between the two is real; the causal link between them is not.',
        ],
        answer: 'Hot weather is a confounding variable.',
      },
      feedback: ['What else changes at the same time of year?'],
      hints: ['Is there a third quantity that would raise both numbers?'],
    }),

    choice({
      code: 'A.4B', slug: 'experiment-vs-observation', band: 4, dok: 3, taskType: 'transfer', representation: 'verbal',
      prompt: 'Which study design gives the strongest evidence that a new tutoring programme CAUSES higher scores?',
      options: [
        ['Randomly assigning students to tutoring or no tutoring, then comparing', true],
        ['Comparing scores of students who chose tutoring with those who did not', false],
        ['Surveying tutored students about whether they felt they improved', false],
        ['Checking whether tutored students have higher scores on average', false],
      ],
      review: {
        headline: 'Random assignment is what separates causation from association.',
        reasoning: [
          'Students who choose tutoring may already be more motivated, which would explain higher scores on its own.',
          'Randomising removes that difference on average, so a gap afterwards can be attributed to the programme.',
        ],
        answer: 'The randomised comparison.',
      },
      feedback: ['Ask what might differ between the two groups BEFORE the programme starts.'],
      hints: ['Who chooses to take tutoring?'],
    }),

    choice({
      code: 'A.4B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A headline reads: "Students who eat breakfast score 12% higher — eat breakfast to raise your grades." What is the flaw?',
      options: [
        ['An observed association is being reported as a proven cause', true],
        ['The percentage is too small to matter', false],
        ['Breakfast cannot be measured', false],
        ['There is no flaw', false],
      ],
      review: {
        headline: 'Observational data supports association claims, not causal advice.',
        reasoning: [
          'Households where breakfast is routine may differ in many other ways.',
          'The finding is worth reporting; the instruction that follows from it is not supported by it.',
        ],
        answer: 'Association is being reported as causation.',
      },
      feedback: ['Which word in the headline makes a causal claim?'],
      hints: ['What else might be true of families who always eat breakfast?'],
    }),

    choice({
      code: 'A.4B', slug: 'table-reasoning', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'Which of these associations is most plausibly causal?',
      stimulus: table(['Association', 'Description'], [
        ['A', 'Hours of exercise and resting heart rate'],
        ['B', 'Shoe size and reading ability in children'],
        ['C', 'Number of firefighters and fire damage'],
        ['D', 'Sales of sunglasses and sales of sandals'],
      ]),
      options: [['Association A', true], ['Association B', false], ['Association C', false], ['Association D', false]],
      review: {
        headline: 'Look for a mechanism, and for a plausible third variable.',
        reasoning: [
          'Exercise physically changes the heart, so a mechanism exists.',
          'B is explained by age, C by fire size, and D by the weather.',
        ],
        answer: 'Association A.',
      },
      feedback: ['For each one, try to name a third variable that would explain it.'],
      hints: ['Which of these has a physical mechanism connecting the two quantities?'],
    }),

    choice({
      code: 'A.4B', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'You find a strong positive association between screen time and poor sleep. Which follow-up would most improve the evidence for causation?',
      options: [
        ['A controlled trial in which screen time is assigned rather than chosen', true],
        ['Collecting more survey responses of the same kind', false],
        ['Calculating $r$ to more decimal places', false],
        ['Restricting the study to students who already sleep poorly', false],
      ],
      review: {
        headline: 'More of the same data does not change what the data can show.',
        reasoning: [
          'A larger survey gives a more precise estimate of the same association.',
          'Only assigning the exposure removes the possibility that a third factor drives both.',
        ],
        answer: 'The controlled trial.',
      },
      feedback: ['Would more responses remove the possibility of a confounding variable?'],
      hints: ['What is the one design feature that rules out self-selection?'],
    }),
  ]),

  // --- A.4C Linear models from data --------------------------------------------------------
  standard('A.4C', [
    numeric({
      code: 'A.4C', slug: 'use-model', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A line of best fit is $y = 3.2x + 18$. Predict $y$ when $x = 25$.',
      expected: '98',
      review: {
        headline: 'Substitute and evaluate.',
        reasoning: ['$3.2 \\times 25 = 80$.', '$80 + 18 = 98$.'],
        answer: '$98$',
      },
      feedback: ['Multiply before adding.'],
      hints: ['What is $3.2 \\times 25$?'],
    }),


    graphWorkspace({
      code: 'A.4C', slug: 'plot-the-fit', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'A line of best fit for some sales data is $y = 6x + 10$, where $x$ is weeks. Plot the points where $x = 0$ and $x = 5$, then give the predicted value at week 5.',
      functionSpec: { type: 'linear', m: 6, b: 10 },
      graph: { xMin: -1, xMax: 9, yMin: 0, yMax: 60 },
      pointTasks: [
        { id: 'start', label: 'Plot the point where $x = 0$', x: 0, expected: [0, 10] },
        { id: 'five', label: 'Plot the point where $x = 5$', x: 5, expected: [5, 40] },
      ],
      analysisRequests: [
        { id: 'predict', label: 'What does the model predict at week 5?', kind: 'increasing', responseMode: 'text', expected: ['40'], accepted: ['40', '40 sales'] },
      ],
      review: {
        headline: 'A model is used by substituting, not by eyeballing the picture.',
        reasoning: [
          'Substituting 5 weeks gives $30 + 10$.',
          'The intercept is what the model says was already happening before week one, which is why the line does not start at zero.',
        ],
        answer: '40 at week 5.',
      },
      feedback: ['Put the week number into the equation rather than reading it off the graph.'],
      hints: ['Substitute the week number for $x$ and evaluate. Use the graph afterwards to check your answer looks right.'],
    }),

    numeric({
      code: 'A.4C', slug: 'residual', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The model is $y = 4x + 10$. Using the table, what is the size of the largest difference between an actual value and the model\'s prediction?',
      stimulus: table(['$x$', 'Actual $y$'], [['2', '19'], ['5', '30'], ['8', '46'], ['11', '52']]),
      expected: '2',
      review: {
        headline: 'Compare each actual value with the value the model predicts.',
        reasoning: [
          'The model predicts 18, 30, 42 and 54.',
          'The differences are 1, 0, 4 and $-2$; the largest in size is 4.',
        ],
        answer: 'The largest difference is 4, at $x = 8$.',
        commonError: 'Ignoring the sign is right here, but the LARGEST difference is 4, not 2 — check every row.',
      },
      feedback: ['Work out the prediction for all four rows before comparing.'],
      hints: ['What does the model predict at $x = 8$?'],
      misconceptions: [{ when: ['4'], say: 'You found the largest gap correctly — check the value you entered against the row it came from.' }],
    }),

    choice({
      code: 'A.4C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A model built from data for ages 20 to 40 is used to predict a value at age 90. What is the concern?',
      options: [
        ['Extrapolating far beyond the data range may be unreliable', true],
        ['The model has the wrong slope', false],
        ['Models cannot be used for prediction at all', false],
        ['Age is not a numerical variable', false],
      ],
      review: {
        headline: 'A model describes the range it was built from.',
        reasoning: [
          'Nothing in the data says the pattern continues past 40.',
          'Predicting inside the range is interpolation and is far safer.',
        ],
        answer: 'It is extrapolation well beyond the data.',
      },
      feedback: ['What ages did the data actually cover?'],
      hints: ['Is 90 inside or outside the range of the data?'],
    }),

    numeric({
      code: 'A.4C', slug: 'reverse-solve', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A model is $y = -0.6x + 45$. For what value of $x$ does the model predict $y = 21$?',
      expected: '40',
      review: {
        headline: 'Solve rather than substitute when the output is given.',
        reasoning: [
          '$21 = -0.6x + 45$ gives $-24 = -0.6x$.',
          'Dividing by $-0.6$ gives $x = 40$.',
        ],
        answer: '$x = 40$',
        commonError: 'Substituting 21 for $x$ answers the other question and gives 32.4.',
      },
      feedback: ['Which letter were you given a value for?'],
      hints: ['Subtract 45 from both sides first.'],
    }),
  ]),

  // --- A.5A Solving linear equations ----------------------------------------------------------
  standard('A.5A', [
    balanceEquation({
      code: 'A.5A', slug: 'balance-both-sides', band: 3, dok: 1,
      prompt: 'Solve $5x - 8 = 2x + 7$ on the balance workspace. Choose each move yourself.',
      equation: '5x - 8 = 2x + 7',
      answer: '5',
      review: {
        headline: 'Collect the variable on one side, then undo what is left.',
        reasoning: [
          'Subtracting $2x$ from both sides gives $3x - 8 = 7$.',
          'Adding 8 gives $3x = 15$, so $x = 5$.',
        ],
        answer: '$x = 5$',
      },
      feedback: ['Try removing the smaller number of $x$ from both sides first.'],
      hints: ['What single move leaves the variable on only one side?'],
    }),

    numeric({
      code: 'A.5A', slug: 'with-distribution', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $3(2x - 5) = 4x + 9$ for $x$.',
      expected: '12',
      review: {
        headline: 'Distribute before you collect.',
        reasoning: [
          'The left side becomes $6x - 15$.',
          'Subtracting $4x$ and adding 15 gives $2x = 24$, so $x = 12$.',
        ],
        answer: '$x = 12$',
        commonError: 'Distributing only to the $2x$ gives $6x - 5$, which changes the equation.',
      },
      feedback: ['Check that the 3 reached both terms inside the brackets.'],
      hints: ['What is $3 \\times (-5)$?'],
    }),

    choice({
      code: 'A.5A', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $\\frac{x + 6}{4} = 5$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$\\frac{x + 6}{4} = 5$' },
        { label: 'Line 2', work: '$x + 6 = 5$' },
        { label: 'Line 3', work: '$x = -1$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — both sides must be multiplied by 4', true],
        ['Line 3', false],
        ['Line 1', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Whatever is done to one side is done to the other.',
        reasoning: [
          'Multiplying both sides by 4 gives $x + 6 = 20$.',
          'So $x = 14$, not $-1$.',
        ],
        answer: 'Line 2. The solution is $x = 14$.',
      },
      feedback: ['Substitute the student\'s answer into the original equation and see whether it balances.'],
      hints: ['What happened to the 4 between Line 1 and Line 2?'],
    }),

    numeric({
      code: 'A.5A', slug: 'context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'Two vans start 260 km apart and drive towards each other, one at 70 km/h and the other at 60 km/h. After how many hours do they meet?',
      expected: '2', unit: 'hours',
      review: {
        headline: 'Together they close the gap at the sum of their speeds.',
        reasoning: [
          'The gap closes at $70 + 60 = 130$ km per hour.',
          '$260 \\div 130 = 2$ hours.',
        ],
        answer: '$2$ hours',
        commonError: 'Using the difference of the speeds is the right move for a chase, not for a head-on approach.',
      },
      feedback: ['Are the vans moving towards each other or in the same direction?'],
      hints: ['How much closer are they after one hour?'],
    }),

    equation({
      code: 'A.5A', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation with the variable on both sides and brackets on one side whose only solution is $x = 4$.',
      expected: '2(x+3)=x+10',
      accepted: ['2(x + 3) = x + 10', '3(x-1)=2x+1', '3(x - 1) = 2x + 1', '2(x-1)=x+2'],
      responseHint: 'For example 2(x + 1) = x + 6.',
      review: {
        headline: 'Choose the structure, then fit the constants to the answer you want.',
        reasoning: [
          'Try $2(x + 3)$ on the left: at $x = 4$ that is 14.',
          'The right side must also equal 14 at $x = 4$, so $x + 10$ works.',
        ],
        answer: 'For example $2(x + 3) = x + 10$.',
        commonError: 'If both sides simplify to the same expression, every value is a solution rather than just 4.',
      },
      feedback: ['Substitute 4 into both sides. Do they match? And does your equation have brackets and a variable on each side?'],
      hints: ['Pick the bracketed side first and work out its value at $x = 4$.'],
    }),
  ]),

  // --- A.5B Solving linear inequalities --------------------------------------------------------
  standard('A.5B', [
    numberLine({
      code: 'A.5B', slug: 'solve-and-graph', band: 3, dok: 2, taskType: 'representationTranslation',
      prompt: 'Solve $-4x + 9 \\le 25$ and graph the solution on the number line.',
      inequalityText: '-4x + 9 ≤ 25',
      min: -10, max: 6, step: 1, variable: 'x',
      ask: ['graph'],
      intervals: [{ min: -4, max: null, minClosed: true, maxClosed: false }],
      review: {
        headline: 'Dividing by a negative reverses the symbol.',
        reasoning: [
          'Subtracting 9 gives $-4x \\le 16$.',
          'Dividing by $-4$ reverses the inequality: $x \\ge -4$.',
          'The endpoint is closed, because $-4$ itself satisfies the original.',
        ],
        answer: '$x \\ge -4$',
        commonError: 'Keeping the symbol the same way round gives exactly the values that are not solutions.',
      },
      feedback: ['Test $x = 0$ in the original inequality. Is it a solution?'],
      hints: ['What must happen to the symbol when you divide by $-4$?'],
    }),

    inequality({
      code: 'A.5B', slug: 'with-distribution', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $2(3x - 4) > 4x + 6$ and write the solution as an inequality in $x$.',
      expected: 'x>7',
      accepted: ['x > 7', '7<x', '7 < x'],
      responseHint: 'Use the symbol pad if you need > or <.',
      review: {
        headline: 'Distribute, collect, then divide by a positive number.',
        reasoning: [
          'The left side becomes $6x - 8$.',
          'Subtracting $4x$ and adding 8 gives $2x > 14$, so $x > 7$.',
          'Dividing by a positive 2 leaves the symbol unchanged.',
        ],
        answer: '$x > 7$',
      },
      feedback: ['Did you distribute the 2 to both terms?'],
      hints: ['What is $2 \\times (-4)$?'],
    }),

    choice({
      code: 'A.5B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $-2x < 10$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$-2x < 10$' },
        { label: 'Line 2', work: '$x < -5$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — the symbol should reverse to give $x > -5$', true],
        ['Line 2 — the answer should be $x < 5$', false],
        ['Line 1', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Dividing by a negative flips the inequality.',
        reasoning: [
          'Dividing both sides by $-2$ gives $x > -5$.',
          'Testing $x = 0$ confirms it: $-2(0) = 0 < 10$ is true, and 0 satisfies $x > -5$ but not $x < -5$.',
        ],
        answer: 'Line 2. The solution is $x > -5$.',
      },
      feedback: ['Test a simple value like $x = 0$ in the original inequality.'],
      hints: ['Does $x = 0$ satisfy $-2x < 10$?'],
    }),

    numeric({
      code: 'A.5B', slug: 'context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A delivery van can carry at most 900 kg. The driver and equipment weigh 130 kg, and each crate weighs 45 kg. What is the greatest number of crates it can carry?',
      expected: '17', unit: 'crates',
      review: {
        headline: 'Solve the inequality, then respect the context.',
        reasoning: [
          '$45c + 130 \\le 900$ gives $45c \\le 770$, so $c \\le 17.1$.',
          'Crates are whole, so the greatest number is 17.',
        ],
        answer: '$17$ crates',
        commonError: 'Rounding 17.1 up to 18 exceeds the weight limit.',
      },
      feedback: ['You cannot round up here — the limit is a maximum.'],
      hints: ['How much weight is available for crates once the driver is accounted for?'],
    }),

    inequality({
      code: 'A.5B', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an inequality whose solution is $x \\le 6$ and which requires dividing by a negative number to solve.',
      expected: '-3x>=-18',
      accepted: ['-3x ≥ -18', '-3x>=-18', '-2x>=-12', '-x>=-6', '-4x >= -24'],
      responseHint: 'Use ≥ or ≤ from the symbol pad.',
      review: {
        headline: 'Work backwards from the answer, then multiply by a negative.',
        reasoning: [
          'Start from $x \\le 6$ and multiply both sides by $-3$, reversing the symbol: $-3x \\ge -18$.',
          'Solving that inequality forwards requires dividing by $-3$ and reversing back.',
        ],
        answer: 'For example $-3x \\ge -18$.',
      },
      feedback: ['Solve your own inequality. Does it give $x \\le 6$?'],
      hints: ['Multiply both sides of $x \\le 6$ by a negative number and flip the symbol.'],
    }),
  ]),

  // --- A.5C Solving systems of equations -----------------------------------------------------
  standard('A.5C', [

    linearSystem({
      code: 'A.5C', slug: 'workspace-solve', band: 3, dok: 2, taskType: 'procedural',
      prompt: 'Graph both lines in the workspace, then give the point where they meet and say how many solutions the system has.',
      m1: 2, b1: -1, m2: -1, b2: 5,
      review: {
        headline: 'Two lines with different slopes cross exactly once.',
        reasoning: [
          'Setting the two expressions equal gives $2x - 1 = -x + 5$, so $3x = 6$.',
          'That input produces the same output in both equations, which is what "the solution of the system" means.',
        ],
        answer: 'One solution, at $(2, 3)$.',
      },
      feedback: ['Compare the two slopes. Different slopes means the lines cannot stay apart.'],
      hints: ['Set the two right-hand sides equal to each other and solve for $x$, then substitute back to get $y$.'],
      misconceptions: ['Reporting only the $x$ value as "the solution" when a system asks for a point.'],
    }),

    orderedPair({
      code: 'A.5C', slug: 'elimination', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve the system $2x + 3y = 16$ and $2x - y = 4$. Give the solution as an ordered pair.',
      expected: '(3.5,3)',
      accepted: ['(3.5, 3)', '3.5,3', '(7/2, 3)'],
      responseHint: 'Write your answer as an ordered pair, for example (2, -4).',
      review: {
        headline: 'Matching coefficients let you eliminate a variable by subtracting.',
        reasoning: [
          'Subtracting the second equation from the first removes $2x$ and gives $4y = 12$, so $y = 3$.',
          'Substituting into $2x - 3 = 4$ gives $x = 3.5$.',
        ],
        answer: '$(3.5, 3)$',
        commonError: 'Adding instead of subtracting keeps $4x$ and eliminates nothing.',
      },
      feedback: ['Which variable already has the same coefficient in both equations?'],
      hints: ['What happens to $2x$ when you subtract one equation from the other?'],
    }),

    choice({
      code: 'A.5C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solved $y = x + 2$ and $2x + y = 11$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$2x + x + 2 = 11$' },
        { label: 'Line 2', work: '$3x = 11$' },
        { label: 'Line 3', work: '$x = \\frac{11}{3}$' },
      ], { title: 'The work' }),
      options: [
        ['Line 2 — the 2 was not subtracted from both sides', true],
        ['Line 1 — the substitution is wrong', false],
        ['Line 3', false],
        ['There is no mistake', false],
      ],
      review: {
        headline: 'Collecting like terms is not the same as ignoring one.',
        reasoning: [
          'Line 1 is correct: $2x + x + 2 = 11$.',
          'Line 2 should be $3x + 2 = 11$, so $3x = 9$ and $x = 3$, giving $y = 5$.',
        ],
        answer: 'Line 2. The solution is $(3, 5)$.',
      },
      feedback: ['Compare Line 1 and Line 2 term by term. What disappeared?'],
      hints: ['Where did the $+2$ go?'],
    }),

    parts({
      code: 'A.5C', slug: 'context-tickets', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A cafe sells 120 drinks in a morning. Small drinks cost $\\$3$, large cost $\\$5$, and takings are $\\$460$. How many of each were sold?',
      fields: [
        { id: 'small', label: 'Small drinks', profile: 'number', expected: '70' },
        { id: 'large', label: 'Large drinks', profile: 'number', expected: '50' },
      ],
      review: {
        headline: 'One equation counts drinks; the other counts money.',
        reasoning: [
          '$s + l = 120$ and $3s + 5l = 460$.',
          'Substituting $s = 120 - l$ gives $360 + 2l = 460$, so $l = 50$ and $s = 70$.',
        ],
        answer: '70 small and 50 large.',
      },
      feedback: ['Write both equations before solving either.'],
      hints: ['If $l$ large drinks were sold, how many were small?'],
    }),

    choice({
      code: 'A.5C', slug: 'reverse-judgement', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'For which system is elimination clearly easier than substitution?',
      options: [
        ['$4x + 7y = 19$ and $4x - 3y = -1$', true],
        ['$y = 3x - 2$ and $5x + y = 14$', false],
        ['$x = 2y$ and $3x + y = 21$', false],
        ['$y = 7$ and $2x + y = 15$', false],
      ],
      review: {
        headline: 'Choose the method the equations are already shaped for.',
        reasoning: [
          'In the first system $4x$ appears in both equations, so subtracting removes it in one step.',
          'The other three already have a variable isolated, which is exactly what substitution wants.',
        ],
        answer: 'The first system.',
        connection: 'Choosing a method is part of the mathematics, not a preference.',
      },
      feedback: ['Look for a system where a variable is already isolated, and one where coefficients already match.'],
      hints: ['Which system has a matching coefficient?'],
    }),
  ]),
];

export default ALGEBRA1_SYSTEMS_STANDARDS;
