import { describe, expect, it } from 'vitest'
import { runBuiltin } from '../../mods/ronce/src/policy/builtins.ts'

const FACTS = { cwd: '/repo', env: {}, isInteractive: true }
const bash = (command: string) => ({ tool: 'Bash', command })
const shellRead = (command: string) => runBuiltin('shell-read', bash(command), FACTS)
const heredocCreate = (command: string) => runBuiltin('heredoc-create', bash(command), FACTS)

describe('shell-read (oracles of shell-read-guard.spec.ts)', () => {
  it('matches cat and sed -n on a project file, naming it', () => {
    expect(shellRead('cat scripts/dev/worktree.ts')).toEqual({ matched: true, detail: 'scripts/dev/worktree.ts' })
    expect(shellRead("sed -n '1,120p' backend/crates/api-server/src/lib.rs")).toMatchObject({ matched: true })
  })

  it('leaves bounded reads, scratch files, non-project files and empty commands alone', () => {
    for (const command of [
      'cat package.json | head -20',
      'cat scripts/dev/worktree.ts | grep export',
      'cat backend/Cargo.toml | wc -l',
      'cat /tmp/sortie.json',
      'cat scratchpad/notes.md',
      'cat .scratch/trace.log',
      'cat /etc/hostname',
      'cat',
      '',
      '   ',
      'git show HEAD:scripts/dev/worktree.ts',
    ]) {
      expect(shellRead(command).matched, command).toBe(false)
    }
  })

  it('sees through a leading cd, which the old guard missed', () => {
    expect(shellRead('cd /repo-wt-12/backend && sed -n 1,80p src/main.rs')).toMatchObject({ matched: true })
  })

  it('does not treat a heredoc creation as a read', () => {
    expect(shellRead('cat > frontend/app/pages/index.vue <<EOF').matched).toBe(false)
  })
})

describe('heredoc-create', () => {
  it('matches cat > a project file', () => {
    expect(heredocCreate('cat > frontend/app/pages/index.vue <<EOF')).toMatchObject({ matched: true })
  })

  it('leaves scratch files alone', () => {
    expect(heredocCreate("cat > /tmp/notes.md <<'EOF'").matched).toBe(false)
  })
})

describe('cd-cwd-noop', () => {
  it('rewrites the call without the cd', () => {
    expect(runBuiltin('cd-cwd-noop', bash('cd /repo && git status'), FACTS)).toEqual({
      matched: true,
      rewrite: { tool: 'Bash', command: 'git status' },
    })
  })

  it('does not match a cd elsewhere', () => {
    expect(runBuiltin('cd-cwd-noop', bash('cd /repo/backend && cargo test'), FACTS).matched).toBe(false)
  })
})
