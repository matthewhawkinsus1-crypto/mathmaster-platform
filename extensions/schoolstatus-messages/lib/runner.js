// The extension's send loop: one queued family message at a time, from the
// Discipline Tracker (window.mathmasterFamilyMessages) out through the
// teacher's own signed-in SchoolStatus tab.
//
// EVERY MESSAGE SENT THROUGH SCHOOLSTATUS REACHES A REAL FAMILY'S PHONE.
// So the loop is built around one rule: Send is pressed in exactly one place
// (`pressSendOnce`), only after MathMaster's `start` succeeded, and at most
// once per guardian per message. A message whose Send may have been pressed
// and whose result was not seen is reported `unknown`; the server never hands
// it out again by itself, and this loop never presses Send for it again.
//
// The owner chose (2026-11-27): one text to each parent or guardian, through
// the Text button on the student's Contacts tab. For each message
// (docs/plans/2026-11-27-schoolstatus-extension-brief.md):
//   1. claim the next message (or stop: none left);
//   2. find the student by district ID, and check the SIS ID and the name
//      SchoolStatus shows; list the parents and guardians it can text; no
//      match, several, a mismatch or no guardian: `failed`, nothing typed;
//   3. open the first guardian's text, and paste the body exactly;
//   4. in test mode, the teacher confirms this exact message and who gets
//      it, in the panel; no confirmation: discard and `release`;
//   5. `start`, once; refused: discard, never press Send;
//   6. each guardian in turn: paste, press Send once, and see the text in
//      SchoolStatus's conversation (SchoolStatus marks one it could not
//      deliver "undelivered");
//   7. `sent` when at least one guardian got it, `failed` when none did,
//      `unknown` when a Send was pressed and its text not seen;
//   8. back to the starting page, next message.
//
// Two adapters, so the loop is the same in Chrome and in a test:
//   mathmaster: status(), claim({ runnerId }), start(ids), report(ids + …), release(ids + …)
//   schoolstatus: where(), findStudent({ sisStudentId, studentName }) ->
//     { ok, reason, guardians: [{ index, relationship }], skipped },
//     openThread(guardian) -> { ok, reason, maxLength }, fill({ body }),
//     discard(), pressSend(), confirmSent() -> { seen, delivered, reason },
//     home()
// An adapter method throws an error with `stopRun: true` for anything that
// ends the run (signed out, a page it does not recognize). The loop never
// guesses.
//
// The log gets message ids, district IDs and outcomes only: never a name,
// a message body or a guardian's contact.

export const RUN_LIMITS = Object.freeze({ messages: 40 });

const reasonOf = (error) => String(error?.message || error || 'Unknown error').slice(0, 280);
const shortId = (id) => String(id || '').slice(0, 8);

/** An error that ends the whole run (signed out, an unknown page, …). */
export const stopRun = (message) => Object.assign(new Error(message), { stopRun: true });

/**
 * Whether the name SchoolStatus shows is the student MathMaster means: first
 * and last name equal, ignoring case, extra spaces, punctuation and middle
 * names. "Last, First Middle" is read as "First Middle Last".
 */
export const sameStudentName = (expected, shown) => {
  const words = (value) => {
    let name = String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const comma = name.split(',');
    if (comma.length === 2) name = `${comma[1]} ${comma[0]}`;
    return name.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').split(/[\s-]+/).map((word) => word.replace(/'/g, '')).filter(Boolean);
  };
  const a = words(expected);
  const b = words(shown);
  if (a.length < 2 || b.length < 2) return false;
  return a[0] === b[0] && a.at(-1) === b.at(-1);
};

/**
 * The one place Send is pressed. `state.started` must be set by a successful
 * `start` for this message; `state.pressed` (one entry per guardian) makes a
 * second press for the same guardian impossible.
 */
const pressSendOnce = async (schoolstatus, state, guardianIndex) => {
  if (!state.started) throw new Error('Refusing to press Send: MathMaster has not started this message.');
  if (state.pressed.has(guardianIndex)) throw new Error('Refusing to press Send twice to one guardian.');
  state.pressed.add(guardianIndex);
  await schoolstatus.pressSend();
};

