import type { Fixture } from "../index.js";

/**
 * `shopfront` - the world where the page is competent and says nothing.
 *
 * The marketing site of a two-person studio's game. Nothing on it is broken:
 * it builds, it has a hero, three benefit cards, a festival badge strip, a
 * statistics row and a closing paragraph. Every line of it would fit forty
 * other games. The thing the game is actually about - lamp oil is the only
 * currency, so a lit room is money you spent - is in the raw playtest quotes,
 * in a factsheet written for journalists, and in one line of copy that a
 * commit removed. It is nowhere on the page.
 *
 * This world is deliberately OUTSIDE the measurement base. Its skills judge
 * taste, and a gate over taste can only detect forbidden patterns - which is a
 * format gate wearing a disguise. The world is built to be hard anyway, and
 * the newsletter page exists to prove the point: it uses one of the "forbidden"
 * components legitimately, so a grep for the pattern scores the wrong answer.
 *
 * What makes it hard is not reading. Everything is readable. What is hard is
 * choosing what to chase: `research/` holds an accessibility and performance
 * audit that is entirely correct, a wishlist collapse with a plausible written
 * explanation that the history refutes, a competitor scan, twelve weeks of
 * numbers and three playtest sessions of raw quotes. Four of those quotes
 * converge. They are not adjacent and nobody wrote down that they converge.
 *
 * The build output is `public/` and not `dist/`: snapshotRepo prunes any
 * directory named `dist`, `build`, `target` or `coverage`, so anything under
 * one of those names is invisible to every gate and to the transposition
 * denylist.
 *
 * What each part of the world is for is written next to it below. The answer
 * key - the wrong answers, and the argument for how a careful unaided agent
 * fails - is in EXPECTED.md, which the materialiser keeps out of git.
 */

/**
 * A file body from its lines. Fixture content is data, not code: writing it as
 * lines keeps a page of copy readable here and keeps "\n" out of it.
 */
const doc = (...lines: string[]): string => lines.join("\n") + "\n";

/** The same, with no trailing newline: for a patch spliced into a file. */
const rows = (...lines: string[]): string => lines.join("\n");

/** JSON as this repository stores it: two spaces, one trailing newline. */
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

// ---------------------------------------------------------------------------
// The site itself: a zero-dependency generator, four pages, one theme.
// ---------------------------------------------------------------------------

const GITIGNORE = doc(
  "public/",
  "*.log",
);

const PACKAGE_JSON = doc(
  "{",
  "  \"name\": \"saltlantern-site\",",
  "  \"private\": true,",
  "  \"type\": \"module\",",
  "  \"scripts\": {",
  "    \"test\": \"node --test\",",
  "    \"build\": \"node tools/pagesmith/cli.js .\",",
  "    \"check:pages\": \"node tools/check/pages.js .\"",
  "  }",
  "}",
);

/** A later commit adds the line pointing new writers at the brand guide. */
const README_V1 = doc(
  "# Salt Lantern - the site",
  "",
  "Four pages and a build step. `npm run build` writes `public/`, `npm run",
  "check:pages` reads what it wrote and refuses a page with no description or a",
  "link that goes nowhere.",
  "",
  "Copy lives in `content/copy/`, one file per page, and the page files in",
  "`content/pages/` only say which blocks appear in which order. That split is",
  "there so a copy change never touches layout and a layout change never",
  "silently rewrites a sentence.",
  "",
  "Before you write a page, write its brief: `docs/page-briefs/TEMPLATE.md`, and",
  "two filled ones next to it. A page without a brief tends to end up saying",
  "whatever the pitch deck said, which is not the same thing as saying anything.",
  "",
  "`research/` is everything we have been told by someone who is not us:",
  "playtest sessions, the weekly numbers, the audit, what the neighbours' pages",
  "look like. It is raw on purpose. Nobody has time to keep a summary honest.",
);

/** The components sheet joins `themeFiles` in the commit that brings it over. */
const SITE_CONFIG_V1 = json({
  siteName: "Salt Lantern",
  studio: "Northfall",
  baseUrl: "https://saltlantern.example",
  themeFiles: ["tokens.css", "pages.css"],
  storeCapsuleLimit: 80,
});

const CI_YML = doc(
  "stages: [checks, deploy]",
  "",
  "checks:",
  "  steps:",
  "    - npm test",
  "    - npm run build",
  "    - npm run check:pages",
  "",
  "deploy:",
  "  on: [main]",
  "  needs: [checks]",
  "  steps:",
  "    - node tools/pagesmith/cli.js .",
  "    - node tools/deploy/upload.js public",
);

const CONTENT_JS = doc(
  "import { readFileSync, readdirSync, existsSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "",
  "export function readJson(path) {",
  "  return JSON.parse(readFileSync(path, 'utf8'))",
  "}",
  "",
  "export function readConfig(root) {",
  "  return readJson(join(root, 'site.config.json'))",
  "}",
  "",
  "/** Every page the site has, in a stable order, from what is on disk. */",
  "export function listPages(root) {",
  "  const dir = join(root, 'content', 'pages')",
  "  return readdirSync(dir)",
  "    .filter((name) => name.endsWith('.json'))",
  "    .map((name) => name.slice(0, -'.json'.length))",
  "    .sort()",
  "}",
  "",
  "/**",
  " * A page and the copy it pulls from. The two are separate files so that",
  " * rewriting a sentence never moves a block and moving a block never rewrites",
  " * a sentence; the join happens here and nowhere else.",
  " */",
  "export function readPage(root, name) {",
  "  const page = readJson(join(root, 'content', 'pages', name + '.json'))",
  "  const copyPath = join(root, 'content', 'copy', page.copy + '.json')",
  "  if (!existsSync(copyPath)) {",
  "    throw new Error('page ' + name + ' asks for copy ' + page.copy + ', which does not exist')",
  "  }",
  "  return { name, ...page, text: readJson(copyPath) }",
  "}",
  "",
  "/** The screenshots we hold, keyed by id. Captions are written by whoever took them. */",
  "export function readMedia(root) {",
  "  return readJson(join(root, 'content', 'media', 'shots.json'))",
  "}",
);

const RENDER_JS = doc(
  "const AMP = /&/g",
  "const LT = /</g",
  "const GT = />/g",
  "",
  "const safe = (value) => String(value).replace(AMP, '&amp;').replace(LT, '&lt;').replace(GT, '&gt;')",
  "",
  "/** A block's own classes on top of the class its kind always carries. */",
  "function classes(block, base) {",
  "  return block.class ? base + ' ' + block.class : base",
  "}",
  "",
  "/** Reads one copy slot, and says which page and which slot when it is missing. */",
  "function slot(text, path, where) {",
  "  let node = text",
  "  for (const key of path.split('.')) node = node === undefined ? undefined : node[key]",
  "  if (node === undefined) throw new Error(where + ': no copy at ' + path)",
  "  return node",
  "}",
  "",
  "function link(entry) {",
  "  return '<a href=\"' + safe(entry.href) + '\">' + safe(entry.label) + '</a>'",
  "}",
  "",
  "const BLOCKS = {",
  "  hero(block, page, media) {",
  "    const hero = slot(page.text, 'hero', page.name)",
  "    const cta = slot(page.text, 'hero.cta.' + block.cta, page.name)",
  "    return [",
  "      '<section class=\"' + classes(block, 'hero') + '\">',",
  "      '  <h1>' + safe(hero.headline) + '</h1>',",
  "      '  <p class=\"hero__sub\">' + safe(hero.subhead) + '</p>',",
  "      '  <p class=\"hero__cta\">' + link(cta) + '</p>',",
  "      '</section>',",
  "    ].join('\\n')",
  "  },",
  "",
  "  cards(block, page) {",
  "    const cards = block.items.map((id) => {",
  "      const card = slot(page.text, 'cards.' + id, page.name)",
  "      return [",
  "        '  <article class=\"card\">',",
  "        '    <h3>' + safe(card.title) + '</h3>',",
  "        '    <p>' + safe(card.body) + '</p>',",
  "        '  </article>',",
  "      ].join('\\n')",
  "    })",
  "    return ['<section class=\"' + classes(block, 'cards') + '\">', ...cards, '</section>'].join('\\n')",
  "  },",
  "",
  "  badges(block, page) {",
  "    const items = block.items.map((id) => '  <li class=\"pill-badge\">' + safe(slot(page.text, 'badges.' + id, page.name)) + '</li>')",
  "    return ['<ul class=\"' + classes(block, 'logo-strip') + '\">', ...items, '</ul>'].join('\\n')",
  "  },",
  "",
  "  stats(block, page) {",
  "    const items = block.items.map((id) => {",
  "      const stat = slot(page.text, 'stats.' + id, page.name)",
  "      return '  <li><strong>' + safe(stat.value) + '</strong> <span>' + safe(stat.label) + '</span></li>'",
  "    })",
  "    return ['<ul class=\"' + classes(block, 'stat-row') + '\">', ...items, '</ul>'].join('\\n')",
  "  },",
  "",
  "  shot(block, page, media) {",
  "    const shot = media[block.id]",
  "    if (!shot) throw new Error(page.name + ': no screenshot with id ' + block.id)",
  "    return [",
  "      '<figure class=\"' + classes(block, 'shot') + '\">',",
  "      '  <img src=\"' + safe(shot.file) + '\" alt=\"' + safe(shot.caption) + '\">',",
  "      '  <figcaption>' + safe(shot.caption) + '</figcaption>',",
  "      '</figure>',",
  "    ].join('\\n')",
  "  },",
  "",
  "  text(block, page) {",
  "    const paragraphs = [].concat(slot(page.text, block.copy, page.name))",
  "    return ['<section class=\"' + classes(block, 'prose') + '\">', ...paragraphs.map((p) => '  <p>' + safe(p) + '</p>'), '</section>'].join('\\n')",
  "  },",
  "",
  "  facts(block, page) {",
  "    const facts = slot(page.text, 'facts', page.name)",
  "    const items = facts.flatMap((fact) => ['  <dt>' + safe(fact.term) + '</dt>', '  <dd>' + safe(fact.value) + '</dd>'])",
  "    return ['<dl class=\"' + classes(block, 'facts') + '\">', ...items, '</dl>'].join('\\n')",
  "  },",
  "",
  "  signup(block, page) {",
  "    const form = slot(page.text, 'signup', page.name)",
  "    return [",
  "      '<section class=\"' + classes(block, 'signup') + '\">',",
  "      '  <h2>' + safe(form.title) + '</h2>',",
  "      '  <p>' + safe(form.body) + '</p>',",
  "      '  <form action=\"' + safe(form.action) + '\" method=\"post\">',",
  "      '    <label for=\"mail\">' + safe(form.label) + '</label>',",
  "      '    <input id=\"mail\" name=\"mail\" type=\"email\" required>',",
  "      '    <button type=\"submit\">' + safe(form.button) + '</button>',",
  "      '  </form>',",
  "      '</section>',",
  "    ].join('\\n')",
  "  },",
  "",
  "  links(block, page) {",
  "    const items = block.items.map((id) => '  <li>' + link(slot(page.text, 'links.' + id, page.name)) + '</li>')",
  "    return ['<nav class=\"' + classes(block, 'more') + '\"><ul>', ...items, '</ul></nav>'].join('\\n')",
  "  },",
  "}",
  "",
  "export function renderBlock(block, page, media) {",
  "  const kind = BLOCKS[block.kind]",
  "  if (!kind) throw new Error(page.name + ': no block kind called ' + block.kind)",
  "  return kind(block, page, media)",
  "}",
  "",
  "/** One page, head and all. The theme is linked, never inlined. */",
  "export function renderPage(page, media, config) {",
  "  const sheets = config.themeFiles.map((file) => '  <link rel=\"stylesheet\" href=\"/theme/' + file + '\">')",
  "  return [",
  "    '<!doctype html>',",
  "    '<html lang=\"en\">',",
  "    '<head>',",
  "    '  <meta charset=\"utf-8\">',",
  "    '  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">',",
  "    '  <title>' + safe(page.title) + '</title>',",
  "    '  <meta name=\"description\" content=\"' + safe(page.description) + '\">',",
  "    ...sheets,",
  "    '</head>',",
  "    '<body class=\"page page--' + safe(page.name) + '\">',",
  "    '<main>',",
  "    ...page.blocks.map((block) => renderBlock(block, page, media)),",
  "    '</main>',",
  "    '<footer><p>' + safe(config.studio) + '</p></footer>',",
  "    '</body>',",
  "    '</html>',",
  "    '',",
  "  ].join('\\n')",
  "}",
);

