# Algebra I and Algebra I Honors — Module 3 Topic 1, Lesson 2: Literal Equations

Two Assignment V5 teacher imports built from the district's Lesson 2 slides, each for one 90-minute block: a regular and an Honors version. Both teach TEKS A.12E (solve formulas and other literal equations for a specified variable), with A.2B, A.3A and A.3C for Activity 2.1's forms of a linear equation. (The other files in this folder come from other lessons.)

| File | For | Questions (Warm-Up · Classwork · Practice · DOL) |
|---|---|---|
| `T1_L2_Literal_Equations.json` | Algebra I | 3 · 9 · 26 · 3 |
| `T1_L2_Literal_Equations_Honors.json` | Algebra I Honors | 3 · 9 · 28 · 3 |

Each block is Warm-Up 10 minutes, Classwork 20, Practice 50 and DOL 10. The Classwork is the same nine questions in both files, short enough to go over in 15–20 minutes: Perimeter Perspectives (solve P = 2l + 2w for w), Activity 2.1 (the structure of 3x − 2y = 8, 8x − 2y = 12 in slope-intercept form, y + 7 = 0.5(x − 1) in standard form), Activity 2.2 (solve C = 5/9(F − 32) for F, Jayden and Mateo, Isabella, Ethan and Minh), Activity 2.3 (the trapezoid solved for h) and Talk the Talk (the soup can's height).

## Regular

- **Warm-Up:** a two-step equation with parentheses, the intercepts of Ax + By = C, and a first literal equation, ax + y = c, solved for y.
- **Practice:** easiest first. One-step formulas, two-step formulas, slope-intercept and standard form, fractions and grouped factors (F = 9/5C + 32, the trapezoid for b₁, Z = A/B + C/D), using a formula with numbers (the box, the trapezoid, the soup can), then error analysis.
- **DOL:** solve Ax + By = C for y, solve a cost formula for the number of visits, and find a trapezoid's height.

## Honors

The same lesson at Honors depth:

- **Warm-Up:** a two-step equation with a fraction outside the parentheses (the shape of C = 5/9(F − 32)), the same intercepts question, and ax + by = c solved for y, with a coefficient on y.
- **Practice:** P = 2(l + w), fractional slopes, a line from two points, and Z = A/B + C/D solved for D (the slide's 4b). Also A = xB + xC solved by factoring, a charge with a grouped factor, a trapezoid's other base and a rideshare model. Then the units of h = 3V/B, when x = (y − b)/m fails, and one line in every form.
- **Audited CCMR items:** four from MathMaster's bank in Practice (P25 Digital SAT, P26 ACT, P27–P28 ASVAB). That is Pre-Flight's target of about 15% of Practice, so the Honors version Pre-Flight builds is ready as written and replaces none of the lesson's questions.
- **DOL:** the same three skills at Honors settings: a fractional slope, a charge with a grouped factor, and a trapezoid's other base.

Import the regular file for Algebra I classes and the Honors file for Algebra I Honors classes. Do not assign the regular file to an Honors class.

## Recovery

Every Warm-Up and DOL question in both files is a Question Family slot, so Pre-Flight shows Warm-Up and DOL Recovery **Ready** with nothing to prepare:

- **Warm-Up:** `linear.twoStepEquation` v3 (with parentheses; fraction coefficients in Honors), `functions.identifyIntercepts`, and the lesson's own generator for the first literal equation.
- **DOL:** each question is generated per student by the lesson's own generator, so every student gets their own exit ticket and Recovery has fresh versions.
- **Unlocking DOL Recovery:** it unlocks after 7 of the last 8 Practice questions are right without help. The Practice formulas and rewrites share the DOL's TEKS (A.12E), so they count.

Students get 3 tries on each Warm-Up, Classwork and Practice question, with hints. The DOL is one try with no hints. The audited multiple-choice items allow one try, and after it the student sees the reason for the option they chose.

## How students solve a formula

Every "solve for a letter" question opens the step-by-step workspace: the student does the same thing to both sides until the letter stands alone. Any finished, equivalent answer is right (w = (P − 2l)/2 and w = P/2 − l alike). The formula left as it was is not. Rewrites into slope-intercept form must end as y = mx + b.

In Honors, A = xB + xC uses the workspace's Rewrite → Factor and Rewrite → Cancel factors tools.

Formulas with r² (the cone written with πr², the soup can's surface area) are asked as a choice of the rearranged formula plus the number. The workspace does not solve those for one letter.

## Slide note

The opening slide of Activity 2.2 shows C = −5/9(F − 32). The minus sign is a typo: Isabella's work uses C = 5/9(F − 32), and so do these files.

## Shipped with these files

Two student supports need a Hosting deploy to reach students. The imports themselves do not need them:

- "Practice like this" now checks a student's answer on literal-equation and slope-intercept siblings. Before, those answers were shown in words only. The same change fixes the one-variable siblings in Solving Linear Equations (Lesson 1 and its Honors file), where a right "x = −8" was marked wrong and "−8" was never checked.
- Spanish translations for the hints and worked examples MathMaster writes for literal equations and slope-intercept rewrites.

## Changing the lessons

Edit `scripts/content/build-algebra1-m3-literal-equations.mjs`, run `node scripts/content/build-algebra1-m3-literal-equations.mjs`, and commit the files it writes. `tests/platform/algebra1Module3LiteralEquations.test.mjs` fails when a committed file differs from the builder's output. It also grades every key, in every generated version, through the browser and server graders, and holds the Honors file to the Honors contract.
