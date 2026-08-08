/**
 * The interactive TTY selector: layout, rendering and keyboard logic.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { SELF } from "./paths.js";
import type { Item, Kind } from "./catalog.js";
import { KIND_LABEL } from "./detect.js";

const KIND_ORDER: Kind[] = ["rule", "skill", "script", "hook", "agent"];

// ─── Layout constants ─────────────────────────────────────────────────────────
const HEADER_LINES = 2;
const LEGEND_LINES = 2;
const DETAIL_LINES = 4;
const MIN_VIEWPORT_ROWS = 5;
const ITEM_LINE_WIDTH = 50;

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const DIM = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const INVERSE = (s: string): string => `\x1b[7m${s}\x1b[0m`;
const BOLD = (s: string): string => `\x1b[1m${s}\x1b[0m`;

// ─── Description precomputation ───────────────────────────────────────────────

/**
 * Reads the real description of each item from its source file.
 * Called once before the selector loop.
 */
function buildDetailMap(items: Item[]): Map<Item, string> {
  const map = new Map<Item, string>();
  for (const item of items) {
    map.set(item, readItemDescription(item));
  }
  return map;
}

function readItemDescription(item: Item): string {
  try {
    if (item.kind === "skill") {
      const skillFile = join(SELF, "skills", item.name, "SKILL.md");
      if (existsSync(skillFile)) {
        const content = readFileSync(skillFile, "utf8");
        const desc = extractFrontmatterField(content, "description");
        if (desc) return desc;
      }
    } else if (item.kind === "rule") {
      const ruleFile = join(SELF, "rules", item.name);
      if (existsSync(ruleFile)) {
        const content = readFileSync(ruleFile, "utf8");
        // Look for the first # line after the frontmatter (or at the start of the file)
        const afterFront = skipFrontmatter(content);
        const m = /^#\s+(.+)/m.exec(afterFront);
        if (m) return m[1].trim();
      }
    } else if (item.kind === "script") {
      const scriptFile = join(SELF, "scripts", item.name);
      if (existsSync(scriptFile)) {
        const content = readFileSync(scriptFile, "utf8");
        const desc = extractJsDocFirstSentence(content);
        if (desc) return desc;
      }
    } else if (item.kind === "hook") {
      const hookFile = join(SELF, "hooks", item.name);
      if (existsSync(hookFile)) {
        const content = readFileSync(hookFile, "utf8");
        const desc = extractJsDocFirstSentence(content);
        if (desc) return desc;
      }
    } else if (item.kind === "agent") {
      const agentFile = join(SELF, "agents", item.name);
      if (existsSync(agentFile)) {
        const content = readFileSync(agentFile, "utf8");
        const desc = extractFrontmatterField(content, "description");
        if (desc) return desc;
        // Fallback: first line of the file
        const firstLine = content.split("\n").find((l) => l.trim().length > 0);
        if (firstLine) return firstLine.replace(/^#\s*/, "").trim();
      }
    }
  } catch {
    // Cannot read - fall back to the default
  }
  return item.reason;
}

function skipFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4);
}

