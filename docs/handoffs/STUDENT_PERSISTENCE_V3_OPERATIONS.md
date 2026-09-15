# Student Persistence V3 operations

Student Submit/Step remains local-first: MathMaster computes the local result,
waits only for the IndexedDB outbox write, updates the screen, and delivers to
`ingestStudentSubmissions` in the background. A 30-minute outage therefore
leaves work on the Chromebook, visibly marked **Waiting for connection**, and
retries it after reconnect without using the former browser grade transaction.

Known queued work, active checkpoints, or a strong session/canonical gap marks
an ordinary assignment **Sync pending**. MathMaster may show non-final progress,
but withholds a final Classroom passback until the evidence clears. Secure Test
Cycle continues to use its own release authority.

## Cloud Shell: targeted deploy and verification

From the repository root, the owner can copy and run exactly:

```sh
npm ci && npm run deploy:persistence
```

That command deploys only `ingestStudentSubmissions` and
`reportStudentDeviceQueue`, then fails unless both underlying Gen 2 Cloud Run
services grant `allUsers` the transport-only `roles/run.invoker` role. It does
not deploy the whole function fleet and does not change Firebase authorization.

To verify production without deploying anything:

```sh
npm run verify:persistence-production
```

Override the defaults only for another environment, for example:
`FIREBASE_PROJECT=my-project FUNCTION_REGION=us-central1 npm run verify:persistence-production`.
