/*
 * THE EXPORT JSON DIALOG: CLOSING IT AND COPYING ITS TEXT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It runs no effects.
 */
import { useState } from 'react';

export function useExportJsonDialog({ setExportJsonAssignment }) {
  const [exportJsonCopied, setExportJsonCopied] = useState(false);

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
  return { exportJsonCopied, setExportJsonCopied, closeExportJsonDialog, copyExportJsonToClipboard };
}