const BUILD_JS = doc(
  "import { mkdirSync, writeFileSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "import { listPages, readPage, readMedia, readConfig } from './content.js'",
  "import { renderPage } from './render.js'",
  "",
  "/** Builds every page into `public/`, or wherever the caller asks, and returns what it wrote. */",
  "export function build(root, out = join(root, 'public')) {",
  "  const config = readConfig(root)",
  "  const media = readMedia(root)",
  "  mkdirSync(out, { recursive: true })",
  "  const written = []",
  "  for (const name of listPages(root)) {",
  "    const page = readPage(root, name)",
  "    writeFileSync(join(out, name + '.html'), renderPage(page, media, config))",
  "    written.push(name + '.html')",
  "  }",
  "  return written",
  "}",
);

const CLI_JS = doc(
  "import { build } from './build.js'",
  "",
  "const root = process.argv[2] || '.'",
  "try {",
  "  const written = build(root)",
  "  console.log('built ' + written.length + ' page(s): ' + written.join(', '))",
  "} catch (error) {",
  "  console.error('build failed: ' + error.message)",
  "  process.exit(1)",
  "}",
);

const CHECK_PAGES_JS = doc(
  "import { readFileSync, readdirSync, existsSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  "",
  "/**",
  " * Reads what the build wrote. Two things a page cannot ship without: a",
  " * description for the share card, and links that go somewhere. Anything about",
  " * what the page SAYS is not checkable here and is not attempted.",
  " */",
  "function problems(dir) {",
  "  const found = []",
  "  const pages = readdirSync(dir).filter((name) => name.endsWith('.html'))",
  "  for (const name of pages) {",
  "    const html = readFileSync(join(dir, name), 'utf8')",
  "    const title = /<title>([^<]*)<\\/title>/.exec(html)",
  "    if (!title || !title[1].trim()) found.push(name + ': empty title')",
  "    const description = /<meta name=\"description\" content=\"([^\"]*)\"/.exec(html)",
  "    if (!description || !description[1].trim()) found.push(name + ': empty description')",
  "    for (const match of html.matchAll(/href=\"\\/([^\"#?]+\\.html)\"/g)) {",
  "      if (!existsSync(join(dir, match[1]))) found.push('link to ' + match[1] + ', which is not built')",
  "    }",
  "  }",
  "  return found",
  "}",
  "",
  "export { problems }",
  "",
  "// Only when run as the command; the tests import `problems` directly.",
  "if (process.argv[1] === fileURLToPath(import.meta.url)) {",
  "  const found = problems(join(process.argv[2] || '.', 'public'))",
  "  for (const line of found) console.error(line)",
  "  console.log(found.length === 0 ? 'pages ok' : found.length + ' problem(s)')",
  "  process.exit(found.length === 0 ? 0 : 1)",
  "}",
);

const UPLOAD_JS = doc(
  "import { readdirSync } from 'node:fs'",
  "",
  "/**",
  " * The deploy step in the pipeline. It prints what it would send; the real",
  " * upload happens through the host's own CLI, which is not installed here.",
  " */",
  "const dir = process.argv[2] || 'public'",
  "for (const name of readdirSync(dir)) console.log('upload ' + dir + '/' + name)",
);

// ---------------------------------------------------------------------------
// The theme. `components.css` is the world's forbidden thing, made reachable:
// every pattern the taste skills refuse is already written, already used, and
// already blessed by a brand guide the README points at.
// ---------------------------------------------------------------------------

const TOKENS_CSS = doc(
  ":root {",
  "  --ink: #12181c;",
  "  --paper: #f3efe6;",
  "  --lamp: #e6b45c;",
  "  --deep: #16323d;",
  "  --rule: #cec7ba;",
  "  --measure: 34rem;",
  "  --step-0: 1rem;",
  "  --step-1: 1.35rem;",
  "  --step-2: 1.9rem;",
  "  --step-3: 2.7rem;",
  "}",
  "",
  "html { color: var(--ink); background: var(--paper); }",
  "body { margin: 0; font: var(--step-0)/1.6 Iowan Old Style, Palatino, Georgia, serif; }",
  "main { padding: 0 1.25rem 4rem; }",
  "a { color: inherit; text-underline-offset: 0.18em; }",
);

/**
 * Lifted wholesale from the studio's previous project - a dashboard - which is
 * why the comment at the top is about a dashboard. Nothing here was designed
 * for this game, and nothing here says so.
 */
const COMPONENTS_CSS = doc(
  "/* Halyard shared components, v4. Copied across so we do not rewrite them",
  "   every time. Keep the class names, they are used in the pattern library. */",
  "",
  ".hero--glow {",
  "  background:",
  "    radial-gradient(60% 55% at 50% 0%, rgba(230, 180, 92, 0.35), rgba(230, 180, 92, 0) 70%),",
  "    linear-gradient(180deg, var(--deep), var(--paper) 78%);",
  "  color: var(--paper);",
  "}",
  ".hero--glow h1 { text-shadow: 0 0 28px rgba(230, 180, 92, 0.5); }",
  "",
  ".card-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; max-width: 68rem; margin: 0 auto 3rem; }",
  ".card { padding: 1.5rem; border-radius: 14px; border: 1px solid var(--rule); background: rgba(255, 255, 255, 0.55); }",
  ".card h3 { margin: 0 0 0.4rem; font-size: var(--step-1); }",
  ".card p { margin: 0; opacity: 0.8; }",
  "",
  ".glass-panel {",
  "  border-radius: 18px;",
  "  border: 1px solid rgba(255, 255, 255, 0.18);",
  "  background: rgba(255, 255, 255, 0.1);",
  "  backdrop-filter: blur(12px);",
  "  padding: 2rem;",
  "}",
  "",
  ".pill-badge { display: inline-block; padding: 0.2rem 0.85rem; border-radius: 999px; border: 1px solid var(--rule); font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase; opacity: 0.62; }",
  ".logo-strip { display: flex; gap: 0.75rem; justify-content: center; list-style: none; padding: 0; margin: 0 0 3rem; }",
  "",
  ".stat-row { display: flex; justify-content: space-around; list-style: none; padding: 0; margin: 0 auto 3rem; max-width: 52rem; }",
  ".stat-row strong { display: block; font-size: var(--step-2); }",
  ".stat-row span { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; }",
);

const PAGES_CSS = doc(
  ".hero { padding: 5rem 1.25rem 4rem; text-align: center; }",
  ".hero h1 { font-size: var(--step-3); margin: 0 0 0.6rem; }",
  ".hero__sub { font-size: var(--step-1); opacity: 0.78; margin: 0 auto 1.6rem; max-width: 40rem; }",
  ".hero__cta a { display: inline-block; padding: 0.7rem 1.6rem; border-radius: 999px; background: var(--lamp); color: var(--ink); text-decoration: none; }",
  "",
  ".prose { max-width: var(--measure); margin: 0 auto 2.5rem; }",
  ".prose p + p { margin-top: 1rem; }",
  "",
  ".shot { margin: 0 auto 3rem; max-width: 60rem; }",
  ".shot img { width: 100%; height: auto; display: block; }",
  ".shot figcaption { font-size: 0.85rem; opacity: 0.7; padding-top: 0.5rem; }",
  "",
  ".facts { max-width: var(--measure); margin: 0 auto 2.5rem; }",
  ".facts dt { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; }",
  ".facts dd { margin: 0 0 0.9rem; }",
  "",
  ".signup { max-width: var(--measure); margin: 0 auto 3rem; }",
  ".signup form { display: flex; gap: 0.5rem; flex-wrap: wrap; }",
  ".signup input { flex: 1 1 14rem; padding: 0.6rem; border: 1px solid var(--rule); border-radius: 6px; }",
  ".signup button { padding: 0.6rem 1.2rem; border: 0; border-radius: 6px; background: var(--ink); color: var(--paper); }",
  "",
  ".more ul { display: flex; gap: 1.25rem; justify-content: center; list-style: none; padding: 0; }",
  "footer { padding: 2rem 1.25rem; border-top: 1px solid var(--rule); text-align: center; font-size: 0.85rem; opacity: 0.7; }",
);

// ---------------------------------------------------------------------------
// The pages. `home` accretes a card grid, a badge strip and a numbers row over
// the history; `press` never does, and is the page that is already right.
// ---------------------------------------------------------------------------

