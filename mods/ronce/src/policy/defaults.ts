import type { CheckSpec, Features, Rule, ShapingConfig, TelemetryConfig } from '../../types'

const AGENT_PROMPT_LIMIT = 8000

export const DEFAULT_SHAPING: ShapingConfig = {
  mode: 'enforce',
  maxChars: 4000,
  headLines: 20,
  tailLines: 20,
  // Under the home directory: a full output may hold what the cut hid, and /tmp is readable by every local user.
  dir: '~/.claude/ronce/outputs',
}

export const DEFAULT_TELEMETRY: TelemetryConfig = { dir: '~/.claude/ronce/events' }

const JS_FILES = '\\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue)$'
const ESLINT_CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
]

/** What the global lint-changed hook did after each edit; each check is skipped where its tool is missing. */
export const DEFAULT_EDIT_CHECKS: readonly CheckSpec[] = [
  { id: 'rustfmt', title: 'rustfmt (lancer cargo fmt)', match: '\\.rs$', run: ['rustfmt', '--edition', '2021', '--check', '{file}'], timeoutMs: 30_000, maxLines: 20 },
  {
    id: 'eslint', title: 'ESLint (--max-warnings=0)', match: JS_FILES, unless: '\\.d\\.ts$',
    run: ['./node_modules/.bin/eslint', '{file}', '--max-warnings=0'], cwd: 'package', packageMarker: 'node_modules/.bin/eslint',
    requiresAny: ESLINT_CONFIGS, timeoutMs: 45_000, maxLines: 20,
  },
  {
    id: 'biome-scripts', title: 'Biome (scripts/), correction : npx biome check --write <fichier>', match: '(^|/)scripts/.*\\.ts$',
    run: ['./node_modules/.bin/biome', 'check', '{file}'], requiresAny: ['node_modules/.bin/biome'], timeoutMs: 30_000, maxLines: 15,
  },
  {
    id: 'ast-grep', title: 'ast-grep (règles du projet)', match: '\\.(rs|ts|tsx)$', run: ['ast-grep', 'scan', '-c', 'sgconfig.yml', '{file}'],
    requiresAny: ['sgconfig.yml'], findingWhen: 'error\\[', keepLinesMatching: '^(?!Help:)', timeoutMs: 20_000, maxLines: 20,
  },
]

/** The related tests, moved off the edit: they took up to 90 s each time a file was saved. */
export const DEFAULT_BACKGROUND_CHECKS: readonly CheckSpec[] = [
  {
    id: 'vitest-related', title: 'Vitest (tests liés)', match: JS_FILES, unless: '\\.d\\.ts$',
    run: ['./node_modules/.bin/vitest', 'related', '{files}', '--run'], cwd: 'package', packageMarker: 'node_modules/.bin/vitest',
    keepLinesMatching: 'FAIL|✗|×|AssertionError|Error[: ]|expected|Tests +[0-9]|Test Files', timeoutMs: 120_000, maxLines: 20,
  },
]

/** Generic features are on; those that need a project's own settings (remote, budgets, hints) are off. */
export const DEFAULT_FEATURES: Features = {
  worktree: { links: ['.env'] },
  freshness: null,
  agentBudget: null,
  memo: { ticketPattern: '(?:feat|fix|chore)\\/(\\d+)', staleDays: 14 },
  skillHints: [],
  // The project's own skills, then the catalog of the ronce-racine plugin, shipped beside this mod.
  skillCatalog: {
    sources: [{ dir: '.claude/skills' }, { dir: '{pluginRoot}/../../skills', namespace: 'ronce-racine' }],
    max: 3,
  },
  band: true,
  checks: {
    onEdit: [...DEFAULT_EDIT_CHECKS],
    background: [...DEFAULT_BACKGROUND_CHECKS],
    busyPattern: 'cargo (build|test|nextest|clippy|check)',
    maxWakes: 2,
  },
}

