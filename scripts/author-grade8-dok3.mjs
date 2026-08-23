#!/usr/bin/env node
// Grade 8 DOK 3 templates — the gap the content audit named.
//
// WHY GRADE 8, AND WHY DOK 3. The audit found 598 standard/bank pairs with no
// DOK 3 template at all, and every Grade 6-8 standard was among them. That has
// a specific consequence: for a middle-school student the platform can raise
// the NUMBERS but not the THINKING. Extension has nothing to offer, and the
// recommendation engine's whole "same complexity, more demanding reasoning"
// branch is unreachable below Algebra I. Grade 8 first because it is the
// prerequisite year for Algebra I, so its gaps are the ones that surface as
// Algebra I failures.
//
// WHAT MAKES THESE DOK 3 AND NOT HARDER DOK 2. Depth of Knowledge 3 is
// strategic reasoning: evaluating a claim, justifying a conclusion, or locating
// and explaining an error. It is NOT a longer computation or uglier numbers —
// that is difficulty band, the other axis. Every item here asks the student to
// judge something rather than to execute a procedure:
//
//   - decide whether a stated conclusion follows, and say which fact settles it
//   - find the step where a worked solution goes wrong
//   - choose between two situations on a criterion the student must supply
//
// CORRECTNESS BY CONSTRUCTION. Each generator picks the ANSWER first and
// derives the question from it, so no draw can produce an item whose stated
// answer is wrong. `verify-grade8-dok3.mjs` then re-derives every answer
// independently and compares — a check, not a restatement.

import { readFileSync, writeFileSync } from 'node:fs';

const SEED = 'seed/pathQuestionBank/grade8_pathQuestionBank_seed.json';