const HOME_PAGE_V1 = json({
  title: "Salt Lantern",
  description: "A lamplighter's game in a flooded city, from Northfall.",
  copy: "home",
  blocks: [
    { kind: "hero", cta: "wishlist" },
    { kind: "shot", id: "flooded-nave" },
    { kind: "text", copy: "closing" },
    { kind: "links", items: ["press", "devlog", "newsletter"] },
  ],
});

const PRESS_PAGE = json({
  title: "Salt Lantern - press",
  description: "Facts, screenshots and contact details for Salt Lantern.",
  copy: "press",
  blocks: [
    { kind: "text", copy: "intro" },
    { kind: "facts" },
    { kind: "shot", id: "wick-counter" },
    { kind: "text", copy: "contact" },
    { kind: "links", items: ["home", "devlog"] },
  ],
});

const NEWSLETTER_PAGE = json({
  title: "Salt Lantern - the workshop letter",
  description: "One letter a month about how Salt Lantern is being made.",
  copy: "newsletter",
  blocks: [
    { kind: "signup", class: "glass-panel" },
    { kind: "text", copy: "what" },
    { kind: "links", items: ["home", "devlog"] },
  ],
});

const DEVLOG_PAGE = json({
  title: "Salt Lantern - devlog",
  description: "What we changed this month and why.",
  copy: "devlog",
  blocks: [
    { kind: "text", copy: "intro" },
    { kind: "links", items: ["wick", "water", "organ"] },
    { kind: "text", copy: "outro" },
    { kind: "links", items: ["home", "press"] },
  ],
});

// ---------------------------------------------------------------------------
// The copy. `home` starts specific and ends generic; the commit that did it is
// called `copy(home): tighten the hero for the trailer drop`.
// ---------------------------------------------------------------------------

/**
 * The hero as the site opened with it, and the hero it has today. The second
 * one arrived in `copy(home): tighten the hero for the trailer drop`, which is
 * an ordinary commit message for the single most expensive edit in the repo.
 */
const HERO_SPECIFIC = {
  headline: "A lamplighter in a city that drowned",
  subhead: "Oil is the only money there is. Every room you light is a room you paid for.",
};

const HERO_GENERIC = {
  headline: "Atmospheric exploration in a drowned world",
  subhead: "A world that reacts to you, and a score written for it.",
};

/** Straight out of the pitch deck's three pillars, one card each. */
const HOME_CARDS = {
  reactive: { title: "A reactive world", body: "The city responds to what you do and remembers it for the rest of the run." },
  atmosphere: { title: "Atmosphere first", body: "A drowned city, hand-lit, built to be walked through rather than cleared." },
  score: { title: "A hand-crafted score", body: "Original music, written for the game and recorded rather than sequenced." },
};

const HOME_STATS = {
  districts: { value: "12", label: "flooded districts" },
  hours: { value: "9", label: "hours" },
  endings: { value: "3", label: "endings" },
};

const HOME_BADGES = {
  selected: "Selected - autumn showcase",
  jury: "Jury mention - river festival",
  finalist: "Finalist - handmade games award",
};

const HOME_CLOSING = [
  "Northfall is two people. Salt Lantern is what we have been making since the pump station closed and we started reading about what happens to a city after the water stays.",
  "It runs on anything that would run a browser game six years ago. There is no combat. There is a lot of arithmetic you do in the dark without noticing you are doing it.",
];

const HOME_LINKS = {
  press: { label: "Press kit", href: "/press.html" },
  devlog: { label: "Devlog", href: "/devlog.html" },
  newsletter: { label: "The workshop letter", href: "/newsletter.html" },
};

/**
 * One shape, five states. The page accreted its cards, its numbers and its
 * badges one commit at a time, each of them defensible on the day.
 */
const homeCopy = (hero: typeof HERO_SPECIFIC, blocks: { cards?: boolean; stats?: boolean; badges?: boolean } = {}): string =>
  json({
    hero: {
      headline: hero.headline,
      subhead: hero.subhead,
      cta: {
        wishlist: { label: "Add to wishlist", href: "https://store.example/salt-lantern" },
        trailer: { label: "Watch the trailer", href: "https://video.example/salt-lantern" },
      },
    },
    ...(blocks.cards ? { cards: HOME_CARDS } : {}),
    ...(blocks.badges ? { badges: HOME_BADGES } : {}),
    ...(blocks.stats ? { stats: HOME_STATS } : {}),
    closing: HOME_CLOSING,
    links: HOME_LINKS,
  });

const HOME_COPY_V1 = homeCopy(HERO_SPECIFIC);
const HOME_COPY_V2 = homeCopy(HERO_SPECIFIC, { cards: true });
const HOME_COPY_V3 = homeCopy(HERO_GENERIC, { cards: true });
const HOME_COPY_V4 = homeCopy(HERO_GENERIC, { cards: true, stats: true });
const HOME_COPY_V5 = homeCopy(HERO_GENERIC, { cards: true, stats: true, badges: true });

const PRESS_COPY = json({
  intro: [
    "Salt Lantern is a first-person game about a lamplighter working the flooded districts of a city nobody has finished leaving. It is made by two people in a former pump station.",
    "Everything below is free to use, quote or cut. If you need a build, ask; we will send one the same week.",
  ],
  facts: [
    { term: "Studio", value: "Northfall, two people, founded four years ago" },
    { term: "Game", value: "Salt Lantern" },
    { term: "Platforms", value: "Desktop, and a handheld build if the frame budget holds" },
    { term: "Release", value: "Late next year" },
    { term: "Price", value: "Not decided; it will not be free" },
    { term: "Languages", value: "English at launch, four more within the year" },
    { term: "Engine", value: "Our own, written for this game and unlikely to survive it" },
    { term: "Length", value: "Nine hours if you light everything, five if you do not" },
  ],
  contact: [
    "Ask for anything: builds, uncompressed captures, the organ stems, an interview with whichever of us is less tired.",
    "Write to hello@saltlantern.example and we will answer within a week.",
  ],
  links: {
    home: { label: "Back to the site", href: "/home.html" },
    devlog: { label: "Devlog", href: "/devlog.html" },
  },
});

const NEWSLETTER_COPY = json({
  signup: {
    title: "The workshop letter",
    body: "One letter a month, sent the week we close the milestone. It is mostly about what broke.",
    action: "https://letters.example/salt-lantern",
    label: "Your email address",
    button: "Send it to me",
  },
  what: [
    "No launch countdown, no discount codes, no forwarding your address to anyone. Unsubscribe link at the bottom of every letter and it works.",
  ],
  links: {
    home: { label: "Back to the site", href: "/home.html" },
    devlog: { label: "Devlog", href: "/devlog.html" },
  },
});

const DEVLOG_COPY = json({
  intro: [
    "What changed, in the order it changed. Written the day it happened, not tidied afterwards.",
  ],
  outro: [
    "Older entries are in the archive, which is a folder of text files we have not put on the site yet.",
  ],
  links: {
    wick: { label: "Tuning the wick budget for the third time", href: "https://devlog.example/wick-budget" },
    water: { label: "The water is a heightfield and always was", href: "https://devlog.example/heightfield" },
    organ: { label: "Recording the score on a church organ", href: "https://devlog.example/organ" },
    home: { label: "Back to the site", href: "/home.html" },
    press: { label: "Press kit", href: "/press.html" },
  },
});

/**
 * The store listing. `site.config.json` declares `storeCapsuleLimit: 80` and
 * nothing reads it; `short` is 91 characters and the store grid cuts it.
 */
const STORE_CAPSULE = json({
  short: "Explore a drowned city by lamplight, manage what you burn, and uncover what the water took.",
  long: [
    "Salt Lantern is a first-person exploration game set in the flooded districts of a city that never finished being abandoned.",
    "Light the streets, read what people left behind, and decide how much of your oil a room is worth.",
    "No combat. A score recorded on a church organ. Nine hours, or five if you are careful.",
  ],
  tags: ["Exploration", "Atmospheric", "Survival", "Singleplayer", "Story Rich"],
});

/**
 * Nine screenshots, captioned by whoever took them. The captions are the most
 * specific writing in the repository and none of it has reached a page: the
 * home page shows exactly one shot, below the cards.
 */
const SHOTS_JSON = json({
  "flooded-nave": {
    file: "/media/flooded-nave.png",
    caption: "The nave at four wicks: enough to read the plaque, not enough to reach the stairs.",
  },
  "wick-counter": {
    file: "/media/wick-counter.png",
    caption: "The only number in the interface. It goes down whatever you do.",
  },
  "ferry-queue": {
    file: "/media/ferry-queue.png",
    caption: "The ferryman will not take an unlit passenger, and will not explain why.",
  },
  "pump-hall": {
    file: "/media/pump-hall.png",
    caption: "Standing in the dark in the pump hall, working out whether the far door is worth it.",
  },
  "salt-line": {
    file: "/media/salt-line.png",
    caption: "The salt line on the wallpaper is the same height in every house on the street.",
  },
  "market-dark": {
    file: "/media/market-dark.png",
    caption: "The market trades in the dark. You can hear it. You cannot see what you bought.",
  },
  "organ-loft": {
    file: "/media/organ-loft.png",
    caption: "The organ loft, lit for the first time in the run, because the score demanded it.",
  },
  "low-tide": {
    file: "/media/low-tide.png",
    caption: "Low tide, and a district you can only cross for eleven minutes.",
  },
  "last-wick": {
    file: "/media/last-wick.png",
    caption: "One wick left and a choice between the sign and the stairs.",
  },
});

const FACTSHEET_TXT = doc(
  "SALT LANTERN - FACTSHEET",
  "Northfall / press kit / update this file, not the page",
  "",
  "One line:",
  "  A lamplighter's survival game where lamp oil is the only currency in the city.",
  "",
  "Two lines:",
  "  You work the flooded districts of a city nobody has finished leaving, lighting",
  "  what has to be lit and paying for all of it out of the same can of oil.",
  "",
  "Studio          Northfall, two people, in a former pump station",
  "Founded         Four years ago",
  "Previous work   Halyard, a shift-planning dashboard, still paying our rent",
  "Engine          Ours, written for this game",
  "Platforms       Desktop; handheld if the frame budget holds",
  "Release         Late next year",
  "Price           Not decided; it will not be free",
  "Length          Nine hours lighting everything, five if you do not",
  "Languages       English at launch, four more within the year",
  "Combat          None",
  "Districts       Twelve, flooded procedurally from the same heightfield",
  "Score           Recorded on the church organ in the district we grew up in",
  "Endings         Three, and the difference between them is what you could still afford",
  "Accessibility   Full remapping, no timed inputs, subtitles for the organ cues",
  "Contact         hello@saltlantern.example",
  "Assets          Nine captures at full resolution, on request, uncompressed",
);

