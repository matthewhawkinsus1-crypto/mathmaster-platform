/*
 * A CONTROLLED FIELD MUST NOT BE OVERWRITTEN BY ITS OWN STALE ECHO.
 *
 * A math field reports every keystroke upward and receives its value back as a
 * prop. The two travel at different speeds: the report is immediate, while the
 * prop returns only after the parent re-renders and React flushes the effect
 * that writes it into the field. On a heavy assignment page that flush can land
 * AFTER the student's next keystroke. The field then held `40+`, the prop still
 * said `40`, the effect wrote `40` back — and the next key typed onto it, so the
 * `+` was gone for good and the student submitted `405x` (live QA, Algebra I
 * DOL #2: 3 of 5 tries at 30 ms per key lost a character).
 *
 * The guard remembers what the field itself emitted. A prop equal to one of
 * those values is the field's own history arriving late, and is not written
 * back. Anything else — a reset, an undo, a restored draft — is a change from
 * outside and is written as before.
 *
 * Pure: no DOM, no React.
 */

const MAX_PENDING = 64;

export const createFieldEchoGuard = () => {
  let pending = [];
  return {
    /** Record a value the field reported upward. */
    emitted(value) {
      pending.push(String(value ?? ''));
      if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
    },
    /** Should the prop value be written into a field that currently holds `fieldValue`? */
    shouldWrite(fieldValue, propValue) {
      const field = String(fieldValue ?? '');
      const prop = String(propValue ?? '');
      if (field === prop) {
        pending = [];
        return false;
      }
      const echo = pending.indexOf(prop);
      if (echo >= 0) {
        // Everything up to this echo has now come back; later emissions are
        // still on their way.
        pending = pending.slice(echo + 1);
        return false;
      }
      pending = [];
      return true;
    },
  };
};
