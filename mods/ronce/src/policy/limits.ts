/** Commands are matched on their first characters only, so a 1 MB heredoc costs no more than a long command. */
export const MAX_MATCH_CHARS = 20_000