/** Rules every project gets. A project policy may disable, replace or switch the mode of each. */
export const DEFAULT_RULES: readonly Rule[] = [
  {
    id: 'cd-cwd-noop',
    tool: 'Bash',
    builtin: 'cd-cwd-noop',
    action: 'rewrite',
    mode: 'enforce',
    message: 'Préfixe « cd <répertoire courant> » retiré : il ne change rien et coûte une demande de permission.',
    examples: {
      match: [{ command: 'cd /repo && git status' }],
      pass: [{ command: 'cd /repo/backend && cargo test' }, { command: 'git status' }],
    },
  },
  {
    id: 'shell-read',
    tool: 'Bash',
    builtin: 'shell-read',
    action: 'deny',
    mode: 'enforce',
    message: 'Lire ce fichier avec Read (offset/limit) : une lecture par le shell verse tout le fichier dans un contexte que chaque appel suivant repaie.',
    examples: {
      match: [{ command: 'sed -n 1,80p src/main.rs' }, { command: 'cd /repo/wt && cat src/lib.ts' }],
      pass: [{ command: 'cat src/lib.ts | head -20' }, { command: 'cat /tmp/out.log' }],
    },
  },
  {
    id: 'heredoc-create',
    tool: 'Bash',
    builtin: 'heredoc-create',
    action: 'deny',
    mode: 'enforce',
    message: 'Créer ce fichier avec Write : un fichier créé par le shell échappe aux hooks de format, de lint et de détection de secrets.',
    examples: {
      match: [{ command: "cat > src/new.ts <<'EOF'\nexport {}\nEOF" }],
      pass: [{ command: "cat > /tmp/notes.md <<'EOF'\nx\nEOF" }],
    },
  },
  {
    id: 'destructive-after-semicolon',
    tool: 'Bash',
    command: ';\\s*git\\s+(reset\\s+--hard|checkout\\s+--|clean\\s+-\\w*f|push\\b.*--force)',
    // The `cd X;` this rule is about is exactly what normalization strips.
    raw: true,
    action: 'deny',
    mode: 'enforce',
    message: "Commande git destructive enchaînée après « ; » : elle s'exécute même si la précédente échoue. La lancer seule, avec git -C <chemin>.",
    examples: {
      match: [{ command: 'cd ../wt; git reset --hard origin/master' }],
      pass: [{ command: 'git -C ../wt reset --hard origin/master' }],
    },
  },
  {
    id: 'devnull-hides-errors',
    tool: 'Bash',
    command: '\\b(cargo|npm|npx)\\b[^|;&]*2>\\s*/dev/null',
    action: 'warn',
    mode: 'enforce',
    message: '2>/dev/null masque les erreurs : garder 2>&1 et filtrer la sortie.',
    examples: { match: [{ command: 'cargo build 2>/dev/null' }], pass: [{ command: 'cargo build 2>&1 | tail -20' }] },
  },
  {
    id: 'zsh-wordsplit',
    tool: 'Bash',
    command: '\\bfor\\s+\\w+\\s+in\\s+\\$\\w+(\\s|;)',
    action: 'warn',
    mode: 'enforce',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: ${=VAR} is the zsh syntax this message teaches.
    message: 'Sous zsh, $VAR ne se découpe pas en mots dans un for : écrire ${=VAR}.',
    examples: {
      match: [{ command: 'for f in $FILES; do echo $f; done' }],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a zsh command, not a template.
      pass: [{ command: 'for f in ${=FILES}; do echo $f; done' }],
    },
  },
  {
    id: 'agent-prompt-too-large',
    tool: 'Agent',
    promptLongerThan: AGENT_PROMPT_LIMIT,
    action: 'deny',
    mode: 'shadow',
    message: 'Prompt de sous-agent de plus de 8 000 caractères : écrire le contexte lourd dans des fichiers et passer leurs chemins.',
    examples: { match: [{ prompt: 'x'.repeat(AGENT_PROMPT_LIMIT + 1) }], pass: [{ prompt: 'Explore le module X.' }] },
  },
  {
    id: 'commit-mentions-ai',
    tool: 'Bash',
    command: '\\bgit\\s+commit\\b[\\s\\S]*([Cc]laude|\\bAI\\b|\\bLLM\\b)',
    action: 'deny',
    mode: 'enforce',
    message: 'Un message de commit ne mentionne jamais Claude, AI ni LLM (y compris en trailer Co-Authored-By).',
    examples: {
      match: [{ command: 'git commit -m "feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' }],
      pass: [{ command: 'git commit -m "feat(api): ajouter le filtre"' }],
    },
  },
]
