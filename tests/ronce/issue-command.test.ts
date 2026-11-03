import { describe, expect, it } from 'vitest'
import { isIssueSearch, issueCreations } from '../../mods/ronce/src/policy/issue-command.ts'

const first = (command: string) => issueCreations(command)[0] ?? null
const bodiesOf = (command: string) => first(command)?.bodies
const unknown = expect.objectContaining({ kind: 'unknown' })

describe('issueCreations', () => {
  it('reads an inline gh body, its labels, and sees through a leading cd', () => {
    const found = first('cd /repo && gh issue create --repo o/r --title "Timeout" --body "## Problem\nslow" --label bug,api -l python')
    expect(found?.bodies).toEqual([{ kind: 'text', text: '## Problem\nslow', format: 'markdown' }])
    expect(found?.labels).toEqual(['bug', 'api', 'python'])
  })

  it('reads a gh body file, long or short flag, and the --flag=value form', () => {
    expect(bodiesOf('gh issue create -t x -F /tmp/body.md')).toEqual([{ kind: 'file', path: '/tmp/body.md', format: 'markdown' }])
    expect(bodiesOf("gh issue create --title x --body-file='issue body.md'")).toEqual([
      { kind: 'file', path: 'issue body.md', format: 'markdown' },
    ])
  })

  it('takes a heredoc as the body of --body-file - and of --body "$(cat <<EOF)"', () => {
    expect(bodiesOf("gh issue create --title x --body-file - <<'EOF'\n## Problem\nx\nEOF")).toEqual([
      { kind: 'text', text: '## Problem\nx', format: 'markdown' },
    ])
    expect(bodiesOf(`gh issue create --title x --body "$(cat <<'EOF'\n## Problem\nit "breaks" (twice)\nEOF\n)"`)).toEqual([
      { kind: 'text', text: '## Problem\nit "breaks" (twice)', format: 'markdown' },
    ])
  })

  it('gives the creation only its own heredoc, not the one another command of the line reads', () => {
    const command = "cat > /tmp/notes.txt <<'A'\nnotes\nA\ngh issue create --title x --body-file - <<'B'\n## Problem\nB"
    expect(bodiesOf(command)).toEqual([{ kind: 'text', text: '## Problem', format: 'markdown' }])
  })

  it('ends a heredoc only on its terminator alone on its line (tabs allowed after <<-)', () => {
    expect(bodiesOf("gh issue create -t x -F - <<'EOF'\n## Problem\n  EOF\nmore\nEOF")).toEqual([
      { kind: 'text', text: '## Problem\n  EOF\nmore', format: 'markdown' },
    ])
    expect(bodiesOf("gh issue create -t x -F - <<-'EOF'\n## Problem\n\tEOF")).toEqual([
      { kind: 'text', text: '## Problem', format: 'markdown' },
    ])
  })

  it('takes --body "$(cat file)" as a body file', () => {
    expect(bodiesOf('gh issue create --title x --body "$(cat notes/issue.md)"')).toEqual([
      { kind: 'file', path: 'notes/issue.md', format: 'markdown' },
    ])
  })

  it('marks as unknown a body only the shell can produce, never as an empty one', () => {
    for (const command of [
      'gh issue create -t x --body "$BODY"',
      'gh issue create -t x --body "$(printf "## A\\nb")"',
      'gh issue create -t x --body $(cat f.md)',
      'gh issue create -t x --body "`cat f.md`"',
      'gh issue create -t x -F "$TMPDIR/b.md"',
      'cat body.md | gh issue create -t x -F -',
      'gh issue create -t x --body-file /dev/stdin',
    ]) {
      expect(bodiesOf(command), command).toEqual([unknown])
    }
  })

  it('marks as unknown the body of an interactive creation', () => {
    for (const command of ['gh issue create -t x --web', 'gh issue create -t x --editor', 'gh issue create -t x --template bug.md']) {
      expect(bodiesOf(command), command).toEqual([unknown])
    }
  })

  it('marks as unknown a body file the same command writes before it runs', () => {
    const command = "cat > /tmp/b.md <<'EOF'\n## Problem\nEOF\ngh issue create -t x -F /tmp/b.md"
    expect(bodiesOf(command)).toEqual([unknown])
    expect(bodiesOf('printf x | tee /tmp/b.md && gh issue create -t x -F /tmp/b.md')).toEqual([unknown])
  })

  it('reports a creation that carries no body as empty', () => {
    expect(first('gh issue create --title x')).toMatchObject({ bodies: [], labels: [] })
  })

  it('finds the creation behind a capture, a subshell, a wrapper or a global flag', () => {
    for (const command of [
      'url=$(gh issue create -t x -F b.md)',
      '(gh issue create -t x -F b.md)',
      'if true; then gh issue create -t x -F b.md; fi',
      'timeout 20 gh issue create -t x -F b.md',
      'env GH_HOST=github.com gh issue create -t x -F b.md',
      'gh -R o/r issue create -t x -F b.md',
      'gh --repo=o/r issue create -t x -F b.md',
      'bash -c "gh issue create -t x -F b.md"',
    ]) {
      expect(bodiesOf(command), command).toEqual([{ kind: 'file', path: 'b.md', format: 'markdown' }])
    }
  })

  it('returns every creation of a command', () => {
    expect(issueCreations('gh issue create -t a -F a.md && gh issue create -t b -F b.md')).toHaveLength(2)
  })

  it('reads an attached short label flag', () => {
    expect(first('gh issue create -t x -F b.md -lbug')?.labels).toEqual(['bug'])
  })

  it('reads glab: --description and -d, labels', () => {
    const found = first('glab issue create -t x -d "## Problem" --label bug')
    expect(found?.bodies).toEqual([{ kind: 'text', text: '## Problem', format: 'markdown' }])
    expect(found?.labels).toEqual(['bug'])
  })

  it('reads a gh api POST on .../issues: fields, @file fields and --input', () => {
    const fields = first("gh api repos/o/r/issues -f title=x -f 'body=## Problem' -f 'labels[]=bug'")
    expect(fields?.bodies).toEqual([{ kind: 'text', text: '## Problem', format: 'markdown' }])
    expect(fields?.labels).toEqual(['bug'])
    expect(bodiesOf('gh api -X POST repos/o/r/issues -F body=@issue.md')).toEqual([{ kind: 'file', path: 'issue.md', format: 'markdown' }])
    expect(bodiesOf('gh api repos/o/r/issues --method POST --input payload.json')).toEqual([
      { kind: 'file', path: 'payload.json', format: 'payload' },
    ])
  })

  it('leaves gh api reads and calls on other endpoints alone', () => {
    expect(issueCreations('gh api repos/o/r/issues')).toEqual([])
    expect(issueCreations('gh api repos/o/r/issues/12/comments -f body=x')).toEqual([])
    expect(issueCreations('gh api -X PATCH repos/o/r/issues -f body=x')).toEqual([])
  })

  it('reads a curl POST to a GitLab or GitHub issues endpoint', () => {
    const gitlab = bodiesOf(
      'curl -s -X POST -H "PRIVATE-TOKEN: $T" "https://gitlab.com/api/v4/projects/1/issues" --data-urlencode "description=## Problem 100%" -d labels=bug',
    )
    expect(gitlab).toEqual([
      { kind: 'text', text: 'description=## Problem 100%', format: 'field' },
      { kind: 'text', text: 'labels=bug', format: 'payload' },
    ])
    expect(bodiesOf('curl https://api.github.com/repos/o/r/issues -d @payload.json')).toEqual([
      { kind: 'file', path: 'payload.json', format: 'payload' },
    ])
    expect(bodiesOf('curl -X POST https://gitlab.com/api/v4/projects/1/issues --data-urlencode "description@b.md"')).toEqual([
      { kind: 'file', path: 'b.md', format: 'markdown' },
    ])
  })

  it('leaves curl GETs and other commands alone', () => {
    for (const command of [
      'curl -s "https://gitlab.com/api/v4/projects/1/issues?search=timeout"',
      'gh issue list --search "timeout"',
      'gh pr create --title x --body y',
      'echo "gh issue create --title x"',
      'git commit -m "gh issue create"',
    ]) {
      expect(issueCreations(command), command).toEqual([])
    }
  })

  it('ignores a trailing comment, so a ronce:allow marker is not a body', () => {
    expect(bodiesOf('gh issue create --title x --body-file b.md # ronce:allow ticket-needs-skill')).toEqual([
      { kind: 'file', path: 'b.md', format: 'markdown' },
    ])
  })

  it('counts a search that runs earlier in the same command', () => {
    expect(first('gh issue list --search timeout && gh issue create -t x -F b.md')?.afterSearch).toBe(true)
    expect(first('gh issue create -t x -F b.md && gh issue list --search timeout')?.afterSearch).toBe(false)
  })
})

describe('isIssueSearch', () => {
  it('recognizes the searches a duplicate check is made of', () => {
    for (const command of [
      'gh issue list --repo o/r --state all --search "timeout" --limit 20',
      'gh issue list -S timeout',
      'gh search issues timeout --repo o/r',
      'glab issue list --search timeout',
      'gh api "search/issues?q=repo:o/r+timeout"',
      'curl -s "https://gitlab.com/api/v4/projects/1/issues?search=timeout"',
      'cd /repo && gh -R o/r issue list --search timeout',
    ]) {
      expect(isIssueSearch(command), command).toBe(true)
    }
  })

  it('does not count a plain listing, nor a search named in some text, as a search', () => {
    for (const command of [
      'gh issue list --label bug',
      'gh issue view 12',
      'glab issue list',
      'echo "search/issues"',
      'gh api "repos/o/r/issues?q=timeout"',
    ]) {
      expect(isIssueSearch(command), command).toBe(false)
    }
  })
})
