/// <reference types="vite/client" />
import type { Timeline, Summary, Settings } from './model'
declare global {
  interface Window {
    desktop?: {
      load: () => Promise<{
        timelines: Summary[]
        settings: Partial<Settings>
        recovered?: boolean
      }>
      read: (id: string) => Promise<unknown>
      save: (t: Timeline) => Promise<void>
      settings: (s: Settings) => Promise<void>
      remove: (id: string) => Promise<void>
      importMany: (t: Timeline[]) => Promise<void>
      importJson: () => Promise<unknown>
      exportJson: (data: unknown, title: string) => Promise<string | null>
      version: () => Promise<string>
      onClosing: (cb: () => void) => void
      close: () => Promise<void>
      forceClose: () => Promise<void>
    }
  }
}
