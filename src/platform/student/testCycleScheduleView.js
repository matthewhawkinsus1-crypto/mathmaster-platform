/*
 * WHEN IS IT OPEN — AS THE STUDENT'S CARD SAYS IT.
 *
 * The server sends the Test's class-time window and the home window for
 * Corrections and the Retest already in words, with exact school times
 * (getStudentTestCycle `schedule`; functions/shared/testCycleAvailability.mjs).
 * This only chooses WHICH of the two a student still needs to read:
 *
 *   - the Test window while the Test is still ahead of them;
 *   - the home window once Corrections or the Retest are (a student who missed
 *     the Test included) — and while the Test is ahead too, so "what happens
 *     if I am absent?" has an answer on the card;
 *   - neither once the cycle is finished for them: a closing time is not news
 *     to a student who passed.
 *
 * A cycle with no window set shows nothing: nothing is enforced, and a card
 * that announced "no window" to every student would be noise.
 *
 * Pure: no React.
 */

import { TEST_CYCLE_STAGE } from '../assessment/testCycle.js';

const FINISHED = [
  TEST_CYCLE_STAGE.PASSED, TEST_CYCLE_STAGE.COMPLETE, TEST_CYCLE_STAGE.RETEST_CLOSED, TEST_CYCLE_STAGE.RETEST_SUBMITTED,
];
const TEST_AHEAD = [TEST_CYCLE_STAGE.REVIEW, TEST_CYCLE_STAGE.TEST];

const block = (id, title, window) => ({
  id,
  title,
  state: window.state,
  headline: window.headline,
  detail: window.detail,
  home: window.home || null,
});

export const studentScheduleBlocks = (card) => {
  const schedule = card?.schedule;
  if (!schedule || FINISHED.includes(card.stage)) return [];
  const blocks = [];
  const missed = schedule.missedTest === true;
  const testShown = schedule.test && schedule.test.state !== 'unset'
    && !missed && [...TEST_AHEAD, TEST_CYCLE_STAGE.AWAITING_RELEASE].includes(card.stage)
    && card.stage !== TEST_CYCLE_STAGE.AWAITING_RELEASE;
  if (testShown) blocks.push(block('test', 'Test', schedule.test));
  if (schedule.followUp?.enforced) {
    blocks.push(block(
      'followUp',
      missed ? 'Retest' : 'Corrections and Retest',
      schedule.followUp,
    ));
  }
  return blocks;
};

export default studentScheduleBlocks;
