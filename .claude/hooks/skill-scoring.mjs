/**
 * Lexical scoring of a skill against a prompt — the ONE implementation.
 *
 * It used to live twice. `tools/routing-cases.ts` carried this version, richer,
 * and 208 test cases held it to account (198 triggers ranked top-3, 10
 * disambiguation cases judged against their declared neighbours). The hook that
 * actually ran in session carried another one: `triggers.filter(t =>
 * prompt.includes(t)).length`, no stopwords, no stemming, no weighting, and
 * three suggestions emitted whatever the score. So the algorithm under test was
 * never the algorithm under load — the same defect the 2026-08-24 portability
 * postmortem records for the two frontmatter parsers.
 *
 * Scoring: `overlap + 5 * quoted`. A trigger quoted verbatim in the prompt is an
 * explicit invocation and outranks any amount of incidental vocabulary overlap.
 *
 * This is lexical overlap, not a model of how Claude routes — a floor that
 * catches two descriptions no wording can tell apart, never a promise about live
 * behaviour.
 *
 * Not wired on its own: it ships alongside `skill-reminder.ts`, which is the
 * hook the harness runs.
 *
 * @version 1.0.0
 * @last-reviewed 2026-09-19
 */
/** Common words that carry no routing signal, in both languages of these skills. */
const STOP = new Set([
    "this", "that", "with", "from", "what", "when", "where", "which", "does", "have",
    "been", "they", "them", "some", "more", "than", "then", "into", "about", "before",
    "after", "over", "only", "must", "will", "should", "could", "there", "here", "your",
    "yours", "just", "also", "same", "such", "each", "both", "very", "much", "many",
    "want", "need", "make", "made", "know", "nobody", "somebody", "still", "even", "like",
    "cette", "avec", "dans", "pour", "sans", "sont", "être", "faire", "plus", "tout",
    "tous", "leur",
]);
/** Naive singular folding, so "aggregates" in a prompt reaches "aggregate" in a description. */
const stem = (w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
/**
 * Score below which a match is noise rather than a signal.
 *
 * Measured on the live catalogue (2026-09-19). Prompts that genuinely call a
 * skill score far above it — 17 for "reproduis et analyse ce bug, corriger ou
 * ticket ?", 7 for "review cette MR avant merge", 3 for "écris des tests pour ce
 * fichier". Prompts with no business here score 1 or 0. Below this line the hook
 * says nothing: zero suggestion is an answer, and the old top-3-whatever-happens
 * spent its credibility naming three skills for a prompt about none of them.
 */
export const MIN_SCORE = 2;
export function words(s) {
    return [...new Set((s.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []).filter((w) => !STOP.has(w)).map(stem))];
}
/** Quoted phrases in a description - the deliberate routing signals. */
export function quotedPhrases(desc) {
    return [...desc.matchAll(/"([^"]+)"|«\s*([^»]+?)\s*»/g)]
        .map((m) => (m[1] || m[2]).toLowerCase().trim())
        .filter((t) => t.length >= 4);
}
/** Lexical score of one skill against one prompt. */
export function scorePrompt(prompt, skill, allDirs) {
    const lower = prompt.toLowerCase();
    // A description naming ANOTHER skill is redirecting to it ("that is
    // writing-robust-tests"), not claiming its vocabulary. Scoring those words
    // for the redirecting skill makes the pair inseparable by construction.
    const borrowed = new Set(allDirs
        .filter((other) => other !== skill.dir && skill.description.includes(other))
        .flatMap((other) => words(other.replace(/-/g, " "))));
    const vocab = new Set([
        ...words(skill.description).filter((w) => !borrowed.has(w)),
        ...words(skill.dir.replace(/-/g, " ")),
    ]);
    const overlap = words(prompt).filter((w) => vocab.has(w)).length;
    // A trigger quoted verbatim in the prompt is an explicit invocation and
    // outranks any amount of incidental vocabulary overlap.
    const quoted = quotedPhrases(skill.description).filter((t) => lower.includes(t)).length;
    return overlap + 5 * quoted;
}
/**
 * The skills worth naming for this prompt, best first — those above the noise
 * line, capped. An empty array is a legitimate answer.
 */
export function rankSkills(prompt, skills, max) {
    const dirs = skills.map((s) => s.dir);
    return skills
        .map((skill) => ({ skill, score: scorePrompt(prompt, skill, dirs) }))
        .filter((s) => s.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map((s) => s.skill);
}
