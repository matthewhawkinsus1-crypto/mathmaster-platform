#!/usr/bin/env node
// Grade 7 and Grade 6 DOK 3 templates.
//
// Continues what `author-grade8-dok3.mjs` started. The audit found every Grade
// 6-8 standard without a single DOK 3 item, which meant middle school could be
// given harder NUMBERS but never harder THINKING — and the recommendation
// engine's "same complexity, more demanding reasoning" branch was unreachable
// below Algebra I.
//
// The same two rules as Grade 8:
//
//   DOK 3 MEANS JUDGING, NOT COMPUTING. Every item asks the student to evaluate
//   a claim, locate an error, or say what settles a question. A longer
//   calculation is the difficulty axis, not this one.
//
//   CORRECTNESS BY CONSTRUCTION. Each generator picks the ANSWER first and
//   derives the question from it, so no parameter draw can produce an item
//   whose stated answer is wrong. The tests then re-derive every answer with
//   their own arithmetic and compare.
//
// The misconceptions chosen are the ones that actually block the next year:
// treating a constant rate as proportional, halving nothing when given a
// diameter, reading |-5| as -5, adding instead of multiplying for a ratio.

import { readFileSync, writeFileSync } from 'node:fs';

const choice = (id, label) => ({ id, label });
const pick = (expected) => ([{
  id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected,
}]);

