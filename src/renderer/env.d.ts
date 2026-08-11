/// <reference types="vite/client" />

interface ElectronApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

declare global {
  interface Window {
    api: ElectronApi
  }
}
