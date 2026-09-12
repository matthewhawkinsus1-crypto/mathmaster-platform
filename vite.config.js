import { spawnSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * A BUILD MUST BE ABLE TO NAME ITSELF.
 *
 * `npm run build:firebase` injects VITE_MATHMASTER_GIT_SHA and _BUILT_AT so a
 * deployed bundle can say which commit it came from. A plain `vite build` did
 * not, so any build made outside that script reported "unknown" — and "unknown"
 * is exactly the answer that makes a stale-cache report unanswerable.
 *
 * This fills them in when they are absent, and never overwrites them, so the
 * Firebase script stays authoritative for a real deploy. A checkout with no git
 * history simply leaves them unset and the stamp reads "dev", which is honest.
 */
const fillBuildIdentity = () => {
  if (!process.env.VITE_MATHMASTER_GIT_SHA) {
    const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' })
    const sha = result.status === 0 ? String(result.stdout || '').trim() : ''
    if (sha) process.env.VITE_MATHMASTER_GIT_SHA = sha
  }
  if (!process.env.VITE_MATHMASTER_BUILT_AT) {
    process.env.VITE_MATHMASTER_BUILT_AT = new Date().toISOString()
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  fillBuildIdentity()
  return {
    plugins: [react()],
  }
})
