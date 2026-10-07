import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPathMap, explainPacing } from '../../platform/path/pathMap.js';
import PracticeAsMenu from './PracticeAsMenu.jsx';
import MyMathPathTopicBrowser from './MyMathPathTopicBrowser.jsx';
import {
  describeCoursePathPass,
  summarizeCoursePathPasses,
} from '../../platform/path/pathPassPresentation.js';
import { toneTextColor } from '../../theme/themeColorRoles.js';
import { masteredSectionView } from '../../platform/path/masteredSection.js';

// The student's actual learning path.
//
// It draws the decision the engine already made. There is no ranking, no
// prerequisite check and no date arithmetic in this file — all of that arrives
// in `pathOptions`, the same object Recommended for You is built from, which is
// what makes it impossible for the two screens to disagree about a skill.
//
// The shape on screen is the point. A student should see that their work
// branches, that being blocked on one thing leaves the others open, and that
// something is coming on a date the class actually reaches.

const section = {
  border: '1px solid var(--mm-border)', borderRadius: 14, background: 'var(--mm-surface)',
  padding: '16px 16px 18px', marginBottom: 14, textAlign: 'left',
};

const sectionHeading = {
  margin: '0 0 4px', fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--mm-text-muted)',
};

const nodeRow = { display: 'flex', flexWrap: 'wrap', gap: 12 };

// A card that is not a door still has to say WHY it is not a door, and the two
// reasons must not look alike. "Your class gets here in three weeks" is a
// calendar fact about the course; "you need an earlier skill first" is a
// statement about the student. Rendering both in the same grey was how a
// pacing restriction came to read as mathematical failure.
const cardStyle = (tone, selectable, blockedBy = null) => ({
  flex: '1 1 220px', minWidth: 0, padding: '13px 14px', borderRadius: 12,
  border: selectable ? `2px solid ${tone}`
    : blockedBy === 'pacing' ? '2px dashed var(--mm-primary-border)'
      : '2px solid var(--mm-border-soft)',
  background: selectable ? 'var(--mm-surface)' : blockedBy === 'pacing' ? 'var(--mm-surface-tint)' : 'var(--mm-surface-sunken)',
  textAlign: 'left', cursor: selectable ? 'pointer' : 'default',
  color: 'var(--mm-text-strong)', font: 'inherit',
});

// What the "why" disclosure is called depends on what is actually true. A
// REMEDIATION card has a Start button on it; labelling its disclosure
// "Why is this locked?" told the student the opposite of what the button said.
const whyLabel = (blockedBy) => (
  blockedBy === 'pacing' ? 'Why is this later?'
    : blockedBy === 'teacher' ? 'Why is this closed?'
      : blockedBy === 'prerequisite' ? 'Why is this locked?'
        : 'Why this comes first'
);

