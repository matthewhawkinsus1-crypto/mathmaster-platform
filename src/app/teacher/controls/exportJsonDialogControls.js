/*
 * THE EXPORT JSON DIALOG: CLOSING IT AND COPYING ITS TEXT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
export function createExportJsonDialogControls(setExportJsonAssignment, setExportJsonCopied) {
  const closeExportJsonDialog = () => {
    setExportJsonAssignment(null);
    setExportJsonCopied(false);
  };

  const copyExportJsonToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setExportJsonCopied(true);
    } catch (error) {
      console.error(error);
      setExportJsonCopied(false);
    }
  };
  return [closeExportJsonDialog, copyExportJsonToClipboard];
}
