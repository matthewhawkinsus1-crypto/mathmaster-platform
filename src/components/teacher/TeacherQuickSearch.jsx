import { useEffect, useMemo, useRef, useState } from 'react';
import Dialog from '../../ui/Dialog.jsx';
import {
  RESULT_KIND, RESULT_KIND_LABEL, searchTeacherWorkspace,
} from '../../platform/teacher/teacherSearch.js';

/*
 * ONE BOX, AND THE KEYBOARD.
 *
 * Everything on this palette is arranged around the fact that a teacher opening
 * it already knows what they want. So: it opens on a keystroke, the first
 * result is pre-selected, and Enter takes it. The mouse works, but a teacher
 * who never touches it should be able to go from "how is Ana doing?" to Ana's
 * profile in about a second and a half.
 *
 * The result list is short on purpose — see the note in teacherSearch.js. A
 * palette that shows forty results is one a teacher reads instead of typing one
 * more letter into.
 */

const KIND_TONE = {
  [RESULT_KIND.STUDENT]: { bg: 'var(--mm-primary-subtle)', fg: 'var(--mm-primary-text)' },
  [RESULT_KIND.CLASS]: { bg: 'var(--mm-success-subtle)', fg: 'var(--mm-success-text)' },
  [RESULT_KIND.ASSIGNMENT]: { bg: 'var(--mm-accent-soft)', fg: 'var(--mm-accent-text)' },
  [RESULT_KIND.STANDARD]: { bg: 'var(--mm-warning-bg)', fg: 'var(--mm-warning-text)' },
};

export default function TeacherQuickSearch({
  open = false,
  students = [],
  classes = [],
  assignments = [],
  standards = [],
  onClose = null,
  onSelect = null,
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(
    () => searchTeacherWorkspace({ query, students, classes, assignments, standards }),
    [query, students, classes, assignments, standards],
  );

  useEffect(() => { setCursor(0); }, [query]);

  // The parent passes a fresh onClose on every render, and the workspace
  // re-renders about once a second while students are working (presence).
  // Keyed on it, this effect cleared whatever the teacher was typing. It now
  // resets only when the palette opens. Focus on the box and Escape are
  // Dialog's (which reads the latest onClose).
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  if (!open) return null;

  const choose = (result) => {
    if (!result) return;
    onSelect?.(result);
    onClose?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[cursor]);
    }
  };

  return (
    <div
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(16, 24, 22, .38)', zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 20px 20px',
      }}
    >
      <Dialog
        onClose={onClose}
        initialFocusRef={inputRef}
        aria-label="Find a student, class, assignment or standard"
        style={{
          width: 'min(620px, 100%)', background: 'var(--mm-surface)', borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Student, class, assignment or TEKS code"
          aria-label="Search"
          style={{
            width: '100%', padding: '17px 20px', border: 0, borderBottom: '1px solid var(--mm-border-soft)',
            fontSize: 17, outline: 'none', boxSizing: 'border-box',
          }}
        />

        {query.trim().length >= 2 && !results.length && (
          <p style={{ margin: 0, padding: '18px 20px', color: 'var(--mm-text-muted)', fontSize: 13.5 }}>
            Nothing matches that. Try a surname, a class name, or a TEKS code such as A.5C.
          </p>
        )}

        {query.trim().length < 2 && (
          <p style={{ margin: 0, padding: '16px 20px', color: 'var(--mm-text-muted)', fontSize: 13 }}>
            Type at least two characters. A full student ID or TEKS code goes straight to the top.
          </p>
        )}

        <ul role="listbox" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '48vh', overflowY: 'auto' }}>
          {results.map((result, index) => {
            const tone = KIND_TONE[result.kind];
            const active = index === cursor;
            return (
              <li key={`${result.kind}:${result.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(result)}
                  style={{
                    display: 'flex', width: '100%', gap: 12, alignItems: 'center', textAlign: 'left',
                    padding: '11px 20px', border: 0, background: active ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)', cursor: 'pointer',
                  }}
                >
                  <span style={{ padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10.5, fontWeight: 900, whiteSpace: 'nowrap' }}>
                    {RESULT_KIND_LABEL[result.kind]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, color: 'var(--mm-text-strong)' }}>{result.title}</span>
                    {result.subtitle && (
                      <span style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.subtitle}
                      </span>
                    )}
                  </span>
                  {active && <span style={{ color: 'var(--mm-text-subtle)', fontSize: 11, fontWeight: 800 }}>ENTER</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </div>
  );
}
