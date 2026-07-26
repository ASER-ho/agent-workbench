import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { join } from 'node:path'

import { IPC_CHANNELS } from '../../shared/ipc-types'
import type { ActionBinding, ActionType } from '../../shared/action-types'
import type { SessionSnapshot } from '../../shared/session-types'
import { ControlledActionManager } from '../services/controlled-action'

export function registerActionHandlers(
  getSessionSnapshot: () => SessionSnapshot
): ControlledActionManager | null {
  const fixtureEnabled = process.env['AGENT_WORKBENCH_E2E'] === '1' || process.env['AGENT_WORKBENCH_ACTION_FIXTURE'] === '1'
  const fixtureRoot = process.env['AGENT_WORKBENCH_FIXTURE_ROOT']
  const manager = fixtureEnabled && fixtureRoot
    ? new ControlledActionManager({
        workspaceRoot: join(fixtureRoot, 'workspace'),
        getSessionSnapshot,
        executablePath: process.execPath,
        marker: 'agent-workbench-action-stub',
        commandDelayMs: Number(process.env['AGENT_WORKBENCH_ACTION_DELAY_MS'] ?? 20),
        fileWriteDelayMs: Number(process.env['AGENT_WORKBENCH_ACTION_FILE_DELAY_MS'] ?? 0),
        fileTargetResolveDelayMs: Number(process.env['AGENT_WORKBENCH_ACTION_TARGET_DELAY_MS'] ?? 0)
      })
    : null

  const required = (): ControlledActionManager => {
    if (!manager) throw new Error('controlled actions are disabled outside fixture mode')
    return manager
  }

  ipcMain.handle(IPC_CHANNELS.ACTION_PROPOSE, (_event, input: { actionType: ActionType; workspaceLabel: string }) =>
    required().propose({ actionType: input?.actionType, workspaceLabel: input?.workspaceLabel })
  )
  ipcMain.handle(IPC_CHANNELS.ACTION_APPROVE, (_event, input: ActionBinding) => required().approve(input))
  ipcMain.handle(IPC_CHANNELS.ACTION_REJECT, (_event, input: ActionBinding) => required().reject(input))
  ipcMain.handle(IPC_CHANNELS.ACTION_CANCEL, (_event, input: ActionBinding) => required().cancel(input))
  ipcMain.handle(IPC_CHANNELS.ACTION_EXECUTE, (_event, input: { approvalId: string }) => required().execute(input?.approvalId))
  ipcMain.handle(IPC_CHANNELS.ACTION_GET_RECEIPTS, () => required().getReceipts())
  return manager
}