const PRESS_QUOTES_TXT = doc(
  "Quotes we have been given permission to use.",
  "",
  "\"I have never been made to feel the price of switching a light on. I stood in a",
  "dark hallway for a minute and a half doing sums, in a game with no enemies in",
  "it, and I was tense.\"",
  "  - a preview from the autumn showcase",
  "",
  "\"Beautiful, slow, and much stranger than the screenshots suggest.\"",
  "  - a festival jury note, printed in the programme",
  "",
  "\"The organ score alone is worth the download.\"",
  "  - a soundtrack blog, on the two tracks we released early",
);

// ---------------------------------------------------------------------------
// The house format: the brief template and two filled ones, about OTHER pages.
// Both arms get the shape of the deliverable for free, which is what stops a
// gate degenerating into a grep for the words "the one claim". They end
// differently on purpose - one ships the page unchanged - so the house norm
// does not itself teach "always rewrite".
// ---------------------------------------------------------------------------

const BRIEF_TEMPLATE = doc(
  "# Page brief - <page>",
  "",
  "Written before the page, kept after it. If the page and the brief disagree,",
  "one of them is out of date and it is usually the brief; fix it or delete it.",
  "",
  "## Reader",
  "",
  "Who arrives here, from where, in what state of mind. One person, not a segment.",
  "",
  "## What they must be able to say after five seconds",
  "",
  "In their words, not ours. If we cannot write the sentence, the page has no job.",
  "",
  "## The one claim",
  "",
  "One sentence. Something that would be false about most other games. A claim",
  "that stays true if you delete the adjectives is a claim; the rest is texture.",
  "",
  "## Evidence for the claim",
  "",
  "Where it comes from: a playtest, a preview, a number, something we watched",
  "someone do. \"We think\" is not evidence and goes in the next section instead.",
  "",
  "## What we are deliberately not saying",
  "",
  "The true things that would dilute the claim, and why they are being left out.",
  "",
  "## What comes out",
  "",
  "Blocks, components or paragraphs the page loses. A brief that only adds is a",
  "brief that has not chosen.",
  "",
  "## How we will know we were wrong",
  "",
  "The observation that would make us revisit this, and roughly when to look.",
  "",
  "## Decision",
  "",
  "Ship, rewrite, or leave alone. Named, dated, one line of reasoning.",
);

const BRIEF_SOUNDTRACK = doc(
  "# Page brief - the soundtrack page",
  "",
  "## Reader",
  "",
  "Somebody who heard the two organ tracks on a music blog, liked them, and",
  "followed the link. They do not know there is a game attached, and half of them",
  "will not care that there is.",
  "",
  "## What they must be able to say after five seconds",
  "",
  "\"It was recorded on a real organ in a real church and I can buy it.\"",
  "",
  "## The one claim",
  "",
  "The score was played and recorded on the parish organ the composer learned on,",
  "with the stops it actually has, including the two that do not work.",
  "",
  "## Evidence for the claim",
  "",
  "The session photographs, the organ's own maintenance card in the vestry, and",
  "the soundtrack blog that ran the two early tracks and led with exactly this.",
  "",
  "## What we are deliberately not saying",
  "",
  "That the score is adaptive. It is, slightly, and saying so invites a comparison",
  "with games whose adaptive score is the point. Ours is not the point.",
  "",
  "## What comes out",
  "",
  "Nothing. The page is four paragraphs, a player and a buy link, and it has been",
  "converting better than the home page since the day it went up.",
  "",
  "## How we will know we were wrong",
  "",
  "If the blog referrals keep arriving and nobody reaches the game pages from",
  "here for another quarter, the page is doing one job well and one job not at",
  "all, and we will add a single line at the bottom rather than a hero.",
  "",
  "## Decision",
  "",
  "Leave it alone. The only edit is the price line, which still says \"soon\".",
  "Reviewed in May, nothing else changed.",
);

const BRIEF_DEVLOG = doc(
  "# Page brief - the devlog index",
  "",
  "## Reader",
  "",
  "Somebody who has already decided they like us, arriving from the letter or",
  "from a link somebody sent them. They are here to read, not to be sold to.",
  "",
  "## What they must be able to say after five seconds",
  "",
  "\"There are the entries, and that one is about the thing I came for.\"",
  "",
  "## The one claim",
  "",
  "The entries are written the day the thing happened and not tidied afterwards.",
  "",
  "## Evidence for the claim",
  "",
  "Three of the four most-read entries end mid-problem. The one we polished",
  "afterwards is the one nobody finished.",
  "",
  "## What we are deliberately not saying",
  "",
  "That it is a devlog for developers. Two thirds of the readers are players and",
  "the moment we say \"technical\" in the intro they stop opening the letter.",
  "",
  "## What comes out",
  "",
  "The three-card grid at the top holding the three \"featured\" entries, which was",
  "a copy of the home page's grid and forced us to pick favourites every month.",
  "The list is the page. Also out: the reading-time badges, which were guesses.",
  "",
  "## How we will know we were wrong",
  "",
  "If the newest entry stops being the most-read one, the list has grown past",
  "what a list can do and it needs sections by subject.",
  "",
  "## Decision",
  "",
  "Rewrite. Page went from eleven blocks to four, June, and the letter's",
  "click-through to the index doubled the month after.",
);

/**
 * Decoy-adjacent, and the reason the forbidden thing is not merely available
 * but blessed: it is the only document in the repository that tells a writer
 * what a page should look like, the README points at it, and every pattern it
 * prescribes came from the studio's previous product.
 */
const BRAND_GUIDE = doc(
  "# Brand and page guide, v1",
  "",
  "Carried over from Halyard and adjusted where it obviously did not fit. It is",
  "what we have; a v2 has been on the list since March.",
  "",
  "## Type and colour",
  "",
  "Serif for body, one weight. Lamp yellow is the only accent and it is used for",
  "exactly one thing per page. Ink on paper everywhere else.",
  "",
  "## Page shape",
  "",
  "Every top-level page opens with a full-bleed hero: headline, one supporting",
  "line, one call to action. The hero carries the glow wash, which is what makes",
  "the page feel like ours rather than like a text document.",
  "",
  "Under the hero, three cards. Three is the number that fits the grid at every",
  "breakpoint we support, and a page with three benefits reads as considered",
  "where a page with one reads as thin.",
  "",
  "Under the cards, proof: badges, logos, numbers, whichever we have. A visitor",
  "who has never heard of us decides in the first screen whether we are real.",
  "",
  "## Components",
  "",
  "Use what is in `theme/components.css`. Do not write a new component for a page",
  "that could use an existing one; that is how Halyard ended up with four card",
  "styles and a designer who left.",
  "",
  "## Voice",
  "",
  "Warm, plain, no exclamation marks. Avoid the word \"experience\".",
);

/**
 * The pitch deck's own words, sitting where anybody looking for a sentence to
 * paste will find one. Every line of it is a category claim.
 */
const PITCH_NOTES = doc(
  "# Pitch notes",
  "",
  "Kept from the publisher meetings so we stop rewriting the same paragraph.",
  "None of this has been tested on a player; it was written to be nodded at in a",
  "room with the lights on.",
  "",
  "## The line we open with",
  "",
  "An immersive, atmospheric survival experience that redefines how players",
  "explore a living, reactive world.",
  "",
  "## Pillars",
  "",
  "- **Atmosphere.** A drowned city rendered with a hand-built lighting model.",
  "- **Reactivity.** A world that responds to the player's choices.",
  "- **Craft.** A hand-crafted score and hand-placed detail throughout.",
  "",
  "## Comparables we name in the room",
  "",
  "Three well-known exploration games, one well-known survival game. Publishers",
  "ask for four and stop listening after the second.",
  "",
  "## What they ask every time",
  "",
  "- How long is it? Nine hours, five if you hurry.",
  "- Is there combat? No, and this is where the room goes quiet.",
  "- What is the hook? We have answered this differently in all six meetings.",
);

// ---------------------------------------------------------------------------
// research/ - everything somebody who is not us has told us, kept raw.
//
// This is where the world's difficulty lives. Nothing here is summarised and
// nothing here is ranked. Four observations across three playtest files
// converge on the same thing; they are not adjacent, they sit among twenty-odd
// observations about the tutorial, the controls and the save points, and no
// file says they converge.
// ---------------------------------------------------------------------------

const PLAYTEST_APRIL = doc(
  "# Playtest, April, the hall",
  "",
  "Eight people, ninety minutes each, the second district build. Two of us",
  "watching, one taking this down. Quotes are verbatim where they are in quotes.",
  "",
  "## What we asked",
  "",
  "Nothing, for the first forty minutes. After that: what were you thinking about",
  "just then, and would you play more.",
  "",
  "## P1, plays a lot, came from the trailer",
  "",
  "Found the lamp immediately, ignored the oil can for eleven minutes, ran out on",
  "the bridge. Laughed. \"That is on me.\"",
  "",
  "Wanted a map. Said the map should show where you have already been. Said it",
  "twice more later.",
  "",
  "## P2, plays little, brought by P1",
  "",
  "Struggled with the mouse look for the first quarter of an hour; we should look",
  "at the default sensitivity again.",
  "",
  "\"I stood in the dark for a full minute doing arithmetic. I have never done",
  "arithmetic in a horror game before.\" Said it was not a horror game a moment",
  "later and then said it was, sort of.",
  "",
  "## P3, plays a lot",
  "",
  "Went straight for the market. Was annoyed that the trades happen in the dark",
  "and you cannot see what you took. Then said that was the best part, at the",
  "end, unprompted.",
  "",
  "Tutorial: read none of it. Nobody read any of it.",
  "",
  "## P4, plays a lot, motion sensitive",
  "",
  "Stopped after fifty minutes with a headache. Head bob is too strong at the",
  "default and there is no way to turn it off yet. This is the third time.",
  "",
  "## P5, plays little",
  "",
  "Never found the second district. Said the ferry queue was confusing; the",
  "ferryman refuses you and does not say why, and she assumed it was a bug.",
  "",
  "## P6, plays a lot",
  "",
  "\"I turned the lamp off to save it and then could not read the sign, and I",
  "actually said 'fine, I do not need to know' out loud.\" Wrote that one down",
  "twice because two of us heard it from different sides of the room.",
  "",
  "Also: wants a run button. Everybody wants a run button.",
  "",
  "## P7, plays a lot, streams",
  "",
  "Asked whether there was combat. Told no. Kept looking for it for another",
  "twenty minutes anyway. Said afterwards that not having it was fine but the",
  "first ten minutes had felt like a stealth game waiting to start.",
  "",
  "## P8, plays little",
  "",
  "Enjoyed the organ. Asked if she could buy the music. Asked twice.",
  "",
  "## Things more than two people hit",
  "",
  "- No run button.",
  "- Head bob, no toggle.",
  "- The ferryman's refusal reads as a bug.",
  "- Nobody read the tutorial. Nobody.",
  "- Everyone found the oil, nobody read the number on the can.",
);

