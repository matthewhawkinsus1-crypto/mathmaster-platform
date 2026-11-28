// What the Discipline Tracker offers the MathMaster extension that sends
// family messages through SchoolStatus: `window.mathmasterFamilyMessages`,
// present only while a teacher has the Discipline Tracker open.
//
// The extension has no MathMaster sign-in of its own. It runs these calls in
// the teacher's MathMaster tab, so each goes through the familyMessageOutbox
// callable as the teacher, and the server hands out only that teacher's own
// messages, under the SchoolStatus switch (off / test / live). The same
// pattern as Grade Transfer's window.mathmasterTeamsSync.
//
// The protocol, one message at a time:
//
//   claim({ runnerId })                          -> { mode, message | null, held }
//   start({ runnerId, messageId, attemptId })    -> about to press Send; a
//                                                   rejection means do NOT press it
//   report({ runnerId, messageId, attemptId, outcome: 'sent' | 'failed' | 'unknown',
//            reason, confirmation: { recipientCount, channel, note } })
//   release({ runnerId, messageId, attemptId, reason })  -> nothing was pressed
//
// Only these fields are passed on. The bridge holds no state.

const loadStore = () => import('./disciplineStore.js');

export const FAMILY_MESSAGE_BRIDGE_VERSION = 1;

export const createFamilyMessageBridge = ({ api = null, onChange = () => {} } = {}) => {
  let calls = api ? Promise.resolve(api) : null;
  const outbox = async (payload) => {
    calls = calls || loadStore();
    const result = await (await calls).familyMessageOutbox(payload);
    // The screen shows each message's state; let it catch up (not for
    // `status`, which an extension may ask often and changes nothing).
    if (payload.action !== 'status') {
      try { onChange(); } catch { /* the screen may be closing */ }
    }
    return result;
  };
  const ids = ({ runnerId, messageId, attemptId } = {}) => ({ runnerId: String(runnerId || ''), messageId: String(messageId || ''), attemptId: String(attemptId || '') });
  return Object.freeze({
    version: FAMILY_MESSAGE_BRIDGE_VERSION,
    status: () => outbox({ action: 'status' }),
    claim: ({ runnerId } = {}) => outbox({ action: 'claim', runnerId: String(runnerId || '') }),
    start: (input = {}) => outbox({ action: 'start', ...ids(input) }),
    report: (input = {}) => outbox({
      action: 'report',
      ...ids(input),
      outcome: String(input.outcome || ''),
      reason: String(input.reason || '').slice(0, 300),
      confirmation: {
        recipientCount: Number(input.confirmation?.recipientCount) || 0,
        channel: String(input.confirmation?.channel || ''),
        note: String(input.confirmation?.note || '').slice(0, 200),
      },
    }),
    release: (input = {}) => outbox({ action: 'release', ...ids(input), reason: String(input.reason || '').slice(0, 200) }),
  });
};

/** Expose the bridge on `target` (the window); returns the undo. */
export const installFamilyMessageBridge = (bridge, target = globalThis) => {
  target.mathmasterFamilyMessages = bridge;
  return () => {
    if (target.mathmasterFamilyMessages === bridge) delete target.mathmasterFamilyMessages;
  };
};
