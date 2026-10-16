/*
 * THE PDF RENDERERS, LOADED WHEN A TEACHER ASKS FOR A PDF.
 *
 * lessonNotesPdf.js and assignmentWorksheetPdf.js pull in html2canvas, MathLive's
 * markup converter and its stylesheet. App imported them statically, so every
 * student's sign-in screen downloaded and parsed a PDF engine no student ever
 * runs. These wrappers keep the same names and signatures (each was already
 * awaited), and the browser fetches the renderer on first use.
 */

export const generateLessonNotesPdfBlob = async (...args) => (
  (await import('./lessonNotesPdf.js')).generateLessonNotesPdfBlob(...args)
);

export const blobToBase64 = async (...args) => (
  (await import('./lessonNotesPdf.js')).blobToBase64(...args)
);

export const downloadAssignmentWorksheetPdf = async (...args) => (
  (await import('./assignmentWorksheetPdf.js')).downloadAssignmentWorksheetPdf(...args)
);

// The worksheet and answer-key builders. They read every tool's answer key
// (the Matrix Lab's whole model among them), so they load with the PDF too.
export const buildAssignmentWorksheetModel = async (...args) => (
  (await import('./assignmentWorksheetPdfModel.js')).buildAssignmentWorksheetModel(...args)
);

export const buildTeacherAssignmentWorksheetModel = async (...args) => (
  (await import('./teacherAssignmentWorksheetExport.js')).buildTeacherAssignmentWorksheetModel(...args)
);
