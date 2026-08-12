import type { RegisteredRecipe } from './recipe-registry-types.ts'

/**
 * Trusted auto-verification recipes — hardcoded allowlist. Auto-verification
 * may only run these exact test paths. Adding a recipe is a code-level decision,
 * never a runtime configuration.
 */
export const REGISTERED_RECIPES: RegisteredRecipe[] = [
  { id: 'project-default-check', label: 'Project default check', testPath: 'test/verify.spec.mjs', timeoutMs: 30_000 }
]
