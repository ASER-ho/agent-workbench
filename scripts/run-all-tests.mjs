// Sequential runner for every `test:*` npm script — single entry: `npm test`.
// Ensures the app is built before suites that consume out/ (privacy scan,
// Electron E2E). Exits non-zero if any suite fails.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outMain = resolve(root, 'out', 'main', 'index.js')

const suites = Object.entries(pkg.scripts).filter(([name]) => name.startsWith('test:'))
if (suites.length === 0) {
  console.error('No test:* scripts found in package.json')
  process.exit(1)
}

// Suites that read out/ (privacy scan over `out`, Electron E2E launching the app).
const needsBuild = ['test:privacy', 'test:electron']
if (needsBuild.some(n => suites.some(([name]) => name === n)) && !existsSync(outMain)) {
  console.log('out/main/index.js missing — building app first (npm run build)…')
  const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (b.status !== 0) {
    console.error(`build failed (exit ${b.status})`)
    process.exit(b.status ?? 1)
  }
}

let failed = 0
for (const [name, cmd] of suites) {
  console.log(`\n=== ${name} → ${cmd} ===`)
  const r = spawnSync('npm', ['run', name], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`FAIL ${name} (exit ${r.status})`)
    failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${suites.length} suites failed`)
  process.exit(1)
}
console.log(`\nAll ${suites.length} test suites passed`)
