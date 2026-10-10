/*
 * ONE DRAFT SAVE AT A TIME, IN THE ORDER THE STUDENT TYPED.
 *
 * `createSerialSaver(send)` returns `save()`. Each call waits for the save
 * before it to settle, then calls `send()` — which reads whatever is pending
 * at that moment — so two saves of one answer never race to the server, and a
 * move or Submit that awaits `save()` has the last edit saved first. A save
 * that fails does not hold up the next one.
 *
 * The server holds the same line for a request that arrives late anyway (a
 * retry, a slow network): each request carries this page's `draftWriter` and
 * a `draftRevision` that rises with every edit, and an older revision from
 * the same page is not written (functions/lib/secureExamItems.js
 * staleDraftWrite).
 */
export const createSerialSaver = (send) => {
  let tail = Promise.resolve();
  return () => {
    const run = tail.then(() => send(), () => send());
    tail = run.catch(() => {});
    return run;
  };
};

/** This page's id on its draft saves: new on every load, so a reload is a new writer. */
export const newDraftWriterId = () => {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `page_${random}`.slice(0, 64);
};