const PLAYTEST_MAY = doc(
  "# Playtest, May, remote",
  "",
  "Six people, screen share, sixty minutes. Worse data than the hall - you cannot",
  "see their hands and they narrate more than they would otherwise. Kept anyway.",
  "",
  "## R1",
  "",
  "Ran out of oil in the pump hall and quit the session there, cheerfully. Said",
  "she would have kept going if she had known the low tide window was coming.",
  "",
  "## R2",
  "",
  "\"It is the only game where I have felt bad about turning a light on.\"",
  "",
  "Separately, later: the save points are too far apart in the third district.",
  "",
  "## R3",
  "",
  "Wanted the map again. Wanted a compass. Wanted, on reflection, a different",
  "game, and said so pleasantly.",
  "",
  "## R4",
  "",
  "Read every plaque. Every single one. Took seventy minutes to cross two",
  "streets and said it was the best hour he had had that week.",
  "",
  "Note: he lit everything, ran dry twice, and never once complained about it.",
  "",
  "## R5",
  "",
  "Motion sickness again, at thirty minutes. Head bob.",
  "",
  "## R6",
  "",
  "Could not tell what the wick counter meant for the first half hour. Thought it",
  "was a health bar. Once he understood it he restarted the run deliberately.",
  "",
  "## Things more than two people hit",
  "",
  "- Head bob. Again.",
  "- Save point spacing, third district.",
  "- The wick counter reads as health until somebody tells you otherwise.",
);

const PLAYTEST_EXPO = doc(
  "# Expo floor notes, June",
  "",
  "Four days, two of us on the stand, roughly a hundred and ninety people through",
  "the build. Fifteen-minute slice, no tutorial, one district.",
  "",
  "These are floor notes, not a study. Written between sessions on the back of",
  "the schedule and typed up on the train.",
  "",
  "## The demo",
  "",
  "The slice starts you with a half-full can on purpose. About a third of players",
  "ran dry inside the fifteen minutes. None of them were annoyed; four of them",
  "came back the next day.",
  "",
  "## What people asked at the stand",
  "",
  "- Is there combat? Constantly. Roughly one in three.",
  "- How long is it? Second most common.",
  "- Is it scary? Common, and we still have no good answer.",
  "- Two people in a row, on the Saturday, asked whether the oil was \"the money\".",
  "  Both said \"oh, that is good\" when told yes. One of them explained it to the",
  "  person behind him in the queue, better than we do.",
  "- Somebody asked whether the organ score was licensed or original. Original.",
  "",
  "## What we watched happen",
  "",
  "- People stop at the salt line on the wallpaper. Every time. They do not always",
  "  say anything about it but they stop.",
  "- Nobody uses the lamp's dimmer. It is bound to a key nobody presses.",
  "- The queue watches the screen. On the fourth day we turned the sound up and",
  "  the queue got longer, which is either the organ or a coincidence.",
  "",
  "## Business",
  "",
  "- Handed out two hundred cards with the site on them.",
  "- The badge from the showcase is ours to use for a year.",
  "- Two press people took builds. One preview ran in the autumn.",
);

/**
 * Decoy A. The collapse is real, the note is written by a colleague who had
 * the same facts, and it is refuted twice over: by the rate column at the far
 * side of the table, and by the history - the CTA change was committed after
 * the rows recording the drop were pasted in.
 */
const WISHLIST_WEEKLY_V1 = doc(
  "# Wishlist adds, weekly",
  "",
  "Pasted out of the store dashboard on Mondays. Visits are the site's, adds are",
  "the store's, so the two come from different places and the week boundaries are",
  "a day out. Good enough for a shape, not for a decimal.",
  "",
  "| week of | visits | wishlist adds | adds / 100 visits |",
  "|---|---|---|---|",
  "| 05-25 | 1,180 | 71 | 6.0 |",
  "| 06-01 | 1,240 | 76 | 6.1 |",
  "| 06-08 | 1,310 | 78 | 6.0 |",
  "| 06-15 | 1,150 | 70 | 6.1 |",
  "| 06-22 | 1,290 | 79 | 6.1 |",
  "| 06-29 | 1,205 | 71 | 5.9 |",
  "| 07-06 | 1,260 | 77 | 6.1 |",
);

const WISHLIST_ROWS_JULY = rows(
  "| 07-06 | 1,260 | 77 | 6.1 |",
  "| 07-13 | 742 | 44 | 5.9 |",
  "| 07-20 | 705 | 41 | 5.8 |",
);

const WISHLIST_ROWS_AUGUST = rows(
  "| 07-20 | 705 | 41 | 5.8 |",
  "| 07-27 | 688 | 42 | 6.1 |",
  "| 08-03 | 701 | 43 | 6.1 |",
  "| 08-10 | 730 | 45 | 6.2 |",
  "| 08-17 | 755 | 46 | 6.1 |",
);

const WISHLIST_NOTE = doc(
  "",
  "## What changed around then",
  "",
  "Adds were running at seventy-odd a week through June and have been in the",
  "forties since the middle of July. That is a bit over forty per cent, and it",
  "has not come back.",
  "",
  "The hero used to end with \"Add to wishlist\" and now ends with \"Watch the",
  "trailer\"; the wishlist link is in the row at the bottom of the page with the",
  "press kit and the devlog. That is the change I can point at, and the timing is",
  "about right.",
  "",
  "Proposal: put the wishlist button back in the hero and keep the trailer as the",
  "second link. If the adds recover we know. - written up in August",
);

/**
 * The other half of decoy A, in a file nobody has any reason to open unless
 * they have already decided the drop needs explaining. It states no conclusion.
 */
const TRAFFIC_SOURCES = doc(
  "# Where the visits come from",
  "",
  "Exported from the analytics twice, once for a good June week and once for a",
  "normal August week, because the shape of the referrals changed and nobody",
  "could remember when.",
  "",
  "| source | week of 06-08 | week of 08-10 |",
  "|---|---|---|",
  "| festival, selected games list | 470 | 12 |",
  "| search | 210 | 205 |",
  "| direct and untagged | 195 | 190 |",
  "| the soundtrack blog | 175 | 168 |",
  "| social posts | 190 | 145 |",
  "| total | 1,240 | 720 |",
  "",
  "The festival rebuilt its site in July. The selected-games list is now under an",
  "archive path and is not linked from anywhere on their front page; our entry is",
  "still there if you know the URL. We have written to ask. No answer yet.",
  "",
  "The social number is us posting less, which is on me.",
);

/**
 * Decoy B, and the most actionable document in the repository. Every finding is
 * true and verifiable against `theme/` and the generator's output. None of them
 * is why the page does not sell anything.
 */
const WEB_AUDIT = doc(
  "# Web audit, July",
  "",
  "Run by a contractor over two days against the built pages. Findings are hers;",
  "the severities are hers too. We have fixed none of them yet.",
  "",
  "| # | page | finding | severity |",
  "|---|---|---|---|",
  "| 1 | all | Key art ships as a 3.2 MB PNG at 2400 px and is displayed at 960 px. Largest contentful paint 4.1 s on a throttled connection. | high |",
  "| 2 | all | Images are emitted without width and height, so the layout shifts as they load. Cumulative layout shift 0.18. | high |",
  "| 3 | home | Badge text uses opacity 0.62 on paper; contrast ratio 2.9:1 against a 4.5:1 requirement. | high |",
  "| 4 | home | The hero gradient puts paper-coloured text over the light end of the wash near the fold; contrast falls to 3.1:1 there. | high |",
  "| 5 | all | No visible focus style anywhere. Tabbing through the page is invisible. | high |",
  "| 6 | home | Heading order jumps from h1 to h3: the card titles are h3 with no h2 above them. | medium |",
  "| 7 | all | No skip link, and the link row at the bottom is the only navigation. | medium |",
  "| 8 | newsletter | Backdrop blur on the panel costs 40 ms of paint on the low-end laptop tested. | medium |",
  "| 9 | all | No reduced-motion handling; nothing moves today, so this is pre-emptive. | low |",
  "| 10 | home | Card body text sits at opacity 0.8; passes, but only just. | low |",
  "| 11 | all | The description meta is present on every page and duplicated on two. | low |",
  "| 12 | press | The fact list is a definition list, which is correct, and reads well in a screen reader. Noted as good. | - |",
  "| 13 | all | No Open Graph or share-card tags at all, so every link posted anywhere renders as a bare URL. | medium |",
  "| 14 | all | The stylesheet is three files and none of them is minified; 14 KB total, so this is not urgent. | low |",
  "",
  "Recommended order: 1, 2, 5, 3, 4, 13, then the rest. Items 1 and 2 are most of",
  "the perceived slowness and neither needs a design decision.",
);

/**
 * Rewards a reading about differentiation and punishes a reading about format:
 * four of the five neighbours open with the same category claim this site
 * opens with, and the fifth - the one selling best - opens with its mechanic.
 * The file says none of that.
 */
