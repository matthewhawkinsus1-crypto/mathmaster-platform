/*
 * WHETHER A STUDENT'S DRAFTS ARE SAVING: A COUNTER THAT MOVES WHEN THAT CHANGES, CLEARED FOR THE NEXT ACCOUNT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef, useState } from 'react';
import { accountChangeClearsDraftProblems, clearDraftSaveProblems, subscribeDraftSaveHealth } from '../../platform/persistence/draftSaveHealth.js';

export function useDraftSaveHealth({ user }) {
  // Unfinished work this device could not save, or the backup could not take
  // (draftSaveHealth.js). Bumped on every change; the line below reads it.
  const [draftSaveHealthVersion, setDraftSaveHealthVersion] = useState(0);
  useEffect(() => subscribeDraftSaveHealth(() => setDraftSaveHealthVersion((value) => value + 1)), []);
  // A shared Chromebook: the next student never inherits this one's notice,
  // and a reload keeps this student's (accountChangeClearsDraftProblems).
  const draftHealthAccountRef = useRef(null);
  useEffect(() => {
    const account = user?.id || null;
    if (accountChangeClearsDraftProblems(draftHealthAccountRef.current, account)) clearDraftSaveProblems();
    draftHealthAccountRef.current = account;
  }, [user?.id]);
  return { draftSaveHealthVersion };
}
