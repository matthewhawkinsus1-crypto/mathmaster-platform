/*
 * A STUDENT'S CLASS POINTS, ANNOUNCEMENTS, PRACTICE PASSES AND REWARDS, LIVE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  emptyClassPointAccount, subscribeToClassPointAnnouncements, subscribeToPracticePassRedemptions,
  subscribeToStudentClassPoints,
} from '../../platform/classPointsClient.js';
import { subscribeToStudentRewardInventory } from '../../platform/rewards/rewardsClient.js';

export function useStudentClassPoints({ user }) {
  const emptyStudentClassPoints = () => ({
    account: emptyClassPointAccount(),
    transactions: [],
    announcements: [],
    // Live waivers only, by assignment: what grading and completion read.
    redemptionsByAssignment: {},
    // Every Practice Pass use, undone ones included: what reward history reads.
    redemptions: [],
    // The student's usable rewards (rewardGrants with status available);
    // null until the first snapshot, so "what they already had" is never
    // mistaken for "just earned".
    grants: null,
    inventoryUnavailable: false,
    unavailable: true,
  });
  const [studentClassPoints, setStudentClassPoints] = useState(emptyStudentClassPoints());

  useEffect(() => {
    // Teacher Preview and synthetic student views can never cross this role gate.
    // A student without canonical class membership also creates no query.
    if (user?.role !== 'student' || !user.id || !user.classId) {
      setStudentClassPoints(emptyStudentClassPoints());
      return undefined;
    }
    setStudentClassPoints(emptyStudentClassPoints());
    let walletFailed = false;
    const unavailable = (error) => {
      walletFailed = true;
      console.warn('Class Points are temporarily unavailable:', error);
      setStudentClassPoints((current) => ({ ...current, unavailable: true }));
    };
    const unsubscribeWallet = subscribeToStudentClassPoints({
      db,
      studentId: user.id,
      classId: user.classId,
      onAccount: (account) => setStudentClassPoints((current) => ({ ...current, account, unavailable: walletFailed })),
      onHistory: (transactions) => setStudentClassPoints((current) => ({ ...current, transactions })),
      onError: unavailable,
    });
    const unsubscribeAnnouncements = subscribeToClassPointAnnouncements({
      db,
      classId: user.classId,
      onAnnouncements: (announcements) => setStudentClassPoints((current) => ({ ...current, announcements })),
      // A public celebration feed failure must not hide an otherwise healthy private wallet.
      onError: (error) => console.warn('Class celebrations are temporarily unavailable:', error),
    });
    // The authoritative Practice Pass waiver projection for this student+class.
    // Read-only here -- redeeming one goes only through redeemPracticePassCallable.
    const unsubscribeRedemptions = subscribeToPracticePassRedemptions({
      db,
      studentId: user.id,
      classId: user.classId,
      onRedemptions: (redemptionsByAssignment, redemptions = []) => setStudentClassPoints((current) => ({ ...current, redemptionsByAssignment, redemptions })),
      onError: (error) => console.warn('Practice Pass redemptions are temporarily unavailable:', error),
    });
    // The student's usable rewards. A failure here hides nothing else.
    const unsubscribeInventory = subscribeToStudentRewardInventory({
      db,
      studentId: user.id,
      classId: user.classId,
      onGrants: (grants) => setStudentClassPoints((current) => ({ ...current, grants, inventoryUnavailable: false })),
      onError: (error) => {
        console.warn('Rewards are temporarily unavailable:', error);
        setStudentClassPoints((current) => ({ ...current, inventoryUnavailable: true }));
      },
    });
    return () => { unsubscribeWallet(); unsubscribeAnnouncements(); unsubscribeRedemptions(); unsubscribeInventory(); };
  }, [user?.role, user?.id, user?.classId]);
  return { studentClassPoints };
}