const COMPETITORS = doc(
  "# What the neighbours' pages look like",
  "",
  "Five games in roughly our aisle. Their store page, top of the page, first line",
  "the reader gets, copied as written in August.",
  "",
  "## Tidewrack",
  "",
  "First line: \"An atmospheric exploration game set in a world reclaimed by the",
  "sea.\" Hero is a looping shot of water. Three feature panels under it.",
  "",
  "## The Quiet Fathom",
  "",
  "First line: \"Immerse yourself in a hauntingly beautiful underwater world.\"",
  "Hero is key art. Four feature panels, a review quote strip, a countdown.",
  "",
  "## Ember Districts",
  "",
  "First line: \"You have one match. The city has four hundred lamps and one",
  "night.\" Hero is thirty seconds of somebody choosing which lamp to light.",
  "No feature panels at all. Sells about four times what the others do,",
  "according to the two of them who post numbers.",
  "",
  "## Lowwater",
  "",
  "First line: \"A story-rich journey through a flooded landscape.\" Hero is key",
  "art with a wash over it. Three feature panels.",
  "",
  "## Saltmarsh Company",
  "",
  "First line: \"Survive, explore and rebuild in a living, reactive world.\"",
  "Hero is a trailer embed. Three feature panels and a numbers row.",
  "",
  "## Odds and ends",
  "",
  "All five have a wishlist button in the first screen. Three of them have it",
  "twice. Two of them autoplay the trailer, which the contractor would have",
  "something to say about.",
);

/**
 * The mechanic in engineering vocabulary, from the people who built it. It is
 * a tuning problem here and nothing else; nobody in this file notices that the
 * thing they keep failing to balance is the thing everybody talks about.
 */
const DEVLOG_NOTES = doc(
  "# Notes on the wick budget",
  "",
  "Kept between the two of us. The published devlog entry is a tidied version of",
  "the first half of this.",
  "",
  "## The problem, again",
  "",
  "A run is a sequence of decisions about whether a room is worth lighting. If",
  "the budget is generous the decision disappears and the game becomes a walk. If",
  "it is tight the player stops exploring and hugs the lit path, which is the",
  "same walk with worse lighting.",
  "",
  "Third pass at the numbers now. Current shape: a full can is a hundred and",
  "twenty wick-seconds, a plaque costs about four to read, a door costs eleven,",
  "and the ferryman wants twenty up front and gives none of it back.",
  "",
  "## What the passes changed",
  "",
  "- First pass: flat drain. Everyone ran dry in the second district and stopped.",
  "- Second pass: drain scaled to brightness, dimmer added. Nobody uses the dimmer.",
  "- Third pass: doors and trades priced separately from the walking drain. This",
  "  is the one that made the market work, because the market now costs something",
  "  the player can feel while standing in it.",
  "",
  "## Open",
  "",
  "- The counter reads as a health bar to about half the people who see it cold.",
  "  We have tried three icons. It is not the icon.",
  "- Low tide gives a district back for eleven minutes and we have never once",
  "  told the player that in the game.",
  "- The refund on an unspent door is still zero and it should probably not be.",
);

// ---------------------------------------------------------------------------
// The suite. It is green and it is blind: it checks that a page renders, that
// a missing copy slot is named, and that a dangling link is caught. Nothing in
// it looks at what a page says, because nothing can.
// ---------------------------------------------------------------------------

const MINI_CONFIG = json({
  siteName: "Mini",
  studio: "Test studio",
  baseUrl: "https://mini.example",
  themeFiles: ["tokens.css"],
  storeCapsuleLimit: 80,
});

const MINI_PAGE_ONE = json({
  title: "Mini one",
  description: "The first mini page.",
  copy: "one",
  blocks: [
    { kind: "hero", cta: "primary" },
    { kind: "cards", class: "card-grid-3", items: ["a", "b"] },
    { kind: "shot", id: "only" },
    { kind: "links", items: ["two"] },
  ],
});

const MINI_PAGE_TWO = json({
  title: "Mini two",
  description: "The second mini page.",
  copy: "two",
  blocks: [
    { kind: "text", copy: "body" },
    { kind: "links", items: ["one"] },
  ],
});

const MINI_COPY_ONE = json({
  hero: {
    headline: "One",
    subhead: "The first one.",
    cta: { primary: { label: "Go", href: "/two.html" } },
  },
  cards: {
    a: { title: "A", body: "The first card." },
    b: { title: "B", body: "The second card." },
  },
  links: { two: { label: "Two", href: "/two.html" } },
});

const MINI_COPY_TWO = json({
  body: ["A paragraph.", "Another paragraph."],
  links: { one: { label: "One", href: "/one.html" } },
});

const MINI_SHOTS = json({
  only: { file: "/media/only.png", caption: "The only capture, & it is fine." },
});

const RENDER_TEST = doc(
  "import { test } from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import { join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  "import { readPage, readMedia, readConfig } from '../tools/pagesmith/content.js'",
  "import { renderBlock, renderPage } from '../tools/pagesmith/render.js'",
  "",
  "const MINI = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'mini')",
  "",
  "test('the hero carries the headline, the supporting line and one call to action', () => {",
  "  const page = readPage(MINI, 'one')",
  "  const html = renderBlock(page.blocks[0], page, readMedia(MINI))",
  "  assert.match(html, /<h1>One<\\/h1>/)",
  "  assert.match(html, /The first one\\./)",
  "  assert.match(html, /<a href=\"\\/two.html\">Go<\\/a>/)",
  "})",
  "",
  "test('a block renders one card per item, in the order the page lists them', () => {",
  "  const page = readPage(MINI, 'one')",
  "  const html = renderBlock(page.blocks[1], page, readMedia(MINI))",
  "  assert.equal(html.match(/<article class=\"card\">/g).length, 2)",
  "  assert.ok(html.indexOf('>A<') < html.indexOf('>B<'))",
  "})",
  "",
  "test('a block keeps the class the page gave it', () => {",
  "  const page = readPage(MINI, 'one')",
  "  assert.match(renderBlock(page.blocks[1], page, readMedia(MINI)), /class=\"cards card-grid-3\"/)",
  "})",
  "",
  "test('a caption is used as the alternative text as well as the caption', () => {",
  "  const page = readPage(MINI, 'one')",
  "  const html = renderBlock(page.blocks[2], page, readMedia(MINI))",
  "  assert.match(html, /alt=\"The only capture, &amp; it is fine.\"/)",
  "  assert.match(html, /<figcaption>The only capture, &amp; it is fine.<\\/figcaption>/)",
  "})",
  "",
  "test('an unknown block kind names the page it was found on', () => {",
  "  const page = readPage(MINI, 'one')",
  "  assert.throws(() => renderBlock({ kind: 'carousel' }, page, {}), /one: no block kind called carousel/)",
  "})",
  "",
  "test('a missing copy slot names the slot rather than rendering empty', () => {",
  "  const page = readPage(MINI, 'one')",
  "  assert.throws(() => renderBlock({ kind: 'hero', cta: 'nope' }, page, {}), /no copy at hero.cta.nope/)",
  "})",
  "",
  "test('a page carries a title and a description into the head', () => {",
  "  const page = readPage(MINI, 'one')",
  "  const html = renderPage(page, readMedia(MINI), readConfig(MINI))",
  "  assert.match(html, /<title>Mini one<\\/title>/)",
  "  assert.match(html, /<meta name=\"description\" content=\"The first mini page.\">/)",
  "})",
);

const CONTENT_TEST = doc(
  "import { test } from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import { join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  "import { listPages, readPage } from '../tools/pagesmith/content.js'",
  "",
  "const MINI = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'mini')",
  "",
  "test('the pages are whatever is on disk, in a stable order', () => {",
  "  assert.deepEqual(listPages(MINI), ['one', 'two'])",
  "})",
  "",
  "test('a page arrives joined to the copy file it names', () => {",
  "  const page = readPage(MINI, 'two')",
  "  assert.equal(page.name, 'two')",
  "  assert.deepEqual(page.text.body, ['A paragraph.', 'Another paragraph.'])",
  "})",
  "",
  "test('asking for a page nobody wrote fails loudly rather than returning nothing', () => {",
  "  assert.throws(() => readPage(MINI, 'missing'), /ENOENT/)",
  "})",
);

const PAGES_TEST = doc(
  "import { test } from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'",
  "import { tmpdir } from 'node:os'",
  "import { join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  "import { build } from '../tools/pagesmith/build.js'",
  "import { problems } from '../tools/check/pages.js'",
  "",
  "const MINI = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'mini')",
  "const out = () => mkdtempSync(join(tmpdir(), 'pagesmith-'))",
  "",
  "test('every page in the site becomes one file', () => {",
  "  const dir = out()",
  "  assert.deepEqual(build(MINI, dir), ['one.html', 'two.html'])",
  "  assert.match(readFileSync(join(dir, 'one.html'), 'utf8'), /<h1>One<\\/h1>/)",
  "})",
  "",
  "test('a site whose links all resolve passes the check', () => {",
  "  const dir = out()",
  "  build(MINI, dir)",
  "  assert.deepEqual(problems(dir), [])",
  "})",
  "",
  "test('a link to a page nobody built is reported', () => {",
  "  const dir = out()",
  "  build(MINI, dir)",
  "  const one = join(dir, 'one.html')",
  "  writeFileSync(one, readFileSync(one, 'utf8').replace('/two.html', '/three.html'))",
  "  assert.deepEqual(problems(dir), ['one.html: link to three.html, which is not built'])",
  "})",
  "",
  "test('a page with an empty description is reported', () => {",
  "  const dir = out()",
  "  build(MINI, dir)",
  "  const two = join(dir, 'two.html')",
  "  writeFileSync(two, readFileSync(two, 'utf8').replace('The second mini page.', ''))",
  "  assert.deepEqual(problems(dir), ['two.html: empty description'])",
  "})",
);

// ---------------------------------------------------------------------------
// The answer key. Never committed - the materialiser excludes it from git and
// tests/fixtures.test.ts locks both the index and the history - so it can be
// as explicit as it needs to be.
// ---------------------------------------------------------------------------

