import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const MANAGED_SNAPSHOT_PATTERN =
  /^settings\.json\.backup\.(?:pre-rollback-)?\d{8}-\d{6}$/

export interface ManagedSnapshotFileType {
  isFile(): boolean
  isSymbolicLink(): boolean
}

export function isManagedSnapshotName(value: unknown): value is string {
  return typeof value === 'string' && MANAGED_SNAPSHOT_PATTERN.test(value)
}

export function validateManagedSnapshotTarget(
  backupRealPath: string,
  snapshotRealPath: string,
  fileType: ManagedSnapshotFileType
): void {
  if (!fileType.isFile() || fileType.isSymbolicLink()) {
    throw new Error('Snapshot is not a regular app-managed file')
  }
  const relativePath = relative(backupRealPath, snapshotRealPath)
  if (!relativePath || isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new Error('Snapshot resolves outside the app-managed backup directory')
  }
}

export function resolveManagedSnapshotPath(backupDir: string, snapshotName: unknown): string {
  if (!isManagedSnapshotName(snapshotName)) {
    throw new Error('Snapshot is not an app-managed backup')
  }

  let backupRealPath: string
  let snapshotRealPath: string
  try {
    backupRealPath = realpathSync.native(resolve(backupDir))
    const candidatePath = join(backupRealPath, snapshotName)
    const candidateStat = lstatSync(candidatePath)
    snapshotRealPath = realpathSync.native(candidatePath)
    validateManagedSnapshotTarget(backupRealPath, snapshotRealPath, candidateStat)
  } catch {
    throw new Error('Snapshot is unavailable or is not an app-managed backup')
  }

  return snapshotRealPath
}
