/// <reference types="vite/client" />

import type { AgentWorkbenchApi } from '../preload/index'

declare global {
  interface Window {
    api: AgentWorkbenchApi
  }
}
