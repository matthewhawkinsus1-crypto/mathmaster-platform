import { useEffect, useMemo, useRef, useState } from 'react';
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
  [RESULT_KIND.STUDENT]: { bg: '#eef3fb', fg: '#174ea6' },
  [RESULT_KIND.CLASS]: { bg: '#eefaf1', fg: '#12633a' },
  [RESULT_KIND.ASSIGNMENT]: { bg: '#f3e8fd', fg: '#6f2da8' },
  [RESULT_KIND.STANDARD]: { bg: '#fdf6e3', fg: '#854d0e' },
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

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    inputRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find a student, class, assignment or standard"
        style={{
          width: 'min(620px, 100%)', background: '#fff', borderRadius: 14,
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
            width: '100%', padding: '17px 20px', border: 0, borderBottom: '1px solid #eef0f2',
            fontSize: 17, outline: 'none', boxSizing: 'border-box',
          }}
        />

        {query.trim().length >= 2 && !results.length && (
          <p style={{ margin: 0, padding: '18px 20px', color: '#5f6368', fontSize: 13.5 }}>
            Nothing matches that. Try a surname, a class name, or a TEKS code such as A.5C.
          </p>
        )}

        {query.trim().length < 2 && (
          <p style={{ margin: 0, padding: '16px 20px', color: '#5f6368', fontSize: 13 }}>
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
                    padding: '11px 20px', border: 0, background: active ? '#f1f5fb' : '#fff', cursor: 'pointer',
                  }}
                >
                  <span style={{ padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10.5, fontWeight: 900, whiteSpace: 'nowrap' }}>
                    {RESULT_KIND_LABEL[result.kind]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, color: '#202124' }}>{result.title}</span>
                    {result.subtitle && (
                      <span style={{ display: 'block', color: '#5f6368', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.subtitle}
                      </span>
                    )}
                  </span>
                  {active && <span style={{ color: '#9aa0a6', fontSize: 11, fontWeight: 800 }}>ENTER</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
