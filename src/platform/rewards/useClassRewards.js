import { useEffect, useState } from 'react';
import { db } from '../../firebase.js';
import {
  redeemClassReward,
  resolveClassRewardRequest,
  saveClassRewardCatalog,
  subscribeToClassRewardCatalog,
  subscribeToPendingClassRewardRequests,
  subscribeToStudentClassRewardRequests,
} from './classRewardsClient.js';

/*
 * Live class-reward data for one screen. Each hook opens only the listeners
 * firestore.rules allow its viewer (classRewardsClient.js) and closes them
 * when the class or the viewer changes. A listener failure marks the data
 * unavailable; it never hides the rest of My Rewards or the teacher panel.
 */

const STUDENT_EMPTY = Object.freeze({ catalog: null, requests: [], loaded: false, unavailable: false });

/** The student's class catalog and their own requests. `enabled: false` opens nothing. */
export function useStudentClassRewards({ studentId, classId, enabled = true }) {
  const [state, setState] = useState(STUDENT_EMPTY);
  useEffect(() => {
    if (!enabled || !studentId || !classId) {
      setState(STUDENT_EMPTY);
      return undefined;
    }
    setState(STUDENT_EMPTY);
    const merge = (patch) => setState((current) => ({ ...current, ...patch }));
    const unavailable = (error) => {
      console.warn('Class rewards are temporarily unavailable:', error);
      merge({ unavailable: true, loaded: true });
    };
    const stopCatalog = subscribeToClassRewardCatalog({ db, classId, onCatalog: (catalog) => merge({ catalog, loaded: true }), onError: unavailable });
    const stopRequests = subscribeToStudentClassRewardRequests({ db, studentId, classId, onRequests: (requests) => merge({ requests }), onError: unavailable });
    return () => { stopCatalog(); stopRequests(); };
  }, [enabled, studentId, classId]);
  return { ...state, redeem: redeemClassReward };
}

/** The teacher's catalog for one class, and the save action. */
export function useClassRewardCatalog({ classId, enabled = true }) {
  const [state, setState] = useState({ catalog: null, loaded: false, unavailable: false });
  useEffect(() => {
    if (!enabled || !classId) {
      setState({ catalog: null, loaded: false, unavailable: false });
      return undefined;
    }
    setState({ catalog: null, loaded: false, unavailable: false });
    return subscribeToClassRewardCatalog({
      db,
      classId,
      onCatalog: (catalog) => setState({ catalog, loaded: true, unavailable: false }),
      onError: (error) => {
        console.warn('The class reward list is temporarily unavailable:', error);
        setState((current) => ({ ...current, loaded: true, unavailable: true }));
      },
    });
  }, [enabled, classId]);
  return { ...state, save: saveClassRewardCatalog };
}

/** The class's pending requests, and the resolve action. */
export function usePendingClassRewardRequests({ classId, teacherEmail, enabled = true }) {
  const [state, setState] = useState({ requests: [], loaded: false, unavailable: false });
  useEffect(() => {
    if (!enabled || !classId || !teacherEmail) {
      setState({ requests: [], loaded: false, unavailable: false });
      return undefined;
    }
    setState({ requests: [], loaded: false, unavailable: false });
    return subscribeToPendingClassRewardRequests({
      db,
      classId,
      teacherEmail,
      onRequests: (requests) => setState({ requests, loaded: true, unavailable: false }),
      onError: (error) => {
        console.warn('Class reward requests are temporarily unavailable:', error);
        setState((current) => ({ ...current, loaded: true, unavailable: true }));
      },
    });
  }, [enabled, classId, teacherEmail]);
  return { ...state, resolve: resolveClassRewardRequest };
}
