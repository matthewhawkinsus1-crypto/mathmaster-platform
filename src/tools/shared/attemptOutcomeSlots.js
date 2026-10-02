/*
 * WHERE A REGISTRY TOOL SHOWS THE PLATFORM'S OUTCOME FOR AN ATTEMPT.
 *
 * After a tool's Check, its own verdict ("• Not yet") appears beside the
 * button, but QuestionEngine's authoritative outcome — "Not quite. You have 2
 * attempts remaining on this version." — was rendered below the whole tool:
 * 357–403px below Check on a 1366x768 Chromebook and 180px below it on a
 * 390x844 phone, off screen every time. The student saw "Not yet" and never
 * learned that an attempt had been spent, or how many were left (platform
 * quirks audit PQ-022).
 *
 * A tool's verdict area offers a SLOT — ResultPill does, unless it reports a
 * single stage rather than the attempt. Slots register while they are mounted.
 * A verdict mounts the moment Check is pressed, before the attempt is graded,
 * so when the outcome arrives the most recently mounted slot is the verdict of
 * the Check just pressed, and QuestionEngine hands the outcome to it. A tool
 * with no slot (or one hidden under server grading) keeps QuestionEngine's own
 * box. Either way the outcome is shown — and announced — in exactly one place
 * (PQ-017).
 *
 * React-free so the ownership rule can be tested in node.
 */
export const createAttemptOutcomeSlots = () => {
  let nextToken = 1;
  let mounted = [];
  return Object.freeze({
    /** A verdict area has mounted; returns its token. */
    register() {
      const token = nextToken;
      nextToken += 1;
      mounted = [...mounted, token];
      return token;
    },
    /** That verdict area has unmounted. */
    unregister(token) {
      mounted = mounted.filter((entry) => entry !== token);
    },
    /** The verdict area mounted most recently and still mounted, or null. */
    latest() {
      return mounted.length ? mounted[mounted.length - 1] : null;
    },
  });
};

export default createAttemptOutcomeSlots;
