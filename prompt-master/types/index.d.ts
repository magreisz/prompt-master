export type Note = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      isAuto: boolean
      isBusy: boolean
      note: Note
      pending: Note
    }
  }
}
