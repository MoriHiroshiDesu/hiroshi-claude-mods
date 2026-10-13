export type Commit = {
  hash: string
  subject: string
  author: string
  when: string
  // Lines the commit added and removed, summed over its files (binary files count 0).
  added: number
  removed: number
}

export type GitInfo = {
  // Branch name, or the short hash when HEAD is detached.
  head: string
  isDetached: boolean
  // Name of the linked worktree's folder; undefined in the main checkout.
  worktree?: string
  ahead: number
  behind: number
  // Each changed path is counted once, by this priority: untracked, deleted (staged or
  // not), modified in the working tree (staged too or not), staged only.
  staged: number
  modified: number
  untracked: number
  deleted: number
  // Undefined in a repository with no commit yet.
  commit?: Commit
}

declare module 'claude-code' {
  interface PluginState {
    'git-band': { info: GitInfo | null }
  }
}