const base = (code, slug, extra) => ({
  id: `mm_gen_8_${code.replace('.', '_')}_${slug}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  courseId: 'grade8',
  familyId: `mathmaster:${code}:gen-${slug}`,
  familyVersion: 1,
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 3,
  calculatorPolicy: 'inherit',
  assessedConstruct: code,
  authoring: { source: 'MathMaster generative Path authoring', kit: 4 },
  attemptFeedback: [
    'Look at what the question is asking you to decide, not just what to compute.',
  ],
  supportHints: [
    'Work out what is actually true first. Then check each statement against it.',
  ],
  ...extra,
});

const choice = (id, label) => ({ id, label });
const pick = (expected) => ([{
  id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected,
}]);
const numeric = (expected, label = 'Answer') => ([{
  id: 'answer', label, inputProfile: 'number', expected,
}]);

const TEMPLATES = [

  // --- 8.2C scientific notation ---------------------------------------------
  //
  // The reasoning: comparing numbers in scientific notation is settled by the
  // EXPONENT first, and only then by the coefficient. The distractor is the
  // very common error of comparing coefficients.
  base('8.2C', 'compare-notation-claim', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'A student says $ {{a}} \\times 10^{ {{p}} }$ is greater than $ {{b}} \\times 10^{ {{q}} }$ because $ {{a}} > {{b}} $. Is the student right, and what actually settles it?',
    choices: [
      choice('exponent', 'No — the exponents decide first, and {{q}} > {{p}}'),
      choice('coefficient', 'Yes — the larger coefficient always gives the larger number'),
      choice('equal', 'No — the two numbers are equal'),
      choice('cannot', 'It cannot be decided without converting both to standard notation'),
    ],
    responseFields: pick('exponent'),
    solutionReview: {
      headline: 'In scientific notation the exponent decides the size first.',
      reasoning: [
        'Both coefficients are between 1 and 10, so neither can span a whole power of ten.',
        'Since $ {{q}} > {{p}} $, the second number is larger no matter which coefficient is bigger.',
      ],
      answerSummary: 'No — the exponents decide first, and {{q}} > {{p}}',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 5, max: 9 },
        b: { type: 'int', min: 1, max: 4 },
        p: { type: 'int', min: 2, max: 5 },
        gap: { type: 'int', min: 1, max: 3 },
      },
      derived: { q: 'p+gap' },
    },
  }),

  // --- 8.4C rate of change and y-intercept from a table ---------------------
  //
  // The reasoning: the y-intercept is the value at x = 0, which a table
  // starting at x = 1 does not show. Reading the first row as the intercept is
  // the classic error, and the fix is to step BACK one interval.
  base('8.4C', 'intercept-not-first-row', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'table',
    prompt: 'A table shows $y = {{y1}}$ when $x = 1$, and $y$ increases by $ {{m}} $ for every increase of 1 in $x$. A student says the $y$-intercept is $ {{y1}} $. What is wrong with that?',
    choices: [
      choice('stepback', 'The intercept is the value at $x=0$, which is $ {{b}} $ — one step of $ {{m}} $ back from $ {{y1}} $'),
      choice('nothing', 'Nothing — the first value in a table is always the $y$-intercept'),
      choice('slope', 'The intercept is the rate of change, $ {{m}} $'),
      choice('none', 'A table cannot show a $y$-intercept at all'),
    ],
    responseFields: pick('stepback'),
    solutionReview: {
      headline: 'The y-intercept is the output when the input is zero.',
      reasoning: [
        'The table starts at $x=1$, not at $x=0$, so its first value is not the intercept.',
        'Stepping back one unit of $x$ subtracts one rate of change: $ {{y1}} - {{m}} = {{b}} $.',
      ],
      answerSummary: 'The intercept is {{b}}, one step of {{m}} back from {{y1}}',
    },
    generator: {
      parameters: {
        m: { type: 'int', min: 2, max: 9 },
        b: { type: 'int', min: -12, max: 12 },
      },
      derived: { y1: 'b+m' },
    },
  }),

  // --- 8.5F proportional vs non-proportional -------------------------------
  //
  // The reasoning: BOTH situations are linear and both have a constant rate of
  // change. Only one passes through the origin. The distractor is exactly the
  // conflation the standard exists to break.
  base('8.5F', 'both-linear-one-proportional', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'Plan A charges $ \\${{r}} $ per hour with no fee. Plan B charges $ \\${{r}} $ per hour plus a $ \\${{fee}} $ fee. Both change at a constant rate. Which is proportional, and why?',
    choices: [
      choice('planA', 'Plan A only — a proportional relationship must pass through $(0,0)$, and Plan B starts at $ \\${{fee}} $'),
      choice('both', 'Both — they have the same constant rate of change'),
      choice('planB', 'Plan B only — it has a larger total cost'),
      choice('neither', 'Neither — proportional relationships cannot involve money'),
    ],
    responseFields: pick('planA'),
    solutionReview: {
      headline: 'A constant rate is not enough. Proportional means y = kx, with no constant term.',
      reasoning: [
        'Plan A costs $ {{r}}x $, so at $x=0$ the cost is $0$ and every ratio $y/x$ equals $ {{r}} $.',
        'Plan B costs $ {{r}}x + {{fee}} $. At 1 hour the ratio is $ {{ratio1}} $, at 2 hours it is $ {{ratio2}} $ — not constant.',
      ],
      answerSummary: 'Plan A only — Plan B does not pass through the origin',
    },
    generator: {
      parameters: {
        r: { type: 'int', min: 6, max: 15 },
        fee: { type: 'int', min: 5, max: 30 },
      },
      derived: { ratio1: 'r+fee', ratio2: '(2*r+fee)/2' },
    },
  }),

  // --- 8.5I write y = mx + b from two points --------------------------------
  //
  // The reasoning: test a proposed equation against BOTH points. It is built to
  // fit one and fail the other, which is the error a student makes when they
  // compute the slope correctly and then read the intercept off the wrong point.
  base('8.5I', 'equation-fits-one-point', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'A line passes through $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$. A student writes $y = {{m}}x + {{wrongB}}$. Check the equation against both points.',
    choices: [
      choice('interceptWrong', 'The slope is right but the intercept is wrong — the correct equation is $y = {{m}}x + {{b}}$'),
      choice('correct', 'The equation is correct — it fits both points'),
      choice('slopeWrong', 'The slope is wrong; it should be $ {{y1}} $'),
      choice('noLine', 'No line can pass through both points'),
    ],
    responseFields: pick('interceptWrong'),
    solutionReview: {
      headline: 'An equation must fit EVERY point on the line, not just one.',
      reasoning: [
        'The slope is $({{y2}} - {{y1}})/({{x2}} - {{x1}}) = {{m}}$, which the student had right.',
        'Substituting $({{x1}}, {{y1}})$ gives $ {{y1}} = {{m}}({{x1}}) + b $, so $b = {{b}}$, not $ {{wrongB}} $.',
      ],
      answerSummary: 'y = {{m}}x + {{b}}',
    },
    generator: {
      parameters: {
        m: { type: 'int', min: 2, max: 8 },
        b: { type: 'int', min: -10, max: 10 },
        x1: { type: 'int', min: -4, max: 2 },
        run: { type: 'int', min: 2, max: 5 },
        off: { type: 'int', min: 2, max: 6 },
      },
      derived: {
        x2: 'x1+run',
        y1: 'm*x1+b',
        y2: 'm*(x1+run)+b',
        wrongB: 'b+off',
      },
    },
  }),

  // --- 8.7C Pythagorean converse -------------------------------------------
  //
  // The reasoning: the converse. Having the largest side is not enough; the
  // squares must balance. Built from a genuine non-right triple so the answer
  // is "no", with the specific numeric comparison as the justification.
  base('8.7C', 'converse-check', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'diagram',
    prompt: 'A triangle has sides $ {{a}} $, $ {{b}} $ and $ {{c}} $, with $ {{c}} $ the longest. A student says it must be a right triangle because $ {{c}} $ is the longest side. Is it a right triangle?',
    choices: [
      choice('no', 'No — $ {{a}}^2 + {{b}}^2 = {{sumSquares}} $, but $ {{c}}^2 = {{cSquared}} $'),
      choice('yes', 'Yes — the longest side is always the hypotenuse of a right triangle'),
      choice('needAngle', 'It cannot be decided without measuring an angle'),
      choice('notTriangle', 'These three lengths cannot form a triangle'),
    ],
    responseFields: pick('no'),
    solutionReview: {
      headline: 'The converse of the Pythagorean Theorem is a test, not a guarantee.',
      reasoning: [
        'Every triangle has a longest side. That alone says nothing about its angles.',
        'The triangle is right only when $a^2 + b^2 = c^2$. Here $ {{sumSquares}} \\ne {{cSquared}} $, so it is not.',
      ],
      answerSummary: 'No — the squares do not balance',
    },
    generator: {
      parameters: {
        a: { type: 'int', min: 5, max: 12 },
        b: { type: 'int', min: 6, max: 14 },
        bump: { type: 'int', min: 1, max: 3 },
      },
      // c is built one to three units off the true hypotenuse-square, so the
      // triangle is genuinely NOT right and the comparison is unambiguous.
      derived: {
        sumSquares: 'a*a+b*b',
        c: 'floor(sqrt(a*a+b*b))+bump',
        cSquared: 'c*c',
      },
      constraints: [
        // A real triangle, and c strictly the longest.
        'c < a + b',
        'c > a',
        'c > b',
        // And unambiguously not right.
        'cSquared != sumSquares',
      ],
    },
  }),

  // --- 8.8C variables on both sides: find the flawed step -------------------
  //
  // The reasoning: locate the step where a legal operation was applied to only
  // one side. Built from a correct solution with one deliberate corruption.
  base('8.8C', 'find-the-flawed-step', {
    questionType: 'multipleChoice',
    taskType: 'errorAnalysis',
    representation: 'symbolic',
    prompt: 'Solving $ {{m1}}x + {{b1}} = {{m2}}x + {{b2}} $, a student writes: Step 1: $ {{diffM}}x + {{b1}} = {{b2}} $. Step 2: $ {{diffM}}x = {{wrongRight}} $. Step 3: $x = {{wrongX}} $. Which step is wrong, and why?',
    choices: [
      choice('step2', 'Step 2 — $ {{b1}} $ was subtracted from the left but not from the right; it should be $ {{rightSide}} $'),
      choice('step1', 'Step 1 — subtracting $ {{m2}}x $ from both sides was not allowed'),
      choice('step3', 'Step 3 — the division was done incorrectly'),
      choice('none', 'No step is wrong; the answer is correct'),
    ],
    responseFields: pick('step2'),
    solutionReview: {
      headline: 'Whatever you do to one side, you must do to the other.',
      reasoning: [
        'Step 1 is fine: subtracting $ {{m2}}x $ from both sides gives $ {{diffM}}x + {{b1}} = {{b2}} $.',
        'Step 2 subtracted $ {{b1}} $ from the left only. The right side must become $ {{b2}} - {{b1}} = {{rightSide}} $.',
        'The correct solution is $x = {{x}} $.',
      ],
      answerSummary: 'Step 2 — the right side should be {{rightSide}}',
    },
    generator: {
      parameters: {
        m1: { type: 'int', min: 6, max: 12 },
        m2: { type: 'int', min: 1, max: 5 },
        b1: { type: 'int', min: 2, max: 12 },
        x: { type: 'int', min: -6, max: 6, exclude: [0] },
      },
      derived: {
        diffM: 'm1-m2',
        b2: '(m1-m2)*x+b1',
        rightSide: '(m1-m2)*x',
        // The corrupted line: b1 never taken off the right.
        wrongRight: '(m1-m2)*x+b1',
        wrongX: '((m1-m2)*x+b1)/(m1-m2)',
      },
      constraints: ['diffM > 0', 'b1 % diffM == 0'],
    },
  }),

  // --- 8.9 simultaneous equations: verify a proposed solution ---------------
  //
  // The reasoning: a solution must satisfy BOTH equations. Built to satisfy the
  // first and fail the second, which is what a student produces when they solve
  // one equation and stop.
  base('8.9', 'satisfies-only-one', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'A student says $({{px}}, {{py}})$ solves the system $y = {{m1}}x + {{c1}}$ and $y = {{m2}}x + {{c2}}$. Check it in both equations.',
    choices: [
      choice('firstOnly', 'It satisfies the first equation only — in the second, the right side is $ {{secondValue}} $, not $ {{py}} $'),
      choice('both', 'It satisfies both, so it is the solution'),
      choice('neither', 'It satisfies neither equation'),
      choice('secondOnly', 'It satisfies the second equation only'),
    ],
    responseFields: pick('firstOnly'),
    solutionReview: {
      headline: 'A solution to a system must make every equation true at once.',
      reasoning: [
        'First equation: $ {{m1}}({{px}}) + {{c1}} = {{py}} $, so this point is on that line.',
        'Second equation: $ {{m2}}({{px}}) + {{c2}} = {{secondValue}} $, which is not $ {{py}} $.',
        'The actual solution of the system is $({{sx}}, {{sy}})$.',
      ],
      answerSummary: 'The first equation only',
    },
    generator: {
      parameters: {
        m1: { type: 'int', min: 2, max: 6 },
        m2: { type: 'int', min: -6, max: -1 },
        sx: { type: 'int', min: -5, max: 5 },
        c1: { type: 'int', min: -8, max: 8 },
        shift: { type: 'int', min: 1, max: 4 },
      },
      derived: {
        // A genuine intersection at (sx, sy)...
        sy: 'm1*sx+c1',
        c2: 'm1*sx+c1-m2*sx',
        // ...and a proposed point ON the first line but away from it.
        px: 'sx+shift',
        py: 'm1*(sx+shift)+c1',
        secondValue: 'm2*(sx+shift)+(m1*sx+c1-m2*sx)',
      },
    },
  }),

  // --- 8.4A slope is the same between any two points ------------------------
  //
  // The reasoning: why similar right triangles make slope well-defined. The
  // student must justify a general property, not compute one slope.
  base('8.4A', 'slope-independent-of-points', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'graph',
    prompt: 'On one line, a student draws a slope triangle with rise $ {{r1}} $ and run $ {{u1}} $, then another with rise $ {{r2}} $ and run $ {{u2}} $. The triangles are different sizes. Why do both give the same slope?',
    choices: [
      choice('similar', 'The triangles are similar, so their corresponding sides are proportional and both ratios equal $ {{slope}} $'),
      choice('congruent', 'The triangles are congruent, so their sides are equal'),
      choice('coincidence', 'It is a coincidence that depends on the numbers chosen'),
      choice('bigger', 'The larger triangle gives the more accurate slope'),
    ],
    responseFields: pick('similar'),
    solutionReview: {
      headline: 'Slope triangles on one line are similar, so the rise-to-run ratio cannot change.',
      reasoning: [
        'Both triangles have a right angle and share the line, so their angles match and they are similar.',
        'Similar triangles have proportional sides: $ {{r1}}/{{u1}} = {{r2}}/{{u2}} = {{slope}} $.',
      ],
      answerSummary: 'They are similar triangles, so the ratios are equal',
    },
    generator: {
      parameters: {
        slope: { type: 'int', min: 2, max: 6 },
        u1: { type: 'int', min: 1, max: 4 },
        scale: { type: 'int', min: 2, max: 4 },
      },
      derived: {
        r1: 'slope*u1',
        u2: 'u1*scale',
        r2: 'slope*u1*scale',
      },
    },
  }),

  // --- 8.3C dilation on a coordinate plane ----------------------------------
  //
  // The reasoning: a scale factor multiplies LENGTHS by k and AREAS by k^2. The
  // distractor is applying k to both, which is the standard misconception.
  base('8.3C', 'scale-factor-length-vs-area', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'diagram',
    prompt: 'A rectangle $ {{w}} $ by $ {{h}} $ is dilated from the origin by a scale factor of $ {{k}} $. A student says both the perimeter and the area are multiplied by $ {{k}} $. What is actually true?',
    choices: [
      choice('areaSquared', 'The perimeter is multiplied by $ {{k}} $, but the area is multiplied by $ {{kSquared}} $ — it becomes $ {{newArea}} $'),
      choice('bothK', 'The student is right — both are multiplied by $ {{k}} $'),
      choice('bothSquared', 'Both the perimeter and the area are multiplied by $ {{kSquared}} $'),
      choice('neither', 'Neither changes, because dilation preserves shape'),
    ],
    responseFields: pick('areaSquared'),
    solutionReview: {
      headline: 'A dilation scales every length by k, so it scales area by k twice.',
      reasoning: [
        'The sides become $ {{newW}} $ and $ {{newH}} $, so the perimeter scales by $ {{k}} $.',
        'The area was $ {{area}} $ and becomes $ {{newW}} \\times {{newH}} = {{newArea}} $, which is $ {{kSquared}} $ times as large.',
      ],
      answerSummary: 'Perimeter times {{k}}, area times {{kSquared}}',
    },
    generator: {
      parameters: {
        w: { type: 'int', min: 2, max: 9 },
        h: { type: 'int', min: 2, max: 9 },
        k: { type: 'int', min: 2, max: 5 },
      },
      derived: {
        newW: 'w*k',
        newH: 'h*k',
        area: 'w*h',
        newArea: 'w*k*h*k',
        kSquared: 'k*k',
      },
    },
  }),

  // --- 8.7D distance on the coordinate plane --------------------------------
  //
  // The reasoning: compare a straight-line distance with a path along the grid.
  // Requires choosing the right tool AND recognising the two are different
  // questions — not just applying the distance formula.
  base('8.7D', 'straight-line-vs-grid-path', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'graph',
    prompt: 'From $(0,0)$ to $({{a}}, {{b}})$, one student walks $ {{a}} $ east then $ {{b}} $ north. Another goes straight. How much shorter is the straight route?',
    choices: [
      choice('diff', '$ {{diff}} $ units — the straight route is $ {{c}} $ and the grid route is $ {{gridPath}} $'),
      choice('same', 'They are the same length'),
      choice('half', 'Exactly half as long'),
      choice('cannot', 'It cannot be found without a protractor'),
    ],
    responseFields: pick('diff'),
    solutionReview: {
      headline: 'The grid route is two legs; the straight route is the hypotenuse.',
      reasoning: [
        'The grid route is $ {{a}} + {{b}} = {{gridPath}} $ units.',
        'The straight route is $\\sqrt{ {{a}}^2 + {{b}}^2 } = \\sqrt{ {{sumSquares}} } = {{c}} $ units.',
        'The difference is $ {{gridPath}} - {{c}} = {{diff}} $ units.',
      ],
      answerSummary: '{{diff}} units shorter',
    },
    generator: {
      // Euclid's parametric family: for j > k, (j^2-k^2, 2jk, j^2+k^2) is always
      // a Pythagorean triple. The expression grammar has no ternary, so a
      // hard-coded lookup table is not expressible — and this is better anyway,
      // because the hypotenuse is a whole number BY CONSTRUCTION rather than
      // because someone listed the right triples.
      parameters: {
        j: { type: 'int', min: 2, max: 6 },
        k: { type: 'int', min: 1, max: 5 },
      },
      derived: {
        a: 'j*j-k*k',
        b: '2*j*k',
        c: 'j*j+k*k',
        sumSquares: 'a*a+b*b',
        gridPath: 'a+b',
        diff: 'a+b-c',
      },
      constraints: ['k < j'],
    },
  }),

  // --- 8.5B non-proportional linear situations ------------------------------
  //
  // The reasoning: given a real situation, decide what b represents and why it
  // cannot be zero. Interpretation, not computation.
  base('8.5B', 'interpret-the-constant', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'verbal',
    prompt: 'A tank holds $ {{b}} $ litres and is filling at $ {{m}} $ litres per minute, so $y = {{m}}x + {{b}}$. A student says the $ {{b}} $ should not be there because the tank is being filled. What does the $ {{b}} $ represent, and why does it belong?',
    choices: [
      choice('start', 'The amount already in the tank at $x=0$ — the tank did not start empty'),
      choice('rate', 'A second filling rate that adds to $ {{m}} $'),
      choice('total', 'The capacity of the tank when it is full'),
      choice('error', 'Nothing — the student is right that it should be removed'),
    ],
    responseFields: pick('start'),
    solutionReview: {
      headline: 'In y = mx + b, b is the value when x is zero.',
      reasoning: [
        'At $x = 0$ minutes, $y = {{b}}$ litres — that is what was in the tank before filling started.',
        'After {{t}} minutes there are $ {{m}}({{t}}) + {{b}} = {{after}} $ litres, which is $ {{b}} $ more than filling from empty would give.',
      ],
      answerSummary: 'The amount already in the tank when timing started',
    },
    generator: {
      parameters: {
        m: { type: 'int', min: 3, max: 12 },
        b: { type: 'int', min: 5, max: 40 },
        t: { type: 'int', min: 2, max: 9 },
      },
      derived: { after: 'm*t+b' },
    },
  }),

  // --- 8.2B approximating irrational numbers --------------------------------
  //
  // The reasoning: bound an irrational between consecutive integers by using
  // perfect squares, and justify the bound rather than reading a decimal.
  base('8.2B', 'justify-the-bound', {
    questionType: 'multipleChoice',
    taskType: 'justification',
    representation: 'symbolic',
    prompt: 'Without a calculator, between which two consecutive whole numbers does $\\sqrt{ {{n}} }$ lie, and what settles it?',
    choices: [
      choice('bounds', 'Between $ {{lo}} $ and $ {{hi}} $, because $ {{loSq}} < {{n}} < {{hiSq}} $'),
      choice('halve', 'Between $ {{lo}} $ and $ {{hi}} $, because $\\sqrt{ {{n}} }$ is about half of $ {{n}} $'),
      choice('exact', '$\\sqrt{ {{n}} }$ is exactly $ {{lo}} $'),
      choice('cannot', 'It cannot be determined without a calculator'),
    ],
    responseFields: pick('bounds'),
    solutionReview: {
      headline: 'Trap the number between the perfect squares on either side of it.',
      reasoning: [
        '$ {{lo}}^2 = {{loSq}} $ and $ {{hi}}^2 = {{hiSq}} $.',
        'Since $ {{loSq}} < {{n}} < {{hiSq}} $, taking square roots gives $ {{lo}} < \\sqrt{ {{n}} } < {{hi}} $.',
      ],
      answerSummary: 'Between {{lo}} and {{hi}}',
    },
    generator: {
      parameters: {
        lo: { type: 'int', min: 3, max: 11 },
        offset: { type: 'int', min: 1, max: 4 },
      },
      derived: {
        hi: 'lo+1',
        loSq: 'lo*lo',
        hiSq: '(lo+1)*(lo+1)',
        n: 'lo*lo+offset',
      },
      constraints: ['n < hiSq'],
    },
  }),
];

// --- Write ------------------------------------------------------------------

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const existing = new Set(seed.documents.map((doc) => doc.id));
const fresh = TEMPLATES.filter((template) => !existing.has(template.id));

if (!fresh.length) {
  console.log('All Grade 8 DOK 3 templates are already present. Nothing to add.');
} else {
  seed.documents.push(...fresh);
  writeFileSync(SEED, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Added ${fresh.length} DOK 3 template(s) to ${SEED}:`);
  fresh.forEach((template) => console.log(`  ${template.alignmentKeys[0]}  ${template.id}`));
}
