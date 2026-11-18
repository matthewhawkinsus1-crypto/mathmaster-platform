import { useLayoutEffect, useRef, useState } from 'react';
import { IDLE_STEP_ROOM, readStepRoom } from './stepRoom.js';

/*
 * THE STAGED STEP'S ROOM, AS WORK VIEW LAYS IT OUT (stepRoom.js).
 *
 * Measured only while Work View is open (`enlarged`), as the step is laid out
 * and again whenever the view, the step or its content changes size: the view
 * opening or turning, the text size, another step, a plane drawn smaller. The
 * view, the step and the step's content are each watched, since a bounded
 * step's box does not change when only its content does.
 */
const same = (a, b) => a.flow === b.flow
  && (a.planeMax === b.planeMax || (a.planeMax != null && b.planeMax != null && Math.abs(a.planeMax - b.planeMax) < 1));

export const useStepRoom = (rootRef, { enlarged = false, stepKey = '' } = {}) => {
  const [room, setRoom] = useState(IDLE_STEP_ROOM);
  const roomRef = useRef(room);
  roomRef.current = room;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enlarged || !root) {
      if (roomRef.current !== IDLE_STEP_ROOM) setRoom(IDLE_STEP_ROOM);
      return undefined;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = readStepRoom(root, roomRef.current.flow);
      if (!same(roomRef.current, next)) {
        roomRef.current = next;
        setRoom(next);
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    [
      root,
      root.closest('.mathmaster-work-view-surface'),
      root.querySelector('.workflow-focus__workspace-body'),
      root.querySelector('.workflow-focus__active-stage'),
    ].filter(Boolean).forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef, enlarged, stepKey]);
  return room;
};

export default useStepRoom;
