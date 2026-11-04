# Algebra I — Module 3 Topic 1, Lesson 2: Literal Equations

`T1_L2_Literal_Equations.json` is an Assignment V5 teacher import for Algebra I, built from the district's Lesson 2 slides for one 90-minute block. It teaches TEKS A.12E (solve formulas and other literal equations for a specified variable), with A.2B, A.3A and A.3C for Activity 2.1's forms of a linear equation. (The other files in this folder come from other lessons.)

| Section | Minutes | Questions | What students do |
|---|---|---|---|
| Warm-Up | 10 | 3 | Solve a two-step equation with parentheses; find the intercepts of Ax + By = C; a first literal equation, ax + y = c, solved for y |
| Classwork | 20 | 9 | Perimeter Perspectives (solve P = 2l + 2w for w); Activity 2.1 (the structure of 3x − 2y = 8, 8x − 2y = 12 in slope-intercept form, y + 7 = 0.5(x − 1) in standard form); Activity 2.2 (solve C = 5/9(F − 32) for F, Jayden and Mateo, Isabella, Ethan and Minh); Activity 2.3 (the trapezoid solved for h); Talk the Talk (the soup can's height) |
| Practice | 50 | 26 | Easiest first: one-step formulas, two-step formulas, slope-intercept and standard form, fractions and grouped factors (F = 9/5C + 32, the trapezoid for b₁, Z = A/B + C/D), using a formula with numbers (the box, the trapezoid, the soup can), error analysis |
| DOL | 10 | 3 | Solve Ax + By = C for y; solve a cost formula for the number of visits; find a trapezoid's height |

The Classwork is short enough to go over in 15–20 minutes, and the Practice is the long section.

## Recovery

Every Warm-Up and DOL question is a Question Family slot, so Pre-Flight shows Warm-Up and DOL Recovery **Ready** with nothing to prepare:

- Warm-Up: `linear.twoStepEquation` v3 (with parentheses), `functions.identifyIntercepts`, and the lesson's own generator for ax + y = c.
- DOL: each question is generated per student by the lesson's own generator, so every student gets their own exit ticket and Recovery has fresh versions.
- DOL Recovery unlocks after 7 of the last 8 Practice questions are right without help. The Practice formulas and rewrites share the DOL's TEKS (A.12E), so they count.

Students get 3 tries on each Warm-Up, Classwork and Practice question, with hints. The DOL is one try with no hints.

## How students solve a formula

Every "solve for a letter" question opens the step-by-step workspace: the student does the same thing to both sides until the letter stands alone. Any finished, equivalent answer is right (w = (P − 2l)/2 and w = P/2 − l alike). The formula left as it was is not. Rewrites into slope-intercept form must end as y = mx + b.

Formulas with r² (the cone written with πr², the soup can's surface area) are asked as a choice of the rearranged formula plus the number. The workspace does not solve those for one letter.

## Slide note

The opening slide of Activity 2.2 shows C = −5/9(F − 32). The minus sign is a typo: Isabella's work uses C = 5/9(F − 32), and so does this file.

## Shipped with this file

Two student supports need a Hosting deploy to reach students. The import itself does not need them:

- "Practice like this" now checks a student's answer on literal-equation and slope-intercept siblings. Before, those answers were shown in words only. The same change fixes the one-variable siblings in Solving Linear Equations (Lesson 1 and its Honors file), where a right "x = −8" was marked wrong and "−8" was never checked.
- Spanish translations for the hints and worked examples MathMaster writes for literal equations and slope-intercept rewrites.

## Changing the lesson

Edit `scripts/content/build-algebra1-m3-literal-equations.mjs`, run `node scripts/content/build-algebra1-m3-literal-equations.mjs`, and commit the file it writes. `tests/platform/algebra1Module3LiteralEquations.test.mjs` fails when the committed file differs from the builder's output. It also grades every key, in every generated version, through the browser and server graders.
