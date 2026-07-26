import { isAbsolute } from 'node:path'

export interface ArchiveInvocation {
  args: string[]
  env: NodeJS.ProcessEnv
}

const ARCHIVE_COMMAND =
  "Compress-Archive -Path (Join-Path $env:AGENT_WORKBENCH_ARCHIVE_SOURCE '*') -DestinationPath $env:AGENT_WORKBENCH_ARCHIVE_DESTINATION -Force"

export function createArchiveInvocation(
  sourceDir: string,
  zipPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env
): ArchiveInvocation {
  if (!isAbsolute(sourceDir) || !isAbsolute(zipPath)) {
    throw new Error('Archive paths must be absolute')
  }

  return {
    args: ['-NoProfile', '-NonInteractive', '-Command', ARCHIVE_COMMAND],
    env: {
      ...baseEnv,
      AGENT_WORKBENCH_ARCHIVE_SOURCE: sourceDir,
      AGENT_WORKBENCH_ARCHIVE_DESTINATION: zipPath
    }
  }
}
