/**
 * Integration seam for the canonical student-specific final-deadline service.
 * Grade Transfer deliberately owns no attendance storage shape or extension
 * calculation. The attendance/history work can supply this function once its
 * authoritative contract lands; until then only the ordinary assignment final
 * deadline is used.
 */
export const noStudentSpecificFinalDeadline = () => null;
