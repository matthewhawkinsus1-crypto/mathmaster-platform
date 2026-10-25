// A HARNESS SWITCH THAT MAKES THE DEVICE REFUSE A WRITE (CI13, D-9).
//
// The teacher-workflow harness accepts every write the app sends it, offline
// too (its Firestore is in memory), and the browser it runs in has plenty of
// room, so a journey could never see what a student sees when the work cannot
// be stored: "Not saved · this device could not store your last change. Keep
// this tab open and try it again." phoneSaveLineJourneys.mjs used to type the
// longest such sentence into the save line to measure it. This is the real
// thing: with the switch on, every IndexedDB write the page makes (the device
// queue every answer and every checkpoint goes through, src/platform/
// performance/durableActionOutbox.js) is aborted the way a full disk aborts
// it, so the app's own failure path runs and draws its own line.
//
//   await installDeviceStorageFault(context);   // once, before any page opens
//   await setDeviceStorageFull(page, true);     // from now on writes are refused
//   ...type; the app's line is on screen...
//   await setDeviceStorageFull(page, false);    // (a reload also clears it)
//
// The switch is per page and is off when a page loads. Reads still work, so a
// page that was already open keeps what it had.
export const installDeviceStorageFault = (context) => context.addInitScript(() => {
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function putOrRefuse(...args) {
    if (!window.__deviceStorageFull) return realPut.apply(this, args);
    // The write is issued, then its transaction aborts with the quota error: the
    // request and the transaction both fail, as they do when storage runs out.
    const transaction = this.transaction;
    const request = realPut.apply(this, args);
    Object.defineProperty(transaction, 'error', { value: new DOMException('The quota has been exceeded.', 'QuotaExceededError'), configurable: true });
    queueMicrotask(() => { try { transaction.abort(); } catch { /* already finished */ } });
    return request;
  };
});

export const setDeviceStorageFull = (page, full = true) => page.evaluate((value) => { window.__deviceStorageFull = value; }, Boolean(full));
