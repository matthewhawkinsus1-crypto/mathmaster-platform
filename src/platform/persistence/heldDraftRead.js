/*
 * ONE READ FOR OPENING A LESSON OR A RECOVERY AND FOR ITS FIRST SAVE.
 *
 * Opening an assignment reads the student's server copy of their drafts
 * (App.jsx restores what another Chromebook saved), and the first background
 * save, a few seconds later, read the same document again: a save merges into
 * whatever is stored, in a transaction that reads first
 * (workspaceDraftStore.js). Two reads of one document, nearly always at one
 * version, on every lesson a student opened. A Recovery's saved answers were
 * read the same way twice (useRecoveryAnswerDrafts.js,
 * recoveryAnswerDraftStore.js).
 *
 * A Firestore transaction in the web SDK is optimistic. Its read records the
 * document's version, and its write is sent as "only if the document is still
 * at that version"; nothing is held on the server in between, however long
 * that is. So the opening's read is the read of a transaction whose write
 * waits for the first save:
 *
 *   - the server copy is handed over the moment it is read (`serverCopy`), as
 *     the opening's own read always was;
 *   - the first save (`save`) is merged into that copy and written in the same
 *     transaction. If another device wrote the document in between, Firestore
 *     refuses the write and runs the transaction again: a fresh read, and the
 *     save merged into what is stored then. That read buys something;
 *   - `release` ends it without writing: the assignment closed, or a newer
 *     read replaced it, before anything was saved.
 *
 * The caller hands a save over only once the copy has been read (`landed`):
 * a save never waits for a slow opening read. Before then it releases this
 * one, which still delivers the copy when it comes, and saves on its own.
 *
 * Injected, so it runs in a node test: `transact(update)` runs `update` as a
 * transaction (Firestore's runTransaction, retries included), `read(t)`
 * resolves to the stored document or null, `write(t, stored, patch)` merges
 * and writes it and returns what the save resolves to (a lesson's: the keys
 * the document's caps left out; a Recovery's: the stored answers it sent).
 */
// What `release` hands the waiting transaction. It then throws an error that
// is not Firestore's, so Firestore ends the transaction without running it again.
const RELEASED = Symbol();

export const holdDraftRead = ({ transact, read, write }) => {
  let landed = false;
  let handOver;
  let refuse;
  const serverCopy = new Promise((resolve, reject) => { handOver = resolve; refuse = reject; });
  let deliver;
  const request = new Promise((resolve) => { deliver = resolve; });
  let taken = false;
  let saved;
  const done = Promise.resolve().then(() => transact(async (transaction) => {
    const stored = await read(transaction);
    // Handed over once: a transaction run again after a refused write reads
    // again for the save, not for the screen.
    if (!landed) {
      landed = true;
      handOver(stored);
    }
    const patch = await request;
    if (patch === RELEASED) throw new Error('released');
    // Of the attempt that commits (a refused write runs this again).
    saved = write(transaction, stored, patch);
  }));
  // The read failed (offline, refused): the copy never comes. A failure after
  // it was read is the save's, and goes to whoever saved.
  done.catch((error) => { if (!landed) refuse(error); });
  const take = (patch) => {
    if (taken) return false;
    taken = true;
    deliver(patch);
    return true;
  };
  return {
    serverCopy,
    /** Has the server copy been read (and handed over)? */
    get landed() { return landed; },
    /** The first save, written in the read's own transaction. Once only. */
    save(patch) {
      if (!take(patch)) return Promise.reject(new Error('used'));
      return done.then(() => saved);
    },
    /** Nothing to save with this read: its transaction ends without a write. */
    release() { take(RELEASED); },
  };
};

/**
 * An open assignment's reads and saves, as App.jsx makes them (and a
 * Recovery's, as useRecoveryAnswerDrafts.js does).
 *
 *   read()          reads the server copy, held for the next save (an older
 *                   read no save took is let go), and resolves to the copy;
 *   save(document)  the next save: with the held read if it has landed, in
 *                   its transaction; otherwise on its own, as every save
 *                   after the first is (`write`, which reads first);
 *   release()       the assignment closed: a read no save took is let go.
 *
 * `open()` makes a held read (holdDraftRead); `write(document)` saves alone.
 */
export const createHeldDraftReads = ({ open, write }) => {
  let held = null;
  return {
    read() {
      held?.release();
      const opened = open();
      held = opened;
      // A read that failed holds nothing: the next save reads for itself.
      opened.serverCopy.catch(() => { if (held === opened) held = null; });
      return opened.serverCopy;
    },
    save(document) {
      const opened = held;
      held = null;
      if (opened?.landed) return opened.save(document);
      // Still on its way: the save does not wait for it, and the copy still
      // comes when it is read.
      opened?.release();
      return write(document);
    },
    release() {
      held?.release();
      held = null;
    },
  };
};
