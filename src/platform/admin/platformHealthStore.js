/*
 * The Platform health view's reads and its one callable
 * (functions/lib/platformHealth.js). Opened by the root administrator only:
 * at most HEALTH_DAYS_SHOWN document reads each time the view loads or is
 * refreshed, and no listener.
 */
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import { PLATFORM_HEALTH_DAILY_COLLECTION } from '../../../functions/shared/crashReport.mjs';

export const HEALTH_DAYS_SHOWN = 14;

const manage = (data) => httpsCallable(functions, 'managePlatformHealthReporting')(data).then((result) => result.data || {});

export const readCrashReportingStatus = () => manage({ action: 'status' });
export const setCrashReportingMode = (mode) => manage({ action: 'set', mode });
export const purgeCrashReports = () => manage({ action: 'purge' });

export const readPlatformHealthDays = async () => {
  const snapshot = await getDocs(query(
    collection(db, PLATFORM_HEALTH_DAILY_COLLECTION),
    // The `day` field, not the document name: Firestore has no descending
    // scan by name. A single-field order needs no composite index.
    orderBy('day', 'desc'),
    limit(HEALTH_DAYS_SHOWN),
  ));
  return snapshot.docs.map((entry) => ({ day: entry.id, ...entry.data() }));
};