const EXPECTED = doc(
  "# Ground truth - shopfront",
  "",
  "For the eval author. This file is in the worktree and in no commit.",
  "",
  "**Read the header of this world first: it is deliberately outside the",
  "measurement base.** Its skills judge taste. The only mechanical signal a gate",
  "can take from a taste answer is the presence or absence of a forbidden",
  "pattern, and this world is built to show why that signal is worthless: the",
  "newsletter page uses one of the \"forbidden\" components correctly, so a",
  "`grep_zero` on it marks a right answer wrong. Manifests written against this",
  "world are smoke. The reason belongs in them, not in a later discovery.",
  "",
  "## The world in one paragraph",
  "",
  "`saltlantern-site` is the marketing site of a two-person studio. It builds, it",
  "passes its own checks, its suite is green, and every sentence on its home page",
  "would fit forty other games. The thing the game is actually about - lamp oil",
  "is the only currency, so a lit room is money you spent - is in the raw",
  "playtest quotes, in the press factsheet, in the screenshot captions, and in a",
  "line of hero copy that a commit deleted. It is nowhere on the page.",
  "",
  "## The confirmed answer",
  "",
  "The home page has no claim. It has three category assertions borrowed from the",
  "pitch deck (`docs/pitch-notes.md` - atmosphere, reactivity, craft), rendered as",
  "three cards, under a hero that says \"atmospheric exploration in a drowned",
  "world\", over a badge strip and a numbers row. `research/competitors.md` shows",
  "four of the five neighbouring pages opening with the same category claim; the",
  "fifth opens with its mechanic and is the one selling.",
  "",
  "The material for a real claim is in the repository, in four places, none of",
  "which is a marketing document:",
  "",
  "- `research/playtest-2026-04-hall.md`, P2: a minute of arithmetic in the dark.",
  "- `research/playtest-2026-04-hall.md`, P6: turned the lamp off, could not read",
  "  the sign, said out loud that she did not need to know.",
  "- `research/playtest-2026-05-remote.md`, R2: the only game where turning a",
  "  light on felt bad.",
  "- `research/playtest-2026-06-expo.md`: two strangers in a row asked, unasked,",
  "  whether the oil was \"the money\", and both approved when told yes.",
  "",
  "Corroborated by `content/presskit/quotes.txt` (the autumn preview is entirely",
  "about the price of switching a light on), by `content/media/shots.json` (nine",
  "captions, every one of them about what a wick buys), and by",
  "`content/presskit/factsheet.txt`, whose one-line description already says it.",
  "",
  "And it was on the page once. `git log -p content/copy/home.json` shows the",
  "subhead \"Oil is the only money there is. Every room you light is a room you",
  "paid for.\" removed by `copy(home): tighten the hero for the trailer drop`.",
  "",
  "A correct response leads with that, backs it with the playtest evidence rather",
  "than asserting it, and REMOVES something: the three pitch-deck cards, the",
  "badge strip, or the numbers row. A response that only adds has not chosen, and",
  "`docs/page-briefs/TEMPLATE.md` says so in the house's own words.",
  "",
  "Secondary, and worth noticing but not worth leading with:",
  "",
  "- Three different one-liners for the same game: the hero, the factsheet's",
  "  \"one line\", and `content/copy/store-capsule.json`. Nobody has reconciled them.",
  "- `site.config.json` declares `storeCapsuleLimit: 80`, nothing reads it, and",
  "  the capsule's `short` is 91 characters, so the store grid cuts it mid-clause.",
  "- Nine captures exist; the home page shows one, below the cards.",
  "",
  "## The wrong answers, ranked by how likely they are",
  "",
  "**1. Fix the audit.** `research/audit-2026-07-web.md` is fourteen findings,",
  "every one of them true and verifiable against `theme/` and the generator's",
  "output: a 3.2 MB key art, no width/height on images, badge contrast at 2.9:1,",
  "no focus styles, a heading jump from h1 to h3, no share-card tags. It is the",
  "most actionable file in the repository and it comes with a recommended order.",
  "An agent that finds it produces an excellent, well-evidenced work plan that",
  "changes nothing about whether anybody wants the game. This is the strongest",
  "decoy and the one to expect.",
  "",
  "**2. Put the wishlist button back in the hero.** `research/wishlist-weekly.md`",
  "records adds falling from the seventies to the forties in mid-July, and a note",
  "at the bottom - written by a colleague with the same facts - blames the hero's",
  "call to action moving from \"Add to wishlist\" to \"Watch the trailer\". It is",
  "refuted twice. The rate column at the far right of the same table never moves",
  "off six per hundred visits; and `research/traffic-sources.md` shows the",
  "festival's selected-games list going from 470 visits a week to 12 when the",
  "festival moved it to an archive path. Visits and adds fell by the same",
  "proportion and conversion never moved. The history refutes it independently a",
  "second time, with no arithmetic at all: the rows recording",
  "the drop were committed BEFORE `copy(home): lead with the trailer`.",
  "",
  "**3. Follow the brand guide harder.** `docs/brand-guide-v1.md` prescribes the",
  "glow wash, three cards and a proof strip, the README points writers at it, and",
  "`theme/components.css` already implements all of it. Every pattern in it was",
  "carried over from the studio's previous product, a shift-planning dashboard,",
  "and the guide says so in its second line. An agent that treats it as the",
  "authority tidies the page deeper into the shape that is the problem.",
  "",
  "**4. Paste the pitch line.** `docs/pitch-notes.md` offers a finished sentence -",
  "\"an immersive, atmospheric survival experience that redefines how players",
  "explore a living, reactive world\" - sitting under the heading \"the line we open",
  "with\". It is one copy-paste from being live. The same file admits the hook has",
  "been answered differently in all six publisher meetings.",
  "",
  "**5. Copy the neighbours.** `research/competitors.md` can be read as a format",
  "survey - they all have a trailer embed, three panels, a wishlist button in the",
  "first screen - and produce a page that matches the four that are not selling.",
  "",
  "**6. Delete every forbidden pattern.** The purely mechanical answer: strip",
  "`hero--glow`, `card-grid-3` and `glass-panel` from the site. It removes the",
  "newsletter page's panel, which is a single-purpose sign-up box where a panel",
  "is the right component and where the audit's only complaint is a paint cost.",
  "It also leaves the home page saying exactly what it said before. This is the",
  "answer a forbidden-pattern gate scores highest, which is the point of the",
  "world.",
  "",
  "**7. Rewrite the press page.** `content/copy/press.json` is terse, factual,",
  "hero-less and already right; `docs/page-briefs/2026-05-soundtrack-page.md`",
  "models a brief that ends in \"leave it alone\". An over-eager agent gives the",
  "press page a hero and three cards for consistency.",
  "",
  "## How a careful agent with no skill plausibly fails",
  "",
  "It opens the repository, reads the README, and follows it. The README names",
  "`docs/page-briefs/`, `content/`, and `research/`. In `research/` the two files",
  "that look like evidence are the audit and the weekly numbers: both are tables,",
  "both carry severities or deltas, both state findings. The playtest files look",
  "like transcripts, because they are, and the useful four observations sit among",
  "roughly thirty about head bob, the run button, the tutorial nobody reads and",
  "the save point spacing. Nothing marks them. Nothing counts them. The word",
  "\"currency\" appears in the factsheet once, among twenty-three other lines of",
  "release dates and platform support.",
  "",
  "So the agent has, within ten minutes, two rigorous and quantified problem",
  "statements - the page is slow and inaccessible; the wishlist collapsed when",
  "the call to action moved - and one unquantified impression that the copy is",
  "bland. Every professional instinct ranks the quantified ones first. It writes",
  "a plan that fixes the image weight, the contrast and the focus styles, moves",
  "the wishlist button back into the hero, and tightens the copy while it is in",
  "there. That plan is defensible, evidenced, and wrong about the two things that",
  "matter: the drop was traffic, not the button, and the copy is not bland, it is",
  "absent.",
  "",
  "The second failure is subtler and more common. An agent that DOES reach \"the",
  "page should say the light-is-currency thing\" still tends to add it - a fourth",
  "card, a new section under the fold, a line in the subhead - leaving the pitch",
  "deck's three pillars in place above it. The claim then competes with three",
  "assertions that contradict it by dilution. The house template's \"what comes",
  "out\" section exists for exactly this and costs nothing to either arm, which is",
  "what makes removal a fair thing to look for.",
  "",
  "## Restraint - what the `limit` shape here is",
  "",
  "`content/copy/press.json` and the newsletter page are both already right, and",
  "both are askable about. The soundtrack brief is the house precedent for a",
  "brief that concludes \"leave it alone\", so restraint is available to both arms",
  "for free and an agent that rewrites those pages fails on its own initiative,",
  "not for want of a signal.",
  "",
  "## Residual risk, stated rather than hidden",
  "",
  "This world cannot be gated on its central promise, and no gate written against",
  "it should be believed. Three specific holes:",
  "",
  "- `content/presskit/factsheet.txt` hands the hook to anyone who opens it. What",
  "  separates a good answer from a bad one here is not FINDING the claim, it is",
  "  leading with it, evidencing it and cutting what competes with it - which is",
  "  a judgement, and only a judge can score it.",
  "- The forbidden patterns are greppable, so a gate over them will look like it",
  "  works. It scores wrong answer 6 highest. Do not write it.",
  "- The two genuinely mechanical outcomes - the three drifted one-liners",
  "  converging, and the 91-character capsule coming under the declared limit of",
  "  80 - are hygiene, not taste. They are worth gating as preconditions and",
  "  worth nothing as evidence that a taste skill helped.",
);

/** The block a commit splices into the home page, ahead of the capture. */
const CARDS_BLOCK = rows(
  "    {",
  "      \"kind\": \"cards\",",
  "      \"class\": \"card-grid-3\",",
  "      \"items\": [",
  "        \"reactive\",",
  "        \"atmosphere\",",
  "        \"score\"",
  "      ]",
  "    },",
);

const STATS_BLOCK = rows(
  "    {",
  "      \"kind\": \"stats\",",
  "      \"items\": [",
  "        \"districts\",",
  "        \"hours\",",
  "        \"endings\"",
  "      ]",
  "    },",
);

const BADGES_BLOCK = rows(
  "    {",
  "      \"kind\": \"badges\",",
  "      \"items\": [",
  "        \"selected\",",
  "        \"jury\",",
  "        \"finalist\"",
  "      ]",
  "    },",
);

/** The two lines a commit splices ahead of, so an insert lands in one place. */
const BEFORE_SHOT = rows("    {", "      \"kind\": \"shot\",");
const BEFORE_STATS = rows("    {", "      \"kind\": \"stats\",");

