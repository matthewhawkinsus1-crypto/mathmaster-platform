MathMaster CCMR Standards Explorer + Student Path UX Upgrade
Date: 2026-08-23

WHERE TO PUT THIS
-----------------
Extract this ZIP into the MathMaster project ROOT — the same folder that contains package.json.
Allow the archive to overwrite matching files. The folders inside this ZIP are already correct.

WHAT THIS PACKAGE INCLUDES
--------------------------
1. Student greeting uses roster/display name before student ID.
2. Recommended-for-you cards deep-link to the exact selected Path skill after secure coverage loads.
3. Exact CCMR reference layer:
   - ACT: official numbered CCRS codes when a specific match is justified (for example F 502).
   - Digital SAT: official College Board domain + skill names; no invented standard numbers.
   - TSIA2: official strand + testing-point language; no invented standard numbers.
   - ASVAB: official AR/MK subtest codes plus the applicable mathematics topic.
4. TEKS/CCMR question details show official references and expandable 'How this Texas skill ties in' explanations.
5. Path skill chooser shows the assessment reference BEFORE a student chooses SAT/ACT/TSIA2/ASVAB practice.
6. Student CCMR tab can search by ACT code, SAT skill, TSIA2 strand/testing point, ASVAB AR/MK, TEKS, or skill name.
   Search results include not-yet-open aligned skills, but locked work cannot be launched.
7. Teacher Path Simulator can search the same CCMR reference system and inspect the matching Texas skill.
8. Teacher read-only student My Math Path view now includes the CCMR tab. Search/inspection works, but teachers cannot
   change the student's goals or start work from that read-only view.
9. Teacher Assessment Skill Inspector shows the same official reference(s), overlap, exclusions, and evidence context.

DEPLOYMENT SCOPE
----------------
This package changes browser/source data and tests only. It does NOT change Cloud Functions or Firestore rules.
After pushing to GitHub main, rebuild and deploy Firebase Hosting only.

IMPORTANT HONESTY RULE
----------------------
Not every assessment publishes TEKS-style numbered math standards. MathMaster does not fabricate them.
Domain-level fallbacks are explicitly labeled as broad connections when a narrower official public reference has not
been selected yet.
