/*
 * The app's own version, shown in the About dialog.
 *
 * Deliberately separate from `sw.js`'s VERSION, which is a cache key bumped on every
 * deploy that touches a precached file — often several times for one release. This is
 * the number a person sees and quotes back when something is wrong.
 *
 * Bump RELEASED with VERSION, to the date the bump is actually made. Check the clock
 * rather than reusing a date from earlier in the conversation — 1.2 shipped stamped
 * with the previous day because of exactly that.
 *
 * A version carrying a stale date is worse than no date: it quietly asserts something
 * false about what you are running.
 */

export const VERSION = '1.3'
export const RELEASED = '2026-09-12'
