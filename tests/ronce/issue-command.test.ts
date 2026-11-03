import { describe, expect, it } from 'vitest'
import { isIssueSearch, issueCreation } from '../../mods/ronce/src/policy/issue-command.ts'

describe('issueCreation', () => {
  it('reads an inline gh body, its labels, and sees through a leading cd', () => {
    const found = issueCreation('cd /repo && gh issue create --repo o/r --title "Timeout" --body "## Problem\nslow" --label bug,api -l python')
    expect(found).toEqual({
      bodies: [{ kind: 'text', text: '## Problem\nslow', format: 'markdown' }],
      labels: ['bug', 'api', 'python'],
    })
  })

  it('reads a gh body file, long or short flag, and the --flag=value form', () => {
    expect(issueCreation('gh issue create -t x -F /tmp/body.md')?.bodies).toEqual([{ kind: 'file', path: '/tmp/body.md', format: 'markdown' }])
    expect(issueCreation("gh issue create --title x --body-file='issue body.md'")?.bodies).toEqual([
      { kind: 'file', path: 'issue body.md', format: 'markdown' },
    ])
  })

  it('takes a heredoc as the body of --body-file - and of --body "$(cat <<EOF)"', () => {
    const stdin = issueCreation("gh issue create --title x --body-file - <<'EOF'\n## Problem\nx\nEOF")
    expect(stdin?.bodies).toEqual([{ kind: 'text', text: '## Problem\nx', format: 'markdown' }])
    const substituted = issueCreation(`gh issue create --title x --body "$(cat <<'EOF'\n## Problem\nit "breaks" (twice)\nEOF\n)"`)
    expect(substituted?.bodies).toEqual([{ kind: 'text', text: '## Problem\nit "breaks" (twice)', format: 'markdown' }])
  })

  it('takes --body "$(cat file)" as a body file', () => {
    expect(issueCreation('gh issue create --title x --body "$(cat notes/issue.md)"')?.bodies).toEqual([
      { kind: 'file', path: 'notes/issue.md', format: 'markdown' },
    ])
  })

  it('reports a creation that carries no body', () => {
    expect(issueCreation('gh issue create --title x')).toEqual({ bodies: [], labels: [] })
  })

  it('reads glab: --description and -d, labels', () => {
    expect(issueCreation('glab issue create -t x -d "## Problem" --label bug')).toEqual({
      bodies: [{ kind: 'text', text: '## Problem', format: 'markdown' }],
      labels: ['bug'],
    })
  })

  it('reads a gh api POST on .../issues: fields, @file fields and --input', () => {
    expect(issueCreation("gh api repos/o/r/issues -f title=x -f 'body=## Problem' -f 'labels[]=bug'")).toEqual({
      bodies: [{ kind: 'text', text: '## Problem', format: 'markdown' }],
      labels: ['bug'],
    })
    expect(issueCreation('gh api -X POST repos/o/r/issues -F body=@issue.md')?.bodies).toEqual([
      { kind: 'file', path: 'issue.md', format: 'markdown' },
    ])
    expect(issueCreation('gh api repos/o/r/issues --method POST --input payload.json')?.bodies).toEqual([
      { kind: 'file', path: 'payload.json', format: 'payload' },
    ])
  })

  it('leaves gh api reads and calls on other endpoints alone', () => {
    expect(issueCreation('gh api repos/o/r/issues')).toBeNull()
    expect(issueCreation('gh api repos/o/r/issues/12/comments -f body=x')).toBeNull()
    expect(issueCreation('gh api -X PATCH repos/o/r/issues -f body=x')).toBeNull()
  })

  it('reads a curl POST to a GitLab or GitHub issues endpoint', () => {
    const gitlab = issueCreation(
      'curl -s -X POST -H "PRIVATE-TOKEN: $T" "https://gitlab.com/api/v4/projects/1/issues" --data-urlencode "description=## Problem" -d labels=bug',
    )
    expect(gitlab?.bodies).toEqual([
      { kind: 'text', text: 'description=## Problem', format: 'payload' },
      { kind: 'text', text: 'labels=bug', format: 'payload' },
    ])
    const github = issueCreation("curl https://api.github.com/repos/o/r/issues -d @payload.json")
    expect(github?.bodies).toEqual([{ kind: 'file', path: 'payload.json', format: 'payload' }])
  })

  it('leaves curl GETs and other commands alone', () => {
    expect(issueCreation('curl -s "https://gitlab.com/api/v4/projects/1/issues?search=timeout"')).toBeNull()
    expect(issueCreation('gh issue list --search "timeout"')).toBeNull()
    expect(issueCreation('gh pr create --title x --body y')).toBeNull()
    expect(issueCreation('echo "gh issue create --title x"')).toBeNull()
  })

  it('ignores a trailing comment, so a ronce:allow marker is not a body', () => {
    expect(issueCreation('gh issue create --title x --body-file b.md # ronce:allow ticket-needs-skill')?.bodies).toEqual([
      { kind: 'file', path: 'b.md', format: 'markdown' },
    ])
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
    ]) {
      expect(isIssueSearch(command), command).toBe(true)
    }
  })

  it('does not count a plain listing as a search', () => {
    for (const command of ['gh issue list --label bug', 'gh issue view 12', 'glab issue list']) {
      expect(isIssueSearch(command), command).toBe(false)
    }
  })
})
