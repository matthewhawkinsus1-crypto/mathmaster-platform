// Algebra II — rational functions and inverse variation (A2.6G – A2.6L).
//
// The through-line for this cluster is that a rational function is a division
// statement, and every interesting feature — the asymptote, the excluded value,
// the extraneous solution — comes from the fact that the denominator is not
// allowed to be zero. Items are written so the student has to notice that,
// rather than being handed a rule to apply.

import {
  standard, choice, numeric, expression, equation, interval, parts,
  table, steps, itemList,
} from './kit.mjs';

export const ALGEBRA2_RATIONAL_STANDARDS = [

  // --- A2.6G Transformations of the reciprocal parent function ---------------
  standard('A2.6G', [
    choice({
      code: 'A2.6G', slug: 'describe', band: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
      prompt: 'The reciprocal parent function is $f(x) = \\dfrac{1}{x}$. How does the graph of $g(x) = \\dfrac{1}{x - 4}$ compare to it?',
      options: [
        ['Shifted right 4, so the vertical asymptote is $x = 4$', true],
        ['Shifted left 4, so the vertical asymptote is $x = -4$', false],
        ['Shifted up 4, so the horizontal asymptote is $y = 4$', false],
        ['Stretched vertically by a factor of 4', false],
      ],
      review: {
        headline: 'Changing the input moves the graph horizontally.',
        reasoning: [
          'Subtracting inside the denominator replaces $x$ with $x - 4$, which shifts every point right.',
          'The parent function blows up where its denominator is zero, so the asymptote travels with the shift.',
        ],
        answer: 'Right 4; vertical asymptote $x = 4$.',
      },
      feedback: ['Is the 4 attached to the input or to the output?'],
      hints: ['Ask which input value now makes the denominator zero — that is where the new vertical asymptote lives.'],
      misconceptions: ['Reading $x - 4$ as a shift left because of the minus sign.'],
    }),

    numeric({
      code: 'A2.6G', slug: 'horizontal-asymptote', band: 3, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'For $g(x) = \\dfrac{2}{x + 1} - 5$, what is the $y$ value of the horizontal asymptote?',
      expected: '-5',
      review: {
        headline: 'The constant outside the fraction sets the horizontal asymptote.',
        reasoning: [
          'As $x$ grows large in either direction, the fraction shrinks toward zero.',
          'What is left is the constant that was added or subtracted outside the fraction.',
        ],
        answer: '$y = -5$',
      },
      feedback: ['What happens to the fraction when $x$ becomes very large?'],
      hints: ['Imagine substituting an enormous value of $x$. The fraction becomes almost nothing — what term survives?'],
    }),

    choice({
      code: 'A2.6G', slug: 'from-table', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'A reciprocal function is sampled in the table. The outputs are growing without bound near one input. Which function does the table describe?',
      stimulus: table(['$x$', '$g(x)$'], [['1', '-1'], ['1.9', '-10'], ['1.99', '-100'], ['2.01', '100'], ['3', '1']]),
      options: [
        ['$g(x) = \\dfrac{1}{x - 2}$', true],
        ['$g(x) = \\dfrac{1}{x + 2}$', false],
        ['$g(x) = \\dfrac{1}{x} - 2$', false],
        ['$g(x) = \\dfrac{2}{x}$', false],
      ],
      review: {
        headline: 'Find the input the table is avoiding.',
        reasoning: [
          'The outputs run off toward large negative values from one side and large positive values from the other.',
          'That behaviour surrounds the input that makes the denominator zero.',
        ],
        answer: '$g(x) = \\dfrac{1}{x - 2}$',
      },
      feedback: ['Between which two table rows do the outputs flip sign and explode?'],
      hints: ['The values on either side of the blow-up tell you the input the function cannot accept.'],
    }),

    choice({
      code: 'A2.6G', slug: 'error-analysis', band: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student says that because $h(x) = \\dfrac{-3}{x}$ has a negative in the numerator, its graph sits entirely below the $x$-axis. What is wrong with that reasoning?',
      options: [
        ['The sign of the output also depends on the sign of $x$, so the branches sit in two opposite quadrants', true],
        ['Nothing is wrong; the graph really is entirely below the axis', false],
        ['The negative only flips the horizontal asymptote, not the branches', false],
        ['The graph is entirely above the axis instead', false],
      ],
      review: {
        headline: 'A quotient has two signs to keep track of, not one.',
        reasoning: [
          'A negative divided by a negative is positive, so negative inputs give positive outputs.',
          'The negative numerator reflects the parent graph, moving its branches to the opposite pair of quadrants.',
        ],
        answer: 'The branches occupy two quadrants, not one half-plane.',
      },
      feedback: ['Try a negative input and see what sign the output has.'],
      hints: ['Divide a negative numerator by a negative input and check the sign of the result.'],
      misconceptions: ['Treating a leading negative as "everything is negative".'],
    }),

    parts({
      code: 'A2.6G', slug: 'reverse-design', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A designer needs a reciprocal graph whose vertical asymptote is $x = -3$ and whose horizontal asymptote is $y = 7$, written in the form $g(x) = \\dfrac{1}{x - h} + k$. Give $h$ and $k$.',
      fields: [
        { id: 'h', label: '$h$', profile: 'number', expected: '-3' },
        { id: 'k', label: '$k$', profile: 'number', expected: '7' },
      ],
      review: {
        headline: 'Work backwards from each asymptote to its parameter.',
        reasoning: [
          'The vertical asymptote is the input that makes the denominator zero, which pins down $h$.',
          'The horizontal asymptote is the value the outputs approach, which is the constant added outside.',
        ],
        answer: '$h = -3$, $k = 7$',
      },
      feedback: ['Which parameter controls the horizontal move, and which controls the vertical one?'],
      hints: ['Set the denominator equal to zero and require the solution to be the asymptote you were given.'],
    }),
  ]),

  // --- A2.6H Formulating rational equations from situations ------------------
  standard('A2.6H', [
    equation({
      code: 'A2.6H', slug: 'shared-work', band: 3, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'One printer finishes a job in 12 minutes. A second printer finishes the same job in $x$ minutes. Working together they finish it in 8 minutes. Write an equation that models this situation.',
      expected: '1/12 + 1/x = 1/8',
      accepted: ['1/x + 1/12 = 1/8', '(1/12)+(1/x)=(1/8)'],
      responseHint: 'Use fractions such as 1/12.',
      review: {
        headline: 'Add the rates, not the times.',
        reasoning: [
          'A machine that finishes a whole job in $t$ minutes completes $\\frac{1}{t}$ of it each minute.',
          'Working together, the per-minute portions add to the combined per-minute portion.',
        ],
        answer: '$\\dfrac{1}{12} + \\dfrac{1}{x} = \\dfrac{1}{8}$',
      },
      feedback: ['What fraction of the job does each printer complete in a single minute?'],
      hints: ['Times do not add — a helper cannot make a job take longer. Think about how much of the job each machine does per minute.'],
      misconceptions: ['Writing $12 + x = 8$ by adding the times.'],
    }),

    choice({
      code: 'A2.6H', slug: 'average-speed', band: 4, dok: 3, taskType: 'modeling', representation: 'context',
      prompt: 'A cyclist rides 30 miles upstream on a river trail at $r$ miles per hour and returns the same 30 miles at $r + 5$ miles per hour. The whole trip takes 4 hours. Which equation models the trip?',
      options: [
        ['$\\dfrac{30}{r} + \\dfrac{30}{r + 5} = 4$', true],
        ['$\\dfrac{r}{30} + \\dfrac{r + 5}{30} = 4$', false],
        ['$30r + 30(r + 5) = 4$', false],
        ['$\\dfrac{60}{2r + 5} = 4$', false],
      ],
      review: {
        headline: 'Each leg contributes a time, and the times add.',
        reasoning: [
          'Time for a leg is distance divided by rate, so each leg is a fraction with the rate underneath.',
          'The two legs together account for the whole 4 hours.',
        ],
        answer: '$\\dfrac{30}{r} + \\dfrac{30}{r + 5} = 4$',
      },
      feedback: ['Which quantity is being added to get 4 — distances, rates, or times?'],
      hints: ['Write an expression for how long each leg takes on its own before you combine anything.'],
    }),

    numeric({
      code: 'A2.6H', slug: 'concentration', band: 3, dok: 2, taskType: 'application', representation: 'context',
      prompt: 'A tank holds 20 liters of a solution that is 30% acid. A technician adds $x$ liters of pure acid. The model $\\dfrac{6 + x}{20 + x} = 0.5$ says the mixture is half acid. How many liters of pure acid were added?',
      expected: '8',
      unit: 'liters',
      review: {
        headline: 'The unknown appears in both the acid and the total.',
        reasoning: [
          'Clearing the denominator gives $6 + x = 0.5(20 + x)$.',
          'Solving that gives $0.5x = 4$, so $x = 8$, and the tank ends with 14 liters of acid in 28 liters of solution.',
        ],
        answer: '8 liters',
      },
      feedback: ['Multiplying both sides by the denominator turns this into a linear equation.'],
      hints: ['Pouring in pure acid raises the acid amount and the total volume by the same number of liters. Clear the fraction and solve what is left.'],
    }),

    choice({
      code: 'A2.6H', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'Two crews paint a house. Alone, one takes 6 hours and the other takes 3 hours. A student writes $6 + 3 = t$ and concludes the crews take 9 hours together. Why is the model wrong before any arithmetic happens?',
      options: [
        ['Adding times predicts that help makes the job slower, which cannot be true', true],
        ['The student should have multiplied the two times instead', false],
        ['The student used the wrong units for time', false],
        ['The model is fine, but the arithmetic should give 4.5', false],
      ],
      review: {
        headline: 'Check the model against common sense first.',
        reasoning: [
          'The combined time must be shorter than either crew working alone.',
          'What adds is the fraction of the job done per hour, giving $\\frac{1}{6} + \\frac{1}{3} = \\frac{1}{t}$.',
        ],
        answer: 'Times do not add; per-hour rates do.',
      },
      feedback: ['Should two crews together take longer than one crew alone?'],
      hints: ['Ask what answer the model predicts and whether that answer could possibly describe the situation.'],
    }),

    equation({
      code: 'A2.6H', slug: 'reverse-model', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
      prompt: 'A situation is modeled by an equation of the form $\\dfrac{d}{r - 3} = 5$, where $d$ is a distance and $r$ is a still-water speed. A boat travels 45 miles against a 3 mile-per-hour current in 5 hours. Write the equation with the numbers filled in.',
      expected: '45/(r-3) = 5',
      accepted: ['45/(r - 3)=5', '(45)/(r-3)=5'],
      review: {
        headline: 'The current subtracts from the boat speed.',
        reasoning: [
          'Going against the current, the effective speed is the still-water speed reduced by 3.',
          'Distance divided by that effective speed equals the 5 hours the trip took.',
        ],
        answer: '$\\dfrac{45}{r - 3} = 5$',
      },
      feedback: ['Which number is the distance and which describes the current?'],
      hints: ['Decide first whether travelling against a current makes the effective speed larger or smaller.'],
    }),
  ]),

  // --- A2.6I Solving rational equations --------------------------------------
  standard('A2.6I', [
    numeric({
      code: 'A2.6I', slug: 'clear-denominators', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\dfrac{3}{x} + \\dfrac{1}{2} = \\dfrac{5}{x}$.',
      expected: '4',
      review: {
        headline: 'Clear the denominators, then solve what is left.',
        reasoning: [
          'Multiplying every term by $2x$ gives $6 + x = 10$.',
          'That leaves $x = 4$, which does not make any denominator zero.',
        ],
        answer: '$x = 4$',
      },
      feedback: ['What single expression is a common denominator for all three terms?'],
      hints: ['Multiply every term — including the one without a variable underneath — by the common denominator.'],
    }),

    choice({
      code: 'A2.6I', slug: 'method-order', band: 3, dok: 2, taskType: 'conceptual', representation: 'verbal',
      prompt: 'Before solving a rational equation, why is it worth writing down the values that make any denominator zero?',
      options: [
        ['Because a value that clears the algebra but breaks a denominator must be rejected', true],
        ['Because those values are always among the solutions', false],
        ['Because it tells you the degree of the equation in advance', false],
        ['Because it lets you skip clearing the denominators', false],
      ],
      review: {
        headline: 'Multiplying by a variable expression can invent solutions.',
        reasoning: [
          'Multiplying both sides by something that could be zero is not a reversible step.',
          'Listing the forbidden inputs first gives you a checklist to test your answers against at the end.',
        ],
        answer: 'They are candidates that must be rejected if they appear.',
      },
      feedback: ['What could go wrong when you multiply both sides by an expression containing the variable?'],
      hints: ['Think about whether multiplying both sides by zero preserves the truth of an equation.'],
    }),

    numeric({
      code: 'A2.6I', slug: 'quadratic-result', band: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Solve $\\dfrac{x}{x - 2} = \\dfrac{12}{x^2 - 4} + 1$. Give the single valid solution.',
      expected: '4',
      review: {
        headline: 'Factor the difference of squares before choosing a common denominator.',
        reasoning: [
          'Since $x^2 - 4 = (x - 2)(x + 2)$, the common denominator is $(x - 2)(x + 2)$.',
          'Clearing gives $x(x + 2) = 12 + (x - 2)(x + 2)$, so $x^2 + 2x = x^2 + 8$ and $2x = 8$.',
          'The result is allowed, because it makes neither $x - 2$ nor $x + 2$ zero.',
        ],
        answer: '$x = 4$',
      },
      feedback: ['Can the largest denominator be factored into the smaller ones?'],
      hints: ['Factor every denominator first; the common denominator is usually already sitting in front of you.'],
    }),

    choice({
      code: 'A2.6I', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
      prompt: 'A student solves $\\dfrac{1}{x - 3} = \\dfrac{x}{x - 3}$ and reports two solutions, $x = 1$ and $x = 3$. Which statement identifies the mistake?',
      stimulus: steps([
        'Multiply both sides by $x - 3$: $1 = x$',
        'So $x = 1$',
        'Also $x - 3 = 0$ works, so $x = 3$',
      ]),
      options: [
        ['Line 3 is invalid — $x = 3$ makes the original denominators undefined', true],
        ['Line 1 is invalid — you cannot multiply both sides by a variable expression', false],
        ['Line 2 is invalid — the solution should be $x = -1$', false],
        ['There is no mistake; both values are solutions', false],
      ],
      review: {
        headline: 'A value that breaks the original equation is not a solution to it.',
        reasoning: [
          'Setting a denominator to zero does not solve the equation; it destroys it.',
          'Only the value that survives substitution into the original equation counts.',
        ],
        answer: 'Only $x = 1$ is a solution.',
      },
      feedback: ['Substitute each reported value back into the original equation and see which one survives.'],
      hints: ['One of the reported values makes a denominator zero. Ask whether the original equation says anything at all there.'],
      misconceptions: ['Treating denominator zeros as extra solutions.'],
    }),

    numeric({
      code: 'A2.6I', slug: 'context-solve', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'A hose fills a pond in 10 hours. With a second hose running as well, the pond fills in 6 hours. How many hours would the second hose need on its own?',
      expected: '15',
      unit: 'hours',
      review: {
        headline: 'Set the per-hour portions equal.',
        reasoning: [
          'The model is $\\frac{1}{10} + \\frac{1}{x} = \\frac{1}{6}$.',
          'Clearing denominators gives $3x + 30 = 5x$, so $x = 15$ — slower than the first hose, which matches the small speed-up.',
        ],
        answer: '15 hours',
      },
      feedback: ['Should the second hose alone be faster or slower than 10 hours? Use that to check your answer.'],
      hints: ['Write what fraction of the pond each hose fills in one hour, then set the sum equal to the combined per-hour fraction.'],
    }),
  ]),

  // --- A2.6J Reasonableness of a solution to a rational equation -------------
  standard('A2.6J', [
    choice({
      code: 'A2.6J', slug: 'extraneous', band: 3, dok: 3, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'Solving $\\dfrac{x^2}{x - 5} = \\dfrac{25}{x - 5}$ algebraically produces $x = 5$ and $x = -5$. Which values are genuine solutions?',
      options: [
        ['Only $x = -5$', true],
        ['Only $x = 5$', false],
        ['Both values', false],
        ['Neither value', false],
      ],
      review: {
        headline: 'Test every candidate in the original equation.',
        reasoning: [
          'One candidate makes the shared denominator zero, so the original equation is undefined there.',
          'The other substitutes cleanly and makes both sides equal.',
        ],
        answer: 'Only $x = -5$.',
      },
      feedback: ['Which candidate makes $x - 5$ equal to zero?'],
      hints: ['Substitute each candidate into the denominator before you substitute it into the whole equation.'],
    }),

    choice({
      code: 'A2.6J', slug: 'context-reject', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'context',
      prompt: 'A rational model for how long a crew takes to finish a job produces the solutions $t = 9$ and $t = -4$. Why does the negative solution get rejected even though the algebra is correct?',
      options: [
        ['A duration cannot be negative, so that solution has no meaning in the situation', true],
        ['Negative numbers are never solutions to rational equations', false],
        ['It makes a denominator zero', false],
        ['It should be rejected only if it is also extraneous algebraically', false],
      ],
      review: {
        headline: 'Algebra proposes; the situation decides.',
        reasoning: [
          'A rational equation can have solutions that are mathematically valid but describe impossible situations.',
          'Checking against the context is a separate step from checking against the denominators.',
        ],
        answer: 'Only $t = 9$ describes a real crew.',
      },
      feedback: ['What is the quantity $t$ actually measuring here?'],
      hints: ['Ask what the variable stands for, then ask whether that quantity is allowed to be negative.'],
    }),

    choice({
      code: 'A2.6J', slug: 'estimate-check', band: 3, dok: 3, taskType: 'comparison', representation: 'table',
      prompt: 'A student solving $\\dfrac{60}{x} = 4$ reports $x = 240$. The table shows a few outputs of $\\dfrac{60}{x}$. What does the table tell you about the reported answer?',
      stimulus: table(['$x$', '$60/x$'], [['10', '6'], ['15', '4'], ['30', '2'], ['60', '1'], ['240', '0.25']]),
      options: [
        ['It is far too large — a bigger input makes the output much smaller than 4', true],
        ['It is correct; the table agrees', false],
        ['It is slightly too small', false],
        ['The table says nothing about the reported answer', false],
      ],
      review: {
        headline: 'A table is a cheap reasonableness check.',
        reasoning: [
          'The outputs fall as the inputs rise, so the input that produces 4 must be a modest one.',
          'The reported value produces an output nowhere near 4, which flags a multiplication done in the wrong direction.',
        ],
        answer: 'The reported value is far too large.',
      },
      feedback: ['Scan the table for the row whose output is 4.'],
      hints: ['Compare the output the reported input actually produces with the output the problem asked for.'],
    }),

    numeric({
      code: 'A2.6J', slug: 'domain-count', band: 4, dok: 2, taskType: 'interpretation', representation: 'symbolic',
      prompt: 'How many values must be excluded from the domain of $\\dfrac{x + 1}{x^2 - 9}$?',
      expected: '2',
      review: {
        headline: 'Count the zeros of the denominator.',
        reasoning: [
          'The denominator factors into $(x - 3)(x + 3)$.',
          'Each factor contributes one forbidden input, and the numerator does not cancel either of them.',
        ],
        answer: '2 values',
      },
      feedback: ['Factor the bottom and count how many inputs make it zero.'],
      hints: ['Set the denominator equal to zero and count the distinct solutions.'],
    }),

    choice({
      code: 'A2.6J', slug: 'reverse-reason', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
      prompt: 'You want to write a rational equation whose only algebraic candidate is extraneous, so it has no solution at all. What must be true of that candidate?',
      options: [
        ['It must be exactly the value that makes a denominator in the original equation zero', true],
        ['It must be negative', false],
        ['It must be irrational', false],
        ['It must be larger than every coefficient in the equation', false],
      ],
      review: {
        headline: 'Extraneous means "created by the clearing step".',
        reasoning: [
          'Clearing denominators multiplies by an expression that is zero at certain inputs.',
          'If the only candidate the cleared equation produces is one of those inputs, nothing survives the check.',
        ],
        answer: 'The candidate must be a zero of a denominator.',
      },
      feedback: ['Where do extraneous solutions come from in the first place?'],
      hints: ['Think about which step in the solving process is not reversible, and what inputs make it fail.'],
    }),
  ]),

  // --- A2.6K Asymptotic restrictions, domain and range -----------------------
  standard('A2.6K', [
    interval({
      code: 'A2.6K', slug: 'domain-interval', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'Write the domain of $f(x) = \\dfrac{x}{x - 6}$ in interval notation.',
      expected: '(-inf, 6) U (6, inf)',
      accepted: ['(-infinity, 6) U (6, infinity)', '(-∞,6)∪(6,∞)', '(-inf,6)U(6,inf)'],
      responseHint: 'Use U to join intervals and inf for infinity.',
      review: {
        headline: 'Remove the forbidden input and keep everything else.',
        reasoning: [
          'The denominator is zero at one input, and the function says nothing there.',
          'Every other real number is allowed, which is two open intervals joined together.',
        ],
        answer: '$(-\\infty, 6) \\cup (6, \\infty)$',
      },
      feedback: ['Which single input has to be cut out of the number line?'],
      hints: ['Find the input that makes the denominator zero, then describe the number line with that point punched out.'],
    }),

    choice({
      code: 'A2.6K', slug: 'three-notations', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'multipleRepresentation',
      prompt: 'The domain of a rational function is every real number except $-2$. Which line writes that domain correctly in all three notations?',
      options: [
        ['$x \\ne -2$; $(-\\infty, -2) \\cup (-2, \\infty)$; $\\{x \\mid x \\ne -2\\}$', true],
        ['$x > -2$; $(-2, \\infty)$; $\\{x \\mid x > -2\\}$', false],
        ['$x \\ne -2$; $(-\\infty, -2] \\cup [-2, \\infty)$; $\\{x \\mid x \\le -2\\}$', false],
        ['$x \\ne 2$; $(-\\infty, 2) \\cup (2, \\infty)$; $\\{x \\mid x \\ne 2\\}$', false],
      ],
      review: {
        headline: 'The same set, said three ways.',
        reasoning: [
          'Excluding a point leaves two pieces, so the interval form uses a union with open ends.',
          'Square brackets would put the excluded point back in, which contradicts the description.',
        ],
        answer: '$x \\ne -2$; $(-\\infty, -2) \\cup (-2, \\infty)$; $\\{x \\mid x \\ne -2\\}$',
      },
      feedback: ['Do square brackets include or exclude an endpoint?'],
      hints: ['Check each option against the plain-language description one notation at a time.'],
    }),

    choice({
      code: 'A2.6K', slug: 'range', band: 4, dok: 3, taskType: 'interpretation', representation: 'graph',
      prompt: 'A reciprocal-type function has a vertical asymptote at $x = 1$ and a horizontal asymptote at $y = 3$, and its two branches approach both asymptotes without ever touching them. What is its range?',
      options: [
        ['$(-\\infty, 3) \\cup (3, \\infty)$', true],
        ['$(-\\infty, 1) \\cup (1, \\infty)$', false],
        ['$(3, \\infty)$', false],
        ['All real numbers', false],
      ],
      review: {
        headline: 'The horizontal asymptote is the output the graph never reaches.',
        reasoning: [
          'The vertical asymptote restricts inputs, so it belongs to the domain discussion.',
          'The horizontal asymptote is the one output value that no input ever produces.',
        ],
        answer: '$(-\\infty, 3) \\cup (3, \\infty)$',
      },
      feedback: ['Which asymptote describes outputs, and which describes inputs?'],
      hints: ['Range is about $y$ values. Ask which of the two asymptotes is a statement about $y$.'],
      misconceptions: ['Reporting the vertical asymptote as the excluded range value.'],
    }),

    choice({
      code: 'A2.6K', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student claims that $g(x) = \\dfrac{(x - 4)(x + 1)}{x - 4}$ has the same domain as $g(x) = x + 1$ because the factors cancel. Why is that claim wrong?',
      options: [
        ['The original expression is still undefined at $x = 4$, so that input stays excluded', true],
        ['Cancelling is never allowed in a rational expression', false],
        ['The simplified form is wrong; it should be $x - 1$', false],
        ['The claim is right — cancelling removes the restriction', false],
      ],
      review: {
        headline: 'Simplifying changes the expression, not the original function.',
        reasoning: [
          'Cancelling is only valid where the cancelled factor is not zero.',
          'The graph looks like a line with a single point removed, which is called a hole rather than an asymptote.',
        ],
        answer: 'The input $x = 4$ is still excluded.',
      },
      feedback: ['What happens to the original expression when you substitute the value that made the cancelled factor zero?'],
      hints: ['Try substituting the value that makes the cancelled factor zero into the expression as it was originally written.'],
    }),

    interval({
      code: 'A2.6K', slug: 'context-domain', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'The cost per shirt for a run of $n$ shirts is $C(n) = \\dfrac{500}{n} + 4$, where $n$ is a whole number of shirts and the shop will not print more than 400 in one run. Written as an interval of allowed values of $n$, what is the practical domain?',
      expected: '(0, 400]',
      accepted: ['(0,400]', '(0, 400 ]'],
      responseHint: 'Use ( or [ to show whether each endpoint is included.',
      review: {
        headline: 'The situation is stricter than the algebra.',
        reasoning: [
          'Zero shirts is impossible both algebraically and practically, so the lower end stays open.',
          'The shop can print exactly 400, so the upper end is included.',
        ],
        answer: '$(0, 400]$',
      },
      feedback: ['Can the shop print exactly 400 shirts? Can it print exactly 0?'],
      hints: ['Decide separately for each end whether the boundary value itself is allowed, then choose the bracket that says so.'],
    }),
  ]),

  // --- A2.6L Inverse variation -----------------------------------------------
  standard('A2.6L', [
    numeric({
      code: 'A2.6L', slug: 'find-constant', band: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
      prompt: 'The quantity $y$ varies inversely with $x$, and $y = 9$ when $x = 4$. What is the constant of variation?',
      expected: '36',
      review: {
        headline: 'In an inverse variation the product is constant.',
        reasoning: [
          'Inverse variation means $y = \\frac{k}{x}$, so $k = xy$.',
          'Multiplying the given pair produces the constant, which then works for every other pair.',
        ],
        answer: '$k = 36$',
      },
      feedback: ['What operation on the pair leaves you with $k$ alone?'],
      hints: ['Rearrange $y = \\frac{k}{x}$ to isolate $k$, then substitute the pair you were given.'],
    }),

    choice({
      code: 'A2.6L', slug: 'identify-from-table', band: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
      prompt: 'Which statement correctly describes the relationship in the table?',
      stimulus: table(['$x$', '$y$'], [['2', '30'], ['3', '20'], ['5', '12'], ['6', '10'], ['10', '6']]),
      options: [
        ['Inverse variation, because the product of each pair is the same', true],
        ['Direct variation, because the ratio of each pair is the same', false],
        ['Linear but not a variation, because the differences are constant', false],
        ['Neither, because the outputs are not in a fixed pattern', false],
      ],
      review: {
        headline: 'Test the product and the ratio.',
        reasoning: [
          'In direct variation $y \\div x$ stays fixed; in inverse variation $x \\times y$ stays fixed.',
          'Here the outputs fall as the inputs rise, and one of those two tests comes out constant.',
        ],
        answer: 'Inverse variation.',
      },
      feedback: ['Multiply each row and see whether you keep getting the same number.'],
      hints: ['Run both tests on two or three rows: divide the pair, then multiply the pair, and see which one is stable.'],
    }),

    numeric({
      code: 'A2.6L', slug: 'context-predict', band: 4, dok: 3, taskType: 'application', representation: 'context',
      prompt: 'The time it takes a crew to clear a field varies inversely with the number of workers. With 6 workers the job takes 14 hours. How many hours would it take with 21 workers?',
      expected: '4',
      unit: 'hours',
      review: {
        headline: 'Find the constant from the known pair, then use it.',
        reasoning: [
          'The product of workers and hours is fixed at $6 \\times 14 = 84$ worker-hours.',
          'Dividing that total by 21 workers gives the new time, which is shorter — as more workers should make it.',
        ],
        answer: '4 hours',
      },
      feedback: ['Should more workers make the time longer or shorter? Check your answer against that.'],
      hints: ['Multiply the known pair to find the total amount of work, then divide by the new number of workers.'],
    }),

    choice({
      code: 'A2.6L', slug: 'error-analysis', band: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
      prompt: 'A student is told that pressure varies inversely with volume, and that tripling the volume should therefore triple the pressure. What is wrong with that reasoning?',
      options: [
        ['Inverse variation means tripling one quantity divides the other by three', true],
        ['Inverse variation means tripling one quantity leaves the other unchanged', false],
        ['Inverse variation means tripling one quantity squares the other', false],
        ['Nothing is wrong; both quantities triple together', false],
      ],
      review: {
        headline: 'Inverse variation moves the two quantities in opposite directions.',
        reasoning: [
          'Because the product stays fixed, growing one factor must shrink the other.',
          'The student has described direct variation, where the two quantities scale together.',
        ],
        answer: 'The pressure is divided by three.',
      },
      feedback: ['If the product must stay the same and one factor grows, what has to happen to the other?'],
      hints: ['Write down the product before and after the change and insist that the two products match.'],
      misconceptions: ['Confusing inverse variation with direct variation.'],
    }),

    equation({
      code: 'A2.6L', slug: 'reverse-write', band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
      prompt: 'A speaker\'s loudness $L$ varies inversely with the square of the distance $d$ from it. At a distance of 2 meters the loudness is 45 units. Write the equation for $L$ in terms of $d$.',
      expected: 'L = 180/d^2',
      accepted: ['L=180/d^2', 'L = 180/(d^2)', 'L=180/(d*d)'],
      responseHint: 'Write it in the form L = .../d^2.',
      review: {
        headline: 'Square the distance before you solve for the constant.',
        reasoning: [
          'The model is $L = \\frac{k}{d^2}$, so substituting the given pair gives $45 = \\frac{k}{4}$.',
          'That determines the constant, and putting it back gives the equation for every distance.',
        ],
        answer: '$L = \\dfrac{180}{d^2}$',
      },
      feedback: ['Does the 2 go under the fraction bar as it is, or squared first?'],
      hints: ['Write the general form with an unknown constant, substitute the given pair, and solve for that constant.'],
    }),
  ]),
];

export default ALGEBRA2_RATIONAL_STANDARDS;
