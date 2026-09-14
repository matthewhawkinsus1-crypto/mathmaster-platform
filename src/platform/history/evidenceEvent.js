// Moved to Cloud Functions shared code, and re-exported here.
//
// The deadline finalizer builds evidence on the server from its OWN grading
// result. One definition keeps a recovered attempt's evidence identical to the
// evidence the same response would have produced through manual Submit.
export * from '../../../functions/shared/attemptEvidenceEvent.mjs';
