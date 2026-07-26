import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  isTrustedIpcSender,
  type IpcEventLike,
  type IpcFrameLike,
  type IpcSenderLike,
  type IpcWindowLike
} from '../../src/main/ipc/ipc-sender-policy.ts'

function fixture(): {
  event: IpcEventLike
  window: IpcWindowLike
  frame: IpcFrameLike
  webContents: IpcSenderLike
} {
  const url = `file:///${['C:', 'app', 'out', 'renderer', 'index.html'].join('/')}`
  const frame = { parent: null, url }
  const webContents = {
    getURL: () => url,
    isDestroyed: () => false
  }
  return {
    frame,
    webContents,
    event: { sender: webContents, senderFrame: frame },
    window: { isDestroyed: () => false, webContents }
  }
}

test('trusted IPC sender accepts only the bound window top frame at its current URL', () => {
  const fx = fixture()
  assert.equal(isTrustedIpcSender(fx.event, fx.window), true)

  const otherSender = { getURL: fx.webContents.getURL, isDestroyed: () => false }
  assert.equal(isTrustedIpcSender({ ...fx.event, sender: otherSender }, fx.window), false)
  assert.equal(
    isTrustedIpcSender({ ...fx.event, senderFrame: { ...fx.frame, parent: {} } }, fx.window),
    false
  )
  assert.equal(
    isTrustedIpcSender(
      { ...fx.event, senderFrame: { ...fx.frame, url: 'https://example.com' } },
      fx.window
    ),
    false
  )
  assert.equal(isTrustedIpcSender({ ...fx.event, senderFrame: null }, fx.window), false)
  assert.equal(
    isTrustedIpcSender(fx.event, { ...fx.window, isDestroyed: () => true }),
    false
  )
  assert.equal(
    isTrustedIpcSender(
      {
        ...fx.event,
        sender: { ...fx.webContents, isDestroyed: () => true }
      },
      fx.window
    ),
    false
  )
})

test('all production IPC handlers use the trusted wrapper', () => {
  const ipcDir = join(process.cwd(), 'src', 'main', 'ipc')
  for (const name of readdirSync(ipcDir)) {
    if (!name.endsWith('.ts') || name === 'trusted-ipc.ts') continue
    const source = readFileSync(join(ipcDir, name), 'utf8')
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\bipcMain\b[^}]*\}\s*from\s*['"]electron['"]/,
      name
    )
  }
})