function PathNode({ node, onChoose, practiceAs, disabled = false, passProgress = null }) {
  const [showWhy, setShowWhy] = useState(false);
  const clickable = node.selectable && typeof onChoose === 'function' && !disabled;
  // A retention check is a two-question check, not a practice round, so its
  // card carries no Level badge and its button says what it starts.
  const retentionCheck = Boolean(node.isRetentionCheck);
  const pass = retentionCheck
    ? { hasCompletedPass: false, levelLabel: null, buttonLabel: node.actionLabel }
    : describeCoursePathPass(passProgress || {}, { mastered: node.status === 'mastered' });
  const showEvidence = node.selectable && !node.lockedExplanation && !node.isRetentionCheck
    && Array.isArray(node.evidence) && node.evidence.length > 0;
  // Said once: when the evidence already places the skill in its unit ("your
  // class is working on this now (Module 2: …)"), the unit line would repeat it.
  const showUnit = Boolean(node.unitTitle)
    && !(showEvidence && node.evidence.some((item) => item.text.includes(node.unitTitle)));

  return (
    <div style={{
      ...cardStyle(node.tone, node.selectable && !disabled, node.blockedBy),
      opacity: disabled && node.selectable ? 0.58 : 1,
      ...(pass.hasCompletedPass ? {
        borderWidth: 3,
        background: 'var(--mm-success-subtle)',
        boxShadow: '0 6px 18px rgba(19,115,51,0.12)',
      } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>{node.symbol}</span>
        <strong style={{ fontSize: 16 }}>{node.title}</strong>
        <span style={{ fontSize: 11, fontWeight: 800, color: toneTextColor(node.tone), textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {node.statusLabel}
        </span>
      </div>

      {pass.hasCompletedPass && (
        <div
          role="status"
          style={{
            margin: '8px 0 10px',
            padding: '10px 11px',
            border: `2px solid ${pass.tone}`,
            borderRadius: 10,
            background: pass.background,
            color: toneTextColor(pass.tone),
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '.045em', textTransform: 'uppercase' }}>
            {pass.completedLabel}
          </div>
          <div style={{ marginTop: 3, fontSize: 13, fontWeight: 900 }}>
            {pass.nextLabel}
          </div>
          {node.status !== 'mastered' && (
            <div style={{ marginTop: 4, color: 'var(--mm-text)', fontSize: 11.5, lineHeight: 1.45 }}>
              This practice round is done. Levels are how deep your practice goes; Mastered is earned separately from your answers.
            </div>
          )}
        </div>
      )}

      {!pass.hasCompletedPass && pass.levelLabel && node.selectable && !disabled && (
        <div style={{ margin: '4px 0 9px', color: 'var(--mm-primary-text)', fontSize: 11.5, fontWeight: 850 }}>
          {pass.levelLabel}
        </div>
      )}
      {node.description && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--mm-text)', lineHeight: 1.5 }}>{node.description}</p>
      )}
      {/* The unit the class calls it by — computed for every card, and now
          shown. */}
      {showUnit && (
        <p data-class-unit style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.45, color: 'var(--mm-text-muted)', fontWeight: 750 }}>
          Class unit · {node.unitTitle}
        </p>
      )}
      {/* WHY, WITH THE EVIDENCE NAMED, on a card the student can open. The
          list restates the engine's reason with what drove it, so it replaces
          the reason rather than repeating it. Blocked cards keep their reason
          and their own "why" disclosure; a retention check keeps its own. */}
      {showEvidence ? (
        <div data-recommendation-evidence style={{ margin: '0 0 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>Why this is suggested</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--mm-text)', lineHeight: 1.5 }}>
            {node.evidence.map((item) => <li key={`${item.kind}:${item.text}`}>{item.text}</li>)}
          </ul>
        </div>
      ) : (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{node.reason}</p>
      )}

      {/* A calendar restriction is a date, so show the date. "Not in your
          learning window yet" with no number is indistinguishable from a
          verdict. The sentence is the topic browser's too (explainPacing). */}
      {node.blockedBy === 'pacing' && (
        <p style={{ margin: '-4px 0 10px', fontSize: 12, color: 'var(--mm-primary-text)', fontWeight: 700 }}>
          {explainPacing(node)}
        </p>
      )}

      {node.lockedExplanation && (
        <div style={{ marginBottom: 10 }}>
          <button
            type="button"
            aria-expanded={showWhy}
            onClick={() => setShowWhy((current) => !current)}
            style={{ minHeight: 44, minWidth: 44, padding: '0 2px', border: 0, background: 'transparent', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
          >
            {showWhy ? 'Hide' : whyLabel(node.blockedBy)}
          </button>
          {showWhy && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--mm-text)', lineHeight: 1.55 }}>{node.lockedExplanation}</p>
          )}
        </div>
      )}

      {node.strengthen && (
        // The repair, not the blocked skill: the student cannot work on the
        // blocked one, so offering it would be an invitation to fail.
        <button
          type="button"
          onClick={() => onChoose?.(node.strengthen)}
          style={{ ...cardStyle(node.strengthen.tone, true), display: 'block', width: '100%', minHeight: 44, marginBottom: 8, padding: '10px 12px' }}
        >
          <span aria-hidden="true">{node.strengthen.symbol}</span>{' '}
          <strong>{node.strengthen.title}</strong>{' '}
          <span style={{ fontSize: 11, fontWeight: 800, color: toneTextColor(node.strengthen.tone), textTransform: 'uppercase' }}>
            {node.strengthen.statusLabel}
          </span>
        </button>
      )}

      {disabled && node.selectable && (
        <div style={{ marginTop: 2, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', fontSize: 12, fontWeight: 800 }}>
          Finish your weekly target first
        </div>
      )}

      {clickable && (
        <button
          type="button"
          onClick={() => onChoose(node)}
          style={{ padding: '9px 14px', minHeight: 44, border: 0, borderRadius: 8, background: node.tone, color: '#fff', fontWeight: 900, cursor: 'pointer' }}
        >
          {pass.buttonLabel}
        </button>
      )}

      {/* Only rendered where a legitimate assessment alignment exists — the
          menu returns nothing rather than showing four disabled buttons. A
          retention check is the course skill itself, so it offers no other
          format. */}
      {clickable && practiceAs && !retentionCheck && (
        <PracticeAsMenu
          skillId={node.skillId}
          pathOptions={practiceAs.pathOptions}
          assessmentEvidence={practiceAs.assessmentEvidence}
          directIndex={practiceAs.directIndex}
          coverage={practiceAs.coverage}
          goals={practiceAs.goals}
          teacherPriorities={practiceAs.teacherPriorities}
          onChoose={practiceAs.onChoose}
        />
      )}
    </div>
  );
}

function PathSection({ title, note, nodes, onChoose, practiceAs, disabled = false, skillProgressByTEKS = {}, footer = null }) {
  if (!nodes.length) return null;
  return (
    <section style={section}>
      <h3 style={sectionHeading}>{title}</h3>
      {note && <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--mm-text-muted)' }}>{note}</p>}
      <div style={nodeRow}>
        {nodes.map((node) => (
          <PathNode
            key={node.skillId}
            node={node}
            onChoose={onChoose}
            practiceAs={practiceAs}
            disabled={disabled}
            passProgress={skillProgressByTEKS[node.code] || null}
          />
        ))}
      </div>
      {footer}
    </section>
  );
}

// "Show all N mastered skills" / "Show fewer". Drawn only when the section has
// more mastered skills than its preview (masteredSection.js).
function MasteredToggle({ view, onToggle }) {
  if (!view.collapsible) return null;
  return (
    <button
      type="button"
      aria-expanded={view.expanded}
      onClick={onToggle}
      style={{
        marginTop: 12, minHeight: 44, padding: '10px 15px', borderRadius: 10,
        border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)',
        color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer', font: 'inherit',
      }}
    >
      {view.toggleLabel}
    </button>
  );
}

export const StudentLearningPath = ({
  pathOptions = null,
  onChooseSkill = null,
  // The retention scheduler's pending checks (evaluateStudentRetentionSchedule
  // `pendingProbes`). They fill "Quick retention check"; without them that
  // section is empty, which is what it always was before they were passed.
  retentionDue = null,
  // Everything the "Practice this skill as…" menu needs. Absent means the
  // menu is not offered at all, which is the honest state before CCMR
  // evidence has been loaded.
  assessmentContext = null,
  onPracticeAs = null,
  limits = undefined,
  // Whether the secure bank can actually issue work for a skill. Without it
  // the map happily draws a Start button in front of a standard with no
  // content, and the student learns about it only after clicking.
  isCovered = null,
  // Weekly Path is the actual student commitment. Ordinary classroom assignment
  // TEKS no longer create an invisible permanent gate. While a weekly target is
  // unfinished, this screen says exactly how many sessions remain and keeps
  // free-choice cards closed so practice launched without the weekly slot key
  // cannot look complete while failing to count.
  freeChoiceLocked = false,
  freeChoiceMessage = null,
  // Server-owned completed course Path passes. This is intentionally separate
  // from mastery: a full Path can be completed before the evidence engine is
  // ready to make the stronger "Mastered" claim.
  skillProgressByTEKS = {},
  // The unified mastery profiles the wheel and the skill card read. Cards name
  // their evidence from these ("58% from 6 questions"), and the topic browser
  // shows each skill's mastery status from them.
  masteryProfilesByTEKS = null,
}) => {
  // The map is a handful of nearby cards; "Browse all topics" is the rest of
  // the course, in the same tab and through the same launcher.
  const [view, setView] = useState('path');
  const browseButtonRef = useRef(null);
  const returningFromBrowser = useRef(false);
  useEffect(() => {
    if (view !== 'path' || !returningFromBrowser.current) return;
    returningFromBrowser.current = false;
    browseButtonRef.current?.focus();
  }, [view]);

  const map = useMemo(
    () => buildPathMap(pathOptions, {
      ...(limits ? { limits } : {}),
      ...(isCovered ? { isCovered } : {}),
      ...(Array.isArray(retentionDue) ? { retentionDue } : {}),
      ...(masteryProfilesByTEKS ? { masteryProfilesByTEKS } : {}),
    }),
    [pathOptions, limits, isCovered, retentionDue, masteryProfilesByTEKS],
  );
  const passSummary = useMemo(
    () => summarizeCoursePathPasses(skillProgressByTEKS),
    [skillProgressByTEKS],
  );

  const practiceAs = useMemo(() => (assessmentContext && onPracticeAs ? {
    pathOptions,
    assessmentEvidence: assessmentContext.assessmentEvidence || {},
    directIndex: assessmentContext.directIndex || null,
    coverage: assessmentContext.coverage,
    goals: assessmentContext.goals || [],
    teacherPriorities: assessmentContext.teacherPriorities || [],
    onChoose: onPracticeAs,
  } : null), [assessmentContext, onPracticeAs, pathOptions]);

  // The map returns every mastered skill; the section previews some of them.
  const [showAllMastered, setShowAllMastered] = useState(false);
  const masteredView = masteredSectionView(map?.mastered, { expanded: showAllMastered });

  if (!pathOptions) {
    return (
      <section style={{ ...section, maxWidth: 940, margin: '24px auto' }}>
        <h3 style={sectionHeading}>Your path</h3>
        <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          MathMaster is still resolving your course and learning path. If this remains here, your class assignment needs
          to be checked by your teacher or administrator.
        </p>
      </section>
    );
  }

  // ONE launcher for the map and the browser: the same card shape reaches
  // onChooseSkill, so the browser starts a session exactly as a map card does.
  const choose = onChooseSkill ? (node) => onChooseSkill({
    skillId: node.skillId,
    title: node.title,
    status: node.status,
    remediationTarget: node.strengthen?.skillId || null,
    // Read by pathCardLaunchOptions: a retention-check card starts the check.
    isRetentionCheck: Boolean(node.isRetentionCheck),
  }) : null;

  if (view === 'topics') {
    return (
      <MyMathPathTopicBrowser
        pathOptions={pathOptions}
        masteryProfilesByTEKS={masteryProfilesByTEKS || {}}
        skillProgressByTEKS={skillProgressByTEKS}
        isCovered={isCovered}
        onChooseSkill={choose}
        disabled={freeChoiceLocked}
        onBack={() => { returningFromBrowser.current = true; setView('path'); }}
      />
    );
  }

  const browseButton = (
    <button
      ref={browseButtonRef}
      type="button"
      onClick={() => setView('topics')}
      style={{ flex: '0 0 auto', minHeight: 44, padding: '10px 15px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer' }}
    >
      Browse all topics
    </button>
  );

  if (!map || map.isEmpty) {
    return (
      <section style={{ ...section, maxWidth: 940, margin: '24px auto' }}>
        <h3 style={sectionHeading}>Your path</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          Nothing is open on your path just yet. Try a practice session from your mastery overview to build some
          evidence, or browse every topic in your course to see what is coming.
        </p>
        {browseButton}
      </section>
    );
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px' }}>
      <header style={{ textAlign: 'left', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 24, color: 'var(--mm-text-strong)' }}>Your path</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.55 }}>
            <strong>{map.masteredCount} of {map.totalSkills}</strong> skills mastered.
            {passSummary.totalCompletedPasses > 0 && (
              <> · <strong>{passSummary.totalCompletedPasses}</strong> practice {passSummary.totalCompletedPasses === 1 ? 'round' : 'rounds'} done across <strong>{passSummary.completedSkillCount}</strong> {passSummary.completedSkillCount === 1 ? 'skill' : 'skills'}.</>
            )}
            {map.pacingIsProvisional ? ' Your class position is provisional, so timing may shift.' : ''}
          </p>
        </div>
        {browseButton}
      </header>

      {/*
        This banner used to appear only when free practice was locked, in warning
        colours, to tell a student what they were not allowed to do yet. It now
        states the opposite fact — everything here is open — and only shows when
        there is a weekly target worth naming alongside it.
      */}
      {freeChoiceMessage && (
        <div role="status" style={{ margin: '0 0 16px', padding: '12px 14px', borderRadius: 11, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)', color: 'var(--mm-primary-text)', fontSize: 13.5, fontWeight: 750, lineHeight: 1.55 }}>
          {freeChoiceMessage}
        </div>
      )}

      <PathSection
        title="Current learning"
        nodes={map.focus}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      <PathSection
        title="Also open to you"
        note={'Pick any of these. They stay open even when something else needs work first.'}
        nodes={map.branches}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      <PathSection
        title="Needs support"
        note="These build on something else. Strengthening that first is the way in."
        nodes={map.needsSupport}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      <PathSection
        title="Coming up next"
        nodes={map.comingUp}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      <PathSection
        title="Challenge"
        note="Ahead of your class, and earned."
        nodes={map.challenge}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      {/* Retention sits between "mastered" and "current": it is work on a skill
          the student has already shown, offered briefly and with a reason, so it
          does not read as the platform having forgotten. */}
      <PathSection
        title="Quick retention check"
        note="You have already shown these. A couple of questions is enough to keep them counted."
        nodes={map.retentionDue}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
      />
      <PathSection
        title="Mastered"
        note={'Yours already. You can practise any of them again whenever you want to.'}
        nodes={masteredView.visible}
        onChoose={choose}
        practiceAs={practiceAs}
        disabled={freeChoiceLocked}
        skillProgressByTEKS={skillProgressByTEKS}
        footer={<MasteredToggle view={masteredView} onToggle={() => setShowAllMastered((current) => !current)} />}
      />
    </div>
  );
};

export default StudentLearningPath;
