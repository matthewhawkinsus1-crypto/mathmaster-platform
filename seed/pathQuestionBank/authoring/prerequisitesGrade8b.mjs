// Grade 8 prerequisites, part two: the rest of the linear-function strand.

import {
  choice, equation, numeric, parts, standard,
  graphWorkspace, relation, steps, table,
} from './kit.mjs';

export const GRADE_8_STANDARDS_B = [

  // --- 8.5B Non-proportional relationships (y = mx + b) ---------------------------
  standard('8.5B', [

    graphWorkspace({
      code: '8.5B', slug: 'graph-the-rate', band: 2, dok: 2, taskType: 'representationTranslation',
      prompt: 'A pool already holds 6 inches of water and rises 4 inches an hour, modelled by $y = 4x + 6$. Plot the depth at $x = 0$ and at $x = 3$, then give the depth the pool started at.',
      functionSpec: { type: 'linear', m: 4, b: 6 },
      graph: { xMin: -1, xMax: 8, yMin: -2, yMax: 26 },
      pointTasks: [
        { id: 'start', label: 'Plot the depth at $x = 0$', x: 0, expected: [0, 6] },
        { id: 'three', label: 'Plot the depth at $x = 3$', x: 3, expected: [3, 18] },
      ],
      analysisRequests: [
        { id: 'start', label: 'What depth did the pool start at, in inches?', kind: 'increasing', responseMode: 'text', expected: ['6'], accepted: ['6', '6 inches'] },
      ],
      review: {
        headline: 'This line does NOT pass through the origin, and that is the point.',
        reasoning: [
          'The pool already held water before the hose was turned on, so at zero hours the depth is not zero.',
          'That starting amount is the $b$ in $y = mx + b$; the 4 is the rate, and the two do different jobs.',
        ],
        answer: 'It started at 6 inches.',
      },
      feedback: ['What is the depth at the moment the hose is turned on?'],
      hints: ['Substitute zero hours into the equation. Which of the two numbers survives?'],
      misconceptions: ['Treating every linear situation as proportional and expecting the line through the origin.'],
    }),

    numeric({
      code: '8.5B', slug: 'context-value', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A gym charges a $\\$40$ joining fee plus $\\$28$ per month. What is the total cost, in dollars, after 7 months?',
      expected: '236', unit: 'dollars',
      review: {
        headline: 'The joining fee is paid once; the monthly charge repeats.',
        reasoning: [
          'Seven months cost $7 \\times 28 = \\$196$.',
          'Adding the one-off fee gives $196 + 40 = \\$236$.',
        ],
        answer: '$\\$236$',
        commonError: 'Multiplying the whole first-month cost by 7 charges the joining fee seven times.',
      },
      feedback: ['How many times is the joining fee paid?'],
      hints: ['Write the cost as an equation before substituting 7.'],
      misconceptions: [{ when: ['476'], say: 'The joining fee was multiplied by 7. It is paid once, not monthly.' }],
    }),

    choice({
      code: '8.5B', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote the equation for a line with slope 3 through $(2, 11)$. Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: '$y = 3x + b$' },
        { label: 'Line 2', work: '$11 = 3(2) + b$' },
        { label: 'Line 3', work: '$11 = 6 + b$, so $b = 17$' },
      ], { title: 'The work' }),
      options: [['Line 1', false], ['Line 2', false], ['Line 3 — adding instead of subtracting', true], ['There is no mistake', false]],
      review: {
        headline: 'To undo "add 6", subtract 6.',
        reasoning: [
          'Lines 1 and 2 set the problem up correctly.',
          '$11 = 6 + b$ gives $b = 11 - 6 = 5$, so the equation is $y = 3x + 5$.',
        ],
        answer: 'Line 3. The equation is $y = 3x + 5$.',
      },
      feedback: ['Check Line 3 by putting the value of $b$ back into Line 2.'],
      hints: ['What number added to 6 gives 11?'],
    }),

    parts({
      code: '8.5B', slug: 'compare-two', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Two saving plans are shown. Give the monthly rate of each plan.',
      stimulus: table(['Month', 'Plan A ($)', 'Plan B ($)'], [['0', '150', '60'], ['3', '195', '150'], ['6', '240', '240']]),
      fields: [
        { id: 'a', label: 'Plan A, dollars per month', profile: 'number', expected: '15' },
        { id: 'b', label: 'Plan B, dollars per month', profile: 'number', expected: '30' },
      ],
      review: {
        headline: 'The rate is the change divided by the months it took.',
        reasoning: [
          'Plan A rises $\\$45$ in 3 months, which is $\\$15$ a month.',
          'Plan B rises $\\$90$ in 3 months, which is $\\$30$ a month.',
          'They are equal at month 6, which is where the faster plan catches up.',
        ],
        answer: 'Plan A: $\\$15$ per month. Plan B: $\\$30$ per month.',
      },
      feedback: ['Remember that the rows step by 3 months, not 1.'],
      hints: ['Work out the change between two rows, then divide by the months between them.'],
    }),

    equation({
      code: '8.5B', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation of a line that has the same $y$-intercept as $y = -2x + 7$ but is less steep and rises rather than falls.',
      expected: 'y=x+7',
      accepted: ['y = x + 7', 'y=1x+7', 'y=0.5x+7', 'y = 0.5x + 7', 'y=x/2+7'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Keep $b$, change $m$ to something positive and smaller in size than 2.',
        reasoning: [
          'The intercept must stay 7, so the constant term does not change.',
          'Rising means a positive slope; less steep means a size below 2, so any $m$ with $0 < m < 2$ works.',
        ],
        answer: 'For example $y = x + 7$ or $y = 0.5x + 7$.',
        commonError: 'Choosing $m = -1$ is less steep but still falling.',
      },
      feedback: ['Check both conditions: is your slope positive, and is it smaller than 2 in size?'],
      hints: ['Which part of the equation controls steepness?'],
    }),
  ]),

  // --- 8.5C Recognising linear data ------------------------------------------------
  standard('8.5C', [
    choice({
      code: '8.5C', slug: 'which-table-linear', band: 2, dok: 1, taskType: 'conceptual', representation: 'table',
      prompt: 'Which table shows a relationship that a straight line would fit exactly?',
      stimulus: table(['Table', '$y$ values for $x = 1, 2, 3, 4$'], [
        ['W', '3, 6, 12, 24'],
        ['X', '3, 7, 11, 15'],
        ['Y', '3, 4, 8, 15'],
        ['Z', '3, 3, 6, 10'],
      ]),
      options: [['Table X', true], ['Table W', false], ['Table Y', false], ['Table Z', false]],
      review: {
        headline: 'Equal steps in $x$ must produce equal steps in $y$.',
        reasoning: [
          'Table X rises by 4 every time, so a line of slope 4 fits it exactly.',
          'Table W doubles, and Tables Y and Z have changing step sizes.',
        ],
        answer: 'Table X.',
      },
      feedback: ['Work out the differences between consecutive values in each row.'],
      hints: ['Write the gaps between the numbers underneath each list.'],
    }),

    choice({
      code: '8.5C', slug: 'scatter-description', band: 3, dok: 2, taskType: 'interpretation', representation: 'verbal',
      prompt: 'A scatterplot of study hours against test score shows points that rise steadily and cluster closely around a straight path. Which description is best?',
      options: [
        ['A strong positive linear association', true],
        ['A weak negative linear association', false],
        ['No association', false],
        ['A non-linear association', false],
      ],
      review: {
        headline: 'Direction, form and strength are three separate readings.',
        reasoning: [
          'Rising means positive; a straight path means linear.',
          'Clustering closely means strong rather than weak.',
        ],
        answer: 'A strong positive linear association.',
        connection: 'You will describe scatterplots the same way in Algebra I before fitting a line to them.',
      },
      feedback: ['Answer three questions in turn: which direction, what shape, and how tightly?'],
      hints: ['What does "rise steadily" tell you about the direction?'],
    }),

    choice({
      code: '8.5C', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says this data is linear because the first two differences are both 6. What is the best response?',
      stimulus: table(['$x$', '$y$'], [['1', '2'], ['2', '8'], ['3', '14'], ['4', '24']]),
      options: [
        ['Not linear — the last difference is 10, not 6', true],
        ['Linear — two matching differences are enough', false],
        ['Not linear — the $x$ values are too small', false],
        ['Linear — the differences average out to 6', false],
      ],
      review: {
        headline: 'Every step has to match, not just the first ones.',
        reasoning: [
          'The differences are 6, 6 and 10.',
          'A single unequal step is enough to rule out an exact linear fit.',
        ],
        answer: 'Not linear. The last step breaks the pattern.',
      },
      feedback: ['Check every consecutive pair, including the last one.'],
      hints: ['What is $24 - 14$?'],
    }),

    numeric({
      code: '8.5C', slug: 'context-fit', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A plant is measured weekly: 4 cm, 7 cm, 10 cm, 13 cm. If growth stays linear, how tall will it be after 6 weeks of measurements, in centimetres?',
      expected: '19', unit: 'cm',
      review: {
        headline: 'A constant weekly increase lets you extend the pattern safely.',
        reasoning: [
          'The plant gains 3 cm each week.',
          'Weeks 5 and 6 add 3 cm each to 13 cm, giving 16 cm then 19 cm.',
        ],
        answer: '$19$ cm',
        commonError: 'Doubling the week-3 value assumes multiplication rather than a constant addition.',
      },
      feedback: ['How much does the plant gain each week, and how many more weeks are there?'],
      hints: ['Continue the list two more terms.'],
    }),

    choice({
      code: '8.5C', slug: 'reverse-judgement', band: 4, dok: 3, taskType: 'transfer', representation: 'context',
      prompt: 'Which of these situations is LEAST likely to produce data that a straight line fits well?',
      options: [
        ['The number of bacteria in a dish, doubling every hour', true],
        ['The cost of petrol against the litres bought at a fixed price', false],
        ['The distance travelled at a constant speed against time', false],
        ['The total pay against hours worked at a fixed hourly rate', false],
      ],
      review: {
        headline: 'Linear means a constant amount added; doubling is a constant amount multiplied.',
        reasoning: [
          'Three of these add the same amount for each extra unit, which is exactly a constant slope.',
          'Bacteria that double each hour grow by a larger amount every hour, which curves upward.',
        ],
        answer: 'The doubling bacteria.',
        connection: 'This is the linear-versus-exponential distinction you will formalise in Algebra I.',
      },
      feedback: ['For each option, ask whether the same amount is added each step or the same factor multiplied.'],
      hints: ['Which one grows faster and faster?'],
    }),
  ]),

  // --- 8.5D Trend lines and predictions -----------------------------------------------
  standard('8.5D', [
    numeric({
      code: '8.5D', slug: 'predict-from-line', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: 'A trend line for a scatterplot is $y = 2.5x + 12$. Predict $y$ when $x = 8$.',
      expected: '32',
      review: {
        headline: 'Substitute and evaluate.',
        reasoning: ['$2.5 \\times 8 = 20$.', 'Adding 12 gives 32.'],
        answer: '$32$',
      },
      feedback: ['Multiply before adding.'],
      hints: ['What is $2.5 \\times 8$?'],
    }),

    numeric({
      code: '8.5D', slug: 'table-trend', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'The table shows recorded data and the values a trend line predicts. What is the size of the largest error between a recorded value and its prediction?',
      stimulus: table(['$x$', 'Recorded $y$', 'Predicted $y$'], [
        ['1', '14', '15'],
        ['2', '21', '19'],
        ['3', '22', '23'],
        ['4', '31', '27'],
      ]),
      expected: '4',
      review: {
        headline: 'The error is the gap between what happened and what the line predicted.',
        reasoning: [
          'The gaps are 1, 2, 1 and 4.',
          'The largest is 4, at $x = 4$.',
        ],
        answer: '$4$',
        connection: 'A trend line is judged by how small these gaps are overall — you will meet them again as residuals.',
      },
      feedback: ['Work out the gap for every row before choosing the largest.'],
      hints: ['Subtract each pair, then ignore the signs.'],
    }),

    choice({
      code: '8.5D', slug: 'good-trend-line', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Which statement best describes a good trend line for a scatterplot?',
      options: [
        ['It follows the overall direction with roughly as many points above as below', true],
        ['It passes through as many plotted points as possible', false],
        ['It passes through the highest and lowest points', false],
        ['It always passes through the origin', false],
      ],
      review: {
        headline: 'A trend line summarises the whole cloud, not particular points.',
        reasoning: [
          'Balancing points above and below is what makes it representative.',
          'Chasing individual points, or the two extremes, lets outliers control the line.',
        ],
        answer: 'It follows the overall direction with roughly as many points above as below.',
      },
      feedback: ['Think about what a line is meant to summarise here.'],
      hints: ['Should one unusual point be allowed to decide the line?'],
    }),

    choice({
      code: '8.5D', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A trend line based on ages 5 to 12 predicts height. A student uses it to predict the height of a 40-year-old. What is the problem?',
      options: [
        ['The prediction goes far outside the range of the data the line was built from', true],
        ['The trend line has the wrong slope', false],
        ['Trend lines can only be used for the exact ages in the data', false],
        ['Height is not a numerical variable', false],
      ],
      review: {
        headline: 'A trend line describes the range it came from.',
        reasoning: [
          'Children between 5 and 12 do grow at a roughly steady rate, so a line fits well there.',
          'Growth stops in adulthood, so extending the line to 40 predicts an impossible height.',
        ],
        answer: 'The prediction is far outside the data range, where the pattern no longer holds.',
        connection: 'Predicting inside the data range is interpolation; going beyond it is extrapolation, and it needs justifying.',
      },
      feedback: ['What ages was the line actually built from?'],
      hints: ['Would you expect the pattern of childhood growth to continue for ever?'],
    }),

    numeric({
      code: '8.5D', slug: 'reverse-solve', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A trend line is $y = -1.5x + 60$, where $y$ is a score and $x$ is hours of gaming. At what value of $x$ does the line predict a score of $30$?',
      expected: '20',
      review: {
        headline: 'Working backwards means solving rather than substituting.',
        reasoning: [
          'Setting $30 = -1.5x + 60$ gives $-30 = -1.5x$.',
          'Dividing both sides by $-1.5$ gives $x = 20$.',
        ],
        answer: '$x = 20$ hours',
        commonError: 'Substituting 30 for $x$ answers the opposite question and gives 15.',
      },
      feedback: ['Which variable were you given, and which are you looking for?'],
      hints: ['Put 30 where $y$ is, then solve.'],
    }),
  ]),

  // --- 8.5E Direct variation --------------------------------------------------------
  standard('8.5E', [
    numeric({
      code: '8.5E', slug: 'find-constant', band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
      prompt: '$y$ varies directly with $x$, and $y = 42$ when $x = 6$. What is the constant of variation?',
      expected: '7',
      review: {
        headline: 'Direct variation means $y = kx$, so $k = y \\div x$.',
        reasoning: ['$42 \\div 6 = 7$.', 'The relationship is therefore $y = 7x$.'],
        answer: '$k = 7$',
      },
      feedback: ['Divide $y$ by $x$, not the other way round.'],
      hints: ['What do you multiply 6 by to reach 42?'],
    }),

    numeric({
      code: '8.5E', slug: 'context-scale', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'The weight of a coil of wire varies directly with its length. A 15 m coil weighs 4.5 kg. What does a 40 m coil weigh, in kilograms?',
      expected: '12', unit: 'kg',
      review: {
        headline: 'Find the weight of one metre, then scale.',
        reasoning: [
          '$4.5 \\div 15 = 0.3$ kg per metre.',
          '$40 \\times 0.3 = 12$ kg.',
        ],
        answer: '$12$ kg',
        commonError: 'Adding 25 kg because the length increased by 25 m treats a rate as a fixed amount.',
      },
      feedback: ['Work out the weight of a single metre first.'],
      hints: ['What is $4.5 \\div 15$?'],
    }),

    choice({
      code: '8.5E', slug: 'table-identify', band: 3, dok: 2, taskType: 'comparison', representation: 'table',
      prompt: 'Which row could NOT belong to the direct variation $y = 2.5x$?',
      stimulus: table(['Row', '$x$', '$y$'], [['A', '4', '10'], ['B', '6', '15'], ['C', '10', '25'], ['D', '12', '32']]),
      options: [['Row D', true], ['Row A', false], ['Row B', false], ['Row C', false]],
      review: {
        headline: 'Every pair in a direct variation has the same ratio.',
        reasoning: [
          'Rows A, B and C all give $y \\div x = 2.5$.',
          'Row D gives $32 \\div 12 \\approx 2.67$, so it does not fit.',
        ],
        answer: 'Row D — it should be $y = 30$.',
      },
      feedback: ['Multiply each $x$ by 2.5 and compare with the $y$ given.'],
      hints: ['What is $2.5 \\times 12$?'],
    }),

    choice({
      code: '8.5E', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says "$y = 3x + 1$ is a direct variation because $y$ goes up when $x$ goes up." Which response is correct?',
      options: [
        ['No — direct variation needs $y = 0$ when $x = 0$, and this gives $y = 1$', true],
        ['Yes — any increasing relationship is direct variation', false],
        ['No — direct variation must have a negative constant', false],
        ['Yes — the constant of variation is 3', false],
      ],
      review: {
        headline: 'Direct variation is $y = kx$ exactly, with nothing added.',
        reasoning: [
          'Substituting $x = 0$ into $y = 3x + 1$ gives 1, not 0.',
          'The ratio $y \\div x$ also changes: it is 4 at $x = 1$ and 3.5 at $x = 2$.',
        ],
        answer: 'No — the "+1" prevents it from being direct variation.',
      },
      feedback: ['Test the relationship at $x = 0$.'],
      hints: ['What must $y$ be when $x$ is zero in a direct variation?'],
    }),

    numeric({
      code: '8.5E', slug: 'reverse-pair', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'In a direct variation, doubling $x$ from 9 to 18 raises $y$ by 21. What is the value of $y$ when $x = 9$?',
      expected: '21',
      review: {
        headline: 'In a direct variation, doubling the input doubles the output.',
        reasoning: [
          'Going from $x = 9$ to $x = 18$ doubles $y$, so the increase equals the original value.',
          'Since the increase is 21, $y$ was 21 at $x = 9$ and becomes 42 at $x = 18$.',
        ],
        answer: '$y = 21$',
        connection: 'Recognising that doubling the input doubles the output saves you from having to find $k$ at all.',
      },
      feedback: ['If doubling $x$ doubles $y$, how does the increase compare with the starting value?'],
      hints: ['Call the starting value $y$. What is the new value in terms of $y$?'],
    }),
  ]),

  // --- 8.5F Proportional or not? -------------------------------------------------------
  standard('8.5F', [
    choice({
      code: '8.5F', slug: 'sort-equations', band: 2, dok: 1, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'Which equation represents a proportional relationship?',
      options: [['$y = -0.75x$', true], ['$y = -0.75x + 2$', false], ['$y = \\frac{2}{x}$', false], ['$y = x^{2}$', false]],
      review: {
        headline: 'Proportional means $y = kx$ and nothing else.',
        reasoning: [
          '$y = -0.75x$ has the required form, with $k = -0.75$.',
          'The second adds a constant; the third divides by $x$; the fourth squares it.',
        ],
        answer: '$y = -0.75x$',
        commonError: 'A negative constant is still proportional — the graph falls through the origin rather than rising.',
      },
      feedback: ['Which options can be written as a single number multiplied by $x$?'],
      hints: ['Substitute $x = 0$ into each option.'],
    }),

    parts({
      code: '8.5F', slug: 'table-decide', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'For the table, give the value of $y$ when $x = 0$, and then state whether the relationship is proportional. Answer the second part with yes or no.',
      stimulus: table(['$x$', '$y$'], [['2', '11'], ['4', '17'], ['6', '23']]),
      fields: [
        { id: 'intercept', label: 'Value of $y$ when $x = 0$', profile: 'number', expected: '5' },
        { id: 'decision', label: 'Is it proportional?', profile: 'text', expected: 'no', accepted: ['No', 'NO'] },
      ],
      review: {
        headline: 'Extend the pattern back to $x = 0$ and see where it lands.',
        reasoning: [
          '$y$ rises by 6 for every 2 in $x$, so it rises 3 per unit.',
          'Stepping back from $(2, 11)$ by 2 units of $x$ removes 6, giving $y = 5$ at $x = 0$.',
          'Because that is not zero, the relationship is linear but not proportional.',
        ],
        answer: '$y = 5$ at $x = 0$, so it is not proportional.',
      },
      feedback: ['Work back to $x = 0$ before deciding.'],
      hints: ['How much does $y$ change for each single unit of $x$?'],
    }),

    choice({
      code: '8.5F', slug: 'match-context', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'Which situation is proportional?',
      options: [
        ['Cost of apples at $\\$3$ per kilogram, with no other charges', true],
        ['A taxi charging $\\$4$ plus $\\$2$ per kilometre', false],
        ['The temperature of a room over a day', false],
        ['A phone plan with 5 GB included, then $\\$1$ per extra GB', false],
      ],
      review: {
        headline: 'Proportional situations charge nothing for nothing.',
        reasoning: [
          'Buying 0 kg of apples costs $\\$0$, and doubling the weight doubles the cost.',
          'The taxi and the phone plan both have a charge that does not depend on the amount used.',
        ],
        answer: 'The apples.',
      },
      feedback: ['For each option, ask what it costs when you use none of it.'],
      hints: ['Which situation has no fixed charge?'],
    }),

    choice({
      code: '8.5F', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student rewrote $2y = 8x$ and concluded it is not proportional because "it has a 2 in it". What is the correct conclusion?',
      options: [
        ['It is proportional — dividing by 2 gives $y = 4x$', true],
        ['It is not proportional, because of the coefficient on $y$', false],
        ['It is proportional with $k = 8$', false],
        ['There is not enough information to decide', false],
      ],
      review: {
        headline: 'Put the equation in the form $y = kx$ before judging it.',
        reasoning: [
          'Dividing both sides by 2 gives $y = 4x$.',
          'That is exactly the proportional form, with $k = 4$.',
        ],
        answer: 'It is proportional, with $k = 4$.',
      },
      feedback: ['Rearrange the equation so that $y$ is alone before deciding.'],
      hints: ['What do you get if you divide both sides by 2?'],
    }),

    equation({
      code: '8.5F', slug: 'reverse-pair-of-equations', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write an equation that is NOT proportional but passes through the point $(4, 12)$.',
      expected: 'y=2x+4',
      accepted: ['y = 2x + 4', 'y=x+8', 'y = x + 8', 'y=4x-4', 'y = 4x - 4', 'y=0.5x+10'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Choose any slope you like, then work out the constant that lands on the point.',
        reasoning: [
          'Pick a slope, say 2. Then $12 = 2(4) + b$, so $b = 4$.',
          'That gives $y = 2x + 4$, which is not proportional because $b$ is not zero.',
          'The proportional line through $(4, 12)$ is $y = 3x$, so any slope except 3 works.',
        ],
        answer: 'For example $y = 2x + 4$.',
        commonError: 'Choosing slope 3 gives $y = 3x$, which is the one proportional answer and so is not allowed here.',
      },
      feedback: ['Substitute $x = 4$ into your equation. Does it give 12? And is your constant term non-zero?'],
      hints: ['Pick any slope other than 3 first.'],
    }),
  ]),

  // --- 8.5G Identifying functions -----------------------------------------------------
  standard('8.5G', [
    relation({
      code: '8.5G', slug: 'mapping-diagram', band: 2, dok: 1,
      prompt: 'Build the mapping diagram for this relation, then give its domain, its range, and whether it is a function.',
      pairs: [[-3, 5], [0, 1], [2, 5], [4, -2]],
      ask: ['mapping', 'domain', 'range', 'isFunction'],
      review: {
        headline: 'A function gives each input exactly one output.',
        reasoning: [
          'The inputs are $-3$, 0, 2 and 4, and no input is repeated.',
          'The outputs are 5, 1 and $-2$; the repeat of 5 is allowed, because two inputs may share an output.',
        ],
        answer: 'Domain $\\{-3, 0, 2, 4\\}$, range $\\{-2, 1, 5\\}$, and it is a function.',
        commonError: 'A repeated output does not break the function rule; a repeated input does.',
      },
      feedback: ['Look at the inputs. Does any one of them point to two different outputs?'],
      hints: ['Which side of the mapping is not allowed to have a value used twice?'],
    }),

    choice({
      code: '8.5G', slug: 'which-is-not', band: 3, dok: 2, taskType: 'comparison', representation: 'orderedPairs',
      prompt: 'Which set of ordered pairs is NOT a function?',
      options: [
        ['$\\{(1, 4), (2, 5), (1, 6)\\}$', true],
        ['$\\{(1, 4), (2, 4), (3, 4)\\}$', false],
        ['$\\{(0, 0), (1, 1), (2, 4)\\}$', false],
        ['$\\{(-1, 3), (0, 3), (5, 7)\\}$', false],
      ],
      review: {
        headline: 'One input, one output.',
        reasoning: [
          'The first set uses the input 1 twice, once with 4 and once with 6.',
          'The other sets repeat outputs, which is allowed.',
        ],
        answer: '$\\{(1, 4), (2, 5), (1, 6)\\}$',
      },
      feedback: ['Look only at the first number of each pair.'],
      hints: ['Which set has the same first coordinate twice?'],
    }),

    choice({
      code: '8.5G', slug: 'vertical-line-test', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Why does a graph fail to be a function if some vertical line crosses it twice?',
      options: [
        ['Because that $x$ value would have two different $y$ values', true],
        ['Because the graph would not be a straight line', false],
        ['Because the graph would not pass through the origin', false],
        ['Because two $x$ values would share a $y$ value', false],
      ],
      review: {
        headline: 'The vertical line test is the function rule in picture form.',
        reasoning: [
          'Every point on one vertical line has the same $x$.',
          'Two crossings means that single input has two outputs, which the definition forbids.',
        ],
        answer: 'That $x$ value would have two different $y$ values.',
      },
      feedback: ['What do all the points on a single vertical line have in common?'],
      hints: ['Think about what stays fixed along a vertical line.'],
    }),

    choice({
      code: '8.5G', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'table',
      prompt: 'A student says this table is not a function because the output 12 appears twice. Which response is correct?',
      stimulus: table(['$x$', '$y$'], [['1', '12'], ['2', '15'], ['5', '12']]),
      options: [
        ['It is a function — repeated outputs are allowed', true],
        ['It is not a function, for the reason given', false],
        ['It is not a function, because the $x$ values are unevenly spaced', false],
        ['There is not enough information', false],
      ],
      review: {
        headline: 'The rule restricts inputs, not outputs.',
        reasoning: [
          'Each input, 1, 2 and 5, appears once and has one output.',
          'Two different inputs may share an output — $y = 12$ simply happens twice.',
        ],
        answer: 'It is a function.',
        connection: 'Many real functions repeat outputs; a horizontal line repeats the same output for every input.',
      },
      feedback: ['Which column is the rule about?'],
      hints: ['Is any $x$ value listed twice?'],
    }),

    shortAnswerIsFunction(),
  ]),

  // --- 8.5H Proportional and non-proportional functions ---------------------------------
  standard('8.5H', [
    choice({
      code: '8.5H', slug: 'classify-situations', band: 2, dok: 1, taskType: 'conceptual', representation: 'context',
      prompt: 'Which of these is a proportional function?',
      options: [
        ['The perimeter of a square as a function of its side length', true],
        ['The area of a square as a function of its side length', false],
        ['The cost of a meal plus a fixed $\\$3$ delivery fee', false],
        ['The temperature of a cooling drink over time', false],
      ],
      review: {
        headline: 'Perimeter is four times the side, with nothing added.',
        reasoning: [
          '$P = 4s$ is exactly the proportional form.',
          'Area is $s^{2}$, which is not linear at all, and a delivery fee adds a constant.',
        ],
        answer: 'The perimeter of a square.',
      },
      feedback: ['Write a formula for each option before deciding.'],
      hints: ['Which formula is a single number multiplied by the input?'],
    }),

    parts({
      code: '8.5H', slug: 'table-classify', band: 3, dok: 2, taskType: 'interpretation', representation: 'table',
      prompt: 'For this function, give the rate of change and state whether it is proportional. Answer the second part with yes or no.',
      stimulus: table(['$x$', '$y$'], [['0', '0'], ['3', '7.5'], ['6', '15']]),
      fields: [
        { id: 'rate', label: 'Rate of change', profile: 'number', expected: '2.5' },
        { id: 'decision', label: 'Is it proportional?', profile: 'text', expected: 'yes', accepted: ['Yes', 'YES'] },
      ],
      review: {
        headline: 'Both conditions are visible in the table.',
        reasoning: [
          '$y$ rises 7.5 for every 3 in $x$, which is 2.5 per unit.',
          'The first row shows $y = 0$ when $x = 0$, so the relationship is proportional.',
        ],
        answer: 'Rate 2.5, and yes, it is proportional.',
      },
      feedback: ['Check both things: the rate, and what happens at $x = 0$.'],
      hints: ['Divide the change in $y$ by the change in $x$.'],
    }),

    choice({
      code: '8.5H', slug: 'compare-two-functions', band: 3, dok: 2, taskType: 'comparison', representation: 'symbolic',
      prompt: 'Compare $f$: $y = 6x$ and $g$: $y = 6x + 4$. Which statement is true?',
      options: [
        ['They have the same rate of change, but only $f$ is proportional', true],
        ['They have different rates of change and both are proportional', false],
        ['$g$ grows faster than $f$', false],
        ['Neither is a function', false],
      ],
      review: {
        headline: 'The constant shifts the graph; it does not change the steepness.',
        reasoning: [
          'Both increase by 6 for every 1 in $x$.',
          'Only $f$ passes through the origin, so only $f$ is proportional.',
        ],
        answer: 'Same rate of change; only $f$ is proportional.',
      },
      feedback: ['Which part of each equation controls the rate?'],
      hints: ['What is the difference between the two graphs, geometrically?'],
    }),

    choice({
      code: '8.5H', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A student says "a taxi that charges $\\$2.50$ per mile with no other fee is not proportional, because you have to pay something." What is wrong with this reasoning?',
      options: [
        ['Paying nothing for zero miles is exactly what makes it proportional', true],
        ['Taxi fares are never proportional', false],
        ['The rate is too high for a proportional relationship', false],
        ['Nothing is wrong; the student is right', false],
      ],
      review: {
        headline: 'Proportional is about the value at zero, not about whether anything is ever paid.',
        reasoning: [
          'A ride of 0 miles costs $\\$0$, so the graph passes through the origin.',
          'Every mile adds the same $\\$2.50$, so the ratio of cost to miles never changes.',
        ],
        answer: 'It is proportional: $c = 2.5m$.',
      },
      feedback: ['What does this taxi charge for a ride of zero miles?'],
      hints: ['Write the cost as an equation.'],
    }),

    equation({
      code: '8.5H', slug: 'reverse-build', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'Write a non-proportional function with the same rate of change as $y = -3x$.',
      expected: 'y=-3x+5',
      accepted: ['y = -3x + 5', 'y=-3x+1', 'y = -3x + 1', 'y=-3x-2', 'y = -3x - 2'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Keep the slope; add any non-zero constant.',
        reasoning: [
          'The rate of change is the coefficient of $x$, so it must stay $-3$.',
          'Adding any non-zero constant moves the line off the origin, which is what makes it non-proportional.',
        ],
        answer: 'For example $y = -3x + 5$.',
      },
      feedback: ['Is your coefficient of $x$ still $-3$, and is your constant term non-zero?'],
      hints: ['What single change turns a proportional equation into a non-proportional one?'],
    }),
  ]),

  // --- 8.5I Writing y = mx + b from a situation ------------------------------------------
  standard('8.5I', [
    equation({
      code: '8.5I', slug: 'from-words', band: 2, dok: 1, taskType: 'representationTranslation', representation: 'context',
      prompt: 'A tank holds 500 litres and is filling at 20 litres per minute. Write an equation for the litres $y$ after $x$ minutes.',
      expected: 'y=20x+500',
      accepted: ['y = 20x + 500', 'y=500+20x', 'y = 500 + 20x'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'The amount already there is the constant; the rate multiplies the time.',
        reasoning: [
          'At 0 minutes the tank already holds 500 litres, so that is the constant.',
          'Each minute adds 20 litres, so 20 multiplies $x$.',
        ],
        answer: '$y = 20x + 500$',
        commonError: 'Writing $y = 500x + 20$ fills the tank at 500 litres a minute.',
      },
      feedback: ['Which of the two numbers depends on how much time has passed?'],
      hints: ['How much is in the tank before any time passes?'],
    }),


    graphWorkspace({
      code: '8.5I', slug: 'model-from-graph', band: 2, dok: 2, taskType: 'representationTranslation',
      prompt: 'A phone plan costs $y$ dollars for $x$ gigabytes and is modelled by $y = 5x + 20$. Plot the points where $x = 0$ and $x = 4$, then give the monthly cost when no data is used.',
      functionSpec: { type: 'linear', m: 5, b: 20 },
      graph: { xMin: -1, xMax: 8, yMin: 0, yMax: 60 },
      pointTasks: [
        { id: 'start', label: 'Plot the point where $x = 0$', x: 0, expected: [0, 20] },
        { id: 'four', label: 'Plot the point where $x = 4$', x: 4, expected: [4, 40] },
      ],
      analysisRequests: [
        { id: 'fixed', label: 'What is the cost in dollars when $x = 0$?', kind: 'increasing', responseMode: 'text', expected: ['20'], accepted: ['20', '$20', '20 dollars'] },
      ],
      review: {
        headline: 'The $y$-intercept is the cost before any data is used.',
        reasoning: [
          'Substituting zero gigabytes leaves only the constant term.',
          'The other number is a rate: it says what each additional gigabyte adds, not what the plan starts at.',
        ],
        answer: 'The plan costs $20 before any data.',
      },
      feedback: ['Which of the two numbers in the equation survives when $x$ is zero?'],
      hints: ['Substitute zero for the number of gigabytes and evaluate. Do not read the value off the picture.'],
    }),

    choice({
      code: '8.5I', slug: 'error-analysis', band: 3, dok: 2, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student wrote an equation for "starts at 8, decreases by 3 each hour". Which line contains the first mistake?',
      stimulus: steps([
        { label: 'Line 1', work: 'The starting value is 8, so $b = 8$' },
        { label: 'Line 2', work: 'It decreases by 3, so $m = 3$' },
        { label: 'Line 3', work: '$y = 3x + 8$' },
      ], { title: 'The work' }),
      options: [['Line 1', false], ['Line 2 — a decrease needs a negative rate', true], ['Line 3', false], ['There is no mistake', false]],
      review: {
        headline: 'Decreasing means a negative slope.',
        reasoning: [
          'Line 1 is right: the starting value is the constant.',
          'A decrease of 3 per hour is a rate of $-3$, so the equation is $y = -3x + 8$.',
        ],
        answer: 'Line 2. The equation is $y = -3x + 8$.',
      },
      feedback: ['Test the student\'s equation at $x = 1$. Does the value go up or down?'],
      hints: ['What sign does the rate need if the quantity is falling?'],
    }),

    numeric({
      code: '8.5I', slug: 'use-the-model', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A candle is 24 cm tall and burns 1.5 cm per hour. After how many hours is it 9 cm tall?',
      expected: '10', unit: 'hours',
      review: {
        headline: 'Write the model, then solve it for the time.',
        reasoning: [
          'The height is $h = 24 - 1.5t$.',
          'Setting $h = 9$ gives $1.5t = 15$, so $t = 10$ hours.',
        ],
        answer: '$10$ hours',
        commonError: 'Dividing 9 by 1.5 answers "how long to burn 9 cm", not "how long until 9 cm remains".',
      },
      feedback: ['How much of the candle has burned away by the time 9 cm is left?'],
      hints: ['Start by working out how many centimetres have burned.'],
    }),

    equation({
      code: '8.5I', slug: 'reverse-story', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'A situation is modelled by $y = -6x + 90$, where $x$ is days. Write an equation for a situation that starts at the same value but falls only half as fast.',
      expected: 'y=-3x+90',
      accepted: ['y = -3x + 90', 'y=90-3x', 'y = 90 - 3x'],
      responseHint: 'Write the whole equation, starting with y =',
      review: {
        headline: 'Halve the rate; leave the starting value alone.',
        reasoning: [
          'The starting value is the constant 90, which does not change.',
          'Falling half as fast means a rate of $-3$ instead of $-6$.',
        ],
        answer: '$y = -3x + 90$',
        commonError: 'Halving the 90 as well changes the starting value, which the question said to keep.',
      },
      feedback: ['Which number were you told to keep the same?'],
      hints: ['Only one of the two numbers should change.'],
    }),
  ]),
];

// A fifth family for 8.5G that asks the student to state the rule itself.
function shortAnswerIsFunction() {
  return choice({
    code: '8.5G', slug: 'reverse-build-relation', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs',
    prompt: 'You must add one more ordered pair to $\\{(2, 5), (4, 9)\\}$ so that the set is still a function. Which pair can you NOT add?',
    options: [
      ['$(4, 11)$', true],
      ['$(6, 13)$', false],
      ['$(0, 1)$', false],
      ['$(7, 5)$', false],
    ],
    review: {
      headline: 'A new pair may repeat an output but never an input.',
      reasoning: [
        'The input 4 is already used, and it already points to 9.',
        'Adding $(4, 11)$ would give the input 4 two different outputs.',
        '$(7, 5)$ reuses the output 5, which is allowed.',
      ],
      answer: '$(4, 11)$',
      connection: 'This is the vertical line test stated in the language of ordered pairs.',
    },
    feedback: ['Look at the first coordinate of each option and compare it with the pairs already in the set.'],
    hints: ['Which inputs are already taken?'],
  });
}

export default GRADE_8_STANDARDS_B;
