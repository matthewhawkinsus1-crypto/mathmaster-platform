import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildTopicBrowser, TOPIC_GROUPING } from '../../platform/path/topicBrowser.js';
import { toneTextColor } from '../../theme/themeColorRoles.js';

// BROWSE ALL TOPICS.
//
// The Path map is deliberately a handful of nearby cards. This is the rest of
// the course: every unit (or topic), every skill, its mastery and its Path
// status, searchable by name.
//
// Nothing here decides anything. The model (topicBrowser.js) draws each skill
// through the map's own node builder, so a skill opens here exactly where it
// opens on the map, and the button calls the same launcher the map calls — the
// session still fails closed on coverage after that. A skill that is not open
// says why (a date, a skill to strengthen first, a teacher's decision, practice
// still being prepared) instead of offering a door.

const GROUPING_LABEL = Object.freeze({
  [TOPIC_GROUPING.UNIT]: 'By class unit',
  [TOPIC_GROUPING.TOPIC]: 'By topic',
});

const VISUALLY_HIDDEN = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999,
  border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface-sunken)',
  fontSize: 12, fontWeight: 800, color: 'var(--mm-text)', lineHeight: 1.4,
};

const badge = {
  flex: '0 0 auto', width: 28, height: 28, borderRadius: 999, display: 'inline-grid', placeItems: 'center',
  border: '2px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)',
  fontSize: 13, fontWeight: 900,
};

function TopicSkill({ skill, grouping, onChooseSkill, disabled }) {
  // The grouping not chosen, as a line under the name — unless the evidence
  // below already names the unit, which would say it twice.
  const unitInEvidence = Boolean(skill.unitTitle) && skill.evidence.some((item) => item.text.includes(skill.unitTitle));
  const other = grouping === TOPIC_GROUPING.UNIT
    ? (skill.topicTitle ? `Topic · ${skill.topicTitle}` : null)
    : (skill.unitTitle && !unitInEvidence ? `Class unit · ${skill.unitTitle}` : null);
  const canStart = skill.launchable && typeof onChooseSkill === 'function';
  return (
    <li data-topic-skill={skill.skillId} data-path-state={skill.pathState} style={{ listStyle: 'none', padding: '12px 14px', borderTop: '1px solid var(--mm-border-soft)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: 'var(--mm-text-strong)', lineHeight: 1.35 }}>{skill.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {/* Two different facts, two chips: how the evidence stands (the
                shared mastery rule's word) and whether the Path is open. */}
            <span data-mastery-status style={chip}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: skill.masteryColor, border: '1px solid var(--mm-border-strong)' }} />
              <span><span style={VISUALLY_HIDDEN}>Mastery: </span>{skill.masteryStatus}</span>
            </span>
            <span data-path-status style={{ ...chip, color: toneTextColor(skill.tone) }}>
              <span aria-hidden="true">{skill.symbol}</span>
              <span><span style={VISUALLY_HIDDEN}>Path: </span>{skill.statusLabel}</span>
            </span>
            {skill.passCompletedLabel && <span style={{ ...chip, color: 'var(--mm-success-text)' }}>{skill.passCompletedLabel}</span>}
          </div>
          {other && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--mm-text-muted)', fontWeight: 700 }}>{other}</p>}
          {skill.launchable ? (
            skill.evidence.length ? (
              <ul aria-label={`Why ${skill.title} is a good choice`} style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--mm-text)', lineHeight: 1.5 }}>
                {skill.evidence.map((item) => <li key={`${item.kind}:${item.text}`}>{item.text}</li>)}
              </ul>
            ) : (
              skill.reason && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{skill.reason}</p>
            )
          ) : (
            <p data-why-not style={{ margin: '6px 0 0', fontSize: 12.5, color: skill.blockedBy === 'pacing' ? 'var(--mm-primary-text)' : 'var(--mm-text)', fontWeight: 650, lineHeight: 1.5 }}>
              {skill.whyNot}
            </p>
          )}
        </div>
        {canStart && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChooseSkill({ skillId: skill.skillId, title: skill.title, status: skill.pathStatus })}
            aria-label={`${skill.buttonLabel}: ${skill.title}`}
            style={{ flex: '0 0 auto', minHeight: 44, padding: '10px 15px', border: 0, borderRadius: 9, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.58 : 1 }}
          >
            {skill.buttonLabel}
          </button>
        )}
      </div>
      {skill.strengthen && typeof onChooseSkill === 'function' && (
        // The repair, not the blocked skill: the student cannot work on the
        // blocked one yet, so the door offered is the one that opens it.
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChooseSkill(skill.strengthen)}
          style={{ marginTop: 8, minHeight: 44, padding: '9px 13px', borderRadius: 9, border: `2px solid ${skill.strengthen.tone}`, background: 'var(--mm-surface)', color: toneTextColor(skill.strengthen.tone), fontWeight: 850, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' }}
        >
          <span aria-hidden="true">{skill.strengthen.symbol} </span>Practise {skill.strengthen.title}
        </button>
      )}
    </li>
  );
}