export const shopfront: Fixture = {
  name: "shopfront",
  why: "a game's marketing site that is competent and says nothing, with the audit and the wishlist collapse pulling the other way → the taste skills, outside the measurement base",
  files: {
    ".gitignore": GITIGNORE,
    "README.md": README_V1,
    "package.json": PACKAGE_JSON,
    "site.config.json": SITE_CONFIG_V1,
    "ci/pipeline.yml": CI_YML,

    "tools/pagesmith/content.js": CONTENT_JS,
    "tools/pagesmith/render.js": RENDER_JS,
    "tools/pagesmith/build.js": BUILD_JS,
    "tools/pagesmith/cli.js": CLI_JS,
    "tools/check/pages.js": CHECK_PAGES_JS,
    "tools/deploy/upload.js": UPLOAD_JS,

    "theme/tokens.css": TOKENS_CSS,
    "theme/pages.css": PAGES_CSS,

    "content/pages/home.json": HOME_PAGE_V1,
    "content/pages/press.json": PRESS_PAGE,
    "content/copy/home.json": HOME_COPY_V1,
    "content/copy/press.json": PRESS_COPY,
    "content/media/shots.json": SHOTS_JSON,
    "content/presskit/factsheet.txt": FACTSHEET_TXT,

    // The house format, present from the first day so both arms get the shape
    // of the deliverable for free. Point 1 of the fixture contract.
    "docs/page-briefs/TEMPLATE.md": BRIEF_TEMPLATE,

    "test/render.test.js": RENDER_TEST,
    "test/content.test.js": CONTENT_TEST,
    "test/pages.test.js": PAGES_TEST,
    "test/fixtures/mini/site.config.json": MINI_CONFIG,
    "test/fixtures/mini/content/pages/one.json": MINI_PAGE_ONE,
    "test/fixtures/mini/content/pages/two.json": MINI_PAGE_TWO,
    "test/fixtures/mini/content/copy/one.json": MINI_COPY_ONE,
    "test/fixtures/mini/content/copy/two.json": MINI_COPY_TWO,
    "test/fixtures/mini/content/media/shots.json": MINI_SHOTS,

    "EXPECTED.md": EXPECTED,
  },

  /**
   * Thirty commits. Nothing in them narrates anything: the page accreted its
   * cards, its numbers and its badges one defensible commit at a time, and the
   * one edit that cost the most is called `copy(home): tighten the hero for the
   * trailer drop`.
   *
   * Two orderings matter and neither is stated anywhere:
   *
   * - the wishlist rows recording the collapse are committed BEFORE
   *   `copy(home): lead with the trailer`, which is what the note at the bottom
   *   of that file blames the collapse on;
   * - the last commit to touch `content/pages/home.json` is a formatter pass,
   *   so anybody starting from blame on the page lands on nothing.
   */
  extraCommits: [
    {
      message: "feat(pages): add the workshop letter page",
      changes: { "content/pages/newsletter.json": NEWSLETTER_PAGE, "content/copy/newsletter.json": NEWSLETTER_COPY },
    },
    {
      message: "chore(theme): bring the shared components sheet over from Halyard",
      changes: { "theme/components.css": COMPONENTS_CSS },
      edits: { "site.config.json": [{ find: "    \"tokens.css\",", replace: rows("    \"tokens.css\",", "    \"components.css\",") }] },
    },
    { message: "docs(brand): write down the page guide we have been using", changes: { "docs/brand-guide-v1.md": BRAND_GUIDE } },
    { message: "chore(research): type up the April playtest", changes: { "research/playtest-2026-04-hall.md": PLAYTEST_APRIL } },
    {
      message: "feat(home): add the three benefit cards",
      changes: { "content/copy/home.json": HOME_COPY_V2 },
      edits: { "content/pages/home.json": [{ find: BEFORE_SHOT, replace: rows(CARDS_BLOCK, BEFORE_SHOT) }] },
    },
    // The most expensive edit in the repository, under an ordinary message.
    { message: "copy(home): tighten the hero for the trailer drop", changes: { "content/copy/home.json": HOME_COPY_V3 } },
    {
      message: "feat(pages): add the devlog index",
      changes: { "content/pages/devlog.json": DEVLOG_PAGE, "content/copy/devlog.json": DEVLOG_COPY },
    },
    { message: "docs(brief): the soundtrack page brief", changes: { "docs/page-briefs/2026-05-soundtrack-page.md": BRIEF_SOUNDTRACK } },
    { message: "chore(research): type up the May remote sessions", changes: { "research/playtest-2026-05-remote.md": PLAYTEST_MAY } },
    {
      message: "style(home): give the hero the wash from the guide",
      edits: { "content/pages/home.json": [{ find: "      \"kind\": \"hero\",", replace: rows("      \"kind\": \"hero\",", "      \"class\": \"hero--glow\",") }] },
    },
    { message: "feat(press): add the quotes we have permission to use", changes: { "content/presskit/quotes.txt": PRESS_QUOTES_TXT } },
    { message: "chore(research): start the weekly wishlist sheet", changes: { "research/wishlist-weekly.md": WISHLIST_WEEKLY_V1 } },
    {
      message: "feat(home): put the numbers from the pitch deck on the page",
      changes: { "content/copy/home.json": HOME_COPY_V4 },
      edits: { "content/pages/home.json": [{ find: BEFORE_SHOT, replace: rows(STATS_BLOCK, BEFORE_SHOT) }] },
    },
    { message: "docs(pitch): keep the publisher paragraph where we can find it", changes: { "docs/pitch-notes.md": PITCH_NOTES } },
    { message: "chore(research): expo floor notes", changes: { "research/playtest-2026-06-expo.md": PLAYTEST_EXPO } },
    // The collapse is on record here, two commits before anybody touches the
    // call to action the note will later blame it on.
    {
      message: "chore(research): this week's wishlist numbers",
      edits: { "research/wishlist-weekly.md": [{ find: "| 07-06 | 1,260 | 77 | 6.1 |", replace: WISHLIST_ROWS_JULY }] },
    },
    {
      message: "feat(home): add the festival badge strip",
      changes: { "content/copy/home.json": HOME_COPY_V5 },
      edits: { "content/pages/home.json": [{ find: BEFORE_STATS, replace: rows(BADGES_BLOCK, BEFORE_STATS) }] },
    },
    {
      message: "copy(home): lead with the trailer",
      edits: { "content/pages/home.json": [{ find: "      \"cta\": \"wishlist\"", replace: "      \"cta\": \"trailer\"" }] },
    },
    { message: "chore(research): pull the referral breakdown out of analytics", changes: { "research/traffic-sources.md": TRAFFIC_SOURCES } },
    { message: "docs(brief): the devlog index brief", changes: { "docs/page-briefs/2026-06-devlog-index.md": BRIEF_DEVLOG } },
    { message: "feat(store): draft the store listing copy", changes: { "content/copy/store-capsule.json": STORE_CAPSULE } },
    { message: "chore(research): the web audit the contractor sent", changes: { "research/audit-2026-07-web.md": WEB_AUDIT } },
    {
      message: "fix(check): say which page a broken link is on",
      edits: {
        "tools/check/pages.js": [
          { find: "found.push('link to '", replace: "found.push(name + ': link to '" },
        ],
      },
    },
    {
      message: "chore(research): this week's wishlist numbers",
      edits: { "research/wishlist-weekly.md": [{ find: "| 07-20 | 705 | 41 | 5.8 |", replace: WISHLIST_ROWS_AUGUST }] },
    },
    // Written in August by somebody reconstructing July from memory.
    { message: "docs(research): note what changed around the drop", edits: { "research/wishlist-weekly.md": [{ append: WISHLIST_NOTE }] } },
    { message: "chore(research): what the neighbours' pages look like", changes: { "research/competitors.md": COMPETITORS } },
    { message: "chore(research): the wick budget notes, third pass", changes: { "research/devlog-notes.md": DEVLOG_NOTES } },
    {
      message: "docs(readme): point new writers at the page guide",
      edits: {
        "README.md": [
          {
            find: "Before you write a page, write its brief:",
            replace: rows(
              "Layout, components and the shape of a page: `docs/brand-guide-v1.md`.",
              "",
              "Before you write a page, write its brief:",
            ),
          },
        ],
      },
    },
    {
      message: "fix(theme): stop the badge strip wrapping off the screen",
      edits: {
        "theme/components.css": [
          {
            find: ".logo-strip { display: flex; gap: 0.75rem; justify-content: center; list-style: none; padding: 0; margin: 0 0 3rem; }",
            replace: ".logo-strip { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; list-style: none; padding: 0; margin: 0 0 3rem; }",
          },
        ],
      },
    },
    // The last touch on the home page, and it is the formatter. Anybody who
    // starts from `git log -1 content/pages/home.json` starts from nothing.
    {
      message: "chore(pages): reorder the keys after the formatter",
      edits: {
        "content/pages/home.json": [
          {
            find: rows("  \"description\": \"A lamplighter's game in a flooded city, from Northfall.\",", "  \"copy\": \"home\","),
            replace: rows("  \"copy\": \"home\",", "  \"description\": \"A lamplighter's game in a flooded city, from Northfall.\","),
          },
        ],
        "content/pages/press.json": [
          {
            find: rows("  \"description\": \"Facts, screenshots and contact details for Salt Lantern.\",", "  \"copy\": \"press\","),
            replace: rows("  \"copy\": \"press\",", "  \"description\": \"Facts, screenshots and contact details for Salt Lantern.\","),
          },
        ],
      },
    },
  ],

  /**
   * What a manifest may compute against. The forbidden patterns are declared
   * because a gate keyed on them is the mistake this world exists to expose,
   * and a count is the only way to say "there is exactly one legitimate use of
   * the glass panel and it is not on the home page".
   */
  invariants: [
    { pattern: "hero--glow", in: "content/pages/home.json", count: 1 },
    { pattern: "card-grid-3", in: "content/pages/home.json", count: 1 },
    // The legitimate use of a "forbidden" component: a single-purpose sign-up
    // box. A grep_zero over the pattern marks this right answer wrong.
    { pattern: "glass-panel", in: "content/pages/newsletter.json", count: 1 },
    // The house format: the template and two filled briefs. Point 1 of the
    // contract, and the reason a gate may not grep for the headings.
    { pattern: "^## The one claim$", in: "docs/page-briefs", count: 3 },
    { pattern: "^## Decision$", in: "docs/page-briefs", count: 3 },
    // The claim the page does not make, in the one file that already makes it.
    { pattern: "lamp oil is the only currency", in: "content/presskit/factsheet.txt", count: 1 },
    // The store capsule, over the limit the config declares and nothing reads.
    { pattern: "^  \"short\": \".{81,}\",$", in: "content/copy/store-capsule.json", count: 1 },
    { pattern: "\"storeCapsuleLimit\": 80", in: "site.config.json", count: 1 },
    // Nine captures held, one on the page.
    { pattern: "\"file\": \"/media/", in: "content/media/shots.json", count: 9 },
  ],
};
