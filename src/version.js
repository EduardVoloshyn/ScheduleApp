/*
 * The app's own version, shown in the About dialog.
 *
 * Deliberately separate from `sw.js`'s VERSION, which is a cache key bumped on every
 * deploy that touches a precached file — often several times for one release. This is
 * the number a person sees and quotes back when something is wrong.
 *
 * Bump RELEASED with VERSION. A version with a stale date is worse than no date: it
 * quietly asserts something false about what you are running.
 */

export const VERSION = '1.1'
export const RELEASED = '2026-09-11'
