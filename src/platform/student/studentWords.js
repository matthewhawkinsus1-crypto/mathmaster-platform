/*
 * Small pieces of student wording shared by the screens that print them
 * (student pass 3, "teacher words on student screens").
 */

/** The class period as a student reads it: "Period 3", never a bare "3" or the roster's "Unassigned". */
export const studentPeriodLabel = (classPeriod) => {
  const value = String(classPeriod ?? '').trim();
  if (!value || /^unassigned$/i.test(value)) return '';
  return /^\d+$/.test(value) ? `Period ${value}` : value;
};
