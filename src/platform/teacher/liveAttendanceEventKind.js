// The kind of support event a Live Classroom attendance mark is written as.
//
// Its own module because App reads only this name (to tell an attendance
// event from any other support event a teacher records); importing it from
// ./liveAttendance.js put the whole live-attendance model in every student's
// first load (scripts/check-first-load-budget.mjs).
export const LIVE_ATTENDANCE_EVENT_KIND = 'liveAttendance';