export function MyMathPathTopicBrowser({
  pathOptions = null,
  courseId = null,
  masteryProfilesByTEKS = {},
  skillProgressByTEKS = {},
  // The map's coverage gate. Null while coverage is still loading, which
  // closes no door here — the launcher fails closed on its own.
  isCovered = null,
  onChooseSkill = null,
  onBack = null,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState(null);
  // A group the student opened or closed by hand; anything else follows the
  // default (the unit the class is on is open).
  const [toggled, setToggled] = useState({});
  const headingRef = useRef(null);

  // Arriving here moves focus — and the page — to the browser's heading, so a
  // keyboard or screen-reader user lands on what they asked for.
  useEffect(() => { headingRef.current?.focus(); }, []);

  const browser = useMemo(() => buildTopicBrowser({
    courseId, pathOptions, masteryProfilesByTEKS, skillProgressByTEKS, isCovered, groupBy, query,
  }), [courseId, pathOptions, masteryProfilesByTEKS, skillProgressByTEKS, isCovered, groupBy, query]);

  if (!browser) return null;

  const anyClassHere = browser.groups.some((group) => group.classHere);
  const isOpen = (group, index) => {
    if (browser.searching) return true;
    if (Object.prototype.hasOwnProperty.call(toggled, group.id)) return toggled[group.id];
    return anyClassHere ? group.classHere : index === 0;
  };

  return (
    <section aria-labelledby="topic-browser-title" style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px', textAlign: 'left' }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ minHeight: 44, padding: '9px 14px', marginBottom: 12, borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer' }}
        >
          ← Back to your path
        </button>
      )}
      <h2 id="topic-browser-title" ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 24, color: 'var(--mm-text-strong)', outline: 'none' }}>
        All topics in {browser.courseLabel}
      </h2>
      <p style={{ margin: '4px 0 0', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.55 }}>
        Every skill in your course{browser.grouping === TOPIC_GROUPING.UNIT ? ', in the order your class meets each unit' : ', grouped by topic'}.
        {' '}Open skills can be practised now; the others say why they are not open yet.
      </p>

      <div role="search" style={{ marginTop: 14 }}>
        <label htmlFor="topic-browser-search" style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 850, color: 'var(--mm-text-muted)' }}>
          Search by name
        </label>
        <input
          id="topic-browser-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “equations” or “graph”"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-input-bg)', color: 'var(--mm-input-text)', fontSize: 16 }}
        />
      </div>

      {browser.groupOptions.length > 1 && (
        <div role="group" aria-label="Group skills" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {browser.groupOptions.map((option) => {
            const pressed = browser.grouping === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={pressed}
                onClick={() => setGroupBy(option)}
                style={{ minHeight: 44, padding: '8px 15px', borderRadius: 999, border: `1px solid ${pressed ? 'var(--mm-primary-border)' : 'var(--mm-border)'}`, background: pressed ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', color: pressed ? 'var(--mm-primary-text)' : 'var(--mm-text)', fontWeight: 850, cursor: 'pointer' }}
              >
                {GROUPING_LABEL[option]}
              </button>
            );
          })}
        </div>
      )}

      <p role="status" aria-live="polite" style={{ margin: '12px 0', fontSize: 13, color: 'var(--mm-text-muted)', fontWeight: 750 }}>
        {browser.searching
          ? `${browser.matchedSkills} of ${browser.totalSkills} skills match.`
          : `${browser.totalSkills} skills · ${browser.masteredSkills} mastered · ${browser.openSkills} open to practise now.`}
      </p>

      {browser.searching && !browser.groups.length && (
        <p style={{ margin: '0 0 12px', padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface-sunken)', color: 'var(--mm-text)', fontSize: 14 }}>
          No skills match “{browser.query.trim()}”. Try a shorter word, or the name of a unit.
        </p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {browser.groups.map((group, index) => {
          const open = isOpen(group, index);
          const panelId = `topic-group-${group.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
          return (
            <section key={group.id} data-topic-group={group.id} style={{ border: '1px solid var(--mm-border)', borderRadius: 14, background: 'var(--mm-surface)', overflow: 'hidden' }}>
              <h3 style={{ margin: 0 }}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setToggled((current) => ({ ...current, [group.id]: !open }))}
                  style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: 0, background: group.classHere ? 'var(--mm-surface-tint)' : 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--mm-text-strong)', font: 'inherit' }}
                >
                  {group.number != null && <span aria-hidden="true" style={badge}>{group.number}</span>}
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15.5, fontWeight: 900, lineHeight: 1.35 }}>{group.title}</span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 750, color: group.classHere ? 'var(--mm-primary-text)' : 'var(--mm-text-muted)' }}>
                      {group.standing ? `${group.standing} · ` : ''}{group.masteredCount} of {group.total} mastered
                      {browser.searching ? ` · ${group.skills.length} ${group.skills.length === 1 ? 'match' : 'matches'}` : ''}
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--mm-text-muted)' }}>{open ? '▴' : '▾'}</span>
                </button>
              </h3>
              {open && (
                <ul id={panelId} style={{ margin: 0, padding: 0 }}>
                  {group.skills.map((skill) => (
                    <TopicSkill key={skill.skillId} skill={skill} grouping={browser.grouping} onChooseSkill={onChooseSkill} disabled={disabled} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

export default MyMathPathTopicBrowser;
