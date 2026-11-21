# Algebra II Honors — Thanksgiving Break Packet

`Algebra2_Honors_Thanksgiving_Packet.json` is an Assignment V5 teacher import: a cumulative review of everything taught from the start of the year to Thanksgiving, for students to work alone over the break. It starts each unit at its building block, so a student who missed a topic can learn it here.

## What is in it

One assignment. Eleven Classwork sections, one per unit in the order taught, then a short SAT section.

| Section | Items | Standards | Worked in |
|---|---|---|---|
| Unit 1 — Interval notation, domain and range | 6 | A2.7I | Number line and interval notation; mapping and plot of a relation; graph analysis |
| Unit 2 — Parent functions and transformations | 6 | A2.2A | Graph analysis; Transformations Lab (read a, h, k; describe; map a point; match a graph) |
| Unit 3 — Inverses, operations on functions and composition | 7 | A2.2B, A2.2D | Inverse workspace (swap and solve); polynomial workshop; function machines; one answer box |
| Unit 4 — Absolute value: graphs, equations and inequalities | 8 | A2.6C, A2.6D, A2.6E, A2.6F | Transformations Lab; Step Algebra; the solving workspace with a number line and interval notation; one answer box |
| Unit 5 — 3×3 systems and matrices | 7 | A2.3A, A2.3B | Systems Workspace (elimination by hand); Matrix Lab (multiply, write A · X = B, solve) |
| Unit 6 — Operations on polynomials | 5 | A2.7B | Polynomial workshop (add, subtract, area model) |
| Unit 7 — Dividing polynomials; the Remainder and Factor Theorems | 8 | A2.7C, A2.7D | Long division; synthetic division; P(r) and "is it a factor?" |
| Unit 8 — Factoring | 7 | A2.7E | Factor-pair tool; a sort by method; answer boxes for GCF, the ac method and cubes |
| Unit 9 — nth roots and operations with radical expressions | 7 | A2.7G | A sort; answer boxes, one small step per part |
| Unit 10 — Rational exponents | 5 | A2.7G | A sort; answer boxes, one small step per part |
| Unit 11 — Solving radical equations | 6 | A2.4G, A2.6B, A2.7H | Radical equation solver; Step Algebra; one answer box |
| College-readiness check — SAT questions | 6 | A2.2A, A2.6E, A2.6F, A2.7B, A2.7C, A2.6B | Audited Digital SAT items (Practice) |

- **72 unit questions**, 56 of them in a tool. Units 9 and 10 have no dedicated tool, so they use answer boxes that ask for one small step of the method in each part (students answer one part at a time), and sorts.
- **Easy to grade level in every unit.** The first question is the building block (a perfect root before a non-perfect one, a GCF before a trinomial), and the last is at grade level.
- **Every question** has a short prompt, three hints, a "Let's back up" step, a worked solution and the usual mistake. Unlimited tries on the unit questions (the answer stays hidden until it is right); import the file only after the platform release that adds unlimited attempts is live.
- **Worked examples.** The first question on each skill names an authored example (`lessonSupports.examples`, 66 in all): a sibling problem with different numbers, in 3 to 6 small steps, each with its reason. The example player shows every one: none states an answer of a question that plays it. The same question carries two guided notes, the idea and that example on one line. The two parent-function questions of Unit 2 (x² and √x) have no authored example, because any honest sibling states the same domain, range and vertex; the platform's own similar problem is their example. Two later questions name an example a second time, so that the one offered on request is the one for their method: Unit 3 question 3 (deriving an inverse) and Unit 5 question 3 (a 3×3 system).
- **None of the items is copied** from a lesson the class has done: the method is the lesson's, the numbers and contexts are new.

## Standard and Honors versions

One import serves both. Honors comes from the class, not the file.

- For an Honors class, Review reports the Honors version ready, with nothing replaced. The six audited Digital SAT items in the last section are the CCMR Practice an Honors class is owed, and the Honors depth checks pass (DOK 3 work, explanation, modeling).
- The SAT items are Practice, not Classwork, because the platform counts audited items only in Practice. Each student gets their own numbers there. Every SAT item has at least 36 versions, so a class of up to 36 shares none.
- The eleven unit sections are the same for every student, so a student can ask about "Unit 4, question 3".

## Teacher setup

1. **Import JSON** and choose the classes. Pre-Flight shows the assignment ready, with no errors or warnings.
2. Assign it before the break with a due date after it. Students can work the units in any order; each one stands alone.
3. Units are Classwork on purpose: a worked example opens by itself only on Classwork. Do not change a unit to DOL, quiz or test, where examples are never shown.

## Verification

- `npm run validate:authoring-v5 -- teacher-import-jsons/thanksgiving-packet/Algebra2_Honors_Thanksgiving_Packet.json` prints PASS with no warnings.
- `tests/platform/thanksgivingPacketAlgebra2Honors.test.mjs` holds, on every run:
  - the committed file is what the builder writes;
  - the structure, counts and standards above;
  - every Classwork question is covered by a worked example, and no example gives away the answer of a question that plays it;
  - every one of the 72 answers, worked out in the test from what the student is shown, is accepted by the platform's own grader, and a wrong answer is refused;
  - the SAT items are the bank's own;
  - the Honors version is READY and replaces nothing.
- Not checked here: the screens themselves. No browser journey was run for this file.

## Regenerating

Edit the builder, not the JSON:

```bash
node scripts/content/build-algebra2-honors-thanksgiving-packet.mjs
```

The questions are in `scripts/content/algebra2HonorsThanksgivingPacket/` (`units1to4.mjs`, `units5to8.mjs`, `units9to11.mjs`); `packetKit.mjs` refuses a question that lacks a hint, a back-up step or a worked solution.

## Known limits

- Follow-through grading and checkpoints are written into the answer boxes (`followThrough`, `checkpoint`) but nothing reads them yet. Until they ship, each part is graded against its own key.
- Every example has a step card (`steps`), which is what the player plays. The Step Algebra example for radical equations also carries a tool replay (`moves`), which does not play yet. The absolute value examples carry step cards only: the documented replay vocabulary has no move for splitting an absolute value equation.

## Checked on a screen

Every question was opened in a real browser at desktop and phone width on 2026-11-21, and one question of each tool was answered right and wrong through the screen. The record, with what was fixed and what was not, is `docs/reviews/2026-11-21-thanksgiving-packet-tool-check.md`. Two things changed here as a result: the three number lines of Unit 1 now open on a plain −10 to 10 line (the tool's own window is centred on the answer), and the two questions above name their example. `tests/browser/thanksgivingPacketCheck.mjs` repeats the screen check.
