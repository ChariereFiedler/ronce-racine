#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: wraps verbose commands (cargo build/test,
 * npm install, git log, curl…) so their output is truncated when it
 * exceeds a character threshold. Error output (exit ≠ 0) is always
 * preserved in full so as not to hide debugging information.
 *
 * Uses base64 encoding to pass the original command to the
 * truncate-bash-output.ts script, avoiding shell-escaping problems.
 *
 * Bypass strategy: if the command contains `# no-truncate`, we leave it untouched.
 *
 * @version 2.0.0
 * @last-reviewed 2026-07-10
 */
import { readFileSync } from 'node:fs';
const VERBOSE_PATTERNS = [
    /^\s*cargo\s+(build|test|clippy|check|fmt|doc|run)/,
    // `npm install`/`npm ci` are handled by the bash-npm-silent hook (avoid a
    // two-hook conflict on the same command - PreToolUse updatedInput is last-wins).
    /^\s*npm\s+run\s+(build|test|typecheck|lint)\b/,
    /^\s*npx\s+(vitest|tsc|nuxi|tsx)\b/,
    /^\s*git\s+(log|diff)\b/,
    /^\s*curl\s/,
    /^\s*docker\s+(build|logs)\b/,
    /^\s*rustup\s/,
];
const SKIP_PATTERNS = [
    /\|\s*(head|tail|grep|wc|less|more|awk|sed|cut|sort|uniq|jq)\b/,
    /# no-truncate/,
    /truncate-bash-output/,
];
export function isVerboseCommand(cmd) {
    if (SKIP_PATTERNS.some(p => p.test(cmd)))
        return false;
    const parts = cmd.split(/&&|\|\|/).map(s => s.trim());
    return parts.some(part => VERBOSE_PATTERNS.some(p => p.test(part)));
}
export function wrapCommand(cmd, hookDir) {
    const encoded = Buffer.from(cmd).toString('base64');
    // Run the helper via `npx tsx` (works on any Node ≥ 18) rather than
    // `node --experimental-strip-types` (only Node ≥ 22.6), matching how the
    // hooks themselves are wired in settings.json.
    return `TRUNCATE_CMD_B64=${encoded} node '${hookDir}/truncate-bash-output.mjs'`;
}
function readStdin() {
    try {
        return readFileSync(0, 'utf-8');
    }
    catch {
        return '';
    }
}
function main() {
    const raw = readStdin();
    if (!raw)
        return;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return;
    }
    if (parsed.tool_name !== 'Bash')
        return;
    const cmd = parsed.tool_input?.command ?? '';
    if (!cmd || !isVerboseCommand(cmd))
        return;
    // Resolving the hooks directory: the CLAUDE_PROJECT_DIR variable takes priority,
    // otherwise a path relative to this file (for local execution / tests)
    const hookDir = process.env.CLAUDE_PROJECT_DIR
        ? `${process.env.CLAUDE_PROJECT_DIR}/.claude/hooks`
        : new URL('.', import.meta.url).pathname.replace(/\/$/, '');
    const output = {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: 'Auto-truncate verbose output (truncate-output hook)',
            updatedInput: {
                command: wrapCommand(cmd, hookDir),
            },
        },
    };
    process.stdout.write(JSON.stringify(output));
}
// Entry guard by BASENAME, never by extension: this file is authored as .ts and
// ships as .mjs, and an extension-bound guard silently disables main() in the
// built copy - the hook then exits 0 doing nothing, with no signal at all.
const invoked = (process.argv[1] ?? "").split("/").pop()?.replace(/\.(ts|mjs|js)$/, "");
if (invoked === 'truncate-output')
    main();
