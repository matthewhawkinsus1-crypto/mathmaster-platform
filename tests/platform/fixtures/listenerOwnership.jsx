/*
 * LISTENERS THE LIFECYCLE GUARD MUST CATCH, BESIDE OWNED ONES.
 *
 * Read as text by tests/platform/listenerLifecycleGuard.test.mjs; never
 * imported, built or run. Each line that opens a listener nothing releases
 * ends in a "leak" comment, and the guard must flag exactly those lines. All
 * five passed the guard while it read source text: it found an
 * `unsubscribe()` later in the file, a `return`, or a `.map(` that was not the
 * effect's own cleanup, and it took the arrow's listener for a definition.
 */
import { useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

// Kept in a ref for the Leave button. When roomId changes the effect runs
// again and the old listener stays open: nothing in the effect releases it.
// The next effect's `unsubscribe()` closes a different listener.
export function RoomBanner({ db, roomId, classId, onRoom, onRoster }) {
  const stopRoom = useRef(null);
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), onRoom); // leak
    stopRoom.current = unsubscribe;
  }, [db, roomId, onRoom]);
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rosters', classId), onRoster);
    return () => unsubscribe();
  }, [db, classId, onRoster]);
  return <button type="button" onClick={() => stopRoom.current?.()}>Leave</button>;
}

// Released only if the listener fails: leaving the screen leaves it open.
export function ScoreLine({ db, playerId, onScore }) {
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'players', playerId), onScore, () => unsubscribe()); // leak
  }, [db, playerId, onScore]);
  return null;
}

// Returned into the lazy load's promise, which drops it.
export function RosterCount({ classId, loadRoster, onRoster }) {
  useEffect(() => {
    loadRoster().then(({ watchRoster }) => {
      return watchRoster(classId, onRoster); // leak
    });
  }, [classId, loadRoster, onRoster]);
  return null;
}

// One listener per student, mapped and dropped.
export function PresenceDots({ db, studentIds, onPresence }) {
  useEffect(() => {
    studentIds.map((id) => onSnapshot(doc(db, 'presence', id), onPresence)); // leak
  }, [db, studentIds, onPresence]);
  return null;
}

// Not a watch…/subscribe… function, so nothing checks who calls it and
// whether they release what it returns.
export const roomListener = (db, roomId, onRoom) => onSnapshot(doc(db, 'rooms', roomId), onRoom); // leak

// OWNED: each listener below is released by its own effect's or function's
// cleanup, or returned to a caller the guard checks.
export const watchRoomName = (db, roomId, onName) => onSnapshot(doc(db, 'rooms', roomId), (snapshot) => onName(snapshot.data()?.name));

export const watchRoomAndRoster = ({ db, roomId, classId, onRoom, onRoster }) => {
  const stopRoom = onSnapshot(doc(db, 'rooms', roomId), onRoom);
  const stopRoster = onSnapshot(doc(db, 'rosters', classId), onRoster);
  return () => { stopRoom(); stopRoster(); };
};

export function RoomPanel({ db, roomId, studentIds, loadRoster, onRoom, onRoster, onPresence }) {
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), onRoom);
    return unsubscribe;
  }, [db, roomId, onRoom]);
  useEffect(() => {
    let stopped = false;
    let release = null;
    loadRoster().then(({ watchRoster }) => {
      if (stopped) return;
      const unsubscribe = watchRoster(roomId, onRoster);
      release = () => unsubscribe();
    });
    return () => { stopped = true; release?.(); };
  }, [loadRoster, roomId, onRoster]);
  useEffect(() => {
    const stops = studentIds.map((id) => onSnapshot(doc(db, 'presence', id), onPresence));
    return () => stops.forEach((stop) => stop());
  }, [db, studentIds, onPresence]);
  useEffect(() => {
    const stops = [];
    for (const id of studentIds) stops.push(onSnapshot(doc(db, 'scores', id), onPresence));
    return () => { for (const stop of stops) stop(); };
  }, [db, studentIds, onPresence]);
  useEffect(() => watchRoomName(db, roomId, onRoom), [db, roomId, onRoom]);
  return null;
}
