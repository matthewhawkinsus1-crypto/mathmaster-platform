/*
 * PER-ACCOUNT DRAFTS KEPT IN THIS TAB — NEVER LONGER THAN THE ACCOUNT.
 *
 * A screen may keep a small draft for the signed-in account in this tab's
 * sessionStorage (the Student Case Review keeps the teacher's next steps this
 * way). Never in Firestore, never in localStorage: the draft stays on this
 * device, in this tab, and is gone when the tab closes.
 *
 * Every such key starts with ACCOUNT_TAB_STORAGE_PREFIX followed by the
 * account's uid, so:
 *   - one account's draft is never read under another account's key;
 *   - signing out removes every account's drafts (authService.signOutSession,
 *     and AuthProvider when the session ends any other way), so nothing one
 *     teacher kept is left in the tab for the next person on a shared device.
 *
 * Framework-free and Firebase-free, so the auth layer and node tests can both
 * import it.
 */

export const ACCOUNT_TAB_STORAGE_PREFIX = 'mathmaster.accountTab.v1:';

const clean = (value) => String(value ?? '').trim();

/** This tab's sessionStorage, or null where the browser blocks it. */
export const tabStorage = () => {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/**
 * The key for one draft of one account: null unless the account and every
 * part are named — a draft is never kept under a key another account shares.
 * Parts are encoded, so no uid or id can run into the next one.
 */
export const accountTabStorageKey = (uid, ...parts) => {
  const owner = clean(uid);
  const names = parts.map(clean);
  if (!owner || !names.length || names.some((name) => !name)) return null;
  return `${ACCOUNT_TAB_STORAGE_PREFIX}${[owner, ...names].map(encodeURIComponent).join(':')}`;
};

const ownerOfKey = (key) => {
  try {
    return decodeURIComponent(key.slice(ACCOUNT_TAB_STORAGE_PREFIX.length).split(':')[0] || '');
  } catch {
    return '';
  }
};

/**
 * Remove every account's drafts from this tab — or, with `keepUid`, every
 * account's but that one's. Returns how many were removed; never throws.
 */
export const clearAccountTabStorage = ({ storage = tabStorage(), keepUid = null } = {}) => {
  if (!storage) return 0;
  const keep = clean(keepUid);
  try {
    const doomed = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key !== 'string' || !key.startsWith(ACCOUNT_TAB_STORAGE_PREFIX)) continue;
      if (keep && ownerOfKey(key) === keep) continue;
      doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
    return doomed.length;
  } catch {
    return 0;
  }
};

export default clearAccountTabStorage;
