// ARE THE LIVE TILES ON THE PROJECTOR?
//
// Teacher Home knows (LiveClassMonitor's Large room tiles) and says so here;
// a panel drawn elsewhere over those tiles, a student's drawer, reads it and
// withholds what the room must not read (TT26). One value for the page, held
// here so neither App nor the teacher workspace keeps state for it.

let projected = false;
const listeners = new Set();

export const setRoomProjected = (value) => {
  const next = Boolean(value);
  if (next === projected) return;
  projected = next;
  listeners.forEach((listener) => listener());
};
export const isRoomProjected = () => projected;
export const subscribeRoomProjected = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
