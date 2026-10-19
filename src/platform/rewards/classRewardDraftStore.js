/*
 * A TEACHER'S UNSAVED CLASS-REWARD LIST, KEPT FOR THIS TAB.
 *
 * The catalog editor lives on the Classes workspace and is keyed by class, so
 * switching tab or class unmounts it — and used to drop the teacher's edits
 * without a word. While the list has unsaved changes they are kept here,
 * under the signed-in account's tab-storage key (accountTabStorage.js, so
 * sign-out clears them), and the editor brings them back, saying so, when the
 * teacher returns to that class. Saving or reloading the list clears them.
 */
import { accountTabStorageKey, tabStorage } from '../../auth/accountTabStorage.js';

const NAME = 'classRewardDraft';

export const classRewardDraftKey = (ownerUid, classId) => accountTabStorageKey(ownerUid, NAME, classId);

/** The kept draft for this account and class, or null. Never throws. */
export const readClassRewardDraft = ({ ownerUid, classId, storage = tabStorage() } = {}) => {
  const key = classRewardDraftKey(ownerUid, classId);
  if (!key || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || !Array.isArray(parsed.draft)) return null;
    return { draft: parsed.draft, baseRevision: Number(parsed.baseRevision) || 0 };
  } catch {
    return null;
  }
};

/** Keep a draft (or clear it with draft === null). Never throws. */
export const writeClassRewardDraft = ({ ownerUid, classId, draft, baseRevision = 0, storage = tabStorage() } = {}) => {
  const key = classRewardDraftKey(ownerUid, classId);
  if (!key || !storage) return;
  try {
    if (draft === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ draft, baseRevision: Number(baseRevision) || 0 }));
  } catch {
    // A tab that cannot store keeps today's behaviour: the beforeunload warning only.
  }
};
