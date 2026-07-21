#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: adds `--silent` to a bare `npm install` / `npm ci`
 * to reduce the install noise injected into the assistant's context.
 *
 * Conservative approach:
 * - Only rewrites a single, non-compound `npm install` / `npm ci` / `npm i`
 *   with NO positional package (flags allowed). `npm install <pkg>` is a
 *   deliberate dependency add → left untouched.
 * - Skips compound/piped commands (`&&`, `||`, `;`, `|`, backticks, `$(`):
 *   rewriting them is unsafe.
 * - Adds only the `--silent` flag: it does NOT wrap the command in a pipe, so
 *   the real exit code is preserved (a failed `npm ci` still fails).
 * - Does not touch a command that is already `--silent`/`--quiet`/`-s`.
 *
 * Bypass strategy: if the command contains `# no-silent`, we leave it untouched.
 *
 * @version 2.0.0
 * @last-reviewed 2026-07-10
 */
import { readFileSync } from 'node:fs';
function readStdin() {
    try {
        return readFileSync(0, 'utf-8');
    }
    catch {
        return '';
    }
}
function shouldRewrite(cmd) {
    const trimmed = cmd.trim();
    // Explicit bypass: a `# no-silent` comment anywhere in the command
    if (trimmed.includes('# no-silent'))
        return false;
    // Skip compound/piped/substituted commands - rewriting them is unsafe
    if (/[;&|`]|\$\(/.test(trimmed))
        return false;
    // Match ONLY a bare `npm install`/`npm ci`/`npm i` with no positional
    // package (flags allowed). `npm install lodash` is a deliberate add → skip.
    if (!/^npm\s+(install|ci|i)((?:\s+-{1,2}\S+)*)\s*$/.test(trimmed))
        return false;
    // Already silent → we add nothing
    if (/--silent|--quiet|(^|\s)-s(\s|$)/.test(trimmed))
        return false;
    return true;
}
function rewrite(cmd) {
    // Add `--silent` after the npm subcommand. No pipe → exit code preserved.
    return cmd.replace(/^(\s*npm\s+(?:install|ci|i))\b/, '$1 --silent');
}
function main() {
    const raw = readStdin();
    if (!raw) {
        process.exit(0); // no input, let it through
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        process.exit(0);
    }
    if (parsed.tool_name !== 'Bash')
        process.exit(0);
    const cmd = parsed.tool_input?.command ?? '';
    if (!shouldRewrite(cmd))
        process.exit(0);
    const updated = rewrite(cmd);
    const output = {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: 'Added --silent (bash-npm-silent hook)',
            updatedInput: {
                command: updated,
            },
        },
    };
    process.stdout.write(JSON.stringify(output));
}
main();
