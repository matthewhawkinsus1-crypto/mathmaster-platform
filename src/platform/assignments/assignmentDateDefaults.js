const pad = (value) => String(value).padStart(2, '0');

export const toLocalDateTimeInput = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * New assignment defaults are deliberately based on the teacher's local
 * calendar rather than UTC. If the teacher creates an assignment on Monday,
 * the regular due date starts at Tuesday 11:59 PM and the final late deadline
 * starts at the following Monday 11:59 PM.
 */
export const defaultAssignmentDateInputs = (nowValue = Date.now()) => {
  const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue);
  if (Number.isNaN(now.getTime())) return { dueAt: '', lateDueAt: '' };

  const due = new Date(now.getTime());
  due.setDate(due.getDate() + 1);
  due.setHours(23, 59, 0, 0);

  const late = new Date(now.getTime());
  late.setDate(late.getDate() + 7);
  late.setHours(23, 59, 0, 0);

  return {
    dueAt: toLocalDateTimeInput(due),
    lateDueAt: toLocalDateTimeInput(late),
  };
};

export default defaultAssignmentDateInputs;