const make = (courseId, prefix, code, slug, extra) => ({
  id: `mm_gen_${prefix}_${code.replace('.', '_')}_${slug}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  courseId,
  familyId: `mathmaster:${code}:gen-${slug}`,
  familyVersion: 1,
  questionType: 'multipleChoice',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 3,
  calculatorPolicy: 'inherit',
  assessedConstruct: code,
  authoring: { source: 'MathMaster generative Path authoring', kit: 4 },
  attemptFeedback: ['Work out what is actually true first, then check the claim against it.'],
  supportHints: ['Decide what would have to be true for the statement to hold. Then test it.'],
  ...extra,
});

// ============================================================ GRADE 7

const g7 = (code, slug, extra) => make('grade7', '7', code, slug, extra);

const GRADE7 = [

  // Constant of proportionality: the ratio must be the SAME in every row.
  g7('7.4C', 'ratio-must-hold-everywhere', {
    taskType: 'justification',
    representation: 'table',
    prompt: 'A table shows $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$. A student says the constant of proportionality is $ {{k}} $ because $ {{y1}} \\div {{x1}} = {{k}} $. Check the second pair.',
    choices: [
      choice('notProportional', 'Not proportional — the second pair gives $ {{y2}} \\div {{x2}} $, which is not $ {{k}} $'),
      choice('correct', 'Correct — one pair is enough to find $k$'),
      choice('useSecond', 'The constant is whatever the second pair gives'),
      choice('needThree', 'At least three pairs are needed before $k$ can be found'),
    ],
    responseFields: pick('notProportional'),
    solutionReview: {
      headline: 'A constant of proportionality is only constant if every pair gives it.',
      reasoning: [
        'The first pair does give $ {{y1}} \\div {{x1}} = {{k}} $.',
        'The second pair gives $ {{y2}} \\div {{x2}} $, a different value, so no single $k$ works and the relationship is not proportional.',
      ],
      answerSummary: 'Not proportional — the ratios disagree',
    },
    generator: {
      parameters: {
        k: { type: 'int', min: 2, max: 9 },
        x1: { type: 'int', min: 2, max: 6 },
        x2: { type: 'int', min: 7, max: 12 },
        off: { type: 'int', min: 1, max: 5 },
      },
      derived: { y1: 'k*x1', y2: 'k*x2+off' },
    },
  }),

  // Verifying a proposed solution: substitute, do not re-solve.
  g7('7.11B', 'does-the-value-fit', {
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'Does $x = {{guess}}$ make $ {{a}}x + {{b}} = {{c}} $ true? Substitute and check.',
    choices: [
      choice('no', 'No — it gives $ {{guessValue}} $, not $ {{c}} $. The value that works is $ {{x}} $'),
      choice('yes', 'Yes — it makes both sides equal'),
      choice('cannot', 'It cannot be checked without solving the equation first'),
      choice('always', 'Any value works, because the equation has infinitely many solutions'),
    ],
    responseFields: pick('no'),
    solutionReview: {
      headline: 'Checking a solution means substituting it, not re-solving.',
      reasoning: [
        'Substituting $x = {{guess}}$: $ {{a}}({{guess}}) + {{b}} = {{guessValue}} $.',
        'That is not $ {{c}} $, so $ {{guess}} $ is not a solution. Solving gives $x = {{x}} $.',
      ],
      answerSummary: 'No — the value that works is {{x}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 2, max: 9 },
        b: { type: 'int', min: -12, max: 12 },
        x: { type: 'int', min: -8, max: 8 },
        off: { type: 'int', min: 1, max: 4 },
      },
      derived: { c: 'a*x+b', guess: 'x+off', guessValue: 'a*(x+off)+b' },
    },
  }),

  // The percent that does not come back: down p% then up p% is not the start.
  g7('7.4D', 'percent-off-then-on', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A $ \\${{price}} $ item is reduced by $ {{p}}\\% $, then that sale price is increased by $ {{p}}\\% $. A student says it is back to $ \\${{price}} $. Is it?',
    choices: [
      choice('less', 'No — it ends BELOW $ \\${{price}} $, because the $ {{p}}\\% $ increase is taken on the smaller sale price'),
      choice('yes', 'Yes — the same percent up and down cancel out'),
      choice('more', 'No — it ends up higher than it started'),
      choice('depends', 'It depends on whether the percent is more or less than 50%'),
    ],
    responseFields: pick('less'),
    solutionReview: {
      headline: 'A percent is always a percent OF something, and the something changed.',
      reasoning: [
        'The discount was $ {{p}}\\% $ of $ \\${{price}} $, which is $ \\${{discount}} $, leaving $ \\${{sale}} $.',
        'The increase is $ {{p}}\\% $ of $ \\${{sale}} $, not of $ \\${{price}} $ — so it adds back LESS than $ \\${{discount}} $ and the price ends below where it started.',
      ],
      answerSummary: 'No — it ends below the original price',
    },
    generator: {
      parameters: {
        price: { type: 'int', min: 20, max: 90, step: 10 },
        p: { type: 'int', min: 10, max: 40, step: 10 },
      },
      // Every displayed figure is a whole number of dollars. `finalCents` is
      // kept for the verification test, which needs the exact endpoint, but it
      // is never shown — "2970 hundredths of a dollar" is not how anyone talks.
      derived: {
        discount: 'price*p/100',
        sale: 'price-price*p/100',
        finalCents: 'price*(100-p)*(100+p)/100',
      },
    },
  }),

  // Diameter is not radius. The single most common circle error.
  g7('7.9B', 'diameter-not-radius', {
    taskType: 'errorAnalysis',
    representation: 'diagram',
    prompt: 'A circle has DIAMETER $ {{d}} $ cm. A student finds the area as $\\pi \\times {{d}}^2 = {{wrongArea}}\\pi$. What went wrong?',
    choices: [
      choice('halveFirst', 'The formula uses the RADIUS. Halving first gives $ {{r}} $, so the area is $ {{area}}\\pi $'),
      choice('nothing', 'Nothing — area is $\\pi d^2$'),
      choice('circumference', 'They found the circumference instead of the area'),
      choice('doubled', 'They should have doubled the diameter first'),
    ],
    responseFields: pick('halveFirst'),
    solutionReview: {
      headline: 'Area is πr², and r is half the diameter.',
      reasoning: [
        'The diameter is $ {{d}} $, so the radius is $ {{d}} \\div 2 = {{r}} $.',
        'The area is $\\pi({{r}})^2 = {{area}}\\pi$, which is a quarter of the student\'s answer.',
      ],
      answerSummary: '{{area}}π square cm',
    },
    generator: {
      parameters: { r: { type: 'int', min: 2, max: 12 } },
      derived: { d: '2*r', area: 'r*r', wrongArea: '4*r*r' },
    },
  }),

  // Angles in a triangle sum to 180, not 360.
  g7('7.11C', 'triangle-not-quadrilateral', {
    taskType: 'errorAnalysis',
    representation: 'diagram',
    prompt: 'A triangle has angles $ {{a}}^\\circ $, $ {{b}}^\\circ $ and $x^\\circ$. A student writes $ {{a}} + {{b}} + x = 360 $ and gets $x = {{wrongX}} $. What is wrong?',
    choices: [
      choice('oneEighty', 'The angles of a TRIANGLE sum to $180^\\circ$, not $360^\\circ$, so $x = {{x}} $'),
      choice('nothing', 'Nothing — all polygons have angles summing to $360^\\circ$'),
      choice('subtract', 'They should have subtracted the two angles from each other'),
      choice('impossible', 'The triangle cannot exist'),
    ],
    responseFields: pick('oneEighty'),
    solutionReview: {
      headline: 'Three angles, one hundred and eighty degrees.',
      reasoning: [
        '$360^\\circ$ is the sum for a quadrilateral, not a triangle.',
        '$ {{a}} + {{b}} + x = 180 $, so $x = 180 - {{a}} - {{b}} = {{x}} $.',
      ],
      answerSummary: '{{x}} degrees',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 25, max: 80 },
        b: { type: 'int', min: 25, max: 80 },
      },
      derived: { x: '180-a-b', wrongX: '360-a-b' },
      constraints: ['x > 10'],
    },
  }),

  // Subtracting a negative.
  g7('7.3A', 'subtracting-a-negative', {
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'A student computes $ {{a}} - (-{{b}}) $ and writes $ {{wrong}} $. Is that right, and why?',
    choices: [
      choice('addIt', 'No — subtracting a negative adds, so the answer is $ {{right}} $'),
      choice('yes', 'Yes — two negatives always make the result smaller'),
      choice('zero', 'No — the answer is $0$'),
      choice('cannot', 'Subtracting a negative number is not defined'),
    ],
    responseFields: pick('addIt'),
    solutionReview: {
      headline: 'Subtracting a negative is the same as adding its opposite.',
      reasoning: [
        'On a number line, taking away a debt of $ {{b}} $ moves you UP by $ {{b}} $.',
        '$ {{a}} - (-{{b}}) = {{a}} + {{b}} = {{right}} $.',
      ],
      answerSummary: '{{right}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: -12, max: 12 },
        b: { type: 'int', min: 2, max: 14 },
      },
      derived: { right: 'a+b', wrong: 'a-b' },
    },
  }),

  // The complement.
  g7('7.6E', 'complement-of-an-event', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A bag holds $ {{win}} $ winning tickets and $ {{lose}} $ losing tickets. A student says the probability of NOT winning is $ {{win}}/{{lose}} $. What is it really, and why?',
    choices: [
      choice('complement', '$ {{lose}}/{{total}} $ — the complement is the losing tickets out of ALL $ {{total}} $ tickets'),
      choice('student', 'The student is right'),
      choice('inverse', '$ {{lose}}/{{win}} $'),
      choice('half', 'Always $1/2$, because you either win or you do not'),
    ],
    responseFields: pick('complement'),
    solutionReview: {
      headline: 'A probability is a part out of the WHOLE, and the two must sum to 1.',
      reasoning: [
        'There are $ {{win}} + {{lose}} = {{total}} $ tickets altogether.',
        'P(win) $= {{win}}/{{total}}$ and P(not win) $= {{lose}}/{{total}}$, and those two add to 1.',
      ],
      answerSummary: '{{lose}}/{{total}}',
    },
    generator: {
      parameters: {
        win: { type: 'int', min: 2, max: 9 },
        lose: { type: 'int', min: 3, max: 15 },
      },
      derived: { total: 'win+lose' },
      constraints: ['win != lose'],
    },
  }),

  // Constant rate of change: check EVERY step, not the first one.
  g7('7.4A', 'check-every-step', {
    taskType: 'justification',
    representation: 'table',
    prompt: 'A table goes $ {{y0}} $, $ {{y1}} $, $ {{y2}} $ as $x$ goes 0, 1, 2. A student says the rate of change is $ {{m}} $ because the first step adds $ {{m}} $. Is the rate constant?',
    choices: [
      choice('notConstant', 'No — the second step adds $ {{step2}} $, not $ {{m}} $, so there is no single rate'),
      choice('yes', 'Yes — the first step determines the rate'),
      choice('average', 'The rate is the average of the two steps'),
      choice('needMore', 'More rows are needed before anything can be said'),
    ],
    responseFields: pick('notConstant'),
    solutionReview: {
      headline: 'A constant rate must be the same between EVERY consecutive pair.',
      reasoning: [
        'From $ {{y0}} $ to $ {{y1}} $ the change is $ {{m}} $.',
        'From $ {{y1}} $ to $ {{y2}} $ the change is $ {{step2}} $. Different steps mean the relationship is not linear.',
      ],
      answerSummary: 'No — the steps are {{m}} and {{step2}}',
    },
    generator: {
      parameters: {
        y0: { type: 'int', min: -8, max: 12 },
        m: { type: 'int', min: 2, max: 9 },
        bump: { type: 'int', min: 1, max: 5 },
      },
      derived: { y1: 'y0+m', y2: 'y0+m+m+bump', step2: 'm+bump' },
    },
  }),

  // Rate and starting value swapped.
  g7('7.7', 'rate-versus-start', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A gym charges a $ \\${{start}} $ joining fee plus $ \\${{rate}} $ each month. A student writes $y = {{start}}x + {{rate}}$. What is wrong?',
    choices: [
      choice('swapped', 'The rate and the starting fee are swapped — it should be $y = {{rate}}x + {{start}}$'),
      choice('nothing', 'Nothing — either order gives the same total'),
      choice('noStart', 'The joining fee should not appear in the equation'),
      choice('multiply', 'The two amounts should be multiplied together'),
    ],
    responseFields: pick('swapped'),
    solutionReview: {
      headline: 'The number multiplied by x is the thing that repeats.',
      reasoning: [
        'The $ \\${{rate}} $ happens every month, so it is the coefficient of $x$.',
        'The $ \\${{start}} $ happens once, at $x = 0$, so it is the constant. After {{months}} months the cost is $ {{rate}}({{months}}) + {{start}} = {{total}} $.',
      ],
      answerSummary: 'y = {{rate}}x + {{start}}',
    },
    generator: {
      parameters: {
        start: { type: 'int', min: 15, max: 60 },
        rate: { type: 'int', min: 8, max: 35 },
        months: { type: 'int', min: 3, max: 10 },
      },
      derived: { total: 'rate*months+start' },
      constraints: ['start != rate'],
    },
  }),

  // One step or two?
  g7('7.10A', 'one-step-or-two', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'Tickets cost $ \\${{rate}} $ each and parking costs $ \\${{park}} $ once. The total was $ \\${{total}} $. Which equation finds the number of tickets, and why?',
    choices: [
      choice('twoStep', '$ {{rate}}t + {{park}} = {{total}} $ — parking is paid once, so it is added, not multiplied'),
      choice('oneStep', '$ {{rate}}t = {{total}} $ — parking is part of the ticket price'),
      choice('bothPer', '$({{rate}} + {{park}})t = {{total}} $ — both costs happen per ticket'),
      choice('divide', '$t = {{total}} \\div {{park}} $'),
    ],
    responseFields: pick('twoStep'),
    solutionReview: {
      headline: 'Ask which cost repeats and which happens once.',
      reasoning: [
        'Parking is a single charge, so it is added once rather than multiplied by the number of tickets.',
        'Solving $ {{rate}}t + {{park}} = {{total}} $ gives $t = {{t}} $ tickets.',
      ],
      answerSummary: '{{rate}}t + {{park}} = {{total}}',
    },
    generator: {
      parameters: {
        rate: { type: 'int', min: 6, max: 20 },
        park: { type: 'int', min: 4, max: 15 },
        t: { type: 'int', min: 2, max: 9 },
      },
      derived: { total: 'rate*t+park' },
    },
  }),

  // Similarity: corresponding sides, and the ratio is the same for all of them.
  g7('7.5A', 'corresponding-sides', {
    taskType: 'justification',
    representation: 'diagram',
    prompt: 'Two similar rectangles have sides $ {{a}} $ by $ {{b}} $ and $ {{a2}} $ by $ {{b2}} $. A student says the scale factor is $ {{a2}} \\div {{b}} $. What is it really?',
    choices: [
      choice('corresponding', '$ {{k}} $ — the scale factor compares CORRESPONDING sides, so $ {{a2}} \\div {{a}} $ and $ {{b2}} \\div {{b}} $ both give it'),
      choice('student', 'The student is right'),
      choice('sum', 'The sum of the two ratios'),
      choice('notSimilar', 'The rectangles are not actually similar'),
    ],
    responseFields: pick('corresponding'),
    solutionReview: {
      headline: 'Compare a side with the side that matches it, not with the other one.',
      reasoning: [
        '$ {{a2}} \\div {{a}} = {{k}} $ and $ {{b2}} \\div {{b}} = {{k}} $ — the same factor from both pairs, which is what similarity means.',
        'Dividing a length by a side it does not correspond to mixes up two different measurements.',
      ],
      answerSummary: '{{k}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 2, max: 9 },
        b: { type: 'int', min: 3, max: 12 },
        k: { type: 'int', min: 2, max: 5 },
      },
      derived: { a2: 'a*k', b2: 'b*k' },
      constraints: ['a != b'],
    },
  }),

  // Compound interest earns on interest.
  g7('7.13E', 'simple-versus-compound', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: '$ \\${{p}} $ is invested at $ {{r}}\\% $ for 2 years. A student says simple and compound interest give the same total because the rate and time are the same. Are they the same?',
    choices: [
      choice('compoundMore', 'No — compound earns more, because year 2 pays interest on the interest from year 1'),
      choice('same', 'Yes — the same rate over the same time gives the same total'),
      choice('simpleMore', 'No — simple interest earns more'),
      choice('onlyLong', 'They differ only after 10 years or more'),
    ],
    responseFields: pick('compoundMore'),
    solutionReview: {
      headline: 'Compound interest pays interest on interest. Simple interest never does.',
      reasoning: [
        'Simple: interest is $ {{r}}\\% $ of $ \\${{p}} $ each year, so 2 years give $ \\${{simpleInterest}} $ of interest.',
        'Compound: year 2 charges $ {{r}}\\% $ on $ \\${{afterYear1}} $, not on $ \\${{p}} $ — which is more.',
      ],
      answerSummary: 'Compound earns more',
    },
    generator: {
      parameters: {
        p: { type: 'int', min: 200, max: 2000, step: 100 },
        r: { type: 'int', min: 2, max: 10 },
      },
      derived: {
        simpleInterest: '2*p*r/100',
        afterYear1: 'p+p*r/100',
      },
    },
  }),
];

// ============================================================ GRADE 6

const g6 = (code, slug, extra) => make('grade6', '6', code, slug, extra);

const GRADE6 = [

  // Absolute value is never negative.
  g6('6.2B', 'absolute-value-is-a-distance', {
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'A student writes $|-{{n}}| = -{{n}}$. Is that right, and what does the absolute value actually mean?',
    choices: [
      choice('distance', 'No — it is the DISTANCE from zero, which is never negative, so $|-{{n}}| = {{n}}$'),
      choice('yes', 'Yes — absolute value keeps the sign the number already had'),
      choice('opposite', 'No — it always gives the opposite, so the answer is $ {{n}} $ only for positives'),
      choice('zero', 'No — the absolute value of any negative number is $0$'),
    ],
    responseFields: pick('distance'),
    solutionReview: {
      headline: 'Absolute value asks HOW FAR from zero, not which side.',
      reasoning: [
        '$-{{n}}$ sits $ {{n}} $ units from zero on the number line.',
        'Distance cannot be negative, so $|-{{n}}| = {{n}}$. The OPPOSITE of $-{{n}}$ is also $ {{n}} $ — but those are two different ideas that happen to agree here.',
      ],
      answerSummary: '{{n}}',
    },
    generator: { parameters: { n: { type: 'int', min: 2, max: 19 } }, derived: {} },
  }),

  // Integer subtraction across zero.
  g6('6.3D', 'crossing-zero', {
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'A student computes $ {{a}} - {{b}} $ and writes $ {{wrong}} $, saying you always subtract the smaller from the larger. What is the answer, and why?',
    choices: [
      choice('negative', '$ {{right}} $ — you start at $ {{a}} $ and move $ {{b}} $ to the LEFT, which crosses zero'),
      choice('student', 'The student is right — order does not matter in subtraction'),
      choice('add', '$ {{sum}} $'),
      choice('zero', '$0$, because the numbers cancel'),
    ],
    responseFields: pick('negative'),
    solutionReview: {
      headline: 'Subtraction is a direction on the number line, and order matters.',
      reasoning: [
        'Starting at $ {{a}} $ and moving $ {{b}} $ to the left lands on $ {{right}} $.',
        'Swapping the order gives $ {{wrong}} $, which is a different question with a different answer.',
      ],
      answerSummary: '{{right}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 1, max: 9 },
        b: { type: 'int', min: 10, max: 20 },
      },
      derived: { right: 'a-b', wrong: 'b-a', sum: 'a+b' },
    },
  }),

  // A ratio compares by multiplying, not by adding.
  g6('6.4C', 'times-as-many-not-more-than', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A recipe uses $ {{blue}} $ blue beads for every $ {{red}} $ red beads. A student says "there are $ {{diff}} $ more blue than red, so the ratio is $ {{diff}} $". Why is that wrong?',
    choices: [
      choice('multiplicative', 'A ratio compares by DIVIDING, not by subtracting — it is $ {{blue}} : {{red}} $, so there are $ {{times}} $ times as many blue'),
      choice('student', 'The student is right — a ratio is the difference'),
      choice('sum', 'The ratio is the total, $ {{total}} $'),
      choice('either', 'Either the difference or the quotient may be used'),
    ],
    responseFields: pick('multiplicative'),
    solutionReview: {
      headline: 'A ratio is a multiplicative comparison.',
      reasoning: [
        'Doubling the recipe gives $ {{blue2}} $ blue and $ {{red2}} $ red. The DIFFERENCE changed to $ {{diff2}} $, but the ratio is still $ {{blue}} : {{red}} $.',
        'That is exactly why a ratio divides rather than subtracts — it survives scaling.',
      ],
      answerSummary: '{{blue}} : {{red}}',
    },
    generator: {
      parameters: {
        red: { type: 'int', min: 2, max: 6 },
        times: { type: 'int', min: 2, max: 5 },
      },
      derived: {
        blue: 'red*times',
        diff: 'red*times-red',
        total: 'red*times+red',
        blue2: '2*red*times',
        red2: '2*red',
        diff2: '2*red*times-2*red',
      },
      // "There are 2 more" and "2 times as many" showing the same 2 makes the
      // distinction the item is about invisible.
      constraints: ['diff != times'],
    },
  }),

  // Finding the whole from a part and a percent.
  g6('6.5B', 'find-the-whole', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: '$ {{part}} $ students is $ {{p}}\\% $ of the class. A student multiplies $ {{part}} \\times {{p}}\\% $ to find the class size. What should they do instead?',
    choices: [
      choice('divide', 'Divide — the class is $ {{part}} \\div {{p}}\\% = {{whole}} $ students'),
      choice('multiply', 'Multiplying is right, because percent means "of"'),
      choice('subtract', 'Subtract the percent from 100 first'),
      choice('add', 'Add $ {{p}} $ to $ {{part}} $'),
    ],
    responseFields: pick('divide'),
    solutionReview: {
      headline: 'Multiplying by a percent makes something SMALLER. The whole is bigger than the part.',
      reasoning: [
        '$ {{p}}\\% $ of the class is $ {{part}} $, so $ {{p}}\\% $ of the whole equals $ {{part}} $.',
        'The whole is therefore $ {{part}} \\div {{p}}\\% = {{whole}} $. Check: $ {{p}}\\% $ of $ {{whole}} $ is $ {{part}} $.',
      ],
      answerSummary: '{{whole}} students',
    },
    generator: {
      parameters: {
        whole: { type: 'int', min: 20, max: 40, step: 4 },
        p: { type: 'int', min: 25, max: 75, step: 25 },
      },
      derived: { part: 'whole*p/100' },
      constraints: ['part*100 == whole*p'],
    },
  }),

  // Which quantity depends on which?
  g6('6.6A', 'which-depends-on-which', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A shop charges $ \\${{rate}} $ per hour of parking. A student says the cost is the independent quantity because it is the thing being asked about. Which is independent, and how do you tell?',
    choices: [
      choice('hours', 'Hours is independent — you choose it, and the cost follows from it'),
      choice('cost', 'Cost is independent, because that is what the question is about'),
      choice('either', 'Either one may be called independent'),
      choice('neither', 'Neither, because both change'),
    ],
    responseFields: pick('hours'),
    solutionReview: {
      headline: 'The independent quantity is the one you get to choose.',
      reasoning: [
        'You decide how long to park. The cost is then determined: $ {{rate}} \\times {{hours}} = {{cost}} $ for {{hours}} hours.',
        'You cannot choose the cost first and have the hours follow, so cost is the dependent quantity.',
      ],
      answerSummary: 'Hours is independent; cost depends on it',
    },
    generator: {
      parameters: {
        rate: { type: 'int', min: 2, max: 9 },
        hours: { type: 'int', min: 2, max: 8 },
      },
      derived: { cost: 'rate*hours' },
    },
  }),

  // Order of operations is not left to right.
  g6('6.7A', 'not-left-to-right', {
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'A student evaluates $ {{a}} + {{b}} \\times {{c}} $ from left to right and gets $ {{wrong}} $. What is the correct value, and why?',
    choices: [
      choice('multiplyFirst', '$ {{right}} $ — multiplication is done before addition, so $ {{b}} \\times {{c}} $ comes first'),
      choice('student', 'The student is right — expressions are read left to right'),
      choice('either', 'Both answers are acceptable'),
      choice('parens', 'The expression cannot be evaluated without parentheses'),
    ],
    responseFields: pick('multiplyFirst'),
    solutionReview: {
      headline: 'Multiplication and division happen before addition and subtraction.',
      reasoning: [
        '$ {{b}} \\times {{c}} = {{product}} $ first.',
        'Then $ {{a}} + {{product}} = {{right}} $. Reading left to right would add first and give $ {{wrong}} $ instead.',
      ],
      answerSummary: '{{right}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 2, max: 12 },
        b: { type: 'int', min: 2, max: 9 },
        c: { type: 'int', min: 2, max: 9 },
      },
      derived: { product: 'b*c', right: 'a+b*c', wrong: '(a+b)*c' },
      constraints: ['right != wrong'],
    },
  }),

  // Distributing over a sum.
  g6('6.7C', 'distribute-to-both', {
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'A student says $ {{k}}(x + {{n}}) $ is the same as $ {{k}}x + {{n}} $. Test it with $x = {{test}}$.',
    choices: [
      choice('bothTerms', 'Not equivalent — the $ {{k}} $ multiplies BOTH terms, giving $ {{k}}x + {{kn}} $. At $x={{test}}$ they give $ {{correctValue}} $ and $ {{wrongValue}} $'),
      choice('same', 'They are equivalent for every value of $x$'),
      choice('onlyZero', 'They are equivalent only when $x = 0$'),
      choice('cannot', 'Equivalence cannot be tested by substituting a value'),
    ],
    responseFields: pick('bothTerms'),
    solutionReview: {
      headline: 'A factor outside a bracket multiplies everything inside it.',
      reasoning: [
        '$ {{k}}(x + {{n}}) = {{k}}x + {{kn}} $.',
        'At $x = {{test}}$: the correct expression gives $ {{correctValue}} $, the student\'s gives $ {{wrongValue}} $. One counterexample settles it.',
      ],
      answerSummary: '{{k}}x + {{kn}}',
    },
    generator: {
      parameters: {
        k: { type: 'int', min: 2, max: 9 },
        n: { type: 'int', min: 2, max: 12 },
        test: { type: 'int', min: 1, max: 8 },
      },
      derived: {
        kn: 'k*n',
        correctValue: 'k*test+k*n',
        wrongValue: 'k*test+n',
      },
    },
  }),

  // Which operation undoes which.
  g6('6.9A', 'which-operation-undoes-it', {
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A student shares $ {{total}} $ stickers equally among $ {{groups}} $ friends and writes $ {{groups}}s = {{total}} $. To find $s$, they multiply both sides by $ {{groups}} $. What should they do?',
    choices: [
      choice('divide', 'Divide both sides by $ {{groups}} $ — division undoes multiplication, giving $s = {{s}} $'),
      choice('multiply', 'Multiplying is right, because it isolates $s$'),
      choice('subtract', 'Subtract $ {{groups}} $ from both sides'),
      choice('nothing', 'Nothing needs to be done; $s = {{total}} $'),
    ],
    responseFields: pick('divide'),
    solutionReview: {
      headline: 'Undo an operation with its inverse.',
      reasoning: [
        '$s$ is being MULTIPLIED by $ {{groups}} $, so dividing by $ {{groups}} $ undoes it.',
        '$s = {{total}} \\div {{groups}} = {{s}} $. Check: $ {{groups}} \\times {{s}} = {{total}} $.',
      ],
      answerSummary: '{{s}} stickers each',
    },
    generator: {
      parameters: {
        groups: { type: 'int', min: 3, max: 9 },
        s: { type: 'int', min: 4, max: 15 },
      },
      derived: { total: 'groups*s' },
    },
  }),

  // Testing a value in an inequality.
  g6('6.10B', 'test-the-inequality', {
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'Does $x = {{guess}}$ satisfy $x + {{b}} > {{c}} $? Substitute and check.',
    choices: [
      choice('no', 'No — it gives $ {{guessValue}} $, which is not greater than $ {{c}} $'),
      choice('yes', 'Yes — it makes the inequality true'),
      choice('equal', 'It makes both sides equal, which counts as satisfying it'),
      choice('cannot', 'Inequalities cannot be checked by substitution'),
    ],
    responseFields: pick('no'),
    solutionReview: {
      headline: 'An inequality is checked the same way an equation is — substitute.',
      reasoning: [
        'Substituting: $ {{guess}} + {{b}} = {{guessValue}} $.',
        '$ {{guessValue}} $ is not greater than $ {{c}} $, so $ {{guess}} $ does not satisfy it. Values above $ {{boundary}} $ do.',
      ],
      answerSummary: 'No',
    },
    generator: {
      parameters: {
        b: { type: 'int', min: 2, max: 15 },
        boundary: { type: 'int', min: 3, max: 20 },
        below: { type: 'int', min: 1, max: 5 },
      },
      derived: { c: 'boundary+b', guess: 'boundary-below', guessValue: 'boundary-below+b' },
    },
  }),

  // The half in a triangle's area.
  g6('6.8D', 'the-missing-half', {
    taskType: 'errorAnalysis',
    representation: 'diagram',
    prompt: 'A triangle has base $ {{b}} $ and height $ {{h}} $. A student finds the area as $ {{b}} \\times {{h}} = {{wrongArea}} $. What is wrong?',
    choices: [
      choice('half', 'That is the area of a RECTANGLE with the same base and height. A triangle is half of it, so the area is $ {{area}} $'),
      choice('nothing', 'Nothing — that is the triangle area formula'),
      choice('add', 'The base and height should be added, not multiplied'),
      choice('double', 'The result should be doubled'),
    ],
    responseFields: pick('half'),
    solutionReview: {
      headline: 'Two copies of a triangle make the rectangle around it.',
      reasoning: [
        'A rectangle $ {{b}} $ by $ {{h}} $ has area $ {{wrongArea}} $, and the triangle is exactly half of that.',
        'Area $= \\frac{1}{2} \\times {{b}} \\times {{h}} = {{area}} $ square units.',
      ],
      answerSummary: '{{area}} square units',
    },
    generator: {
      parameters: {
        b: { type: 'int', min: 3, max: 16 },
        h: { type: 'int', min: 2, max: 14 },
      },
      derived: { wrongArea: 'b*h', area: 'b*h/2' },
      constraints: ['b*h % 2 == 0'],
    },
  }),

  // Mean and median do not respond to an outlier the same way.
  g6('6.12C', 'outlier-moves-the-mean', {
    taskType: 'justification',
    representation: 'table',
    prompt: 'Four scores are $ {{a}} $, $ {{b}} $, $ {{c}} $ and $ {{d}} $. One more score of $ {{outlier}} $ is added. A student says the mean and the median both change by the same amount. What actually happens?',
    choices: [
      choice('meanMoves', 'The mean is pulled toward $ {{outlier}} $ much more than the median is, because the mean uses every value\'s size'),
      choice('same', 'Both change by the same amount'),
      choice('neither', 'Neither changes, because one value cannot matter'),
      choice('medianMoves', 'The median moves more than the mean'),
    ],
    responseFields: pick('meanMoves'),
    solutionReview: {
      headline: 'The mean feels how far away a value is. The median only counts positions.',
      reasoning: [
        'The mean of the first four is $ {{mean4}} $; adding $ {{outlier}} $ makes it $ {{mean5}} $.',
        'The median only moves to the next value along, because it depends on ORDER rather than on size.',
      ],
      answerSummary: 'The mean moves much more',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 10, max: 20 },
        step: { type: 'int', min: 1, max: 4 },
        outlier: { type: 'int', min: 90, max: 100 },
      },
      derived: {
        b: 'a+step',
        c: 'a+2*step',
        d: 'a+3*step',
        sum4: '4*a+6*step',
        mean4: '(4*a+6*step)/4',
        mean5: '(4*a+6*step+outlier)/5',
      },
    },
  }),

  // Dividing by a fraction.
  g6('6.3A', 'divide-by-a-fraction', {
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'A student says $ {{whole}} \\div \\frac{1}{{{n}}} $ must be smaller than $ {{whole}} $, because dividing makes things smaller. How many $\\frac{1}{{{n}}}$ pieces are in $ {{whole}} $?',
    choices: [
      choice('bigger', '$ {{answer}} $ — dividing by a number LESS than 1 gives a bigger result, because you are counting small pieces'),
      choice('smaller', '$ {{wrong}} $ — dividing always makes a number smaller'),
      choice('same', '$ {{whole}} $ — dividing by a fraction changes nothing'),
      choice('cannot', 'You cannot divide a whole number by a fraction'),
    ],
    responseFields: pick('bigger'),
    solutionReview: {
      headline: 'Division asks "how many of these fit?" — and small pieces fit many times.',
      reasoning: [
        'Each whole contains $ {{n}} $ pieces of size $\\frac{1}{{{n}}}$.',
        'So $ {{whole}} $ wholes contain $ {{whole}} \\times {{n}} = {{answer}} $ pieces. Dividing by a reciprocal is the same as multiplying.',
      ],
      answerSummary: '{{answer}}',
    },
    generator: {
      parameters: {
        whole: { type: 'int', min: 2, max: 9 },
        n: { type: 'int', min: 2, max: 8 },
      },
      derived: { answer: 'whole*n', wrong: 'whole/n' },
    },
  }),
];

// ============================================================ write

const write = (path, templates) => {
  const seed = JSON.parse(readFileSync(path, 'utf8'));
  const existing = new Set(seed.documents.map((doc) => doc.id));
  const fresh = templates.filter((template) => !existing.has(template.id));
  if (!fresh.length) {
    console.log(`${path}: already present, nothing added.`);
    return 0;
  }
  seed.documents.push(...fresh);
  writeFileSync(path, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`${path}: added ${fresh.length}`);
  fresh.forEach((template) => console.log(`  ${template.alignmentKeys[0]}  ${template.id}`));
  return fresh.length;
};

write('seed/pathQuestionBank/grade7_pathQuestionBank_seed.json', GRADE7);
write('seed/pathQuestionBank/grade6_pathQuestionBank_seed.json', GRADE6);