function extractFrontmatterField(content: string, field: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const front = content.slice(0, end);
  const re = new RegExp(`^${field}:\\s*(.+)`, "m");
  const m = re.exec(front);
  if (!m) return null;
  // Strip any surrounding quotes
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function extractJsDocFirstSentence(content: string): string | null {
  const start = content.indexOf("/**");
  if (start === -1) return null;
  const end = content.indexOf("*/", start);
  const block = end === -1 ? content.slice(start) : content.slice(start, end);
  // Remove /** and the leading * on each line
  const text = block
    .replace(/\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
  // Take up to the first period or the end of the first "sentence"
  const m = /^([^.\n]+\.?)/.exec(text);
  return m ? m[1].trim() : text.slice(0, 120) || null;
}

// ─── Rendering sub-functions (pure) ───────────────────────────────────────────

function buildHeader(checkedCount: number, total: number): string {
  const title = BOLD("⚙  Installing ronce-racine");
  const counter = `${checkedCount}/${total} selected`;
  return `  ${title}   ${counter}\n`;
}

function buildGroupHeader(kind: Kind, checkedInGroup: number, totalInGroup: number): string {
  const label = `${KIND_LABEL[kind]} (${checkedInGroup}/${totalInGroup})`;
  const dashes = "─".repeat(Math.max(0, ITEM_LINE_WIDTH - label.length - 4));
  return `  ─── ${label} ${dashes}`;
}

function buildItemLine(item: Item, isChecked: boolean, isCursor: boolean): string {
  const box = isChecked ? "[x]" : "[ ]";
  const baseName = item.name.replace(/\.md$/, "");
  const optTag = item.optional ? " · opt" : "";
  const nameField = (baseName + optTag).padEnd(28);
  const line = `  ${isCursor ? "›" : " "} ${box} ${nameField}  - ${item.reason}`;
  if (isCursor) return INVERSE(line);
  if (item.optional) return DIM(line);
  return line;
}

function buildDetailPanel(item: Item, detail: Map<Item, string>): string {
  const kindLabel = KIND_LABEL[item.kind];
  const baseName = item.name.replace(/\.md$/, "");
  const token = `${item.kind}:${baseName}`;
  const badge = item.optional ? " · optional" : " · recommended";
  const desc = detail.get(item) ?? item.reason;
  const header = ` Detail: ${kindLabel} › ${baseName}   [token: ${token}]${badge}`;
  const body = ` ${desc.slice(0, 120)}${desc.length > 120 ? "…" : ""}`;
  return `\n${header}\n${body}\n`;
}

function buildLegend(): string {
  return `\n ${DIM("↑↓ move · space toggle · a (un)check the group · enter confirm · q cancel")}`;
}

// ─── Main frame ────────────────────────────────────────────────────────────────

/**
 * Builds the complete selector frame (pure function, no I/O).
 * Returns the string to write after \x1b[2J\x1b[H.
 */
function buildSelectorFrame(opts: {
  flat: Item[];
  checked: Set<Item>;
  cursor: number;
  detail: Map<Item, string>;
  rows: number;
}): string {
  const { flat, checked, cursor, detail, rows } = opts;

  // Viewport computation
  const viewportRows = Math.max(MIN_VIEWPORT_ROWS, rows - HEADER_LINES - LEGEND_LINES - DETAIL_LINES);


  // Header
  const header = buildHeader(checked.size, flat.length);

  // Build the list lines (with group headers)
  const listLines: string[] = [];
  let lastKind: Kind | null = null;
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (item.kind !== lastKind) {
      // Group header
      const groupItems = flat.filter((x) => x.kind === item.kind);
      const checkedInGroup = groupItems.filter((x) => checked.has(x)).length;
      listLines.push(buildGroupHeader(item.kind, checkedInGroup, groupItems.length));
      lastKind = item.kind;
    }
    listLines.push(buildItemLine(item, checked.has(item), i === cursor));
  }

  // Viewport: find the index in listLines corresponding to the cursor item
  // We rebuild an item-index → line-index mapping
  const itemLineIndices: number[] = [];
  let lineIdx = 0;
  let prevKind: Kind | null = null;
  for (const item of flat) {
    if (item.kind !== prevKind) {
      lineIdx++; // group line
      prevKind = item.kind;
    }
    itemLineIndices.push(lineIdx);
    lineIdx++;
  }

  const cursorLineIdx = itemLineIndices[cursor] ?? 0;

  // Compute the viewport start: keeps the cursor visible with a margin on both sides
  const MARGIN = 2; // context lines kept around the cursor
  const lineViewportStart = Math.max(
    0,
    Math.min(cursorLineIdx - MARGIN, listLines.length - viewportRows),
  );

  const visibleLines = listLines.slice(lineViewportStart, lineViewportStart + viewportRows);

  // Overflow indicators
  const overflowTop = lineViewportStart > 0 ? lineViewportStart : 0;
  const overflowBottom = Math.max(0, listLines.length - (lineViewportStart + viewportRows));

  const topIndicator = overflowTop > 0 ? `  ▲ ${overflowTop} more\n` : "";
  const bottomIndicator = overflowBottom > 0 ? `  ▼ ${overflowBottom} more\n` : "";

  // Detail panel
  const currentItem = flat[cursor];
  const detailPanel = currentItem ? buildDetailPanel(currentItem, detail) : "\n\n\n\n";

  // Legend
  const legend = buildLegend();

  return (
    header +
    "\n" +
    topIndicator +
    visibleLines.join("\n") +
    "\n" +
    bottomIndicator +
    detailPanel +
    legend +
    "\n"
  );
}

// ─── Interactive selector ─────────────────────────────────────────────────────

/** TTY checkbox selector with a scrolling viewport and detail panel. Resolves the checked items, or null if cancelled. */
// ─── Selector keyboard logic (pure, exported for tests) ───────────────────────

export interface SelectorState { flat: Item[]; checked: Set<Item>; cursor: number }

/**
 * Applies one keypress to the selector state (mutated in place).
 * Returns "continue", "confirm" (enter) or "cancel" (q / ctrl-c).
 */
export function applySelectorKey(state: SelectorState, key: { name?: string; ctrl?: boolean }): "continue" | "confirm" | "cancel" {
  const k = key?.name;
  if ((key?.ctrl && k === "c") || k === "q") return "cancel";
  if (k === "up" || k === "k") state.cursor = (state.cursor - 1 + state.flat.length) % state.flat.length;
  else if (k === "down" || k === "j") state.cursor = (state.cursor + 1) % state.flat.length;
  else if (k === "space") {
    const it = state.flat[state.cursor];
    state.checked.has(it) ? state.checked.delete(it) : state.checked.add(it);
  } else if (k === "a") {
    const kind = state.flat[state.cursor].kind;
    const group = state.flat.filter((i) => i.kind === kind);
    const allOn = group.every((i) => state.checked.has(i));
    for (const i of group) {
      if (allOn) state.checked.delete(i);
      else state.checked.add(i);
    }
  } else if (k === "return") return "confirm";
  return "continue";
}

export function interactiveSelect(items: Item[], preChecked: Set<Item>): Promise<Item[] | null> {
  const flat = KIND_ORDER.flatMap((k) => items.filter((i) => i.kind === k));
  const checked = new Set(preChecked);
  let cursor = 0;

  // Precompute the descriptions (once)
  const detail = buildDetailMap(items);

  const render = (): void => {
    const frame = buildSelectorFrame({
      flat,
      checked,
      cursor,
      detail,
      rows: process.stdout.rows ?? 24,
    });
    process.stdout.write(`\x1b[2J\x1b[H${frame}`);
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
    emitKeypressEvents(stdin);

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      process.stdout.write("\x1b[?25h\n");
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("keypress", onKey);
    };

    const state: SelectorState = { flat, checked, cursor };
    const onKey = (_s: string, key: { name?: string; ctrl?: boolean }): void => {
      try {
        const outcome = applySelectorKey(state, key);
        cursor = state.cursor; // render() reads the outer binding
        if (outcome === "cancel") { cleanup(); resolve(null); return; }
        if (outcome === "confirm") { cleanup(); resolve(flat.filter((i) => checked.has(i))); return; }
        render();
      } catch {
        cleanup();
        resolve(null);
      }
    };

    try {
      stdin.setRawMode(true);
      stdin.resume();
      process.stdout.write("\x1b[?25l"); // hide the cursor
      render();
      stdin.on("keypress", onKey);
    } catch {
      cleanup();
      resolve(null);
    }
  });
}
