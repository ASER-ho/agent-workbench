export interface RegisteredRecipe {
  id: string
  label: string
  /** Workspace-relative fixed test path (validated by resolveSafeTestTarget). */
  testPath: string
  timeoutMs: number
}
