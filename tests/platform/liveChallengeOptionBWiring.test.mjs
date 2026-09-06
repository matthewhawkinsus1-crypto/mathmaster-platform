import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readRequired = (file) => {
  assert.equal(existsSync(file), true, `${file} must exist for Live Challenge Option B`);
  return readFileSync(file, 'utf8');
};

test('Cloud Functions enters through the additive Live Challenge experience wrapper', () => {
  const pkg = JSON.parse(readFileSync('functions/package.json', 'utf8'));
  assert.equal(pkg.main, 'entry.js');
  const entry = readRequired('functions/entry.js');
  assert.match(entry, /require\(['"]\.\/index\.js['"]\)/);
  assert.match(entry, /configureLiveChallengeExperience/);
  assert.match(entry, /getLiveChallengeExperience/);
  assert.match(entry, /adjustLiveChallengeExperienceScore/);
});

test('the existing backend remains re-exported instead of being replaced', () => {
  const entry = readRequired('functions/entry.js');
  assert.match(entry, /Object\.assign\(exports,\s*base\)/);
  assert.doesNotMatch(entry, /delete\s+base\./);
});

test('the teacher experience exposes scoring, identity, audio and question-library controls', () => {
  const teacher = readFileSync('src/components/liveChallenge/LiveChallengeTeacher.jsx', 'utf8');
  assert.match(teacher, /LiveChallengeAudioDirector/);
  assert.match(teacher, /ChallengeQuestionLibrary/);
  assert.match(teacher, /speedInfluencePercent/);
  assert.match(teacher, /playerDisplayMode/);
  // JSX may encode the literal ampersand as &amp;; both render the same heading.
  assert.match(teacher, /Scoring\s*(?:&|&amp;)\s*Competition/i);
  assert.match(teacher, /Music/);
  assert.match(teacher, /Announcer/);
  assert.match(teacher, /Effects/);
  assert.match(teacher, /Mute All/i);
});

test('the question library reuses the secure Path importer', () => {
  const library = readRequired('src/components/liveChallenge/ChallengeQuestionLibrary.jsx');
  assert.match(library, /seedPathQuestionBank/);
  assert.match(library, /Upload JSON/i);
  assert.match(library, /Import from assignment/i);
  assert.match(library, /Paste \/ create JSON/i);
  assert.doesNotMatch(library, /disabled[^>]*>\s*Generate/i);
});

test('the Dark Arena audio director is host-side and uses the committed V6 pack', () => {
  const audio = readRequired('src/platform/liveChallenge/liveChallengeAudio.js');
  assert.match(audio, /live-challenge\/v6\/live-challenge-audio-manifest-v6\.json/);
  assert.match(audio, /new_leader\.wav/);
  assert.match(audio, /2000/);
  const student = readFileSync('src/components/liveChallenge/LiveChallengeStudent.jsx', 'utf8');
  assert.doesNotMatch(student, /LiveChallengeAudioDirector/);
});

test('service exposes experience callables without duplicating score logic in the browser', () => {
  const service = readFileSync('src/platform/liveChallenge/liveChallengeService.js', 'utf8');
  assert.match(service, /configureLiveChallengeExperience/);
  assert.match(service, /getLiveChallengeExperience/);
  assert.doesNotMatch(service, /speedBonus\s*=|pointsAwarded\s*=/);
});

test('configured speed is returned synchronously while the trigger remains a retry fallback', () => {
  const entry = readRequired('functions/entry.js');
  assert.match(entry, /legacySubmitLiveChallengeResponse\.run\(request\)/);
  assert.match(entry, /exports\.submitLiveChallengeResponse\s*=\s*onCall/);
  assert.match(entry, /applyExperienceSpeedAdjustment/);
  assert.match(entry, /fallback trigger/i);
});

test('Warm-Up waiting is a focused overlay, not a contradictory panel above standard work', () => {
  const gate = readFileSync('src/components/liveChallenge/WarmupChallengeGate.jsx', 'utf8');
  assert.match(gate, /position:\s*['"]fixed['"]/);
  assert.match(gate, /teacher_choice_pending/);
  assert.match(gate, /standard Warm-Up/i);
});
