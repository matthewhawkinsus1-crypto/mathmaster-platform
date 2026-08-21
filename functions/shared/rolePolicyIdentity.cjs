// The root-administrator identity, in the one form CommonJS can read.
//
// `functions/lib/*.js` is CommonJS and cannot `import` an .mjs at module load
// time, but this value is needed synchronously while the module initialises.
// A test asserts this file and rolePolicy.mjs declare the same address, so the
// duplication cannot drift into two different administrators.
module.exports = { ROOT_ADMIN_EMAIL: 'matthew.hawkins@desotoisd.org' };
