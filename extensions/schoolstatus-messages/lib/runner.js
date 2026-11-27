// The extension's send loop: one queued family message at a time, from the
// Discipline Tracker (window.mathmasterFamilyMessages) out through the
// teacher's own signed-in SchoolStatus tab.
//
// EVERY MESSAGE SENT THROUGH SCHOOLSTATUS REACHES A REAL FAMILY'S PHONE.
// So the loop is built around one rule: Send is pressed in exactly one place
// (`pressSendOnce`), only right after MathMaster's `start` succeeded, and at
// most once per message. A message whose Send may have been pressed and whose
// result was not seen is reported `unknown`; the server never hands it out
// again by itself, and this loop never presses Send for it again.
//
// For each message (docs/plans/2026-11-27-schoolstatus-extension-brief.md):
//   1. claim the next message (or stop: none left);
//   2. find the student by district ID, and check the name SchoolStatus shows;
//      no match, several, a mismatch or no guardian: `failed`, nothing typed;
//   3. open a new message to the guardians, and paste the body exactly;
//   4. in test mode, the teacher confirms this exact message in the panel;
//      no confirmation: discard and `release`;
//   5. `start`; refused: discard, never press Send;
//   6. press Send once;
//   7. SchoolStatus's own confirmation: `sent`; not seen: `unknown`;
//   8. back to the starting page, next message.
//
// Two adapters, so the loop is the same in Chrome and in a test:
//   mathmaster: status(), claim({ runnerId }), start(ids), report(ids + …), release(ids + …)
//   schoolstatus: where(), findStudent({ sisStudentId, studentName }),
//     openComposer(), fill({ subject, body }), discard(), pressSend(),
//     confirmSent(), home()
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
 * `start` for this message; `state.pressed` makes a second press impossible.
 */
const pressSendOnce = async (schoolstatus, state) => {
  if (!state.started) throw new Error('Refusing to press Send: MathMaster has not started this message.');
  if (state.pressed) throw new Error('Refusing to press Send twice for one message.');
  state.pressed = true;
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
    const state = { started: false, pressed: false };

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

    try {
      log(`${label}: finding the student in SchoolStatus…`);
      const found = await schoolstatus.findStudent({ sisStudentId: message.sisStudentId, studentName: message.studentName });
      if (!found?.ok) {
        await fail(found?.reason || 'The student was not found in SchoolStatus.');
        await schoolstatus.home();
        continue;
      }
      const composer = await schoolstatus.openComposer();
      if (!composer?.ok) {
        await discardQuietly();
        await fail(composer?.reason || 'SchoolStatus did not open a message to the guardians.');
        await schoolstatus.home();
        continue;
      }
      const body = String(message.body || '');
      if (Number.isFinite(composer.maxLength) && composer.maxLength > 0 && body.length > composer.maxLength) {
        await discardQuietly();
        await fail(`The message is ${body.length} characters; SchoolStatus allows ${composer.maxLength}.`);
        await schoolstatus.home();
        continue;
      }
      await schoolstatus.fill({ subject: String(message.subject || ''), body });

      if (testMode) {
        log(`${label}: waiting for you to confirm the test message in this panel…`);
        const confirmed = await confirmTest({
          messageId: message.messageId,
          sisStudentId: message.sisStudentId,
          studentName: message.studentName,
          recipientCount: composer.recipientCount,
          channel: composer.channel || '',
          subject: message.subject || '',
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

      await pressSendOnce(schoolstatus, state);

      const seen = await schoolstatus.confirmSent();
      if (seen?.seen) {
        await mathmaster.report({
          ...ids,
          outcome: 'sent',
          confirmation: { recipientCount: Number(seen.recipientCount) || Number(composer.recipientCount) || 0, channel: seen.channel || composer.channel || '' },
        });
        counts.sent += 1;
        log(`${label}: sent${testMode ? ' (test)' : ''}, ${Number(seen.recipientCount) || Number(composer.recipientCount) || 0} recipient(s).`);
      } else {
        await mathmaster.report({ ...ids, outcome: 'unknown', reason: seen?.reason || 'SchoolStatus did not show the message as sent.' });
        counts.unknown += 1;
        log(`${label}: UNKNOWN. Check SchoolStatus, then choose "It was sent" or "Send again" on the Discipline Tracker.`);
      }
      await schoolstatus.home();
    } catch (error) {
      const reason = reasonOf(error);
      try {
        if (state.pressed) {
          // Send may have gone out: only the teacher can tell.
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
