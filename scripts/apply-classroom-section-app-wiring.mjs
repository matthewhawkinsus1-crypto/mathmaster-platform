import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

const instructionMarker = "<td style={{ fontSize: '12px' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}`";
const activityMarker = "<td style={{ fontSize: '12px', lineHeight: 1.45 }}>Total {formatTime(activity.totalTimeSeconds || 0)}";
const sectionMarker = "<td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.warmup.total ? `${sectionGrades.warmup.score}%` : '—'}</td>";
const detailsMarker = "<td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))}";

const instructionStart = source.indexOf(instructionMarker);
const activityStart = source.indexOf(activityMarker);
const sectionStart = source.indexOf(sectionMarker);
const detailsStart = source.indexOf(detailsMarker);

if ([instructionStart, activityStart, sectionStart, detailsStart].some((value) => value < 0)) {
  throw new Error('Could not find every gradebook column seam; refusing to rewrite App.jsx.');
}
if (!(instructionStart < activityStart && activityStart < sectionStart && sectionStart < detailsStart)) {
  throw new Error('Gradebook cells are not in the expected pre-fix order; refusing to guess.');
}

const instructionCells = source.slice(instructionStart, activityStart);
const activityCells = source.slice(activityStart, sectionStart);
const sectionCells = source.slice(sectionStart, detailsStart);
source = source.slice(0, instructionStart)
  + sectionCells
  + instructionCells
  + activityCells
  + source.slice(detailsStart);

fs.writeFileSync(path, source);
console.log('Aligned gradebook row cells with Overall, Warm-Up, Classwork, Practice, DOL headers.');
