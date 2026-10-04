import { Suspense, lazy, useState } from 'react';
import { studentSupportTools } from '../../studentSupport.js';

// The per-question tray (language tools) is its own chunk: a student with no
// language support never downloads it, its vocabulary or its language packs.
const SupportToolsTray = lazy(() => import('./supportTools/SupportToolsTray.jsx'));

/*
 * SUPPORT TOOLS — what this student can use, in plain words.
 *
 * A student should not have to diagnose their own plan to get their supports.
 * Automatic supports are already on (a calmer screen, their own due date);
 * this panel lists the tools they can reach for and the materials their
 * teacher attached. It never says why: no program, no "accommodation", no
 * "modified". It renders nothing for a student with no student-facing tool.
 */

const WHERE = {
  'text-to-speech': 'Use 🔊 Read on any question.',
  calculator: 'Use 🧮 Calculator when a question allows it.',
  'graph-paper': 'Open ✎ Scratchpad — it opens on graph paper.',
  translation: 'Use 文A Translate under a question when it is ready in your language.',
  'glossary-lookup': 'Use 📖 Vocabulary under a question to see what math words mean.',
  'chunked-directions': 'Directions are shown as short steps under each question.',
  'sentence-frames': 'Use 💬 Help me say it when a question asks you to explain.',
};

/**
 * SUPPORT TOOLS FOR ONE QUESTION — the same neutral surface, per item.
 *
 * `entitlement` comes from platform/language/supportToolsEntitlement.js (from
 * the student's own profile, or on My Math Path from the server's applicable
 * list). Renders nothing — and loads nothing — when the student has no
 * language tool. Each tool appears only where this item or tool actually has
 * the resource behind it (see the tray).
 */
export function StudentSupportTray({ entitlement = null, ...props }) {
  if (!entitlement?.tools?.length) return null;
  return (
    <Suspense fallback={null}>
      <SupportToolsTray entitlement={entitlement} {...props} />
    </Suspense>
  );
}

export default function StudentSupportTools({ profile = null, onResourceOpened = null, nowValue = null, className = '' }) {
  const [open, setOpen] = useState(false);
  const { tools, resources, any } = studentSupportTools(profile, { nowValue: nowValue ?? Date.now() });
  if (!any) return null;
  return (
    <div className={`mathmaster-support-tools${className ? ` ${className}` : ''}`} data-student-support-tools style={{ marginTop: 8 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{ minHeight: 36, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: 'pointer' }}
      >
        Support tools {open ? '▴' : '▾'}
      </button>
      {open && (
        <div role="region" aria-label="Support tools" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'grid', gap: 8, textAlign: 'left', maxWidth: 520 }}>
          {tools.map((tool) => (
            <div key={tool.supportId} style={{ fontSize: 13 }}>
              <strong>{tool.label}</strong>{WHERE[tool.supportId] ? ` — ${WHERE[tool.supportId]}` : ''}
            </div>
          ))}
          {resources.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {resources.map((resource) => (
                <a
                  key={`${resource.supportId}-${resource.url}`}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onResourceOpened?.(resource.supportId)}
                  style={{ fontSize: 13, fontWeight: 800, color: 'var(--mm-primary-text)' }}
                >
                  {resource.group}: {resource.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
