import { IPC_CHANNELS } from '../../shared/ipc-types.ts'
import { validateVerificationInspectRequest } from '../../shared/verification-validation.ts'
import { GitVerificationService } from '../services/git-verification.ts'
import { getSelectedWorkspaceBinding } from '../services/workspace-foundation/session-workspace.ts'
import { trustedIpcMain as ipcMain } from './trusted-ipc.ts'

export function registerVerificationHandlers(): void {
  let service: GitVerificationService | null = null
  ipcMain.handle(IPC_CHANNELS.VERIFICATION_INSPECT, async (_event, raw: unknown) => {
    const request = validateVerificationInspectRequest(raw)
    const workspace = getSelectedWorkspaceBinding()
    if (!workspace) throw new Error('Select a workspace before checking changes')
    service ??= new GitVerificationService()
    return service.inspect(workspace.cwd, request.contract)
  })
}
