import { normalizeStudentSupportProfile } from './supportProfileResolver.js';

/*
 * Phase 4 — bulk import of IEP / 504 / EB support profiles from a district
 * spreadsheet export. Column names vary by district and by export tool, so each
 * field accepts several spellings rather than forcing a teacher to rename
 * headers by hand.
 */

const HEADER_ALIASES = {
  studentId: ['student_id', 'studentid', 'student id', 'id'],
  sped: ['sped', 'is_sped', 'special_education'],
  section504: ['504', 'section_504', 'section504', 'is_504'],
  emergentBilingual: ['eb', 'ell', 'emergentbilingual', 'emergent_bilingual', 'esl'],
  ebLanguage: ['language', 'eb_language', 'home_language'],
  textToSpeech: ['tts', 'text_to_speech', 'texttospeech', 'read_aloud'],
  spanishTranslation: ['translation', 'spanish_translation', 'spanish'],
  glossaryLookup: ['glossary', 'glossary_lookup'],
  highContrast: ['high_contrast', 'highcontrast'],
  calculator: ['calculator', 'calc'],
  calculatorOverrideComputation: ['calc_override', 'calculator_override'],
  graphicOrganizer: ['graphic_organizer', 'organizer'],
  reducedChoices: ['reduced_choices', 'reduced_answer_choices'],
  extendedTimeMultiplier: ['extended_time', 'time_multiplier', 'extra_time'],
  extraAttempts: ['extra_attempts', 'additional_attempts'],
  isModifiedCurriculum: ['modified_curriculum', 'is_modified', 'modified'],
  modifiedTeksCode: ['modified_teks', 'modified_standard'],
  maxDokCap: ['max_dok', 'dok_cap'],
  authorizedBy: ['authorized_by', 'case_manager', 'authorized'],
};

/** Case/spacing-insensitive column lookup across every accepted alias. */
const pick = (row, field) => {
  const aliases = HEADER_ALIASES[field] || [field];
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const match = keys.find((key) => key.trim().toLowerCase().replace(/\s+/g, '_') === alias);
    if (match !== undefined && row[match] !== undefined && row[match] !== '') return row[match];
  }
  return undefined;
};

const parseBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'x'].includes(text);
};

/**
 * Parses already-split spreadsheet rows (objects keyed by header) into
 * validated support profiles. Rows that cannot be identified are reported
 * rather than silently dropped — a missing student is a compliance gap.
 */
export const importSupportProfilesFromCSV = (csvRows = []) => {
  const profiles = [];
  const errors = [];
  const seenIds = new Set();

  csvRows.forEach((row, index) => {
    const rawId = pick(row, 'studentId');
    if (!rawId) {
      errors.push(`Row ${index + 2}: no student ID column found (looked for ${HEADER_ALIASES.studentId.join(', ')}).`);
      return;
    }
    const studentId = String(rawId).trim();
    if (seenIds.has(studentId.toUpperCase())) {
      errors.push(`Row ${index + 2}: duplicate entry for ${studentId} — only the first was imported.`);
      return;
    }
    seenIds.add(studentId.toUpperCase());

    profiles.push(normalizeStudentSupportProfile({
      studentId,
      programEligibility: {
        sped: parseBool(pick(row, 'sped')),
        section504: parseBool(pick(row, 'section504')),
        emergentBilingual: parseBool(pick(row, 'emergentBilingual')),
        ebLanguage: String(pick(row, 'ebLanguage') || 'es').toLowerCase().trim(),
      },
      accommodations: {
        textToSpeech: parseBool(pick(row, 'textToSpeech')),
        spanishTranslation: parseBool(pick(row, 'spanishTranslation')),
        glossaryLookup: parseBool(pick(row, 'glossaryLookup')),
        highContrast: parseBool(pick(row, 'highContrast')),
        calculator: parseBool(pick(row, 'calculator')),
        calculatorOverrideComputation: parseBool(pick(row, 'calculatorOverrideComputation')),
        graphicOrganizer: parseBool(pick(row, 'graphicOrganizer')),
        reducedChoices: parseBool(pick(row, 'reducedChoices')),
        extendedTimeMultiplier: Number(pick(row, 'extendedTimeMultiplier') || 1),
        extraAttempts: Number(pick(row, 'extraAttempts') || 0),
      },
      modification: {
        isModifiedCurriculum: parseBool(pick(row, 'isModifiedCurriculum')),
        modifiedTeksCode: pick(row, 'modifiedTeksCode') || null,
        maxDokCap: pick(row, 'maxDokCap') ? Number(pick(row, 'maxDokCap')) : null,
      },
      metadata: {
        updatedAt: Date.now(),
        authorizedBy: pick(row, 'authorizedBy') || 'CSV Import',
      },
    }));
  });

  return { successCount: profiles.length, profiles, errors };
};

/**
 * Minimal RFC4180-ish CSV splitter: handles quoted fields containing commas and
 * escaped double quotes, which district exports routinely produce in name and
 * notes columns.
 */
export const parseCsvText = (text = '') => {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else { inQuotes = false; }
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  if (!rows.length) return [];
  const [headers, ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((header, i) => [header.trim(), cells[i] ?? ''])));
};
