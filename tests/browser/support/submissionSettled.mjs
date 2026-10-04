/*
 * WAIT FOR A STUDENT'S ANSWER TO SETTLE BEFORE THE HARNESS MOVES THE ROUND ON.
 *
 * A browser driver that clicks "Lock In Answer" gets control back as soon as
 * the click lands: the screen locks the answer locally and sends it to the
 * server afterwards. A driver that force-closes the round on its next line is
 * then racing the student's own request. When the close wins, the server
 * refuses the answer, correctly ("That Live Challenge round is no longer
 * active"), the harness's callable bridge answers 400 and Chrome logs a
 * resource error: the shell QA's `reconnect` console check failed that way
 * (PR #415, I-11) while every functional check passed.
 *
 * The fix is ordering, not tolerance. Before the harness does anything that
 * can make an answer stale, it waits for that answer's request to finish, and
 * it fails — with what it saw — when the answer did not go through:
 *
 *   never sent   the screen recorded no submit call after the click
 *   hung         the call was sent and never settled
 *   refused      the server refused it while the round was still open (the
 *                harness has not moved the round yet, so a refusal here is a
 *                real defect, never the race)
 *   unrecorded   the screen says it settled but the server has no record
 *
 * Nothing here ignores a status code or a console message.
 *
 * Playwright-free on purpose: `readClientCalls` returns the page's own record
 * of its callables (window.__mmBridgeCalls in liveChallengeBridgeService.js,
 * each { name, payload, ok?, error? }); `serverCalls` is the bridge's record
 * of handled calls ({ name, identity, data, ok, code }), pushed before the
 * bridge responds. tests/platform/liveChallengeQaSubmissionGate.test.mjs
 * runs this against a simulated transport.
 */

export const SUBMIT_CALLABLE = 'submitLiveChallengeResponse';

export class SubmissionNotSettled extends Error {
  constructor(reason, message, detail = {}) {
    super(message);
    this.name = 'SubmissionNotSettled';
    this.reason = reason;
    Object.assign(this, detail);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Resolves with { client, server } once the first submit call the page made
 * at or after `fromIndex` has settled and the server accepted it. Rejects with
 * a SubmissionNotSettled naming the reason otherwise.
 */
export async function awaitSettledSubmission({
  readClientCalls,
  serverCalls,
  studentId,
  fromIndex = 0,
  timeoutMs = 10_000,
  pollMs = 50,
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  const who = studentId || 'the student';
  const deadline = now() + timeoutMs;
  let sent = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const calls = (await readClientCalls()) || [];
    sent = calls.slice(fromIndex).find((call) => call?.name === SUBMIT_CALLABLE) || null;
    if (sent && (sent.ok || sent.error)) break;
    if (now() >= deadline) {
      if (!sent) throw new SubmissionNotSettled('never-sent', `${who}: the screen never sent its answer (no ${SUBMIT_CALLABLE} after the click, ${timeoutMs} ms)`);
      throw new SubmissionNotSettled('hung', `${who}: the answer was sent but did not settle in ${timeoutMs} ms`, { client: sent });
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(pollMs);
  }
  const submissionId = sent.payload?.submissionId;
  const server = serverCalls.find((call) => call?.name === SUBMIT_CALLABLE
    && (!studentId || call.identity?.studentId === studentId)
    && call.data?.submissionId === submissionId) || null;
  if (sent.error || (server && !server.ok)) {
    const code = server?.code || sent.error;
    throw new SubmissionNotSettled('refused', `${who}: the server refused an answer sent while the round was open (${code})`, { client: sent, server });
  }
  if (!server) {
    throw new SubmissionNotSettled('unrecorded', `${who}: the screen says its answer settled, but the server handled no ${SUBMIT_CALLABLE} with submissionId ${submissionId}`, { client: sent });
  }
  return { client: sent, server };
}