/**
 * One run. `confirmTest(preview)` resolves true only when the teacher
 * confirmed this exact test message in the panel. `shouldStop()` is the
 * panel's Stop button. Returns { counts, stopped, reason }.
 */
export const runFamilyMessages = async ({
  mathmaster, schoolstatus, runnerId, confirmTest, shouldStop = () => false, log = () => {},
  maxMessages = RUN_LIMITS.messages,
}) => {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(runnerId || ''))) throw new Error('This browser has no runner id.');
  const counts = { sent: 0, failed: 0, unknown: 0, released: 0, notStarted: 0 };
  const finish = (stopped, reason = '') => ({ counts, stopped, reason });

  const status = await mathmaster.status();
  if (status.mode === 'off') return finish(true, 'Sending to families through SchoolStatus is turned off in MathMaster.');
  const runMode = status.mode;
  log(runMode === 'test' ? 'TEST MODE: only test students, and you confirm each message.' : 'LIVE: messages go to families.');

  for (let index = 0; index < maxMessages; index += 1) {
    if (shouldStop()) return finish(true, 'Stopped.');
    try {
      await schoolstatus.where();
    } catch (error) {
      return finish(true, reasonOf(error));
    }

    const claimed = await mathmaster.claim({ runnerId });
    const message = claimed?.message;
    if (!message) {
      log(index ? 'No more queued messages.' : 'No queued messages.');
      return finish(false);
    }
    const ids = { runnerId, messageId: message.messageId, attemptId: message.attemptId };
    const testMode = message.mode === 'test' || claimed.mode === 'test' || runMode === 'test';
    const label = `Message ${shortId(message.messageId)} (district ID ${message.sisStudentId})`;
    const state = { started: false, pressed: new Set() };

    const fail = async (reason) => {
      await mathmaster.report({ ...ids, outcome: 'failed', reason });
      counts.failed += 1;
      log(`${label}: not sent. ${reason}`);
    };
    const giveBack = async (reason) => {
      await mathmaster.release({ ...ids, reason });
      counts.released += 1;
      log(`${label}: given back unsent (${reason}).`);
    };
    const discardQuietly = async () => {
      try { await schoolstatus.discard(); } catch { /* the composer may already be gone */ }
    };
    const body = String(message.body || '');
    // What happened to each guardian's text, once started.
    const results = [];

    try {
      log(`${label}: finding the student in SchoolStatus…`);
      const found = await schoolstatus.findStudent({ sisStudentId: message.sisStudentId, studentName: message.studentName });
      const guardians = found?.ok ? (found.guardians || []) : [];
      if (!found?.ok || !guardians.length) {
        await fail(found?.ok ? 'SchoolStatus lists no parent or guardian who can get a text.' : (found?.reason || 'The student was not found in SchoolStatus.'));
        await schoolstatus.home();
        continue;
      }
      if (found.skipped) log(`${label}: ${found.skipped} other contact(s) are not texted (not a parent or guardian, or no phone for texts).`);

      const first = await schoolstatus.openThread(guardians[0]);
      if (!first?.ok) {
        await discardQuietly();
        await fail(first?.reason || 'SchoolStatus did not open a text to the guardian.');
        await schoolstatus.home();
        continue;
      }
      if (Number.isFinite(first.maxLength) && first.maxLength > 0 && body.length > first.maxLength) {
        await fail(`The message is ${body.length} characters; SchoolStatus allows ${first.maxLength}.`);
        await schoolstatus.home();
        continue;
      }
      await schoolstatus.fill({ body });

      if (testMode) {
        log(`${label}: waiting for you to confirm the test message in this panel…`);
        const confirmed = await confirmTest({
          messageId: message.messageId,
          sisStudentId: message.sisStudentId,
          studentName: message.studentName,
          recipientCount: guardians.length,
          recipients: guardians.map((guardian) => guardian.relationship),
          channel: 'text',
          body,
        });
        if (confirmed !== true) {
          await discardQuietly();
          await giveBack('The teacher did not confirm the test message.');
          await schoolstatus.home();
          if (shouldStop()) return finish(true, 'Stopped.');
          continue;
        }
      }
      if (shouldStop()) {
        await discardQuietly();
        await giveBack('Stopped before sending.');
        return finish(true, 'Stopped.');
      }

      try {
        await mathmaster.start(ids);
      } catch (error) {
        // Refused: the claim lapsed, another tab took it, the teacher cancelled
        // it, or the switch changed. Send is never pressed.
        await discardQuietly();
        counts.notStarted += 1;
        log(`${label}: not sent, MathMaster said: ${reasonOf(error)}`);
        await schoolstatus.home();
        const now = await mathmaster.status();
        if (now.mode !== runMode) return finish(true, `The SchoolStatus switch is now ${now.mode}.`);
        continue;
      }
      state.started = true;

      let unseen = '';
      for (const [index, guardian] of guardians.entries()) {
        if (index > 0) {
          // eslint-disable-next-line no-await-in-loop
          const thread = await schoolstatus.openThread(guardian);
          if (!thread?.ok) {
            results.push({ delivered: false, reason: thread?.reason || 'not opened' });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await schoolstatus.fill({ body });
        }
        // eslint-disable-next-line no-await-in-loop
        await pressSendOnce(schoolstatus, state, index);
        // eslint-disable-next-line no-await-in-loop
        const seen = await schoolstatus.confirmSent();
        if (!seen?.seen) {
          unseen = seen?.reason || 'SchoolStatus did not show the text in the conversation.';
          break;
        }
        results.push({ delivered: seen.delivered !== false, reason: seen.reason || '' });
      }

      const delivered = results.filter((result) => result.delivered).length;
      const note = `Texted ${delivered} of ${guardians.length} parent(s)/guardian(s) through SchoolStatus.`;
      if (unseen) {
        await mathmaster.report({ ...ids, outcome: 'unknown', reason: `${unseen} ${note}`.slice(0, 280) });
        counts.unknown += 1;
        log(`${label}: UNKNOWN. ${note} Check SchoolStatus, then choose "It was sent" or "Send again" on the Discipline Tracker.`);
        // The page is not where the extension expects it.
        await schoolstatus.home();
        return finish(true, 'A text was not seen in SchoolStatus after Send.');
      }
      if (delivered > 0) {
        await mathmaster.report({ ...ids, outcome: 'sent', confirmation: { recipientCount: delivered, channel: 'text', note } });
        counts.sent += 1;
        log(`${label}: sent${testMode ? ' (test)' : ''}. ${note}`);
      } else {
        await mathmaster.report({ ...ids, outcome: 'failed', reason: `SchoolStatus could not deliver the text to any parent or guardian. ${note}`.slice(0, 280) });
        counts.failed += 1;
        log(`${label}: not delivered to any parent or guardian.`);
      }
      await schoolstatus.home();
    } catch (error) {
      const reason = reasonOf(error);
      try {
        if (state.pressed.size) {
          // A Send may have gone out: only the teacher can tell.
          await mathmaster.report({ ...ids, outcome: 'unknown', reason });
          counts.unknown += 1;
          log(`${label}: UNKNOWN after Send (${reason}). Check SchoolStatus, then choose on the Discipline Tracker.`);
        } else if (state.started) {
          // Started but Send never pressed: certainly not sent.
          await discardQuietly();
          await fail(`Not sent: ${reason}`);
        } else {
          await discardQuietly();
          await giveBack(reason);
        }
      } catch (reportError) {
        // The server's lease takes over: a started message becomes unknown,
        // a claimed one returns to the queue.
        log(`${label}: MathMaster could not record what happened (${reasonOf(reportError)}).`);
      }
      // Anything unexpected ends the run: the next message waits for a page
      // the extension recognizes.
      return finish(true, reason);
    }
  }
  return finish(true, `Stopped after ${maxMessages} messages; run again for the rest.`);
};
