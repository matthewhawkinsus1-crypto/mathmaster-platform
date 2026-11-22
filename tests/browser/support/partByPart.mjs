// ANSWERING A MULTI-PART QUESTION PART BY PART, AS A STUDENT DOES (docs/platform/SHOWING_THE_PROCESS.md, P1).
//
// Where its host asks for it (the student's assignment, a secure Test item), a
// multi-part answer-box question opens one part at a time (MultiAnswerGrader):
// the parts before the open one that have an answer are one line each, with a
// "Change part N, <label>" button, the parts after it are not drawn, and "Next
// part" (on the last part "Review all parts") moves on. A driver that used to
// fill every box on the screen goes through these, so every driver walks the
// parts the same way.
//
//   import { answerParts, partValues, pressNextPart, openPart } from '../support/partByPart.mjs';
//
//   await answerParts(page, ['-2/3', '4'], { root: '.mathmaster-question-stage' });
//   // types each answer into the open part's box, then presses Next part
//   await partValues(page, { root })   // ['-\\frac23', '4'], every part, in order
//   await openPart(page, 0, { root })  // Change part 1
//   await typeIntoPart(page, 1, '4')   // part 2, opened first if it is a line
//
// `root` is a CSS selector for the question (default: the assignment's
// question stage). `type` (optional) fills the open box: (page, box) => …; the
// default clicks the box, selects all, and types the answer.
//
// A question its host draws all at once (a teacher's preview, Path, Live
// Challenge, a student with See every part at once) has no part lines and no
// Next part: answerParts then fills its boxes in order, so a driver can use it
// on both.

export const DEFAULT_ROOT = '.mathmaster-question-stage';
const NEXT_NAME = /^(Next part|Review all parts)$/;
// An answer box, never a box of a part's step (SHOW THE STEP, SP-4: a part
// with a checkpoint draws its tool above its answer box, and the tool has
// boxes of its own).
const NOT_STEP = ':not([data-show-the-step] *)';
const BOX = `math-field${NOT_STEP}, input[type="text"]${NOT_STEP}, textarea${NOT_STEP}`;

/** True when the question on screen walks its parts (a part is drawn as one). */
export const walksParts = (page, { root = DEFAULT_ROOT } = {}) => page.evaluate(
  (selector) => Boolean(document.querySelector(selector)?.querySelector('[data-part-state]')),
  root,
);

/** The open part's index (0-based), or null in the review / when no part is open. */
export const openPartIndex = (page, { root = DEFAULT_ROOT } = {}) => page.evaluate((selector) => {
  const open = document.querySelector(selector)?.querySelector('[data-part-state="open"]');
  return open ? Number(open.getAttribute('data-part-index')) : null;
}, root);

/**
 * Every part's answer, in field order, as the old "every math-field's value"
 * read gave it: a part that is not drawn (after the open one) is ''. On a
 * question drawn all at once, every box's value.
 */
export const partValues = (page, { root = DEFAULT_ROOT } = {}) => page.evaluate(([selector, boxSelector]) => {
  const scope = document.querySelector(selector);
  if (!scope) return [];
  const walk = scope.querySelector('[data-answer-part-count]');
  if (!walk) return [...scope.querySelectorAll('math-field')].map((field) => field.value);
  const values = Array.from({ length: Number(walk.getAttribute('data-answer-part-count')) || 0 }, () => '');
  walk.querySelectorAll('[data-part-state]').forEach((part) => {
    const index = Number(part.getAttribute('data-part-index'));
    const box = part.getAttribute('data-part-state') === 'open' ? part.querySelector(boxSelector) : null;
    values[index] = box ? String(box.value ?? '') : String(part.getAttribute('data-part-value') ?? '');
  });
  return values;
}, [root, BOX]);

/** Press Next part (or, on the last part, Review all parts), and wait for the move. */
export const pressNextPart = async (page, { root = DEFAULT_ROOT, timeout = 10000 } = {}) => {
  const before = await openPartIndex(page, { root });
  const button = page.locator(root).getByRole('button', { name: NEXT_NAME }).first();
  await button.waitFor({ timeout });
  await button.click();
  await page.waitForFunction(([selector, was]) => {
    const open = document.querySelector(selector)?.querySelector('[data-part-state="open"]');
    const now = open ? Number(open.getAttribute('data-part-index')) : null;
    return now !== was;
  }, [root, before], { timeout });
};

/** Change part `index` (0-based): it opens for editing. */
export const openPart = async (page, index, { root = DEFAULT_ROOT, timeout = 10000 } = {}) => {
  const button = page.locator(root).getByRole('button', { name: new RegExp(`^Change part ${index + 1},`) }).first();
  await button.waitFor({ timeout });
  await button.click();
  await page.locator(`${root} [data-part-state="open"][data-part-index="${index}"]`).first().waitFor({ timeout });
};

/** The open part's answer box (or the `index`-th box of a question drawn all at once). */
export const partBox = (page, index, { root = DEFAULT_ROOT } = {}) => page.locator(root)
  .locator(`[data-part-state="open"][data-part-index="${index}"] :is(${BOX}), [data-part-state="open"][data-part-index="${index}"] [role="radiogroup"]`)
  .first();

const typeAnswer = async (page, box, text) => {
  await box.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(String(text), { delay: 20 });
};

/**
 * Type `text` into part `index` (0-based), as a student who goes to that part:
 * the open part is typed into; an answered part is opened first (Change). A
 * part not drawn yet (after the open one) cannot be typed into: the student
 * has not reached it. On a question drawn all at once, the `index`-th box.
 * Ends with Tab, as the drivers always have.
 */
export const typeIntoPart = async (page, index, text, { root = DEFAULT_ROOT, type = null } = {}) => {
  const fill = type || ((box, value) => typeAnswer(page, box, value));
  if (!(await walksParts(page, { root }))) {
    await fill(page.locator(root).locator(BOX).nth(index), text, index);
  } else {
    if ((await openPartIndex(page, { root })) !== index) {
      const drawn = await page.locator(`${root} [data-part-state="answered"][data-part-index="${index}"]`).count();
      if (!drawn) throw new Error(`part ${index + 1} is not on screen: the open part is ${(await openPartIndex(page, { root })) + 1}`);
      await openPart(page, index, { root });
    }
    await fill(partBox(page, index, { root }), text, index);
  }
  await page.keyboard.press('Tab');
};

/**
 * Answer each part in turn, from the open one: type `values[i]` into it and
 * press Next part, the last one included (it goes to Review all parts) unless
 * `review: false`. A value that is null leaves that part as it is and moves on.
 * On a question drawn all at once, fills its boxes in order.
 *
 * `step` (optional): (index) => …, run on each open part before its answer is
 * typed. A part with a checkpoint keeps its answer box shut until its step is
 * done (SP-4), so a driver does the step there.
 */
export const answerParts = async (page, values, { root = DEFAULT_ROOT, type = null, review = true, step = null } = {}) => {
  const fill = type || ((box, text) => typeAnswer(page, box, text));
  if (!(await walksParts(page, { root }))) {
    const boxes = page.locator(root).locator(BOX);
    for (const [index, text] of values.entries()) if (text != null) await fill(boxes.nth(index), text, index);
    return;
  }
  for (const [offset, text] of values.entries()) {
    const index = await openPartIndex(page, { root });
    if (index === null) return;
    if (step) await step(index);
    if (text != null) await fill(partBox(page, index, { root }), text, index);
    if (offset < values.length - 1 || review) await pressNextPart(page, { root });
  }
};
