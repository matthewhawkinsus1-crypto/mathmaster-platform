/*
 * A FINISHED GAME'S REPORT, FOLLOWED UNTIL IT IS WRITTEN.
 *
 * The room turns "finished" in one transaction, and the report is written a
 * moment later, the first of the finalization's effects (functions/index.js,
 * runLiveChallengeFinalizationEffects), or by the sweep's retry if that run
 * failed. The console read the report once, when the room finished, so it
 * usually found nothing, and the report showed only after a refresh. It now
 * follows the report's document from the moment the room finishes, as the
 * setup card follows the class memory, and stops at the first report it is
 * given: a report is written once, so there is nothing more to follow.
 * Leaving the room first (New Challenge, Play Again, closing the console)
 * closes the watch through the function this returns.
 *
 * `listen(next, fail)` is the database's own subscription to the report's
 * document (Firestore's onSnapshot in the app, liveChallengeService.js): it
 * calls `next` with the report, or null while none is written, and returns
 * its unsubscribe function.
 */
export const watchReportUntilWritten = ({ listen, onValue, onError }) => {
  let open = true;
  let unsubscribe = null;
  const close = () => {
    open = false;
    const stop = unsubscribe;
    unsubscribe = null;
    stop?.();
  };
  const listening = listen((report) => {
    if (!open) return;
    onValue?.(report ?? null);
    if (report) close();
  }, (error) => {
    if (open) onError?.(error);
  });
  // A listener that answered before it returned (a cached report) is already done.
  if (open) unsubscribe = listening;
  else listening?.();
  return close;
};
