# Algebra I and Algebra I Honors — Module 3 Topic 2, Lessons 4 and 5

Four Assignment V5 teacher imports built from the district's Lesson 4 and Lesson 5 decks: a regular and an Honors version of each lesson. Each has four sections: Warm-Up, Classwork, Practice and the Exit Ticket (DOL). (The other files in this folder come from other lessons and builders.)

| File | For | Questions (Warm-Up · Classwork · Practice · Exit Ticket) |
|---|---|---|
| `T2_L4_Graphing_Inequalities_in_Two_Variables.json` | Algebra I | 3 · 17 · 12 · 3 |
| `T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json` | Algebra I Honors | 3 · 17 · 16 · 3 |
| `T2_L5_Systems_of_Linear_Inequalities.json` | Algebra I | 3 · 17 · 10 · 3 |
| `T2_L5_Systems_of_Linear_Inequalities_Honors.json` | Algebra I Honors | 3 · 17 · 15 · 3 |

Lesson 4 teaches TEKS A.2H and A.3D (two 45-minute days). Lesson 5 teaches A.3H, with A.2H for writing constraints (three days).

## Before importing: deploy Hosting

The "Break it down" steps written for each question reach students only on a build that includes the import-compiler fix shipped with these files (`authoringIntentV5Core.js` used to drop `directionSteps`). On an older build, students whose plans give chunked directions get the automatic split of the prompt instead. Check with `node scripts/release-firebase.mjs --whats-live`, and if Hosting is older, deploy it first:

```bash
npm run build
npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Or plan the release with `node scripts/release-firebase.mjs`. Never use a raw `firebase deploy --only hosting`.

## Teacher setup

1. Import the regular file for Algebra I classes and the Honors file for Algebra I Honors classes. Pre-Flight shows each one ready, with no errors or warnings.
2. Each Honors file already has its Honors extension and two audited Digital SAT items from MathMaster's CCMR bank in Practice, so Pre-Flight builds the Honors version without replacing anything. Do not assign the regular file to an Honors class.
3. Warm-Up and Exit Ticket questions are generated per student and back Recovery: Warm-Up Recovery opens fresh versions, and DOL Recovery unlocks after 7 of the last 8 Practice questions are correct.
4. Students get 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.

## Students show their thinking in the tools

Every graph is built in the Systems Workspace, one checked step at a time: each boundary line (two points, or slope and y-intercept), solid or dashed, the half-plane to shade, then — where the item asks — the overlap, a marked test point, a point of the student's own, whether the region is bounded, unbounded or empty, and its corners. A standard-form inequality is first rewritten with y alone inside the tool. For a word problem, the student writes the model's coefficients, symbol and constant in the tool before graphing. The tool writes its own worked solution for each of these questions.

The one exception is Emma's workout in Lesson 5. Her calorie boundary, 6.9x + 10.4y = 400, passes through no whole-number point a student could plot, so the tool draws her system and the student works with the overlap, a marked point and a point of their own. The slides say to graph it with technology. The algebraic check follows in the next question.

Graph descriptions that the slides show as pictures (matching graphs, writing an inequality from a graph) are given in words. The static graph display cannot draw dashed lines or shading.

## What is in each lesson

**Lesson 4 — Graphing Inequalities in Two Variables.** The Warm-Up climbs from a one-variable solution on a number line (open or closed circle, the dashed or solid line to come) to graphing the boundary line and testing points. Classwork starts with Kai's points per game, then Activity 4.2's first graph, y > 4x − 6, so that the first graph a student builds has no story. Then Kai's goal is graphed in the tool, followed by half-planes and test points, matching graphs, writing inequalities from graphs, César's phone card, and Talk the Talk. Practice and the Exit Ticket give each student their own inequalities to graph and contexts to model.
Honors adds fractional slopes and standard forms with y-coefficients other than ±1, a parameter (P14), a boundary from two points (P15), reasoning from a description (P16), and CCMR items `mm_sat_A_3D_challenge_1_parameter-boundary-point_v21` (P17) and `mm_sat_A_3D_challenge_3_minimum-integer-y_v21` (P18).

**Lesson 5 — Systems of Linear Inequalities.** The Warm-Up climbs from one inequality graphed, to a point checked against two inequalities, to two constraints written for one situation. Classwork opens with a system that is not on the slides, y > x − 2 and y ≤ −x + 4: two boundaries with y alone and whole-number slopes, the case Practice 1 and Exit Ticket 1 test. Then come Activity 5.2's x + y > 1 and −x + y ≤ 3 with Ava's error, Noah's raft (writing, checking and graphing the constraints, and the intersection point (10, −12)), the parallel and vertical systems, Emma's workout, Activity 5.4's systems A–D with Isabella's error and the blank Graph D, and Talk the Talk. Practice and the Exit Ticket give each student their own systems.
Honors adds standard-form systems to rewrite, a parameter (P11), a bounded region with its corners and area (P12, P13), an Open Sort of systems by their solution sets (P14), Emma's corners found algebraically (P15), and CCMR items `mm_sat_A_3H_challenge_1_parameter-feasible-point_v21` (P16) and `mm_sat_A_3H_challenge_2_integer-points-vertical-slice_v21` (P17).

**Supports.** Every question except the audited CCMR items has authored "Break it down" steps. Every Warm-Up, Classwork and Practice question has hints, a "Let's back up" step, a worked solution and a common error, and the key Classwork questions have Guided Coach notes. The Exit Ticket has none of these. The audited multiple-choice items allow one try, so after it the student sees the reason for the option they chose.

## Slide notes

- Lesson 4: the worked example is titled "Write a linear equality"; it means inequality.
- Lesson 5: the Getting Started "Think about…" box says Chase, but the guide is Noah. On the Activity 5.4 slide the pictures of Systems B and C overlap. These files use B: y > (3/5)x + 3 and y > −(3/5)x + 3, and C: y > (3/5)x + 3 and y < −(3/5)x + 3, which match Possible Solutions B and C.

## Changed after the first import (a class that already has a lesson needs a re-import)

A class gets these changes only when its teacher imports the file again. An assignment created from an earlier import keeps its questions and their order.

- **Lesson 4:** Activity 4.2's y > 4x − 6 (CW 6) now comes right after CW 1. Before, the first graph a student built was Kai's word problem (CW 2), and the first graph with no story came sixth.
- **Lesson 5:** Classwork has 17 questions. The plain system (y > x − 2 and y ≤ −x + 4) is new and comes first, and Noah's four questions now follow Activity 5.2's system. Before, the first system a student built was Noah's, a word problem in standard form, and the plain case first appeared as item 14 of 16. The first hint on Noah's graph now asks for the intercepts instead of listing all four.
- **Lesson 4:** an empty box that asks for the inequality a graph shows (or a description of one) now shows the example y ≥ 3x + 5, one inequality in x and y that is no question's answer. It used to show 0 ≤ x ≤ 4, a compound inequality in one variable.
- Question ids keep their numbers, so they no longer follow the order: Lesson 4's second Classwork question is `m3t2l4-cw-6`, and Lesson 5's first is the new `m3t2l5-cw-17` (`m3t2l5h-cw-17` in Honors).

## Changing a lesson

Edit its module in `scripts/content/algebra1M3Inequalities/`, then run `node scripts/content/build-algebra1-m3-inequalities.mjs` and commit the files it writes. `tests/platform/algebra1Module3InequalityLessons.test.mjs` fails when a committed file differs from the builder's output. It also checks every key in every generated version, that each graph is graded on the inequality the student reads, the worked solutions, the supports, and Honors readiness.
