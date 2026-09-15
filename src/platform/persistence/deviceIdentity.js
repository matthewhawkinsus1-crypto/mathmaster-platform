/*
 * WHICH CHROMEBOOK IS SPEAKING, AND WHICH REPORT IS NEWER.
 *
 * `studentDevicePersistenceReports/{student}__{device}` is the only record of
 * work that exists nowhere a server can see it. Two properties make it usable
 * and both used to be missing:
 *
 *   IDENTITY MUST BE STABLE. The old fallback minted a fresh
 *   `dev_session_<random>` every single call. So the pre-drain report ("2
 *   queued") was filed under device A and the post-drain report ("0 queued")
 *   under device B. Device A was never cleared by anything, every periodic
 *   retry added another positive row, and `readPersistencePending` withheld
 *   that student's final Classroom grade for as long as the rows existed.
 *
 *   ORDER MUST BE EXPLICIT. A client-side timeout does not cancel a callable;
 *   `Promise.race` only stops waiting. A slow "2 queued" report can therefore
 *   land AFTER the "0 queued" report that superseded it and restore the stale
 *   count, with the tab already closed and nothing left to correct it. Only a
 *   generation the server can compare makes that decidable.
 *
 * Identity lives in the durable outbox's own IndexedDB database, deliberately:
 * a device report is a claim about what that queue holds, so the identity
 * making the claim survives exactly as long as the queue it describes. It is
 * per browser installation — IndexedDB is scoped to origin and profile — so
 * two Chromebooks are never one row, and one Chromebook is never two.
 */
import { indexedDbOutboxStorage } from '../performance/durableActionOutbox.js';

const DEVICE_ID_STORAGE_KEY = 'mathmaster:device-id';

const mint = () => `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/*
 * THE LAST RESORT, AND WHY IT IS A MODULE SINGLETON.
 *
 * With IndexedDB unavailable AND localStorage throwing there is nothing left
 * that outlives the page. What must still hold is that every report from THIS
 * page agrees on who it is — that is the pre/post-drain bug. So the id is
 * minted once per module instance and reused, rather than once per call.
 */
let volatileIdentity = null;
let volatileGeneration = 0;
let resolved = null;
let inFlight = null;

const readLocalStorageId = () => {
  try {
    return window.localStorage.getItem(DEVICE_ID_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

const writeLocalStorageId = (deviceId) => {
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // Blocked storage is not a failure. The durable copy is the real one.
  }
};

/**
 * This browser installation's device id.
 *
 * Resolution order, and each step is there for a reason:
 *
 *   1. the durable record, so identity survives whatever the queue survives;
 *   2. an id an earlier release left in `localStorage`, ADOPTED rather than
 *      replaced — a device already reporting under one id must keep it, or its
 *      existing server row is orphaned with its stale counts intact, which is
 *      the very failure this file exists to prevent;
 *   3. a new id.
 *
 * The result is cached for the life of the page, and concurrent callers share
 * one resolution, so nothing can observe two different ids.
 */
export const resolveDeviceIdentity = async ({ storage = indexedDbOutboxStorage } = {}) => {
  if (resolved) return resolved;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const legacyId = readLocalStorageId();
    try {
      const identity = await storage.claimDeviceIdentity({ deviceId: legacyId || mint() });
      if (identity?.deviceId) {
        // Mirror it back. A browser that later loses IndexedDB but keeps
        // localStorage still recognises itself.
        writeLocalStorageId(identity.deviceId);
        resolved = { deviceId: identity.deviceId, durable: true };
        return resolved;
      }
    } catch {
      // IndexedDB unavailable (private mode, blocked site data, quota).
    }
    if (legacyId) {
      resolved = { deviceId: legacyId, durable: false };
      return resolved;
    }
    if (!volatileIdentity) {
      volatileIdentity = mint();
      writeLocalStorageId(volatileIdentity);
    }
    resolved = { deviceId: volatileIdentity, durable: false };
    return resolved;
  })().finally(() => { inFlight = null; });
  return inFlight;
};

export const resolveDeviceId = async (options) => (await resolveDeviceIdentity(options)).deviceId;

/*
 * WHY THE GENERATION IS FLOORED AT THE WALL CLOCK.
 *
 * A counter that restarts at 1 when durable storage is lost is worse than no
 * counter: the server holds generation 812 for this device, every report from
 * the recovered browser is older than that, and the device can never correct
 * its own row again — it is silenced permanently, holding a student's final
 * grade. Flooring at `Date.now()` means a fresh start still outranks anything
 * a previous install wrote, because that too was floored at a wall clock that
 * has since advanced.
 *
 * The stored value is still the floor's floor: `stored + 1` wins whenever the
 * clock is behind, so a device whose clock jumps backward keeps increasing.
 * This is the same shape as `nextCreatedOrder` in the outbox itself.
 */
export const nextDeviceReportGeneration = async ({
  storage = indexedDbOutboxStorage,
  now = Date.now,
} = {}) => {
  const { deviceId } = await resolveDeviceIdentity({ storage });
  const floor = Number(now()) || 0;
  try {
    const identity = await storage.nextReportGeneration(floor);
    const generation = Number(identity?.reportGeneration) || 0;
    if (generation > 0) return { deviceId, generation, durable: true };
  } catch {
    // Fall through to the volatile counter below.
  }
  /*
   * No durable counter. The clock alone still orders reports correctly within
   * this page and against anything an earlier install stored, which is where
   * the race actually happens: two in-flight reports from one tab.
   */
  volatileGeneration = Math.max(volatileGeneration + 1, floor);
  return { deviceId, generation: volatileGeneration, durable: false };
};

/** Test seam. Never called in the browser. */
export const resetDeviceIdentityCacheForTests = () => {
  resolved = null;
  inFlight = null;
  volatileIdentity = null;
  volatileGeneration = 0;
};
