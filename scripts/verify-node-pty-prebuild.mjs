import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron')
if (typeof electronExecutable !== 'string' || !existsSync(electronExecutable)) {
  throw new Error('Electron binary hydration failed')
}
console.log(`Electron binary verified: ${basename(electronExecutable)}`)

const packageRoot = dirname(require.resolve('node-pty/package.json'))
const prebuildRoot = join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`)
const nativeFiles = existsSync(prebuildRoot)
  ? readdirSync(prebuildRoot, { recursive: true }).filter(name => String(name).endsWith('.node'))
  : []

if (nativeFiles.length === 0) {
  throw new Error(`node-pty prebuild missing for ${process.platform}-${process.arch}`)
}

if (process.platform !== 'win32') {
  console.log(`node-pty prebuild verified for ${process.platform}-${process.arch}`)
  process.exit(0)
}

const pty = require('node-pty')
const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
const child = pty.spawn(shell, ['/d', '/s', '/c', 'echo agent-workbench-pty-ok'], {
  name: 'xterm-color',
  cols: 80,
  rows: 24,
  cwd: dirname(fileURLToPath(import.meta.url)),
  env: {
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    ComSpec: shell
  }
})

let output = ''
const timeout = setTimeout(() => {
  try { child.kill() } catch {}
  console.error('node-pty prebuild verification timed out')
  process.exit(1)
}, 5_000)

child.onData(data => { output += data })
child.onExit(({ exitCode }) => {
  clearTimeout(timeout)
  if (exitCode !== 0 || !output.includes('agent-workbench-pty-ok')) {
    console.error(`node-pty prebuild verification failed with exit ${exitCode}`)
    process.exit(1)
  }
  console.log(`node-pty prebuild verified for win32-${process.arch}`)
  process.exit(0)
})
